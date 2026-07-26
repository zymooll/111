"""Read-only operational view of the recommendation pipeline.

降级此前只体现在两个响应头上，运维读不到任何聚合值——LLM 被熔断跳过多少次、缓存命中率
多少、后台积压多少，全都不可见。这个端点把它们暴露出来，只读、不改任何状态。
"""

from __future__ import annotations

from fastapi import APIRouter, Request
from sqlalchemy import func, select

from app.dependencies import AdminCampusId, CurrentAdmin, DbSession
from app.models import ActorAffinity, RecommendationSnapshot
from app.schemas import RecommendationHealth
from app.services.feed import RecommendationService
from app.services.snapshots import SOURCE_AI

router = APIRouter(prefix="/recommendations", tags=["管理后台-推荐运维"])


@router.get("/health", response_model=RecommendationHealth)
def recommendation_health(
    request: Request,
    db: DbSession,
    admin: CurrentAdmin,
    campus_id: AdminCampusId,
) -> RecommendationHealth:
    service: RecommendationService = request.app.state.recommendations

    snapshots = db.execute(
        select(RecommendationSnapshot.source, func.count(RecommendationSnapshot.id))
        .where(RecommendationSnapshot.campus_id == campus_id)
        .group_by(RecommendationSnapshot.source)
    ).all()
    by_source = {str(source): int(total) for source, total in snapshots}

    profiled = db.scalar(
        select(func.count(ActorAffinity.id)).where(ActorAffinity.campus_id == campus_id)
    )

    reads = service.metrics["hit"] + service.metrics["stale"] + service.metrics["miss"]
    return RecommendationHealth(
        ai_configured=service.ai_enabled,
        breaker_open=not service.breaker_allows_now(),
        cache=dict(service.metrics),
        cache_hit_ratio=round(service.metrics["hit"] / reads, 4) if reads else None,
        enrich_failed=dict(service.enrich_failed),
        enrich_skipped=dict(service.enrich_skipped),
        backlog=service.backlog(),
        snapshots=by_source,
        ai_snapshot_share=(
            round(by_source.get(SOURCE_AI, 0) / sum(by_source.values()), 4)
            if by_source
            else None
        ),
        profiled_actors=int(profiled or 0),
    )
