# Campus Foodie 校园饮食推荐系统

Campus Foodie 是一个面向校园场景的菜品与套餐推荐系统。用户端提供首页推荐、地图发现和个人中心；管理端提供用户、商家、菜品与评价审核能力；FastAPI 后端将显式口味偏好与近期点击、收藏、搜索等去标识化行为汇总为用户画像，再通过可选的 DeepSeek 适配器完成候选重排、个性化推荐理由和评价文本审核。

## 工作区

- `backend/`：FastAPI API、数据模型、推荐与审核服务、迁移及测试。
- `apps/user-web/`：移动端 React PWA，开发端口 `5173`。
- `apps/admin-web/`：独立管理端 React 应用，开发端口 `5174`。
- `docs/`：架构、API、验收记录及高校餐饮调研报告。
- `e2e/`、`playwright.config.ts`：用户端与管理端关键流程 E2E。
- `docker-compose.yml`：PostgreSQL/PostGIS、Redis、Mailpit 和 API 的本地联调环境。
- `data/merchants.csv`、`data/images.csv`、`assets/merchant-images/`：中南林业科技大学历史调研档案。
- `data/csut_merchants.csv`、`data/csut_images.csv`、`assets/csut-images/`：长沙理工大学金盆岭、云塘两校区历史调研档案。
- `data/hunan_universities_merchants.csv`、`data/hunan_universities_images.csv`、`assets/hunan-universities-images/`：湖南农大、湖南工商、中南、湖大、湖师大历史调研档案。
- `projects/campus_foodie_ppt_ppt169_20260718/`：项目路演 PPT、讲稿、设计稿与导出文件。

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

完整检查：

```powershell
& '.\scripts\check.ps1'
```

## 降级策略

- 未配置 DeepSeek 时，推荐流使用确定性排序，评价转入人工审核队列。
- 未配置高德 Key 时，地图页使用校园示意地图，同时保留筛选、聚合和收藏星标交互。
- 图片加载失败时展示与品类匹配的渐变封面，不影响卡片和详情页使用。

## 高校餐饮资料档案

仓库归档长沙多所高校校内食堂档口及周边餐饮商家的公开资料。资料来自不同年份的高校官网、校级媒体和公开攻略，并在 2026-07-18 汇总；商家可能已迁址、改名、调价或停业，不能直接视为 2026 年实时营业清单。

对应说明与来源：

- `docs/research-report.md`、`docs/sources.md`：中南林业科技大学。
- `docs/csut-research-report.md`、`docs/csut-sources.md`：长沙理工大学。
- `docs/hunan-universities-research-report.md`、`docs/hunan-universities-sources.md`：湖南农大、湖南工商、中南、湖大、湖师大。

所有归档图片仅作资料索引和研究存档，版权归原作者或平台所有，许可证未知；对外使用前应重新核验并取得授权。归档图片不会复制到用户端 `public`、通过 `/media` 对外提供或用于公开推荐卡片。当前界面使用项目原创 SVG 占位插画，正式上线前应由管理端替换为商家授权照片并记录来源。

## API 文档

API 启动后可访问：

- Swagger UI：`http://localhost:8000/docs`
- ReDoc：`http://localhost:8000/redoc`
- OpenAPI：`http://localhost:8000/openapi.json`

人工维护的完整接口说明见 `backend/API.md`，前端集成摘要见 `docs/API.md`。
