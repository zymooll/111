# Playwright E2E

E2E 会自动启动三个独立服务，端口由 `e2e/ports.mjs` 统一定义（`playwright.config.ts` 与 `start-api.mjs` 都从这里读取），并与开发端口隔离，可与 `pnpm dev:user` / `pnpm dev:admin` 同时运行：

- FastAPI：`http://127.0.0.1:18000`
- 用户端：`http://127.0.0.1:18001`
- 管理端：`http://127.0.0.1:18002`

FastAPI 使用 `runtime/e2e/api/campus_foodie_e2e.db` 和独立上传目录。每次运行默认清空该目录并重新写入演示种子，不会读取开发数据库。启动时设置 `EXPOSE_DEBUG_TOKENS=true`，用例才能取回邮箱验证令牌并注册可发表评价的账号。

首次运行先安装 Chromium：

```powershell
pnpm exec playwright install chromium
```

随后运行：

```powershell
pnpm test:e2e
```

Windows 优先使用仓库的 `.venv\Scripts\python.exe`，其次使用 `C:\Python313\python.exe`；CI 使用 PATH 中的 `python`。如需覆盖，可设置 `E2E_PYTHON`。仅在调试并需要保留数据库时设置 `PW_E2E_KEEP_DATA=1`。

CI 会重试失败用例，而服务器和数据库在整个 run 内只初始化一次，因此用例必须可重复执行：实体名和评价文本都带 `testInfo.retry` 与时间戳后缀，评价流程每次注册新账号，地图用例在创建数据前先按名称前缀下架历史商家。

当前覆盖评价图片上传与审核闭环、游客阅读和作者实时统计、地图收藏星标与聚合，以及管理端商家/菜品/标签 CRUD、CSV 导入和审计日志。
