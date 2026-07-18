from __future__ import annotations

import base64
import json
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import and_, or_


def encode_cursor(created_at: datetime, resource_id: str) -> str:
    payload = json.dumps(
        {"created_at": created_at.isoformat(), "id": resource_id},
        ensure_ascii=True,
        separators=(",", ":"),
    ).encode()
    return base64.urlsafe_b64encode(payload).rstrip(b"=").decode()


def decode_cursor(value: str | None) -> tuple[datetime, str] | None:
    if not value:
        return None
    if len(value) > 400:
        raise HTTPException(status_code=422, detail="游标无效")
    try:
        padding = "=" * (-len(value) % 4)
        payload = json.loads(base64.urlsafe_b64decode(value + padding).decode())
        created_at = datetime.fromisoformat(str(payload["created_at"]))
        resource_id = str(payload["id"])
        if not resource_id:
            raise ValueError
        return created_at, resource_id
    except (ValueError, TypeError, KeyError, UnicodeDecodeError, json.JSONDecodeError):
        raise HTTPException(status_code=422, detail="游标无效") from None


def before_cursor(created_column, id_column, value: str | None):
    decoded = decode_cursor(value)
    if decoded is None:
        return None
    created_at, resource_id = decoded
    return or_(
        created_column < created_at,
        and_(created_column == created_at, id_column < resource_id),
    )


def page_metadata(rows: list[object], limit: int) -> tuple[list[object], str | None, bool]:
    has_more = len(rows) > limit
    visible = rows[:limit]
    if not has_more or not visible:
        return visible, None, has_more
    last = visible[-1]
    return visible, encode_cursor(last.created_at, last.id), has_more
