from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import StaticPool


def json_serializer(value: object) -> str:
    """Keep non-ASCII text readable in JSON columns.

    SQLAlchemy defaults to ``ensure_ascii=True``, which stores 麻辣 as ``\\u9ebb\\u8fa3``
    and makes every ``cast(col, String).like('%麻辣%')`` filter miss.
    """
    return json.dumps(value, ensure_ascii=False)


class Base(DeclarativeBase):
    pass


class Database:
    def __init__(self, url: str) -> None:
        self.url = url
        if url.startswith("sqlite:///") and ":memory:" not in url:
            raw_path = url.removeprefix("sqlite:///")
            Path(raw_path).parent.mkdir(parents=True, exist_ok=True)

        connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
        self.engine = create_engine(
            url,
            connect_args=connect_args,
            pool_pre_ping=True,
            json_serializer=json_serializer,
        )
        if url.startswith("sqlite"):
            event.listen(self.engine, "connect", self._enable_sqlite_foreign_keys)
        self.session_factory = sessionmaker(
            bind=self.engine,
            class_=Session,
            autoflush=False,
            expire_on_commit=False,
        )

    @staticmethod
    def _enable_sqlite_foreign_keys(dbapi_connection: object, _: object) -> None:
        cursor = dbapi_connection.cursor()  # type: ignore[attr-defined]
        cursor.execute("PRAGMA foreign_keys=ON")
        # 后台任务与请求线程会并发写入（推荐快照、亲和度、保留期清理）。默认的
        # rollback journal 下写会互斥并立刻抛 "database is locked"；WAL 让读写并行，
        # busy_timeout 给短暂的写冲突一个重试窗口而不是直接失败。
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()

    def create_all(self) -> None:
        from app import models  # noqa: F401

        Base.metadata.create_all(self.engine)

    def drop_all(self) -> None:
        Base.metadata.drop_all(self.engine)

    def session(self) -> Iterator[Session]:
        db = self.session_factory()
        try:
            yield db
        finally:
            db.close()

    def dispose(self) -> None:
        self.engine.dispose()


def sqlite_memory_database() -> Database:
    """Create a shared in-memory database, primarily for tests."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        json_serializer=json_serializer,
    )
    event.listen(engine, "connect", Database._enable_sqlite_foreign_keys)
    database = object.__new__(Database)
    database.url = "sqlite://"
    database.engine = engine
    database.session_factory = sessionmaker(
        bind=engine,
        class_=Session,
        autoflush=False,
        expire_on_commit=False,
    )
    return database
