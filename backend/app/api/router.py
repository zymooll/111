from fastapi import APIRouter

from app.api.auth import router as auth_router
from app.api.catalog import router as catalog_router
from app.api.interactions import router as interactions_router
from app.api.map import router as map_router


router = APIRouter(prefix="/api/v1")
router.include_router(auth_router)
router.include_router(catalog_router)
router.include_router(interactions_router)
router.include_router(map_router)
