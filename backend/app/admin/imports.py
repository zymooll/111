from __future__ import annotations

import csv
from io import StringIO
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.dependencies import AdminCampusId, CurrentAdmin, DbSession, authorize_campus
from app.models import (
    AdminAuditLog,
    Campus,
    CampusArea,
    Category,
    ImportJob,
    MenuItem,
    Merchant,
    Tag,
    User,
    UserRole,
)
from app.schemas import (
    CursorPage,
    ImportErrorRead,
    ImportJobDetailRead,
    ImportJobRead,
    ImportValidationRead,
)
from app.services.campuses import require_campus
from app.services.geo import wgs84_to_gcj02
from app.services.pagination import before_cursor, page_metadata

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


def _write_failure_reason(exc: SQLAlchemyError) -> str:
    if isinstance(exc, IntegrityError):
        return "与库中已有记录冲突（可能重复或引用了不存在的数据）"
    return "数据库写入失败"


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
    campus_id: str,
) -> tuple[list[tuple[int, dict[str, Any]]], list[ImportErrorRead]]:
    parsed: list[tuple[int, dict[str, Any]]] = []
    errors: list[ImportErrorRead] = []
    for row_number, row in enumerate(rows, start=2):
        before = len(errors)
        data: dict[str, Any] = {}
        if import_type == "areas":
            if not _required(row_number, row, ["campus_id", "name"], errors):
                continue
            if db.get(Campus, row["campus_id"]) is None:
                errors.append(_error(row_number, "campus_id", "校园不存在"))
            if row["campus_id"] != campus_id:
                errors.append(_error(row_number, "campus_id", "不能跨校园导入"))
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
            if row["campus_id"] != campus_id:
                errors.append(_error(row_number, "campus_id", "不能跨校园导入"))
            if row.get("area_id"):
                area = db.get(CampusArea, row["area_id"])
                if area is None or area.campus_id != row["campus_id"]:
                    errors.append(_error(row_number, "area_id", "校园地点不存在或不属于校园"))
            if row.get("category_id"):
                category = db.get(Category, row["category_id"])
                if category is None or category.campus_id != campus_id:
                    errors.append(_error(row_number, "category_id", "品类不属于当前校园"))
            latitude = _float_value(row_number, row, "latitude", errors)
            longitude = _float_value(row_number, row, "longitude", errors)
            if latitude is not None and not -90 <= latitude <= 90:
                errors.append(_error(row_number, "latitude", "纬度必须在 -90 到 90 之间"))
            if longitude is not None and not -180 <= longitude <= 180:
                errors.append(_error(row_number, "longitude", "经度必须在 -180 到 180 之间"))
            if row.get("gcj02_latitude") and row.get("gcj02_longitude"):
                gcj_latitude = _float_value(row_number, row, "gcj02_latitude", errors)
                gcj_longitude = _float_value(row_number, row, "gcj02_longitude", errors)
            elif latitude is not None and longitude is not None:
                gcj_latitude, gcj_longitude = wgs84_to_gcj02(latitude, longitude)
            else:
                gcj_latitude, gcj_longitude = latitude, longitude
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
            merchant = db.get(Merchant, row["merchant_id"])
            if merchant is None:
                errors.append(_error(row_number, "merchant_id", "商家不存在"))
            elif merchant.campus_id != campus_id:
                errors.append(_error(row_number, "merchant_id", "商家不属于当前校园"))
            if row.get("category_id"):
                category = db.get(Category, row["category_id"])
                if category is None or category.campus_id != campus_id:
                    errors.append(_error(row_number, "category_id", "品类不属于当前校园"))
            item_type = row.get("item_type") or "dish"
            if item_type not in {"dish", "combo"}:
                errors.append(_error(row_number, "item_type", "只能是 dish 或 combo"))
            tag_values = [
                value.strip() for value in row.get("tags", "").split("|") if value.strip()
            ]
            known_tags = set(
                db.scalars(
                    select(Tag.name).where(
                        Tag.campus_id == campus_id,
                        Tag.name.in_(set(tag_values)),
                    )
                ).all()
            )
            unknown_tags = sorted(set(tag_values) - known_tags)
            if unknown_tags:
                errors.append(
                    _error(
                        row_number,
                        "tags",
                        f"标签不属于当前校园字典：{'、'.join(unknown_tags)}",
                    )
                )
            data = {
                "campus_id": campus_id,
                "merchant_id": row["merchant_id"],
                "category_id": row.get("category_id") or None,
                "name": row["name"],
                "description": row.get("description", ""),
                "item_type": item_type,
                "price_cents": _int_value(
                    row_number, row, "price_cents", errors, minimum=0, maximum=1_000_000
                ),
                "image_url": row["image_url"],
                "tags": tag_values,
                "is_active": True,
            }
        if len(errors) == before:
            parsed.append((row_number, data))
    return _reject_duplicates(db, import_type, parsed, errors)


def _natural_key(import_type: str, data: dict[str, Any]) -> tuple:
    if import_type == "areas":
        return (data["campus_id"], data.get("parent_id"), data["name"])
    if import_type == "merchants":
        return (data["campus_id"], data["name"])
    return (data["merchant_id"], data["name"])


def _existing_keys(db, import_type: str, campus_id: str) -> set[tuple]:
    if import_type == "areas":
        rows = db.execute(
            select(CampusArea.campus_id, CampusArea.parent_id, CampusArea.name).where(
                CampusArea.campus_id == campus_id
            )
        ).all()
        return {(row[0], row[1], row[2]) for row in rows}
    if import_type == "merchants":
        rows = db.execute(
            select(Merchant.campus_id, Merchant.name).where(Merchant.campus_id == campus_id)
        ).all()
        return {(row[0], row[1]) for row in rows}
    rows = db.execute(
        select(MenuItem.merchant_id, MenuItem.name).where(MenuItem.campus_id == campus_id)
    ).all()
    return {(row[0], row[1]) for row in rows}


def _reject_duplicates(
    db,
    import_type: str,
    parsed: list[tuple[int, dict[str, Any]]],
    errors: list[ImportErrorRead],
) -> tuple[list[tuple[int, dict[str, Any]]], list[ImportErrorRead]]:
    """Reject rows that clash with the file itself or with what is already stored.

    校验阶段就把重复挡下来，避免"预校验通过、导入却整批回滚"，也避免没有唯一约束的表
    （商家、菜品）被重复导入后静默产生两套数据。
    """
    if not parsed:
        return parsed, errors
    campus_id = parsed[0][1].get("campus_id")
    stored = _existing_keys(db, import_type, campus_id) if campus_id else set()
    seen: set[tuple] = set()
    kept: list[tuple[int, dict[str, Any]]] = []
    for row_number, data in parsed:
        key = _natural_key(import_type, data)
        if key in seen:
            errors.append(_error(row_number, "name", "该名称在文件中重复出现"))
            continue
        if key in stored:
            errors.append(_error(row_number, "name", "库中已存在同名记录，重复导入会产生重复数据"))
            continue
        seen.add(key)
        kept.append((row_number, data))
    return kept, errors


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
    campus_id: str = Form(...),
) -> ImportValidationRead:
    authorize_campus(db, admin, campus_id)
    if import_type not in SUPPORTED_TYPES:
        raise HTTPException(status_code=422, detail="导入类型必须是 areas、merchants 或 menu_items")
    rows = await _read_rows(file)
    parsed, errors = _validate_rows(db, import_type, rows, campus_id)
    return _validation(rows, parsed, errors)


@router.post("", response_model=ImportJobRead, status_code=201)
async def start_import(
    db: DbSession,
    admin: ImportManager,
    file: UploadFile = File(...),
    import_type: str = Form(..., alias="type"),
    campus_id: str = Form(...),
) -> ImportJobRead:
    authorize_campus(db, admin, campus_id)
    if import_type not in SUPPORTED_TYPES:
        raise HTTPException(status_code=422, detail="导入类型必须是 areas、merchants 或 menu_items")
    rows = await _read_rows(file)
    parsed, errors = _validate_rows(db, import_type, rows, campus_id)
    job = ImportJob(
        campus_id=campus_id,
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
    # 每行独立 savepoint：一行写失败只丢这一行，并保留逐行的校验错误，不再整批回滚。
    written = 0
    for row_number, values in parsed:
        try:
            with db.begin_nested():
                db.add(model(**values))
        except SQLAlchemyError as exc:
            errors.append(_error(row_number, "database", _write_failure_reason(exc)))
        else:
            written += 1

    job.success = written
    job.failed = len({error.row for error in errors})
    job.errors = [error.model_dump() for error in errors[:100]]
    job.progress = 100
    job.status = "completed" if written else ("completed" if not rows else "failed")
    db.add(
        AdminAuditLog(
            campus_id=campus_id,
            admin_user_id=admin.id,
            action=f"import.{import_type}",
            target_type="import",
            target_id=job.id,
            detail={"success": job.success, "failed": job.failed},
        )
    )
    db.commit()
    db.refresh(job)
    return _present_job(job)


@router.get("", response_model=CursorPage[ImportJobRead])
def list_import_jobs(
    db: DbSession,
    admin: ImportManager,
    campus_id: AdminCampusId,
    cursor: str | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> CursorPage[ImportJobRead]:
    require_campus(db, campus_id)
    query = select(ImportJob).where(ImportJob.campus_id == campus_id)
    cursor_condition = before_cursor(ImportJob.created_at, ImportJob.id, cursor)
    if cursor_condition is not None:
        query = query.where(cursor_condition)
    rows = list(
        db.scalars(
            query.order_by(ImportJob.created_at.desc(), ImportJob.id.desc()).limit(limit + 1)
        ).all()
    )
    visible, next_cursor, has_more = page_metadata(rows, limit)
    return CursorPage(
        items=[_present_job(row) for row in visible],
        next_cursor=next_cursor,
        has_more=has_more,
    )


@router.get("/{job_id}", response_model=ImportJobDetailRead)
def get_import_job(
    job_id: str,
    db: DbSession,
    admin: ImportManager,
    campus_id: AdminCampusId,
) -> ImportJobDetailRead:
    """逐行错误报告：管理员据此定位是哪一行哪一列导入失败。"""
    job = db.get(ImportJob, job_id)
    if job is None or job.campus_id != campus_id:
        raise HTTPException(status_code=404, detail="导入任务不存在或不属于该校园")
    return _present_job_detail(job)


def _job_fields(job: ImportJob) -> dict[str, Any]:
    return {
        "id": job.id,
        "campus_id": job.campus_id,
        "file_name": job.file_name,
        "type": job.import_type,
        "status": job.status,
        "progress": job.progress,
        "total": job.total,
        "success": job.success,
        "failed": job.failed,
        "created_by": job.created_by_name,
        "created_at": job.created_at,
    }


def _present_job(job: ImportJob) -> ImportJobRead:
    return ImportJobRead(**_job_fields(job))


def _present_job_detail(job: ImportJob) -> ImportJobDetailRead:
    return ImportJobDetailRead(
        **_job_fields(job),
        errors=[ImportErrorRead(**error) for error in job.errors or []],
    )
