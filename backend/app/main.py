from __future__ import annotations

from contextlib import asynccontextmanager
import logging
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError, ResponseValidationError
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.admin.router import router as admin_router
from app.api.router import router as api_router
from app.config import Settings, get_settings
from app.database import Database
from app.seed import seed_demo_data
from app.services.idempotency import idempotency_middleware


logger = logging.getLogger(__name__)


def create_app(settings: Settings | None = None, database: Database | None = None) -> FastAPI:
    settings = settings or get_settings()
    database = database or Database(settings.database_url)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        database.create_all()
        if settings.auto_seed:
            with database.session_factory() as db:
                seed_demo_data(db)
        settings.upload_dir.mkdir(parents=True, exist_ok=True)
        yield
        database.dispose()

    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        description=(
            "校园饮食推荐系统 API。用户端位于 `/api/v1`，管理端位于 "
            "`/admin/api/v1`；DeepSeek 未配置时推荐会确定性降级。"
        ),
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.database = database
    settings.upload_dir.mkdir(parents=True, exist_ok=True)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID"],
    )

    app.middleware("http")(idempotency_middleware)

    @app.middleware("http")
    async def request_id_middleware(request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or str(uuid4())
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        return _problem_response(
            request,
            status_code=exc.status_code,
            detail=str(exc.detail),
            headers=exc.headers,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=422,
            content={
                "type": "https://campus-food.local/problems/validation-error",
                "title": "请求参数校验失败",
                "status": 422,
                "detail": "请检查提交的数据",
                "errors": jsonable_encoder(exc.errors()),
                "instance": str(request.url.path),
                "request_id": getattr(request.state, "request_id", None),
            },
            media_type="application/problem+json",
        )

    @app.exception_handler(ResponseValidationError)
    async def response_validation_exception_handler(
        request: Request, exc: ResponseValidationError
    ):
        logger.exception("Response validation failed for %s", request.url.path, exc_info=exc)
        return _problem_response(
            request,
            status_code=500,
            detail="服务器响应校验失败",
            problem_type="https://campus-food.local/problems/response-validation-error",
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        logger.exception("Unhandled API error for %s", request.url.path, exc_info=exc)
        return _problem_response(
            request,
            status_code=500,
            detail="服务器内部错误",
            problem_type="https://campus-food.local/problems/internal-error",
        )

    @app.get("/health", tags=["系统"])
    def health() -> dict[str, str]:
        return {"status": "ok", "environment": settings.environment}

    app.include_router(api_router)
    app.include_router(admin_router)
    app.mount("/media", StaticFiles(directory=settings.upload_dir), name="media")
    return app


def _status_title(status_code: int) -> str:
    return {
        400: "请求错误",
        401: "未登录或登录已失效",
        403: "没有权限",
        404: "资源不存在",
        405: "请求方法不支持",
        409: "资源状态冲突",
        413: "上传内容过大",
        422: "请求参数校验失败",
        429: "请求过于频繁",
        500: "服务器内部错误",
        501: "功能尚未实现",
    }.get(status_code, "请求处理失败")


def _problem_response(
    request: Request,
    *,
    status_code: int,
    detail: str,
    problem_type: str = "about:blank",
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "type": problem_type,
            "title": _status_title(status_code),
            "status": status_code,
            "detail": detail,
            "instance": str(request.url.path),
            "request_id": getattr(request.state, "request_id", None),
        },
        media_type="application/problem+json",
        headers=headers,
    )


app = create_app()
