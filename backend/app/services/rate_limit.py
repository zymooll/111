"""Abuse controls for the authentication and upload surfaces.

The limiter is exposed as a FastAPI dependency rather than a global middleware so每个端点
自己声明配额，路由语义保持单一。未配置 Redis 时退化为进程内滑动窗口——单 worker 部署
足够，多 worker 部署应配置 REDIS_URL 以获得跨进程一致的配额。
"""

from __future__ import annotations

import hashlib
import logging
import threading
import time
from collections import deque
from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request

logger = logging.getLogger(__name__)

#: 进程内窗口最多保留的键数量，防止被随机化的 key 撑爆内存。
MAX_TRACKED_KEYS = 20_000


@dataclass(frozen=True)
class RateLimitRule:
    name: str
    limit: int
    window_seconds: int

    def describe(self) -> str:
        return f"{self.limit} 次 / {self.window_seconds} 秒"


LOGIN_RULE = RateLimitRule("login", limit=10, window_seconds=60)
ADMIN_LOGIN_RULE = RateLimitRule("admin-login", limit=5, window_seconds=60)
REGISTER_RULE = RateLimitRule("register", limit=5, window_seconds=600)
GUEST_RULE = RateLimitRule("guest", limit=20, window_seconds=600)
ACCOUNT_EMAIL_RULE = RateLimitRule("account-email", limit=3, window_seconds=600)
UPLOAD_RULE = RateLimitRule("upload", limit=30, window_seconds=600)
#: 阅读量端点无需登录即可调用，没有配额就能被刷成任意数字。
REVIEW_VIEW_RULE = RateLimitRule("review-view", limit=120, window_seconds=60)

#: 连续失败达到该次数后开始锁定，锁定时长随失败次数指数增长。
LOCKOUT_THRESHOLD = 5
LOCKOUT_BASE_SECONDS = 30
LOCKOUT_MAX_SECONDS = 900
LOCKOUT_RESET_SECONDS = 3600


class _MemoryBackend:
    """Thread-safe sliding window shared by all rules of one application instance."""

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = {}
        self._failures: dict[str, tuple[int, float]] = {}
        self._lock = threading.Lock()

    def hit(self, key: str, *, limit: int, window_seconds: int, now: float) -> float | None:
        """Record one hit. Returns seconds to wait when the caller is over quota."""
        with self._lock:
            self._prune(now)
            window = self._hits.setdefault(key, deque())
            cutoff = now - window_seconds
            while window and window[0] <= cutoff:
                window.popleft()
            if len(window) >= limit:
                return max(1.0, window[0] + window_seconds - now)
            window.append(now)
            return None

    def record_failure(self, key: str, *, now: float) -> None:
        with self._lock:
            count, last = self._failures.get(key, (0, now))
            if now - last > LOCKOUT_RESET_SECONDS:
                count = 0
            self._failures[key] = (count + 1, now)

    def clear_failures(self, key: str) -> None:
        with self._lock:
            self._failures.pop(key, None)

    def lockout_remaining(self, key: str, *, now: float) -> float:
        with self._lock:
            entry = self._failures.get(key)
            if entry is None:
                return 0.0
            count, last = entry
            if now - last > LOCKOUT_RESET_SECONDS:
                self._failures.pop(key, None)
                return 0.0
            if count < LOCKOUT_THRESHOLD:
                return 0.0
            penalty = min(
                LOCKOUT_MAX_SECONDS,
                LOCKOUT_BASE_SECONDS * (2 ** (count - LOCKOUT_THRESHOLD)),
            )
            return max(0.0, last + penalty - now)

    def _prune(self, now: float) -> None:
        if len(self._hits) <= MAX_TRACKED_KEYS:
            return
        stale = [key for key, window in self._hits.items() if not window or window[-1] < now - 3600]
        for key in stale:
            self._hits.pop(key, None)
        if len(self._hits) > MAX_TRACKED_KEYS:
            self._hits.clear()
            logger.warning("Rate limit window exceeded %s keys and was reset", MAX_TRACKED_KEYS)


class _RedisBackend:
    """Cross-process windows backed by Redis; falls back to memory on any Redis error."""

    def __init__(self, client, fallback: _MemoryBackend) -> None:
        self._client = client
        self._fallback = fallback

    def hit(self, key: str, *, limit: int, window_seconds: int, now: float) -> float | None:
        try:
            pipe = self._client.pipeline()
            pipe.incr(key)
            pipe.ttl(key)
            count, ttl = pipe.execute()
            if ttl is None or ttl < 0:
                self._client.expire(key, window_seconds)
                ttl = window_seconds
            if int(count) > limit:
                return max(1.0, float(ttl))
            return None
        except Exception:  # noqa: BLE001 - Redis 故障不应阻断请求
            logger.warning("Rate limit backend degraded to in-process window", exc_info=True)
            return self._fallback.hit(key, limit=limit, window_seconds=window_seconds, now=now)

    def record_failure(self, key: str, *, now: float) -> None:
        try:
            count = int(self._client.incr(f"fail:{key}"))
            self._client.expire(f"fail:{key}", LOCKOUT_RESET_SECONDS)
            if count >= LOCKOUT_THRESHOLD:
                penalty = min(
                    LOCKOUT_MAX_SECONDS,
                    LOCKOUT_BASE_SECONDS * (2 ** (count - LOCKOUT_THRESHOLD)),
                )
                self._client.setex(f"lock:{key}", int(penalty), "1")
        except Exception:  # noqa: BLE001
            logger.warning("Lockout backend degraded to in-process store", exc_info=True)
            self._fallback.record_failure(key, now=now)

    def clear_failures(self, key: str) -> None:
        try:
            self._client.delete(f"fail:{key}", f"lock:{key}")
        except Exception:  # noqa: BLE001
            self._fallback.clear_failures(key)

    def lockout_remaining(self, key: str, *, now: float) -> float:
        try:
            ttl = self._client.ttl(f"lock:{key}")
            return float(ttl) if ttl and ttl > 0 else 0.0
        except Exception:  # noqa: BLE001
            return self._fallback.lockout_remaining(key, now=now)


class RateLimiter:
    def __init__(self, redis_url: str | None = None, *, enabled: bool = True) -> None:
        self.enabled = enabled
        memory = _MemoryBackend()
        self._backend: _MemoryBackend | _RedisBackend = memory
        if redis_url:
            try:
                import redis  # noqa: PLC0415 - optional dependency

                client = redis.Redis.from_url(redis_url, decode_responses=True)
                client.ping()
                self._backend = _RedisBackend(client, memory)
            except Exception:  # noqa: BLE001
                logger.warning(
                    "REDIS_URL configured but unreachable; using in-process rate limiting",
                    exc_info=True,
                )

    def check(self, rule: RateLimitRule, identity: str) -> None:
        if not self.enabled:
            return
        now = time.monotonic()
        key = f"rl:{rule.name}:{identity}"
        retry_after = self._backend.hit(
            key, limit=rule.limit, window_seconds=rule.window_seconds, now=now
        )
        if retry_after is not None:
            raise HTTPException(
                status_code=429,
                detail=f"操作过于频繁，请在 {int(retry_after)} 秒后重试",
                headers={"Retry-After": str(int(retry_after))},
            )

    def guard_lockout(self, scope: str, identity: str) -> None:
        if not self.enabled:
            return
        remaining = self._backend.lockout_remaining(
            f"{scope}:{identity}", now=time.monotonic()
        )
        if remaining > 0:
            raise HTTPException(
                status_code=429,
                detail=f"失败次数过多，账号已临时锁定，请在 {int(remaining)} 秒后重试",
                headers={"Retry-After": str(int(remaining))},
            )

    def record_failure(self, scope: str, identity: str) -> None:
        if self.enabled:
            self._backend.record_failure(f"{scope}:{identity}", now=time.monotonic())

    def clear_failures(self, scope: str, identity: str) -> None:
        if self.enabled:
            self._backend.clear_failures(f"{scope}:{identity}")


def client_identity(request: Request) -> str:
    """Best-effort caller identity: authenticated subject when present, else client IP."""
    authorization = request.headers.get("authorization", "")
    if authorization:
        return "tok:" + hashlib.sha256(authorization.encode()).hexdigest()[:24]
    forwarded = request.headers.get("x-forwarded-for", "")
    host = forwarded.split(",")[0].strip() if forwarded else ""
    if not host:
        host = request.client.host if request.client else "unknown"
    return "ip:" + hashlib.sha256(host.encode()).hexdigest()[:24]


def get_rate_limiter(request: Request) -> RateLimiter:
    return request.app.state.rate_limiter


def rate_limit(rule: RateLimitRule):
    """Build a dependency enforcing ``rule`` for the calling client."""

    def dependency(request: Request) -> None:
        get_rate_limiter(request).check(rule, client_identity(request))

    return Depends(dependency)
