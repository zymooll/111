# Campus Foodie 用户端

移动优先的 React + TypeScript + Vite PWA。包含首页推荐、菜品详情、地图筛选、游客收藏、账号与邮箱流程、评价发布和个人中心，并可在本地演示数据与 FastAPI 之间切换。

## 本地运行

```powershell
pnpm install
pnpm --filter @campus-foodie/user-web dev
```

默认地址为 `http://localhost:5173`，并连接 `http://localhost:8000/api/v1`。FastAPI 演示账号为 `demo` / `Demo123!`。

## 后端接入

页面只依赖 `FoodieApi` 接口，`src/services/httpApi.ts` 已接入 FastAPI `/api/v1`，包括游客会话、登录注册、令牌刷新、推荐、地图、收藏、评价图片上传、邮箱验证和密码重置。

默认使用真实 FastAPI。需要切换时，可复制本目录 `.env.example` 为 `.env.local`：

- `VITE_API_MODE=mock`：只使用内置演示数据。
- `VITE_API_MODE=remote`：只使用 FastAPI，适合集成验证。
- `VITE_API_MODE=fallback`：后端网络不可用或发生服务端故障时回退演示数据；401/403/422 等业务错误仍会原样展示。

## 验证

```powershell
pnpm --filter @campus-foodie/user-web typecheck
pnpm --filter @campus-foodie/user-web test
pnpm --filter @campus-foodie/user-web build
```
