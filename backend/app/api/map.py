from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import String, cast, func, or_, select

from app.api.presenters import favorite_merchant_ids
from app.dependencies import DbSession, OptionalPrincipal
from app.models import MenuItem, Merchant
from app.services.hierarchy import category_with_descendants
from app.services.map_clusters import merchant_geojson
from app.services.ratings import merchant_scores


router = APIRouter(tags=["地图"])


def _bbox(value: str | None) -> tuple[float, float, float, float] | None:
    if not value:
        return None
    try:
        west, south, east, north = [float(part) for part in value.split(",")]
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="bbox 格式应为 west,south,east,north") from exc
    if west >= east or south >= north:
        raise HTTPException(status_code=422, detail="bbox 范围无效")
    if not (-180 <= west <= 180 and -180 <= east <= 180 and -90 <= south <= 90 and -90 <= north <= 90):
        raise HTTPException(status_code=422, detail="bbox 经纬度超出有效范围")
    return west, south, east, north


@router.get("/map/merchants")
def map_merchants(
    db: DbSession,
    principal: OptionalPrincipal,
    campus_id: str,
    bbox: str | None = None,
    zoom: Annotated[int, Query(ge=3, le=22)] = 16,
    price_level: Annotated[list[int] | None, Query()] = None,
    category_id: str | None = None,
    taste: str | None = None,
    search: str | None = Query(default=None, max_length=100),
    favorite_only: bool = False,
) -> dict[str, Any]:
    bounds = _bbox(bbox)
    if price_level and any(value < 1 or value > 4 for value in price_level):
        raise HTTPException(status_code=422, detail="价格等级只能是 1 到 4")
    query = select(Merchant).where(
        Merchant.campus_id == campus_id,
        Merchant.is_active.is_(True),
    )
    if bounds:
        west, south, east, north = bounds
        query = query.where(
            Merchant.gcj02_longitude.between(west, east),
            Merchant.gcj02_latitude.between(south, north),
        )
    if price_level:
        query = query.where(Merchant.price_level.in_(price_level))
    if category_id:
        category_ids = category_with_descendants(db, category_id)
        query = query.where(
            or_(
                Merchant.category_id.in_(category_ids),
                Merchant.id.in_(
                    select(MenuItem.merchant_id).where(MenuItem.category_id.in_(category_ids))
                ),
            )
        )
    if search:
        query = query.where(
            or_(
                Merchant.name.like(f"%{search.strip()}%"),
                Merchant.address.like(f"%{search.strip()}%"),
            )
        )
    if taste:
        query = query.where(
            Merchant.id.in_(
                select(MenuItem.merchant_id).where(
                    MenuItem.is_active.is_(True),
                    cast(MenuItem.tags, String).like(f"%{taste}%"),
                )
            )
        )
    kind = principal.kind if principal else None
    actor_id = principal.id if principal else None
    favorites = favorite_merchant_ids(db, kind=kind, actor_id=actor_id)
    if favorite_only:
        if not favorites:
            return merchant_geojson([], zoom=zoom)
        query = query.where(Merchant.id.in_(favorites))
    merchants = db.scalars(query.order_by(Merchant.id)).all()
    ratings = merchant_scores(db, [merchant.id for merchant in merchants])
    values: list[dict[str, Any]] = []
    for merchant in merchants:
        values.append(
            {
                "id": merchant.id,
                "name": merchant.name,
                "address": merchant.address,
                "gcj02_latitude": merchant.gcj02_latitude,
                "gcj02_longitude": merchant.gcj02_longitude,
                "price_level": merchant.price_level,
                "rating_avg": round(float(ratings.get(merchant.id) or 0), 2),
                "is_favorite": merchant.id in favorites,
                "category_id": merchant.category_id,
            }
        )
    return merchant_geojson(values, zoom=zoom)
