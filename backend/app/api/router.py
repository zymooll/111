from fastapi import APIRouter

from app.api.auth import router as auth_router
from app.api.catalog import router as catalog_router
from app.api.discovery import router as discovery_router
from app.api.events import router as events_router
from app.api.favorites import router as favorites_router
from app.api.map import router as map_router
from app.api.profile import router as profile_router
from app.api.reviews import router as reviews_router
from app.api.uploads import router as uploads_router


router = APIRouter(prefix="/api/v1")
router.include_router(auth_router)
router.include_router(discovery_router)
router.include_router(catalog_router)
router.include_router(map_router)
router.include_router(favorites_router)
router.include_router(reviews_router)
router.include_router(profile_router)
router.include_router(events_router)
router.include_router(uploads_router)
