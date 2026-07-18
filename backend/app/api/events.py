from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.dependencies import DbSession, PrincipalRequired
from app.models import InteractionEvent
from app.schemas import InteractionBatch, Message
from app.services.campuses import require_campus, require_menu_item, require_merchant


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
    for event in payload.events:
        if event.event_id in known:
            continue
        if event.menu_item_id:
            require_menu_item(db, payload.campus_id, event.menu_item_id)
        if event.merchant_id:
            require_merchant(db, payload.campus_id, event.merchant_id)
        db.add(
            InteractionEvent(
                campus_id=payload.campus_id,
                event_id=event.event_id,
                actor_type=principal.kind,
                actor_id=principal.id,
                event_type=event.event_type,
                menu_item_id=event.menu_item_id,
                merchant_id=event.merchant_id,
                metadata_json=event.metadata,
            )
        )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
    return Message(message="行为事件已接收")
