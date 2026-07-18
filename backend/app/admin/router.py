from fastapi import APIRouter

from app.admin.routes import router as routes_router
from app.admin.imports import router as imports_router
from app.api.auth import admin_auth_router


router = APIRouter(prefix="/admin/api/v1")
router.include_router(admin_auth_router)
router.include_router(routes_router)
router.include_router(imports_router)
