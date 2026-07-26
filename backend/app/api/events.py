from __future__ import annotations

import logging

from fastapi import APIRouter
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.dependencies import DbSession, PrincipalRequired
from app.models import InteractionEvent
from app.schemas import InteractionBatch, Message
from app.services.affinity import apply_events
from app.services.campuses import require_campus, require_menu_item, require_merchant

logger = logging.getLogger(__name__)

router = APIRouter(tags=["行为事件"])


@router.post("/interactions", response_model=Message)
def record_interactions(
    payload: InteractionBatch,
    db: DbSession,
    principal: PrincipalRequired,
) -> Message:
    require_campus(db, payload.campus_id)
    known = set(
        db.scalars(
            select(InteractionEvent.event_id).where(
                InteractionEvent.event_id.in_([event.event_id for event in payload.events])
            )
        ).all()
    )
    accepted: list[InteractionEvent] = []
    for event in payload.events:
        if event.event_id in known:
            continue
        if event.menu_item_id:
            require_menu_item(db, payload.campus_id, event.menu_item_id)
        if event.merchant_id:
            require_merchant(db, payload.campus_id, event.merchant_id)
        record = InteractionEvent(
            campus_id=payload.campus_id,
            event_id=event.event_id,
            actor_type=principal.kind,
            actor_id=principal.id,
            event_type=event.event_type,
            menu_item_id=event.menu_item_id,
            merchant_id=event.merchant_id,
            metadata_json=event.metadata,
        )
        # 每条独立 savepoint：一条与并发批次撞上 event_id 唯一约束时只丢这一条，
        # 不再让整批静默消失却仍然返回成功。
        try:
            with db.begin_nested():
                db.add(record)
        except IntegrityError:
            continue
        accepted.append(record)

    # 增量维护画像：把标签/区域解析的开销摊还在写入侧，推荐读路径不再扫原始事件。
    apply_events(
        db,
        campus_id=payload.campus_id,
        actor_type=principal.kind,
        actor_id=principal.id,
        events=accepted,
    )
    db.commit()
    return Message(message="行为事件已接收")
