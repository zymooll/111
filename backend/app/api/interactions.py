"""Compatibility router for clients importing the former combined interaction module.

New application wiring includes the focused routers directly; this aggregate remains so
third-party extensions that imported ``app.api.interactions.router`` keep working.
"""

from fastapi import APIRouter

from app.api.events import router as events_router
from app.api.favorites import router as favorites_router
from app.api.profile import router as profile_router
from app.api.reviews import router as reviews_router
from app.api.uploads import router as uploads_router


router = APIRouter()
router.include_router(favorites_router)
router.include_router(reviews_router)
router.include_router(profile_router)
router.include_router(events_router)
router.include_router(uploads_router)
