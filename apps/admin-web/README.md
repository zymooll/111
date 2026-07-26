# Campus Foodie 管理后台

独立运行在 `5174` 端口的 React + TypeScript + Ant Design 管理端。

```powershell
pnpm install
pnpm --filter @campus-foodie/admin-web dev
```

默认连接 FastAPI，演示账号为 `admin` / `Admin123!`。需要纯前端演示时，可复制本目录 `.env.example` 为 `.env.local` 并设置 `VITE_API_MODE=mock`，Mock 账号为 `admin` / `admin123`。

FastAPI 演示种子账号为 `admin` / `Admin123!`。管理端适配层兼容后端 snake_case 响应与 Mock 使用的 camelCase 模型；所有列表消费后端的 keyset 游标分页（`cursor` + `limit`，响应 `items` / `next_cursor` / `has_more`），因此表格提供上一页 / 下一页导航而不是页码跳转。

访问令牌过期时，适配层会用 `refresh_token` 静默续期并重放原请求，续期失败才清理会话并跳回登录页。`fallback` 模式只允许只读接口在网络错误或服务端错误时降级到演示数据，并在顶栏给出提示；创建、编辑、删除、审核和导入等写操作永不降级，失败会如实报错。

主要页面：运营概览、用户管理、商家/菜品管理、评价审核、CSV 导入和审计日志。

```powershell
pnpm --filter @campus-foodie/admin-web typecheck
pnpm --filter @campus-foodie/admin-web test
pnpm --filter @campus-foodie/admin-web build
```
