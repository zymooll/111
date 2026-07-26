from __future__ import annotations

import hashlib
import json
import logging

from fastapi import Request
from fastapi.responses import JSONResponse, Response
from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError

from app.models import IdempotencyRecord

logger = logging.getLogger(__name__)

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}

STATE_PROCESSING = "processing"
STATE_COMPLETED = "completed"


def _problem(request: Request, status: int, title: str, detail: str) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        media_type="application/problem+json",
        content={
            "type": "https://campus-food.local/problems/idempotency-conflict",
            "title": title,
            "status": status,
            "detail": detail,
            "instance": request.url.path,
            "request_id": getattr(request.state, "request_id", None),
        },
    )


def _scope(request: Request) -> str:
    authorization = request.headers.get("authorization", "")
    if authorization:
        actor = hashlib.sha256(authorization.encode()).hexdigest()[:24]
    else:
        client = request.client.host if request.client else "unknown"
        actor = hashlib.sha256(client.encode()).hexdigest()[:24]
    return f"{actor}:{request.method}:{request.url.path}"[:160]


def _replay(existing: IdempotencyRecord) -> Response:
    return Response(
        content=(existing.response_body or "").encode("utf-8"),
        status_code=existing.response_status or 200,
        media_type=existing.content_type,
        headers={"Idempotency-Replayed": "true"},
    )


async def idempotency_middleware(request: Request, call_next):
    if request.method in SAFE_METHODS:
        return await call_next(request)

    key = request.headers.get("idempotency-key")
    if not key:
        return await call_next(request)
    key = key.strip()
    if len(key) < 8 or len(key) > 120:
        return _problem(request, 422, "幂等键无效", "Idempotency-Key 长度应为 8 到 120 个字符")

    body = await request.body()
    request_hash = hashlib.sha256(
        request.method.encode()
        + b"\0"
        + request.url.path.encode()
        + b"\0"
        + request.url.query.encode()
        + b"\0"
        + body
    ).hexdigest()
    scope = _scope(request)
    database = request.app.state.database

    # 先占位再执行。原先是"先查再执行再写"，两个并发的同键请求会同时查不到、同时进入
    # 处理函数，副作用做了两遍——幂等键反而在它最该起作用的场景（重试）下失效。
    # 这里靠 (scope, key) 唯一约束裁决谁去执行。
    with database.session_factory() as db:
        db.add(
            IdempotencyRecord(
                scope=scope,
                idempotency_key=key,
                request_hash=request_hash,
                state=STATE_PROCESSING,
            )
        )
        try:
            db.commit()
            reserved = True
        except IntegrityError:
            db.rollback()
            reserved = False

        if not reserved:
            existing = db.scalar(
                select(IdempotencyRecord).where(
                    IdempotencyRecord.scope == scope,
                    IdempotencyRecord.idempotency_key == key,
                )
            )
            if existing is None:
                # 占位失败又读不到：只可能是另一个请求刚刚失败并清理掉了，让本次正常执行。
                reserved = True
            elif existing.request_hash != request_hash:
                return _problem(
                    request, 409, "幂等键冲突", "同一 Idempotency-Key 不能用于不同请求"
                )
            elif existing.state == STATE_COMPLETED:
                return _replay(existing)
            else:
                # 同一个请求正在被另一个调用处理，如实告诉客户端稍后重试。
                return _problem(
                    request,
                    409,
                    "请求正在处理中",
                    "相同 Idempotency-Key 的请求尚未完成，请稍后重试",
                )

    async def receive():
        return {"type": "http.request", "body": body, "more_body": False}

    request._receive = receive  # type: ignore[attr-defined]
    try:
        response = await call_next(request)
        response_body = b"".join([chunk async for chunk in response.body_iterator])
    except BaseException:
        _release(database, scope, key)
        raise

    response_headers = dict(response.headers)
    response_headers.pop("content-length", None)
    rebuilt = Response(
        content=response_body,
        status_code=response.status_code,
        headers=response_headers,
        media_type=None,
        background=response.background,
    )

    content_type = response.headers.get("content-type", "")
    if 200 <= response.status_code < 300 and "json" in content_type:
        try:
            response_text = response_body.decode("utf-8")
            json.loads(response_text)
        except (UnicodeDecodeError, json.JSONDecodeError):
            _release(database, scope, key)
            return rebuilt
        with database.session_factory() as db:
            db.execute(
                update(IdempotencyRecord)
                .where(
                    IdempotencyRecord.scope == scope,
                    IdempotencyRecord.idempotency_key == key,
                )
                .values(
                    state=STATE_COMPLETED,
                    response_status=response.status_code,
                    response_body=response_text,
                    content_type=content_type.split(";", 1)[0] or "application/json",
                )
            )
            db.commit()
    else:
        # 失败的请求不该把这个键锁死，否则客户端连重试的机会都没有。
        _release(database, scope, key)
    return rebuilt


def _release(database, scope: str, key: str) -> None:
    """Drop the reservation so the caller can retry this key."""
    try:
        with database.session_factory() as db:
            db.execute(
                delete(IdempotencyRecord).where(
                    IdempotencyRecord.scope == scope,
                    IdempotencyRecord.idempotency_key == key,
                    IdempotencyRecord.state == STATE_PROCESSING,
                )
            )
            db.commit()
    except Exception:  # noqa: BLE001 - 释放失败只影响这一个键的重试，不该冒泡
        logger.warning("Failed to release idempotency reservation", exc_info=True)
