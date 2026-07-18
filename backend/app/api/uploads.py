from __future__ import annotations

from io import BytesIO
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from PIL import Image, UnidentifiedImageError

from app.dependencies import CurrentUser
from app.schemas import UploadRead


router = APIRouter(tags=["上传"])


@router.post("/uploads/images", response_model=UploadRead, status_code=201)
async def upload_image(
    request: Request,
    user: CurrentUser,
    file: UploadFile = File(...),
) -> UploadRead:
    content = await file.read(request.app.state.settings.max_upload_bytes + 1)
    if len(content) > request.app.state.settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail="图片不能超过 10 MB")
    try:
        image = Image.open(BytesIO(content))
        image.verify()
        image = Image.open(BytesIO(content))
        image.load()
    except (UnidentifiedImageError, OSError, SyntaxError) as exc:
        raise HTTPException(status_code=422, detail="无法识别图片内容") from exc
    allowed = {
        "JPEG": ("jpg", "image/jpeg"),
        "PNG": ("png", "image/png"),
        "WEBP": ("webp", "image/webp"),
    }
    if image.format not in allowed:
        raise HTTPException(status_code=422, detail="仅支持 JPEG、PNG、WebP")
    if image.width * image.height > 40_000_000:
        raise HTTPException(status_code=422, detail="图片像素尺寸过大")
    extension, content_type = allowed[image.format]
    upload_root: Path = request.app.state.settings.upload_dir / user.id
    upload_root.mkdir(parents=True, exist_ok=True)
    name = f"{uuid4()}.{extension}"
    target = upload_root / name
    save_image = image.convert("RGB") if image.format == "JPEG" else image
    save_image.save(target, format=image.format, optimize=True)
    relative = f"{user.id}/{name}"
    return UploadRead(
        url=f"/media/{relative}",
        content_type=content_type,
        size=target.stat().st_size,
        width=image.width,
        height=image.height,
    )
