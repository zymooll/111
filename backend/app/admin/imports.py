from __future__ import annotations

import csv
from io import StringIO
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select

from app.dependencies import CurrentAdmin, DbSession
from app.models import (
    AdminAuditLog,
    Campus,
    CampusArea,
    Category,
    ImportJob,
    MenuItem,
    Merchant,
    User,
    UserRole,
)
from app.schemas import ImportErrorRead, ImportJobRead, ImportValidationRead


router = APIRouter(prefix="/imports", tags=["管理后台-批量导入"])
MAX_CSV_BYTES = 2 * 1024 * 1024
SUPPORTED_TYPES = {"areas", "merchants", "menu_items"}


def require_import_manager(admin: CurrentAdmin) -> User:
    if admin.role not in {UserRole.CAMPUS_ADMIN, UserRole.SUPER_ADMIN}:
        raise HTTPException(status_code=403, detail="该操作需要校园管理员权限")
    return admin


ImportManager = Annotated[User, Depends(require_import_manager)]


async def _read_rows(file: UploadFile) -> list[dict[str, str]]:
    if not (file.filename or "").lower().endswith(".csv"):
        raise HTTPException(status_code=422, detail="仅支持 CSV 文件")
    content = await file.read(MAX_CSV_BYTES + 1)
    if len(content) > MAX_CSV_BYTES:
        raise HTTPException(status_code=413, detail="CSV 文件不能超过 2 MB")
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=422, detail="CSV 必须使用 UTF-8 编码") from exc
    reader = csv.DictReader(StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=422, detail="CSV 缺少表头")
    return [
        {str(key).strip(): (value or "").strip() for key, value in row.items() if key}
        for row in reader
        if any((value or "").strip() for value in row.values())
    ]


def _error(row: int, field: str, message: str) -> ImportErrorRead:
    return ImportErrorRead(row=row, field=field, message=message)


def _required(
    row_number: int,
    row: dict[str, str],
    names: list[str],
    errors: list[ImportErrorRead],
) -> bool:
    ok = True
    for name in names:
        if not row.get(name):
            errors.append(_error(row_number, name, "必填字段不能为空"))
            ok = False
    return ok


def _int_value(
    row_number: int,
    row: dict[str, str],
    field: str,
    errors: list[ImportErrorRead],
    *,
    default: int | None = None,
    minimum: int | None = None,
    maximum: int | None = None,
) -> int | None:
    raw = row.get(field, "")
    if not raw and default is not None:
        return default
    try:
        value = int(raw)
    except ValueError:
        errors.append(_error(row_number, field, "必须是整数"))
        return None
    if minimum is not None and value < minimum or maximum is not None and value > maximum:
        errors.append(_error(row_number, field, f"数值范围应为 {minimum} 到 {maximum}"))
        return None
    return value


def _float_value(
    row_number: int,
    row: dict[str, str],
    field: str,
    errors: list[ImportErrorRead],
) -> float | None:
    try:
        return float(row.get(field, ""))
    except ValueError:
        errors.append(_error(row_number, field, "必须是数字"))
        return None


def _validate_rows(
    db,
    import_type: str,
    rows: list[dict[str, str]],
) -> tuple[list[dict[str, Any]], list[ImportErrorRead]]:
    parsed: list[dict[str, Any]] = []
    errors: list[ImportErrorRead] = []
    for row_number, row in enumerate(rows, start=2):
        before = len(errors)
        data: dict[str, Any] = {}
        if import_type == "areas":
            if not _required(row_number, row, ["campus_id", "name"], errors):
                continue
            if db.get(Campus, row["campus_id"]) is None:
                errors.append(_error(row_number, "campus_id", "校园不存在"))
            if row.get("parent_id"):
                parent = db.get(CampusArea, row["parent_id"])
                if parent is None or parent.campus_id != row["campus_id"]:
                    errors.append(_error(row_number, "parent_id", "上级地点不存在或不属于校园"))
            data = {
                "campus_id": row["campus_id"],
                "parent_id": row.get("parent_id") or None,
                "name": row["name"],
                "level": _int_value(row_number, row, "level", errors, default=1, minimum=1, maximum=10),
                "sort_order": _int_value(row_number, row, "sort_order", errors, default=0),
            }
        elif import_type == "merchants":
            required = ["campus_id", "name", "address", "latitude", "longitude"]
            if not _required(row_number, row, required, errors):
                continue
            if db.get(Campus, row["campus_id"]) is None:
                errors.append(_error(row_number, "campus_id", "校园不存在"))
            if row.get("area_id"):
                area = db.get(CampusArea, row["area_id"])
                if area is None or area.campus_id != row["campus_id"]:
                    errors.append(_error(row_number, "area_id", "校园地点不存在或不属于校园"))
            if row.get("category_id") and db.get(Category, row["category_id"]) is None:
                errors.append(_error(row_number, "category_id", "品类不存在"))
            latitude = _float_value(row_number, row, "latitude", errors)
            longitude = _float_value(row_number, row, "longitude", errors)
            if latitude is not None and not -90 <= latitude <= 90:
                errors.append(_error(row_number, "latitude", "纬度必须在 -90 到 90 之间"))
            if longitude is not None and not -180 <= longitude <= 180:
                errors.append(_error(row_number, "longitude", "经度必须在 -180 到 180 之间"))
            gcj_latitude = (
                _float_value(row_number, row, "gcj02_latitude", errors)
                if row.get("gcj02_latitude")
                else latitude
            )
            gcj_longitude = (
                _float_value(row_number, row, "gcj02_longitude", errors)
                if row.get("gcj02_longitude")
                else longitude
            )
            data = {
                "campus_id": row["campus_id"],
                "area_id": row.get("area_id") or None,
                "category_id": row.get("category_id") or None,
                "name": row["name"],
                "description": row.get("description", ""),
                "address": row["address"],
                "latitude": latitude,
                "longitude": longitude,
                "gcj02_latitude": gcj_latitude,
                "gcj02_longitude": gcj_longitude,
                "price_level": _int_value(
                    row_number, row, "price_level", errors, default=2, minimum=1, maximum=4
                ),
                "business_hours": row.get("business_hours") or "07:00-21:00",
                "is_active": True,
            }
        else:
            required = ["merchant_id", "name", "price_cents", "image_url"]
            if not _required(row_number, row, required, errors):
                continue
            if db.get(Merchant, row["merchant_id"]) is None:
                errors.append(_error(row_number, "merchant_id", "商家不存在"))
            if row.get("category_id") and db.get(Category, row["category_id"]) is None:
                errors.append(_error(row_number, "category_id", "品类不存在"))
            item_type = row.get("item_type") or "dish"
            if item_type not in {"dish", "combo"}:
                errors.append(_error(row_number, "item_type", "只能是 dish 或 combo"))
            data = {
                "merchant_id": row["merchant_id"],
                "category_id": row.get("category_id") or None,
                "name": row["name"],
                "description": row.get("description", ""),
                "item_type": item_type,
                "price_cents": _int_value(
                    row_number, row, "price_cents", errors, minimum=0, maximum=1_000_000
                ),
                "image_url": row["image_url"],
                "tags": [value.strip() for value in row.get("tags", "").split("|") if value.strip()],
                "is_active": True,
            }
        if len(errors) == before:
            parsed.append(data)
    return parsed, errors


def _validation(rows: list[dict[str, str]], parsed: list[dict[str, Any]], errors: list[ImportErrorRead]):
    invalid_rows = len({error.row for error in errors})
    return ImportValidationRead(
        total=len(rows),
        valid=len(parsed),
        invalid=invalid_rows,
        errors=errors[:100],
    )


@router.post("/validate", response_model=ImportValidationRead)
async def validate_import(
    db: DbSession,
    admin: ImportManager,
    file: UploadFile = File(...),
    import_type: str = Form(..., alias="type"),
) -> ImportValidationRead:
    if import_type not in SUPPORTED_TYPES:
        raise HTTPException(status_code=422, detail="导入类型必须是 areas、merchants 或 menu_items")
    rows = await _read_rows(file)
    parsed, errors = _validate_rows(db, import_type, rows)
    return _validation(rows, parsed, errors)


@router.post("", response_model=ImportJobRead, status_code=201)
async def start_import(
    db: DbSession,
    admin: ImportManager,
    file: UploadFile = File(...),
    import_type: str = Form(..., alias="type"),
) -> ImportJobRead:
    if import_type not in SUPPORTED_TYPES:
        raise HTTPException(status_code=422, detail="导入类型必须是 areas、merchants 或 menu_items")
    rows = await _read_rows(file)
    parsed, errors = _validate_rows(db, import_type, rows)
    job = ImportJob(
        file_name=file.filename or "import.csv",
        import_type=import_type,
        status="processing",
        progress=0,
        total=len(rows),
        success=0,
        failed=len({error.row for error in errors}),
        errors=[error.model_dump() for error in errors[:100]],
        created_by_user_id=admin.id,
        created_by_name=admin.username,
    )
    db.add(job)
    db.flush()
    model = {"areas": CampusArea, "merchants": Merchant, "menu_items": MenuItem}[import_type]
    try:
        db.add_all(model(**values) for values in parsed)
        job.success = len(parsed)
        job.progress = 100
        job.status = "completed" if parsed or not rows else "failed"
        db.add(
            AdminAuditLog(
                admin_user_id=admin.id,
                action=f"import.{import_type}",
                target_type="import",
                target_id=job.id,
                detail={"success": job.success, "failed": job.failed},
            )
        )
        db.commit()
    except Exception:
        db.rollback()
        failed_job = ImportJob(
            id=job.id,
            file_name=job.file_name,
            import_type=import_type,
            status="failed",
            progress=100,
            total=len(rows),
            success=0,
            failed=len(rows),
            errors=[{"row": 0, "field": "database", "message": "数据库写入失败"}],
            created_by_user_id=admin.id,
            created_by_name=admin.username,
        )
        db.add(failed_job)
        db.commit()
        job = failed_job
    return _present_job(job)


@router.get("", response_model=list[ImportJobRead])
def list_import_jobs(db: DbSession, admin: ImportManager) -> list[ImportJobRead]:
    rows = db.scalars(select(ImportJob).order_by(ImportJob.created_at.desc()).limit(100)).all()
    return [_present_job(row) for row in rows]


def _present_job(job: ImportJob) -> ImportJobRead:
    return ImportJobRead(
        id=job.id,
        file_name=job.file_name,
        type=job.import_type,
        status=job.status,
        progress=job.progress,
        total=job.total,
        success=job.success,
        failed=job.failed,
        created_by=job.created_by_name,
        created_at=job.created_at,
    )
