# API 使用说明

所有接口统一位于 `/api/v1`，管理接口位于 `/admin/api/v1`。成功响应使用 JSON；错误响应遵循 RFC 9457 `application/problem+json`，并通过 `X-Request-ID` 关联日志。

## 认证

- 游客会话用于收藏、问卷偏好和行为记录。
- 用户使用用户名或邮箱登录；短期访问令牌配合旋转刷新令牌。
- 管理端令牌使用独立 audience，不能调用用户写接口。
- 第三方登录仅保留 provider 注册与回调扩展点，未配置时不暴露入口。
- 邮箱验证：`POST /auth/email-verification/request`、`POST /auth/email-verification/confirm`。
- 密码找回：`POST /auth/password/forgot`、`POST /auth/password/reset`。

## 主要资源

- `/auth/*`：游客会话、注册、邮箱验证、登录、刷新、登出和密码重置。
- `/recommendations/feed`：菜品/套餐推荐流，支持品类和地点筛选及游标分页。
- `/menu-items/{id}`：菜品/套餐详情；`/menu-items/{id}/reviews` 获取评价。
- `POST /menu-items/{id}/reviews`：创建评价；`PATCH/DELETE /reviews/{id}` 修改或删除自己的评价。
- `/favorites/merchants/{id}`：幂等收藏或取消收藏商家。
- `/uploads/images`：上传经过格式、尺寸、解码、重编码与 EXIF 清除校验的评价图片。
- `/map/merchants`：按视口、缩放和筛选条件返回 GeoJSON 点或聚合点。
- `/me/*`：个人资料、偏好、收藏、评价及统计。
- `/interactions`：幂等批量上报曝光、点击、搜索和收藏等行为事件。
- `/admin/api/v1/*`：用户、商家、菜品、CSV 导入、评价审核和审计日志。

## 评价状态

`pending_machine -> published` 表示机器审核通过；不通过、不确定或模型不可用时进入 `pending_manual`，由管理员改为 `published` 或 `rejected`。已发布评价可以被管理员转为 `hidden`。

## 推荐降级

推荐接口先从数据库召回合法候选，再调用 DeepSeek 重排。模型输出只能引用候选 ID；无效 JSON、虚构 ID、超时或限流时使用确定性评分返回相同响应结构。

完整字段、请求示例、地图返回结构和管理端接口约定见 `backend/API.md`。运行服务后，以 `/openapi.json` 为机器可读的权威定义，`/docs` 和 `/redoc` 提供交互式文档。
