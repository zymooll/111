from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


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
    auto_seed: bool = True
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://localhost:5174",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:5174",
        ]
    )
    upload_dir: Path = Path("./runtime/uploads")
    max_upload_bytes: int = 10 * 1024 * 1024
    oauth_providers: Annotated[list[str], NoDecode] = Field(default_factory=list)
    user_web_origin: str = "http://localhost:5173"
    account_token_minutes: int = 30

    smtp_host: str | None = None
    smtp_port: int = 1025
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_use_tls: bool = False
    mail_from: str = "Campus Foodie <no-reply@campus-foodie.local>"

    redis_url: str | None = None
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

    @property
    def testing(self) -> bool:
        return self.environment.lower() == "test"

    @property
    def production(self) -> bool:
        return self.environment.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
