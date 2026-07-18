from __future__ import annotations

import hashlib
import secrets
import smtplib
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import AccountActionToken, User


VERIFY_EMAIL = "verify_email"
RESET_PASSWORD = "reset_password"


def issue_account_token(
    db: Session,
    user: User,
    *,
    purpose: str,
    ttl_minutes: int,
) -> str:
    now = datetime.now(UTC)
    for existing in db.scalars(
        select(AccountActionToken).where(
            AccountActionToken.user_id == user.id,
            AccountActionToken.purpose == purpose,
            AccountActionToken.used_at.is_(None),
        )
    ).all():
        existing.used_at = now
    raw = secrets.token_urlsafe(32)
    db.add(
        AccountActionToken(
            user_id=user.id,
            purpose=purpose,
            token_hash=_hash(raw),
            expires_at=now + timedelta(minutes=ttl_minutes),
        )
    )
    db.commit()
    return raw


def consume_account_token(db: Session, token: str, *, purpose: str) -> User | None:
    record = db.scalar(
        select(AccountActionToken).where(
            AccountActionToken.purpose == purpose,
            AccountActionToken.token_hash == _hash(token),
            AccountActionToken.used_at.is_(None),
        )
    )
    if record is None:
        return None
    expires_at = record.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if expires_at <= datetime.now(UTC):
        record.used_at = datetime.now(UTC)
        db.commit()
        return None
    user = db.get(User, record.user_id)
    if user is None:
        return None
    record.used_at = datetime.now(UTC)
    return user


def send_account_email(
    settings: Settings,
    *,
    recipient: str,
    subject: str,
    body: str,
) -> bool:
    if not settings.smtp_host:
        return False
    message = EmailMessage()
    message["From"] = settings.mail_from
    message["To"] = recipient
    message["Subject"] = subject
    message.set_content(body)
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=5) as smtp:
            if settings.smtp_use_tls:
                smtp.starttls()
            if settings.smtp_username:
                smtp.login(settings.smtp_username, settings.smtp_password or "")
            smtp.send_message(message)
    except (OSError, smtplib.SMTPException):
        return False
    return True


def verification_link(settings: Settings, token: str) -> str:
    return f"{settings.user_web_origin.rstrip('/')}/verify-email?token={token}"


def reset_link(settings: Settings, token: str) -> str:
    return f"{settings.user_web_origin.rstrip('/')}/reset-password?token={token}"


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
