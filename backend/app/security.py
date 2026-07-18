from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4


class TokenError(ValueError):
    pass


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def create_token(
    *,
    subject: str,
    secret_key: str,
    audience: str,
    token_type: str,
    expires_delta: timedelta,
    extra: dict[str, Any] | None = None,
) -> str:
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": subject,
        "aud": audience,
        "typ": token_type,
        "iat": int(now.timestamp()),
        "exp": int((now + expires_delta).timestamp()),
        "jti": str(uuid4()),
    }
    if extra:
        payload.update(extra)
    header = {"alg": "HS256", "typ": "JWT"}
    encoded_header = _b64url_encode(json.dumps(header, separators=(",", ":")).encode())
    encoded_payload = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode())
    signing_input = f"{encoded_header}.{encoded_payload}".encode("ascii")
    signature = hmac.new(secret_key.encode(), signing_input, hashlib.sha256).digest()
    return f"{encoded_header}.{encoded_payload}.{_b64url_encode(signature)}"


def decode_token(token: str, *, secret_key: str, audience: str) -> dict[str, Any]:
    try:
        encoded_header, encoded_payload, encoded_signature = token.split(".")
        signing_input = f"{encoded_header}.{encoded_payload}".encode("ascii")
        expected = hmac.new(secret_key.encode(), signing_input, hashlib.sha256).digest()
        actual = _b64url_decode(encoded_signature)
        if not hmac.compare_digest(actual, expected):
            raise TokenError("Invalid token signature")
        header = json.loads(_b64url_decode(encoded_header))
        payload = json.loads(_b64url_decode(encoded_payload))
    except (ValueError, TypeError, json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise TokenError("Malformed token") from exc

    if header.get("alg") != "HS256":
        raise TokenError("Unsupported token algorithm")
    if payload.get("aud") != audience:
        raise TokenError("Invalid token audience")
    if not isinstance(payload.get("exp"), int) or payload["exp"] <= int(datetime.now(UTC).timestamp()):
        raise TokenError("Token expired")
    if not payload.get("sub") or not payload.get("typ"):
        raise TokenError("Incomplete token")
    return payload


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    derived = hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=32
    )
    return f"scrypt$16384$8$1${_b64url_encode(salt)}${_b64url_encode(derived)}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, n, r, p, salt, expected = encoded.split("$")
        if algorithm != "scrypt":
            return False
        derived = hashlib.scrypt(
            password.encode("utf-8"),
            salt=_b64url_decode(salt),
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=32,
        )
        return hmac.compare_digest(derived, _b64url_decode(expected))
    except (ValueError, TypeError):
        return False


def token_fingerprint(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
