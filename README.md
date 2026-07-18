# Campus Foodie 校园饮食推荐系统

Campus Foodie 是一个面向校园场景的菜品与套餐推荐系统。用户端提供首页推荐、地图发现和个人中心；管理端提供用户、商家、菜品与评价审核能力；FastAPI 后端通过可选的 DeepSeek 适配器完成候选重排、个性化推荐理由和评价文本审核。

## 工作区

- `backend/`：FastAPI API、数据模型、推荐与审核服务、后台任务及测试。
- `apps/user-web/`：移动端 React PWA，开发端口 `5173`。
- `apps/admin-web/`：独立管理端 React 应用，开发端口 `5174`。
- `docs/`：架构、API 使用说明和验收记录。
- `data/`、`assets/merchant-images/`：远端仓库原有的中南林业科技大学历史调研档案，仅作为待核验的数据来源。
- `docker-compose.yml`：PostgreSQL/PostGIS、Redis、Mailpit 和 API 的本地联调环境。

## 本地开发

后端使用指定的 Python 3.13 创建隔离环境：

```powershell
& 'C:\Python313\python.exe' -m venv .venv
& '.\.venv\Scripts\python.exe' -m pip install -e '.\backend[dev,postgres,redis]'
Copy-Item .env.example .env
& '.\.venv\Scripts\python.exe' -m uvicorn app.main:app --app-dir backend --reload --port 8000
```

前端：

```powershell
pnpm install
pnpm dev:user
pnpm dev:admin
```

默认端口为用户端 `5173`、管理端 `5174`、API `8000`。用户端默认连接真实 API；如只需要查看静态演示，可设置 `VITE_API_MODE=mock`。

完整依赖服务可通过 `docker compose up --build` 启动。没有 Docker 时也可以使用默认 SQLite 配置直接启动 API。

## 降级策略

- 未配置 DeepSeek 时，推荐流使用确定性排序，评价转入人工审核队列。
- 未配置高德 Key 时，地图页使用校园示意地图，同时保留相同的筛选和聚合交互。
- 图片加载失败时展示与品类匹配的渐变封面，不影响卡片和详情页使用。

## 历史调研数据

仓库原有的 `data/merchants.csv`、`data/images.csv`、`assets/merchant-images/`、`docs/research-report.md` 和 `docs/sources.md` 保持为历史研究档案。这批资料主要来自 2018、2019 年公开文章，42 条商家记录均标记为“待实地核验”，且缺少可直接用于地图的精确经纬度。

归档图片的许可证均为未知，部分带有平台水印或二维码，因此不会复制到用户端 `public`、通过 `/media` 对外提供或用于公开推荐卡片。当前界面使用项目原创 SVG 占位插画；正式上线前应由管理端替换为商家授权照片，并记录来源与许可。

## API 文档

API 启动后可访问：

- Swagger UI：`http://localhost:8000/docs`
- ReDoc：`http://localhost:8000/redoc`
- OpenAPI：`http://localhost:8000/openapi.json`

人工维护的完整接口说明见 `backend/API.md`，前端集成摘要见 `docs/API.md`。
