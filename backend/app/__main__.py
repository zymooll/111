"""Operational entry points.

``python -m app serve`` 启动开发服务器；``python -m app create-admin`` 用于生产首次部署
创建管理员——生产环境不再自动播种带固定口令的演示账号。
"""

from __future__ import annotations

import argparse
import secrets
import sys

from sqlalchemy import select

from app.config import get_settings
from app.database import Database
from app.models import User, UserRole
from app.security import hash_password

MIN_PASSWORD_LENGTH = 12


def _create_admin(args: argparse.Namespace) -> int:
    settings = get_settings()
    database = Database(settings.database_url)
    password = args.password or secrets.token_urlsafe(18)
    generated = args.password is None
    if len(password) < MIN_PASSWORD_LENGTH:
        print(f"密码至少需要 {MIN_PASSWORD_LENGTH} 位", file=sys.stderr)
        return 2

    with database.session_factory() as db:
        clash = db.scalar(
            select(User).where(
                (User.username == args.username) | (User.email == args.email.lower())
            )
        )
        if clash is not None:
            print(f"用户名或邮箱已存在：{clash.username} <{clash.email}>", file=sys.stderr)
            return 1
        admin = User(
            username=args.username,
            email=args.email.lower(),
            password_hash=hash_password(password),
            role=UserRole.SUPER_ADMIN if args.super_admin else UserRole.CAMPUS_ADMIN,
            managed_campus_id=args.campus_id,
            is_active=True,
            email_verified=True,
        )
        db.add(admin)
        db.commit()

    print(f"已创建管理员 {admin.username}（角色 {admin.role}）")
    if generated:
        print(f"随机密码（只显示这一次）：{password}")
    return 0


def _serve(args: argparse.Namespace) -> int:
    import uvicorn

    uvicorn.run("app.main:app", host=args.host, port=args.port, reload=args.reload)
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="app")
    sub = parser.add_subparsers(dest="command")

    serve = sub.add_parser("serve", help="启动 API 服务")
    serve.add_argument("--host", default="0.0.0.0")
    serve.add_argument("--port", type=int, default=7993)
    serve.add_argument("--reload", action="store_true")
    serve.set_defaults(handler=_serve)

    create_admin = sub.add_parser("create-admin", help="创建管理员账号")
    create_admin.add_argument("--username", required=True)
    create_admin.add_argument("--email", required=True)
    create_admin.add_argument(
        "--password",
        default=None,
        help="留空则生成随机密码并打印一次",
    )
    create_admin.add_argument(
        "--campus-id",
        default=None,
        help="该管理员可管理的校园；超级管理员可留空表示不限校园",
    )
    create_admin.add_argument("--super-admin", action="store_true")
    create_admin.set_defaults(handler=_create_admin)

    args = parser.parse_args(argv)
    handler = getattr(args, "handler", None)
    if handler is None:
        parser.print_help()
        return 1
    return handler(args)


if __name__ == "__main__":
    raise SystemExit(main())
