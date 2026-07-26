from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.models import GuestSession, User, UserRole
from app.security import TokenError, decode_token

USER_AUDIENCE = "campus-food-user"
ADMIN_AUDIENCE = "campus-food-admin"

optional_bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class Principal:
    kind: str
    id: str
    role: str | None = None

    @property
    def is_user(self) -> bool:
        return self.kind == "user"

    @property
    def is_guest(self) -> bool:
        return self.kind == "guest"


def get_db(request: Request):
    yield from request.app.state.database.session()


DbSession = Annotated[Session, Depends(get_db)]


def _unauthorized(detail: str = "登录状态无效") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def optional_principal(
    request: Request,
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(optional_bearer)],
) -> Principal | None:
    if credentials is None:
        return None
    settings = request.app.state.settings
    try:
        payload = decode_token(
            credentials.credentials,
            secret_key=settings.secret_key,
            audience=USER_AUDIENCE,
        )
    except TokenError as exc:
        raise _unauthorized(str(exc)) from exc

    token_type = payload.get("typ")
    subject = str(payload["sub"])
    if token_type == "access":
        user = db.get(User, subject)
        if user is None or not user.is_active:
            raise _unauthorized("用户不存在或已停用")
        return Principal("user", user.id, user.role)
    if token_type == "guest":
        guest = db.get(GuestSession, subject)
        if guest is None or not guest.is_active:
            raise _unauthorized("游客会话已失效")
        return Principal("guest", guest.id)
    raise _unauthorized("令牌类型无效")


OptionalPrincipal = Annotated[Principal | None, Depends(optional_principal)]


def require_principal(principal: OptionalPrincipal) -> Principal:
    if principal is None:
        raise _unauthorized("请先创建游客会话或登录")
    return principal


PrincipalRequired = Annotated[Principal, Depends(require_principal)]


def require_user(principal: OptionalPrincipal, db: DbSession) -> User:
    if principal is None or not principal.is_user:
        raise _unauthorized("评价功能需要登录")
    user = db.get(User, principal.id)
    if user is None or not user.is_active:
        raise _unauthorized()
    return user


CurrentUser = Annotated[User, Depends(require_user)]


def require_admin(
    request: Request,
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(optional_bearer)],
) -> User:
    if credentials is None:
        raise _unauthorized("管理员请先登录")
    try:
        payload = decode_token(
            credentials.credentials,
            secret_key=request.app.state.settings.secret_key,
            audience=ADMIN_AUDIENCE,
        )
    except TokenError as exc:
        raise _unauthorized(str(exc)) from exc
    if payload.get("typ") != "access":
        raise _unauthorized("令牌类型无效")
    user = db.get(User, str(payload["sub"]))
    allowed = {UserRole.REVIEWER, UserRole.CAMPUS_ADMIN, UserRole.SUPER_ADMIN}
    if user is None or not user.is_active or user.role not in allowed:
        raise HTTPException(status_code=403, detail="没有管理权限")
    return user


CurrentAdmin = Annotated[User, Depends(require_admin)]


def authorize_campus(db: Session, admin: User, campus_id: str) -> str:
    """Prove ``admin`` may manage ``campus_id``.

    校园归属由服务端根据管理员账号判定，客户端传入的 ``campus_id`` 只是选择目标，
    不构成授权；未授予校园的管理账号一律拒绝（fail-close）。
    """
    from app.services.campuses import require_campus

    require_campus(db, campus_id)
    if admin.role == UserRole.SUPER_ADMIN:
        return campus_id
    if admin.managed_campus_id is None:
        raise HTTPException(
            status_code=403,
            detail="该管理账号尚未分配可管理的校园，请联系超级管理员",
        )
    if admin.managed_campus_id != campus_id:
        raise HTTPException(status_code=403, detail="没有该校园的管理权限")
    return campus_id


def require_admin_campus(campus_id: str, db: DbSession, admin: CurrentAdmin) -> str:
    return authorize_campus(db, admin, campus_id)


AdminCampusId = Annotated[str, Depends(require_admin_campus)]
