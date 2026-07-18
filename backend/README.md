# Campus Foodie 后端

校园饮食推荐系统的 FastAPI 初版后端。默认只依赖本地 SQLite，启动时会自动创建数据库并写入演示校园、地点、品类、商家、菜品以及开发账号；PostgreSQL、Redis 和 DeepSeek 均通过配置保留扩展接口。

## 快速启动（PowerShell）

```powershell
Set-Location C:\Coding\111\backend
& 'C:\Python313\python.exe' -m venv .venv
& '.\.venv\Scripts\python.exe' -m pip install -e '.[dev]'
& '.\.venv\Scripts\python.exe' -m uvicorn app.main:app --reload --port 8000
```

启动后可访问：

- Swagger UI：<http://127.0.0.1:8000/docs>
- ReDoc：<http://127.0.0.1:8000/redoc>
- OpenAPI：<http://127.0.0.1:8000/openapi.json>
- 健康检查：<http://127.0.0.1:8000/health>

开发演示账号：

- 用户：`demo` / `Demo123!`
- 管理员：`admin` / `Admin123!`

这些账号只用于本地演示，生产环境必须删除演示数据并更换 `SECRET_KEY`。

## 测试

```powershell
& '.\.venv\Scripts\python.exe' -m pytest
```

测试使用共享内存 SQLite，不连接外网，也不需要 DeepSeek Key。

数据库迁移：

```powershell
& '.\.venv\Scripts\python.exe' -m alembic upgrade head
```

开发环境会自动 `create_all` 以便开箱即用；正式环境应关闭 `AUTO_SEED` 并以 Alembic 迁移作为数据库结构来源。

导出完整、用户端和管理端三份 OpenAPI：

```powershell
& '.\.venv\Scripts\python.exe' scripts\export_openapi.py
```

## 配置与部署

复制 `.env.example` 为 `.env` 后按需修改：

- `DATABASE_URL`：默认 `sqlite:///./runtime/campus_food.db`；PostgreSQL 可使用 `postgresql+psycopg://user:pass@host/db` 并安装 `.[postgres]`。
- `DEEPSEEK_API_KEY`：为空时首页采用确定性推荐理由，评价进入人工审核队列；配置后调用 OpenAI 兼容的 `/chat/completions` 接口，任何超时、非法 JSON 或虚构候选 ID 都自动降级。
- `REDIS_URL`：为后续推荐缓存、限流与异步任务预留，当前 SQLite MVP 不强制依赖 Redis。
- `SMTP_HOST`、`SMTP_PORT` 等：配置后发送邮箱验证和密码重置邮件；本地未配置 SMTP 时接口仍可运行，并仅在非生产环境返回调试令牌。
- `UPLOAD_DIR`：评价图片本地存储目录。上传会真实解码并重新编码，仅支持 JPEG、PNG、WebP，最大 10 MB。
- `CORS_ORIGINS`：以逗号分隔的用户端和管理端来源。

应用按模块拆分为公开 `/api/v1` 和管理 `/admin/api/v1`，两端 JWT audience 隔离。完整接口说明见 [API.md](API.md)。

仓库同时提供 `Dockerfile` 和 `compose.yml`，可在具备 Docker 的环境中启动 API、PostgreSQL 与 Redis：

```powershell
docker compose -f compose.yml up --build
```

该 Compose 文件定位为本地联调，默认写入演示数据；正式部署须设置 `ENVIRONMENT=production`、`AUTO_SEED=false` 和独立随机密钥。
