# Playwright E2E

E2E 会自动启动三个独立服务：

- FastAPI：`http://127.0.0.1:18000`
- 用户端：`http://127.0.0.1:5173`
- 管理端：`http://127.0.0.1:5174`

FastAPI 使用 `runtime/e2e/api/campus_foodie_e2e.db` 和独立上传目录。每次运行默认清空该目录并重新写入演示种子，不会读取开发数据库。

首次运行先安装 Chromium：

```powershell
pnpm exec playwright install chromium
```

随后运行：

```powershell
pnpm test:e2e
```

Windows 优先使用仓库的 `.venv\Scripts\python.exe`，其次使用 `C:\Python313\python.exe`；CI 使用 PATH 中的 `python`。如需覆盖，可设置 `E2E_PYTHON`。仅在调试并需要保留数据库时设置 `PW_E2E_KEEP_DATA=1`。

当前覆盖评价图片上传与审核闭环、游客阅读和作者实时统计、地图收藏星标与聚合，以及管理端商家/菜品/标签 CRUD、CSV 导入和审计日志。
