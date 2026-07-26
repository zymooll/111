"""Keep the indexed tag rows in step with the JSON read model.

同步刻意做成 flush 事件而不是"每个写路径记得调一次"：管理端 CRUD、CSV 导入、标签重命名、
种子数据都会写 MenuItem.tags，任何一处漏掉都会让归一化表静默偏离，而偏离不会报错——只会
让筛选悄悄少召回。挂在会话上就没有"忘记"这种可能。

reconcile() 是兜底：它把两侧的差异算出来并修正，既可以给运维用，也被一致性测试用作断言。
"""

from __future__ import annotations

import logging
from collections.abc import Iterable

from sqlalchemy import delete, event, insert, inspect, select
from sqlalchemy.orm import Session

from app.models import MenuItem, MenuItemTag

logger = logging.getLogger(__name__)


def normalize_tags(values: object) -> list[str]:
    """De-duplicate, strip and order tags so the two sides are comparable."""
    if not isinstance(values, list):
        return []
    return sorted({str(value).strip() for value in values if str(value).strip()})


def sync_items(db: Session, items: Iterable[MenuItem]) -> None:
    """Replace the indexed rows for the given items with their current JSON tags."""
    targets = [item for item in items if item.id and item.campus_id]
    if not targets:
        return
    db.execute(
        delete(MenuItemTag).where(MenuItemTag.menu_item_id.in_([item.id for item in targets]))
    )
    rows = [
        {"menu_item_id": item.id, "tag": tag, "campus_id": item.campus_id}
        for item in targets
        for tag in normalize_tags(item.tags)
    ]
    if rows:
        db.execute(insert(MenuItemTag), rows)


def reconcile(db: Session, *, campus_id: str | None = None, repair: bool = True) -> int:
    """Return how many items had drifted; repair them unless asked not to."""
    query = select(MenuItem)
    if campus_id:
        query = query.where(MenuItem.campus_id == campus_id)
    items = list(db.scalars(query).all())
    if not items:
        return 0

    stored: dict[str, set[str]] = {}
    for menu_item_id, tag in db.execute(
        select(MenuItemTag.menu_item_id, MenuItemTag.tag).where(
            MenuItemTag.menu_item_id.in_([item.id for item in items])
        )
    ).all():
        stored.setdefault(str(menu_item_id), set()).add(str(tag))

    drifted = [
        item for item in items if stored.get(item.id, set()) != set(normalize_tags(item.tags))
    ]
    if drifted and repair:
        sync_items(db, drifted)
        logger.warning("Repaired %s menu items whose tag rows had drifted", len(drifted))
    return len(drifted)


def _tags_changed(item: MenuItem) -> bool:
    state = inspect(item)
    if state.transient or state.pending:
        return True
    return bool(state.attrs.tags.history.has_changes())


@event.listens_for(Session, "after_flush")
def _sync_on_flush(session: Session, _flush_context: object) -> None:
    # after_flush 里 new/dirty 仍是刷新前的集合，且此时执行 SQL 是被支持的用法。
    touched = [
        obj
        for obj in (*session.new, *session.dirty)
        if isinstance(obj, MenuItem) and obj not in session.deleted and _tags_changed(obj)
    ]
    if touched:
        sync_items(session, touched)
