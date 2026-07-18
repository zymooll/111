from __future__ import annotations

import hashlib
import json

from fastapi import Request
from fastapi.responses import JSONResponse, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.models import IdempotencyRecord


SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


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

    with database.session_factory() as db:
        existing = db.scalar(
            select(IdempotencyRecord).where(
                IdempotencyRecord.scope == scope,
                IdempotencyRecord.idempotency_key == key,
            )
        )
        if existing is not None:
            if existing.request_hash != request_hash:
                return _problem(
                    request,
                    409,
                    "幂等键冲突",
                    "同一 Idempotency-Key 不能用于不同请求",
                )
            return Response(
                content=existing.response_body.encode("utf-8"),
                status_code=existing.response_status,
                media_type=existing.content_type,
                headers={"Idempotency-Replayed": "true"},
            )

    async def receive():
        return {"type": "http.request", "body": body, "more_body": False}

    request._receive = receive  # type: ignore[attr-defined]
    response = await call_next(request)
    response_body = b"".join([chunk async for chunk in response.body_iterator])
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
            return rebuilt
        with database.session_factory() as db:
            db.add(
                IdempotencyRecord(
                    scope=scope,
                    idempotency_key=key,
                    request_hash=request_hash,
                    response_status=response.status_code,
                    response_body=response_text,
                    content_type=content_type.split(";", 1)[0] or "application/json",
                )
            )
            try:
                db.commit()
            except IntegrityError:
                db.rollback()
    return rebuilt
