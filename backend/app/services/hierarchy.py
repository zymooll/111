from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import CampusArea, Category


def category_with_descendants(
    db: Session, category_id: str, campus_id: str | None = None
) -> set[str]:
    query = select(Category.id, Category.parent_id)
    if campus_id:
        query = query.where(Category.campus_id == campus_id)
    rows = db.execute(query).all()
    return _with_descendants(category_id, rows)


def area_with_descendants(
    db: Session, area_id: str, campus_id: str | None = None
) -> set[str]:
    query = select(CampusArea.id, CampusArea.parent_id)
    if campus_id:
        query = query.where(CampusArea.campus_id == campus_id)
    rows = db.execute(query).all()
    return _with_descendants(area_id, rows)


def _with_descendants(root_id: str, rows: list[tuple[str, str | None]]) -> set[str]:
    children: dict[str | None, list[str]] = {}
    for item_id, parent_id in rows:
        children.setdefault(parent_id, []).append(item_id)
    result: set[str] = set()
    stack = [root_id]
    while stack:
        current = stack.pop()
        if current in result:
            continue
        result.add(current)
        stack.extend(children.get(current, []))
    return result
