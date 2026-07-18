from __future__ import annotations

from fastapi import HTTPException, Request

from app.models import ReviewStatus
from app.services.deepseek import DeepSeekClient
from app.services.moderation import ModerationResult, local_moderate


def validate_review_images(request: Request, user_id: str, images: list[str]) -> None:
    owner_root = (request.app.state.settings.upload_dir / user_id).resolve()
    expected_prefix = f"/media/{user_id}/"
    for image_url in images:
        if not image_url.startswith(expected_prefix):
            raise HTTPException(status_code=422, detail="评价只能引用本人已上传的图片")
        filename = image_url.removeprefix(expected_prefix)
        if not filename or "/" in filename or "\\" in filename:
            raise HTTPException(status_code=422, detail="图片地址无效")
        target = (owner_root / filename).resolve()
        if target.parent != owner_root or not target.is_file():
            raise HTTPException(status_code=422, detail="图片不存在或尚未上传完成")


async def moderate_review(request: Request, text: str) -> ModerationResult:
    local = local_moderate(text)
    if local.status == ReviewStatus.PENDING_MANUAL:
        return local
    client = DeepSeekClient(request.app.state.settings)
    if not client.enabled:
        return ModerationResult(
            ReviewStatus.PENDING_MANUAL,
            "DeepSeek 未配置，已转人工审核",
        )
    remote = await client.moderate(text)
    if remote is None:
        return ModerationResult(
            ReviewStatus.PENDING_MANUAL,
            "内容审核服务暂不可用，已转人工审核",
        )
    return remote


def require_image_review(result: ModerationResult, images: list[str]) -> ModerationResult:
    if images and result.status == ReviewStatus.PUBLISHED:
        return ModerationResult(
            ReviewStatus.PENDING_MANUAL,
            "评价包含图片，需要人工确认图片内容",
        )
    return result
