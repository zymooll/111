# API 使用说明

用户接口位于 `/api/v1`，管理接口位于 `/admin/api/v1`。运行服务后，`/openapi.json` 是机器可读的权威定义，`/docs` 与 `/redoc` 提供交互式文档；更完整的字段和调用约定见 `backend/API.md`。

## 前端接入约定

- 用户端、管理端分别使用用户和管理 audience 的 Bearer Token，二者不能混用。
- 校园业务请求必须携带 `campus_id`。读取和资源路径写入通常放在查询参数中，偏好、行为批次和评价阅读等接口按 OpenAPI 放在 JSON 请求体中。
- 金额使用整数分；时间使用 ISO 8601 UTC。
- 错误统一为 RFC 9457 风格的 Problem Details，媒体类型为 `application/problem+json`，并通过响应头 `X-Request-ID` 与响应字段 `request_id` 关联日志。
- 业务列表采用不透明游标。请求传 `cursor`、`limit`，响应读取 `items`、`next_cursor`、`has_more`；客户端不得解析或自行拼接游标。
- 对可能重试的 POST、PUT、PATCH、DELETE 请求发送稳定的 `Idempotency-Key`。同一键与同一请求会重放原成功响应并返回 `Idempotency-Replayed: true`；同一键用于不同请求会返回 `409` Problem Details。

## 认证与游客

- `POST /auth/guest` 创建游客会话；游客可以浏览、搜索、使用地图、维护偏好和收藏。
- `POST /auth/register`、`POST /auth/login` 可携带 `guest_token`，服务端会幂等合并游客收藏、偏好和行为，并停用旧游客会话。
- 用户可使用用户名或邮箱登录；访问令牌配合旋转刷新令牌。
- 邮箱验证：`POST /auth/email-verification/request`、`POST /auth/email-verification/confirm`。
- 密码找回：`POST /auth/password/forgot`、`POST /auth/password/reset`。
- `GET /auth/providers` 只返回已配置的第三方登录提供方；默认为空。授权入口为部署适配器预留，未安装时返回 `501`。

## 动态目录、发现与详情

用户端不维护校园地点、品类或口味标签常量，而是依次读取动态目录：

1. `GET /campuses` 选择启用校园；也可通过 `VITE_CAMPUS_ID` 固定校园。
2. `GET /areas?campus_id=...` 获取树形地点。
3. `GET /categories?campus_id=...` 获取树形品类。
4. `GET /tags?campus_id=...` 获取口味、饮食和场景标签。

主要发现接口：

- `GET /recommendations/feed`：菜品/套餐推荐流，支持校园、地点、品类、搜索、预算和游标。
- `GET /search/suggestions`、`GET /search`：校园范围内的建议和综合搜索。
- `GET /menu-items/{id}`：菜品/套餐详情。
- `GET /menu-items/{id}/reviews`：公开评价游标列表。
- `GET /merchants`、`GET /merchants/{id}`、`GET /merchants/{id}/menu`：商家列表、详情和菜单。

首页使用 `next_cursor` 持续加载，而不是一次拉取全部推荐。

## 评价、图片与收藏

- `POST /uploads/images`：登录用户上传评价图片。服务端验证真实格式、大小、像素、完整解码，并重编码以清除 EXIF。
- `POST /menu-items/{id}/reviews`：创建评价；同一用户对同一菜品只有一条有效评价。
- `PATCH /reviews/{id}`、`DELETE /reviews/{id}`：编辑或软删除自己的评价。
- `POST /reviews/{id}/view`：记录阅读；作者浏览不计数，稳定 `event_id` 防止重复计数。
- `PUT /favorites/merchants/{id}`、`DELETE /favorites/merchants/{id}`：幂等收藏或取消收藏商家。

评价状态为 `pending_machine`、`pending_manual`、`published`、`rejected`、`hidden`。本地规则先执行；DeepSeek 未配置、超时、失败或判断不确定时进入人工队列，不会阻塞提交或误发布。含图片评价进入人工确认。

## 地图与高德地图

`GET /map/merchants` 根据 `campus_id`、`bbox`、`zoom`、价格、品类、口味、关键词和收藏条件返回 GCJ-02 GeoJSON。

- 普通点包含 `is_favorite`。
- 聚合点包含 `count`、`merchant_ids`、`bounds`、`has_favorite`。
- `has_favorite = true` 时，聚合标记必须显示收藏星标。

配置 `VITE_AMAP_KEY` 后，用户端加载高德地图与 `AMap.MarkerCluster`；可同时配置 `VITE_AMAP_SECURITY_CODE`。未配置 Key 或脚本加载失败时，自动切换为具备相同筛选、聚合和星标语义的校园示意地图。

## 我的与行为画像

- `GET /me/stats`：当前校园的已发布评价数、累计阅读次数和收藏数。
- `GET /me/favorites`、`GET /me/reviews`：收藏和本人评价游标列表。
- `GET/PUT /me/preferences`：口味、避忌、预算和常去地点。
- `POST /interactions`：批量上报曝光、点击、搜索、收藏和详情阅读事件。

画像仅向 DeepSeek 提供去标识化标签、校园区域 ID、预算和聚合信号。账号、邮箱、评价原文和原始搜索文本不会进入推荐提示；曝光只用于分析，不参与偏好推断。

## 管理端

管理端使用独立端口和登录态，接口位于 `/admin/api/v1`：

- `/users`：查询、冻结、恢复和触发密码重置邮件。
- `/merchants`、`/menu-items`：商家、菜品和套餐管理；商家表单支持校园示意地图选点。
- `/areas`、`/categories`、`/tags`：校园地点、品类和标签字典管理。
- `/imports/validate`、`/imports`：CSV 预校验、导入和任务游标列表。
- `/reviews`、`/reviews/{id}/moderate`：人工审核、驳回、下架和恢复。
- `/audit-logs`：校园范围内的管理员变更审计日志。

所有管理写入均写入审计记录；接口不会返回或修改明文密码。
