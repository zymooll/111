# Campus Foodie 管理后台

独立运行在 `5174` 端口的 React + TypeScript + Ant Design 管理端。

```powershell
pnpm install
pnpm --filter @campus-foodie/admin-web dev
```

默认连接 FastAPI，演示账号为 `admin` / `Admin123!`。需要纯前端演示时，可复制本目录 `.env.example` 为 `.env.local` 并设置 `VITE_API_MODE=mock`，Mock 账号为 `admin` / `admin123`。

FastAPI 演示种子账号为 `admin` / `Admin123!`。管理端适配层兼容后端 snake_case 响应、原始数组分页以及 Mock 使用的 camelCase 模型；`fallback` 只在网络错误或服务端错误时降级，不会绕过 4xx 鉴权与参数校验。

主要页面：运营概览、用户管理、商家/菜品管理、评价审核、CSV 导入和审计日志。

```powershell
pnpm --filter @campus-foodie/admin-web typecheck
pnpm --filter @campus-foodie/admin-web test
pnpm --filter @campus-foodie/admin-web build
```
