from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Annotated

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

INSECURE_SECRET_KEYS = {
    "development-only-change-me-please",
    "change-this-before-production",
    "changeme",
    "secret",
}
MIN_PRODUCTION_SECRET_KEY_LENGTH = 32


class InsecureProductionSettings(RuntimeError):
    """Raised when production is started with a configuration that cannot be trusted."""


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_name: str = "Campus Foodie API"
    environment: str = "development"
    database_url: str = "sqlite:///./runtime/campus_food.db"
    secret_key: str = "development-only-change-me-please"
    user_access_token_minutes: int = 60
    refresh_token_days: int = 30
    guest_token_days: int = 90
    auto_seed: bool = False
    expose_debug_tokens: bool = False
    rate_limit_enabled: bool = True
    idempotency_retention_hours: int = 48
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: [
            "http://localhost:7991",
            "http://localhost:7992",
            "http://127.0.0.1:7991",
            "http://127.0.0.1:7992",
        ]
    )
    upload_dir: Path = Path("./runtime/uploads")
    max_upload_bytes: int = 10 * 1024 * 1024
    oauth_providers: Annotated[list[str], NoDecode] = Field(default_factory=list)
    user_web_origin: str = "http://127.0.0.1:7991"
    account_token_minutes: int = 30

    smtp_host: str | None = None
    smtp_port: int = 1025
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_use_tls: bool = False
    mail_from: str = "Campus Foodie <no-reply@campus-foodie.local>"

    redis_url: str | None = None
    amap_web_service_key: str | None = None
    deepseek_api_key: str | None = None
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-chat"
    deepseek_timeout_seconds: float = 4.0

    @field_validator("cors_origins", "oauth_providers", mode="before")
    @classmethod
    def parse_string_lists(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @field_validator("upload_dir", mode="before")
    @classmethod
    def parse_upload_dir(cls, value: object) -> Path:
        return Path(str(value))

    @model_validator(mode="after")
    def enforce_production_baseline(self) -> Settings:
        if not self.production:
            return self

        problems: list[str] = []
        if self.secret_key.strip() in INSECURE_SECRET_KEYS or not self.secret_key.strip():
            problems.append(
                "SECRET_KEY 仍是内置占位值，请设置一个随机密钥"
                "（例如 python -c \"import secrets; print(secrets.token_urlsafe(48))\"）"
            )
        elif len(self.secret_key) < MIN_PRODUCTION_SECRET_KEY_LENGTH:
            problems.append(
                f"SECRET_KEY 长度不足 {MIN_PRODUCTION_SECRET_KEY_LENGTH} 位，无法抵御离线爆破"
            )
        if self.auto_seed:
            problems.append(
                "AUTO_SEED 必须为 false：演示数据包含固定口令的超级管理员，"
                "请改用 python -m app create-admin 创建首个管理员"
            )
        if self.expose_debug_tokens:
            problems.append("EXPOSE_DEBUG_TOKENS 必须为 false：该开关会向调用方返回明文账号令牌")
        if not self.rate_limit_enabled:
            problems.append("RATE_LIMIT_ENABLED 不能为 false：登录与找回密码会失去暴力破解防护")
        if not self.cors_origins:
            problems.append("CORS_ORIGINS 不能为空，请显式列出前端来源")
        elif any(origin.strip() == "*" for origin in self.cors_origins):
            problems.append("CORS_ORIGINS 不允许使用通配符 *，请显式列出前端来源")
        if not self.smtp_host:
            problems.append(
                "SMTP_HOST 未配置：邮箱验证与找回密码会静默失效，请配置邮件服务"
            )

        if problems:
            raise InsecureProductionSettings(
                "生产环境配置未通过安全校验，已拒绝启动：\n  - " + "\n  - ".join(problems)
            )
        return self

    @property
    def testing(self) -> bool:
        return self.environment.lower() == "test"

    @property
    def production(self) -> bool:
        return self.environment.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
