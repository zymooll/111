from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.dependencies import (
    ADMIN_AUDIENCE,
    USER_AUDIENCE,
    CurrentAdmin,
    CurrentUser,
    DbSession,
)
from app.models import (
    Favorite,
    GuestSession,
    InteractionEvent,
    RefreshSession,
    User,
    UserProfile,
)
from app.schemas import (
    AccountActionResponse,
    GuestToken,
    LoginRequest,
    LogoutRequest,
    Message,
    OAuthProviderRead,
    PasswordForgotRequest,
    PasswordResetRequest,
    RefreshRequest,
    RegisterRequest,
    TokenRequest,
    TokenPair,
    UserRead,
)
from app.security import TokenError, create_token, decode_token, hash_password, verify_password
from app.services.accounts import (
    RESET_PASSWORD,
    VERIFY_EMAIL,
    consume_account_token,
    issue_account_token,
    reset_link,
    send_account_email,
    verification_link,
)


router = APIRouter(prefix="/auth", tags=["鉴权"])
admin_auth_router = APIRouter(prefix="/auth", tags=["管理端鉴权"])


@router.get("/providers", response_model=list[OAuthProviderRead])
def oauth_providers(request: Request) -> list[OAuthProviderRead]:
    """Advertise only configured providers; an empty list keeps login UI hidden."""
    return [
        OAuthProviderRead(
            id=provider,
            authorize_url=f"/api/v1/auth/oauth/{provider}/authorize",
        )
        for provider in request.app.state.settings.oauth_providers
    ]


@router.get("/oauth/{provider}/authorize", include_in_schema=True)
def oauth_authorize(provider: str, request: Request):
    if provider not in request.app.state.settings.oauth_providers:
        raise HTTPException(status_code=404, detail="第三方登录提供方未配置")
    raise HTTPException(status_code=501, detail="第三方登录适配器尚未安装")


def _create_access_token(request: Request, user: User, *, audience: str) -> str:
    settings = request.app.state.settings
    return create_token(
        subject=user.id,
        secret_key=settings.secret_key,
        audience=audience,
        token_type="access",
        expires_delta=timedelta(minutes=settings.user_access_token_minutes),
        extra={"role": user.role},
    )


def _issue_pair(request: Request, db: Session, user: User, *, audience: str) -> TokenPair:
    settings = request.app.state.settings
    refresh = create_token(
        subject=user.id,
        secret_key=settings.secret_key,
        audience=audience,
        token_type="refresh",
        expires_delta=timedelta(days=settings.refresh_token_days),
    )
    payload = decode_token(refresh, secret_key=settings.secret_key, audience=audience)
    db.add(
        RefreshSession(
            user_id=user.id,
            jti=payload["jti"],
            audience=audience,
            expires_at=datetime.fromtimestamp(payload["exp"], UTC),
        )
    )
    db.commit()
    return TokenPair(
        access_token=_create_access_token(request, user, audience=audience),
        refresh_token=refresh,
        expires_in=settings.user_access_token_minutes * 60,
        user=UserRead.model_validate(user),
    )


def _merge_guest(request: Request, db: Session, user: User, guest_token: str | None) -> None:
    if not guest_token:
        return
    try:
        payload = decode_token(
            guest_token,
            secret_key=request.app.state.settings.secret_key,
            audience=USER_AUDIENCE,
        )
    except TokenError:
        return
    if payload.get("typ") != "guest":
        return
    guest = db.get(GuestSession, str(payload["sub"]))
    if guest is None or not guest.is_active:
        return

    existing = set(
        db.scalars(select(Favorite.merchant_id).where(Favorite.user_id == user.id)).all()
    )
    for favorite in db.scalars(select(Favorite).where(Favorite.guest_id == guest.id)).all():
        if favorite.merchant_id in existing:
            db.delete(favorite)
        else:
            favorite.user_id = user.id
            favorite.guest_id = None
            existing.add(favorite.merchant_id)

    profile = db.scalar(select(UserProfile).where(UserProfile.user_id == user.id))
    if profile is None:
        profile = UserProfile(user_id=user.id, preferences=guest.preferences or {})
        db.add(profile)
    elif guest.preferences:
        merged = dict(profile.preferences or {})
        for key, value in guest.preferences.items():
            if isinstance(value, list):
                merged[key] = list(dict.fromkeys([*(merged.get(key) or []), *value]))
            elif value is not None:
                merged[key] = value
        profile.preferences = merged
    db.execute(
        update(InteractionEvent)
        .where(
            InteractionEvent.actor_type == "guest",
            InteractionEvent.actor_id == guest.id,
        )
        .values(actor_type="user", actor_id=user.id)
    )
    guest.is_active = False
    db.flush()


@router.post("/guest", response_model=GuestToken, status_code=201)
def create_guest(request: Request, db: DbSession) -> GuestToken:
    settings = request.app.state.settings
    guest = GuestSession()
    db.add(guest)
    db.commit()
    db.refresh(guest)
    token = create_token(
        subject=guest.id,
        secret_key=settings.secret_key,
        audience=USER_AUDIENCE,
        token_type="guest",
        expires_delta=timedelta(days=settings.guest_token_days),
    )
    return GuestToken(
        guest_id=guest.id,
        access_token=token,
        expires_in=settings.guest_token_days * 86400,
    )


@router.post("/register", response_model=TokenPair, status_code=201)
def register(payload: RegisterRequest, request: Request, db: DbSession) -> TokenPair:
    existing = db.scalar(
        select(User).where(
            or_(User.username == payload.username, User.email == payload.email.lower())
        )
    )
    if existing is not None:
        raise HTTPException(status_code=409, detail="用户名或邮箱已被使用")
    user = User(
        username=payload.username,
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    try:
        db.flush()
        db.add(UserProfile(user_id=user.id, preferences={}))
        db.flush()
        _merge_guest(request, db, user, payload.guest_token)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="用户名或邮箱已被使用") from exc
    settings = request.app.state.settings
    token = issue_account_token(
        db,
        user,
        purpose=VERIFY_EMAIL,
        ttl_minutes=settings.account_token_minutes,
    )
    send_account_email(
        settings,
        recipient=user.email,
        subject="验证你的 Campus Foodie 邮箱",
        body=f"请在 {settings.account_token_minutes} 分钟内打开以下链接：\n{verification_link(settings, token)}",
    )
    return _issue_pair(request, db, user, audience=USER_AUDIENCE)


def _login(
    payload: LoginRequest,
    request: Request,
    db: Session,
    *,
    admin: bool,
) -> TokenPair:
    user = db.scalar(
        select(User).where(
            or_(
                User.username == payload.identifier,
                User.email == payload.identifier.lower(),
            )
        )
    )
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="账号或密码错误")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="账号已停用")
    if admin and user.role == "user":
        raise HTTPException(status_code=403, detail="该账号没有管理权限")
    if not admin:
        _merge_guest(request, db, user, payload.guest_token)
        db.commit()
    audience = ADMIN_AUDIENCE if admin else USER_AUDIENCE
    return _issue_pair(request, db, user, audience=audience)


@router.post("/login", response_model=TokenPair)
def login(payload: LoginRequest, request: Request, db: DbSession) -> TokenPair:
    return _login(payload, request, db, admin=False)


@admin_auth_router.post("/login", response_model=TokenPair)
def admin_login(payload: LoginRequest, request: Request, db: DbSession) -> TokenPair:
    return _login(payload, request, db, admin=True)


def _refresh(
    payload: RefreshRequest,
    request: Request,
    db: Session,
    *,
    audience: str,
) -> TokenPair:
    try:
        token_payload = decode_token(
            payload.refresh_token,
            secret_key=request.app.state.settings.secret_key,
            audience=audience,
        )
    except TokenError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    if token_payload.get("typ") != "refresh":
        raise HTTPException(status_code=401, detail="令牌类型无效")
    session = db.scalar(
        select(RefreshSession).where(
            RefreshSession.jti == token_payload["jti"],
            RefreshSession.audience == audience,
        )
    )
    if session is None or session.revoked_at is not None:
        raise HTTPException(status_code=401, detail="刷新令牌已撤销")
    user = db.get(User, str(token_payload["sub"]))
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="用户不存在或已停用")
    session.revoked_at = datetime.now(UTC)
    db.commit()
    return _issue_pair(request, db, user, audience=audience)


@router.post("/refresh", response_model=TokenPair)
def refresh(payload: RefreshRequest, request: Request, db: DbSession) -> TokenPair:
    return _refresh(payload, request, db, audience=USER_AUDIENCE)


@admin_auth_router.post("/refresh", response_model=TokenPair)
def admin_refresh(payload: RefreshRequest, request: Request, db: DbSession) -> TokenPair:
    return _refresh(payload, request, db, audience=ADMIN_AUDIENCE)


@router.post("/logout", response_model=Message)
@admin_auth_router.post("/logout", response_model=Message)
def logout(payload: LogoutRequest, request: Request, db: DbSession) -> Message:
    for audience in (USER_AUDIENCE, ADMIN_AUDIENCE):
        try:
            token_payload = decode_token(
                payload.refresh_token,
                secret_key=request.app.state.settings.secret_key,
                audience=audience,
            )
        except TokenError:
            continue
        session = db.scalar(
            select(RefreshSession).where(RefreshSession.jti == token_payload.get("jti"))
        )
        if session is not None and session.revoked_at is None:
            session.revoked_at = datetime.now(UTC)
            db.commit()
        break
    return Message(message="已退出登录")


@router.get("/me", response_model=UserRead)
def auth_me(user: CurrentUser) -> UserRead:
    return UserRead.model_validate(user)


@router.post("/email-verification/request", response_model=AccountActionResponse)
def request_email_verification(
    request: Request,
    db: DbSession,
    user: CurrentUser,
) -> AccountActionResponse:
    if user.email_verified:
        return AccountActionResponse(message="邮箱已经完成验证")
    settings = request.app.state.settings
    token = issue_account_token(
        db,
        user,
        purpose=VERIFY_EMAIL,
        ttl_minutes=settings.account_token_minutes,
    )
    send_account_email(
        settings,
        recipient=user.email,
        subject="验证你的 Campus Foodie 邮箱",
        body=f"请在 {settings.account_token_minutes} 分钟内打开以下链接：\n{verification_link(settings, token)}",
    )
    return AccountActionResponse(
        message="验证邮件已发送",
        debug_token=None if settings.production else token,
    )


@router.post("/email-verification/confirm", response_model=UserRead)
def confirm_email_verification(payload: TokenRequest, db: DbSession) -> UserRead:
    user = consume_account_token(db, payload.token, purpose=VERIFY_EMAIL)
    if user is None:
        raise HTTPException(status_code=400, detail="验证链接无效或已过期")
    user.email_verified = True
    db.commit()
    db.refresh(user)
    return UserRead.model_validate(user)


@router.post("/password/forgot", response_model=AccountActionResponse)
def forgot_password(
    payload: PasswordForgotRequest,
    request: Request,
    db: DbSession,
) -> AccountActionResponse:
    settings = request.app.state.settings
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    debug_token = None
    if user is not None and user.is_active:
        token = issue_account_token(
            db,
            user,
            purpose=RESET_PASSWORD,
            ttl_minutes=settings.account_token_minutes,
        )
        send_account_email(
            settings,
            recipient=user.email,
            subject="重置你的 Campus Foodie 密码",
            body=f"请在 {settings.account_token_minutes} 分钟内打开以下链接：\n{reset_link(settings, token)}",
        )
        if not settings.production:
            debug_token = token
    return AccountActionResponse(
        message="如果邮箱已注册，重置邮件将很快送达",
        debug_token=debug_token,
    )


@router.post("/password/reset", response_model=Message)
def reset_password(payload: PasswordResetRequest, db: DbSession) -> Message:
    user = consume_account_token(db, payload.token, purpose=RESET_PASSWORD)
    if user is None:
        raise HTTPException(status_code=400, detail="重置链接无效或已过期")
    user.password_hash = hash_password(payload.new_password)
    now = datetime.now(UTC)
    for session in db.scalars(
        select(RefreshSession).where(
            RefreshSession.user_id == user.id,
            RefreshSession.revoked_at.is_(None),
        )
    ).all():
        session.revoked_at = now
    db.commit()
    return Message(message="密码已重置，请重新登录")


@admin_auth_router.get("/me", response_model=UserRead)
def admin_auth_me(admin: CurrentAdmin) -> UserRead:
    return UserRead.model_validate(admin)
