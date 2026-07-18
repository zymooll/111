# Campus Foodie API 文档

基础地址默认为 `http://127.0.0.1:8000`。用户接口前缀为 `/api/v1`，管理接口前缀为 `/admin/api/v1`。运行服务后，以 `/openapi.json` 为字段、状态码和请求体的权威定义；`/docs` 与 `/redoc` 提供交互式查看。

## 通用约定

- 鉴权：`Authorization: Bearer <access_token>`。
- 校园隔离：所有校园业务资源都保存 `campus_id`，所有业务请求都必须声明校园并校验资源归属。
- 金额：整数分，例如 `1800` 表示 18 元。
- 时间：ISO 8601 UTC。
- 坐标：商家同时保存 WGS-84 原始坐标和 GCJ-02 展示坐标。普通商家响应通过字段名区分两套坐标；地图 GeoJSON 顶层返回 `coordinate_system: "GCJ-02"`。
- 错误：HTTP、请求校验、响应校验和未处理异常都返回 Problem Details，媒体类型为 `application/problem+json`。
- 请求追踪：响应头 `X-Request-ID` 与 Problem Details 的 `request_id` 使用相同标识。
- 分页：业务列表使用不透明 `cursor`，响应包含 `items`、`next_cursor`、`has_more`；部分评价列表额外返回 `total`。
- 写入幂等：需要网络重试保护的写请求应发送 `Idempotency-Key`。键长度为 8–120 个字符。

典型 Problem Details：

```json
{
  "type": "about:blank",
  "title": "资源不存在",
  "status": 404,
  "detail": "菜品不存在或不属于该校园",
  "instance": "/api/v1/menu-items/example",
  "request_id": "e8a5b693-58ac-4cf3-a4c4-44d55bb2d113"
}
```

典型游标响应：

```json
{
  "items": [],
  "next_cursor": null,
  "has_more": false
}
```

客户端必须把 `next_cursor` 原样传回，不得解析其内部表示。

## Idempotency-Key

幂等中间件覆盖所有非 GET、HEAD、OPTIONS 请求。第一次成功的 JSON 响应会按调用者、HTTP 方法、路径和幂等键保存：

```http
POST /api/v1/menu-items/{id}/reviews?campus_id={campus_id}
Authorization: Bearer ...
Idempotency-Key: review-submit-7e9ef2b4
Content-Type: application/json
```

- 相同键、相同查询和相同请求体：重放原状态码与 JSON，并返回 `Idempotency-Replayed: true`。
- 相同键、不同查询或请求体：返回 `409` Problem Details。
- 未发送幂等键：按普通写请求处理。
- 收藏、评价阅读和行为事件还分别通过资源唯一约束或稳定 `event_id` 提供领域幂等。

## 鉴权与游客合并

1. 首次打开调用 `POST /api/v1/auth/guest`，保存游客 access token。
2. 游客可浏览、搜索、使用地图、维护偏好和收藏；创建评价需要登录且邮箱已验证。
3. 注册或登录时在请求体传入 `guest_token`。服务端在同一事务中合并游客收藏、偏好和行为，去重后停用旧游客会话。
4. `POST /api/v1/auth/refresh` 轮换刷新令牌；旧刷新令牌立即失效。
5. `POST /api/v1/auth/logout` 撤销刷新会话。
6. 管理员通过 `POST /admin/api/v1/auth/login` 登录，令牌 audience 与用户端隔离。

账号闭环接口：

- `POST /api/v1/auth/email-verification/request`
- `POST /api/v1/auth/email-verification/confirm`
- `POST /api/v1/auth/password/forgot`
- `POST /api/v1/auth/password/reset`

验证和重置令牌都是一次性令牌。密码重置成功后，该用户的现有刷新会话全部失效。未配置 SMTP 时，仅非生产环境可在 `debug_token` 中返回令牌。

`GET /api/v1/auth/providers` 返回已配置的第三方登录提供方。默认返回空数组；`GET /api/v1/auth/oauth/{provider}/authorize` 是部署适配器扩展点，未安装适配器时返回 `501`。

## 动态目录

- `GET /api/v1/campuses`：启用校园列表。
- `GET /api/v1/areas?campus_id=...`：当前校园的树形地点。
- `GET /api/v1/categories?campus_id=...`：当前校园的树形品类。
- `GET /api/v1/tags?campus_id=...&kind=...`：当前校园的口味、饮食或场景标签。

地点、品类和标签均由服务端维护。用户端不得使用自定义别名替代真实 ID；管理端商家、菜品和导入请求也必须引用同一校园中的目录项。

## 发现、搜索与详情

发现路由由 `app.api.discovery` 承载：

- `GET /api/v1/recommendations/feed`
- `GET /api/v1/search/suggestions`
- `GET /api/v1/search`

目录与详情路由由 `app.api.catalog` 承载：

- `GET /api/v1/merchants`
- `GET /api/v1/merchants/{id}`
- `GET /api/v1/merchants/{id}/menu`
- `GET /api/v1/menu-items/{id}`
- `GET /api/v1/menu-items/{id}/reviews`

推荐流支持 `campus_id`、`category_id`、`area_id`、`search`、`max_price_cents`、`cursor`、`limit`。流程为：

1. 数据库只召回当前校园中已上架的菜品/套餐和商家。
2. 应用显式预算、避忌、口味、常去地点、收藏和行为信号，执行确定性排序。
3. DeepSeek 可选地重排最多 30 个数据库候选 ID 并生成理由。
4. 模型未配置、超时、限流、坏 JSON、重复 ID 或虚构 ID 时，保留确定性结果。

发送给 DeepSeek 的推荐画像只包含标签、校园区域 ID、预算和聚合信号数，不包含账号、邮箱、评价原文或原始搜索文本。曝光事件不用于推断偏好。

## 评价与图片

评价路由由 `app.api.reviews` 承载：

- `POST /api/v1/menu-items/{id}/reviews?campus_id=...`
- `PATCH /api/v1/reviews/{id}?campus_id=...`
- `DELETE /api/v1/reviews/{id}?campus_id=...`
- `POST /api/v1/reviews/{id}/view`

评价支持 1–5 星、最多 2000 字和最多 9 张本人已上传图片。同一用户对同一菜品只能有一条未删除评价。评价状态为：

- `pending_machine`
- `pending_manual`
- `published`
- `rejected`
- `hidden`

文本先经过本地规则，再调用 DeepSeek 内容审核。规则命中、模型未配置、模型故障或判断不确定时进入 `pending_manual`；含图片评价也进入人工确认。只有 `published` 评价进入公开列表、评分和用户统计。

`POST /api/v1/uploads/images` 由 `app.api.uploads` 承载。服务端执行大小限制、真实格式识别、完整解码、像素限制和重新编码；重新保存时不沿用上传 EXIF。评价只能引用当前用户上传目录中的现存文件。

## 收藏、我的与行为事件

收藏路由：

- `PUT /api/v1/favorites/merchants/{id}?campus_id=...`
- `DELETE /api/v1/favorites/merchants/{id}?campus_id=...`
- `GET /api/v1/me/favorites?campus_id=...&cursor=...`

个人中心路由：

- `GET /api/v1/me/reviews?campus_id=...&cursor=...`
- `GET /api/v1/me/stats?campus_id=...`
- `GET /api/v1/me/preferences?campus_id=...`
- `PUT /api/v1/me/preferences`，请求体包含 `campus_id`

行为路由：

- `POST /api/v1/interactions`，请求体包含批次 `campus_id` 和每个事件的稳定 `event_id`

服务端验证事件引用的菜品和商家属于批次校园。重复 `event_id` 不重复写入。作者自己的评价浏览不增加阅读量。

## 地图

`GET /api/v1/map/merchants` 参数包括：

- `campus_id`（必填）
- `bbox=west,south,east,north`
- `zoom`
- `price_level`
- `category_id`
- `taste`
- `search`
- `favorite_only`

响应为 GCJ-02 GeoJSON FeatureCollection：

- 商家点：`properties.kind = "merchant"`，包含 `is_favorite`。
- 聚合点：`properties.kind = "cluster"`，包含 `count`、`merchant_ids`、`bounds`、`has_favorite`。
- 聚合成员含收藏商家时 `has_favorite = true`。

用户端配置 `VITE_AMAP_KEY` 后使用高德 JS API 与 MarkerCluster；未配置或加载失败时使用校园示意地图，筛选、聚合和收藏星标语义保持一致。

## 管理端

所有管理业务接口都要求管理 audience 令牌和 `campus_id`，并根据角色限制操作：

- `/dashboard`：当前校园统计。
- `/users`：游标查询、冻结、恢复和触发密码重置邮件。
- `/merchants`：游标查询、创建、编辑、上下架；管理 Web 支持 WGS-84 校园示意地图选点。
- `/menu-items`：游标查询、创建、编辑、上下架。
- `/areas`、`/categories`、`/tags`：校园目录字典管理；标签重命名会同步业务引用，已使用标签不能直接删除。
- `/imports/validate`、`/imports`：按校园预校验和导入地点、商家、菜品 CSV；任务列表采用游标。
- `/reviews`：评价游标队列。
- `/reviews/{id}/moderate`：`publish`、`reject`、`hide`、`restore`；驳回和下架必须填写原因。
- `/audit-logs`：当前校园的审计日志游标列表。

用户状态、商家、菜品、目录字典、导入和评价审核等管理变更都会写入带 `campus_id` 的审计日志。用户接口和管理接口都不会返回明文密码。

## 降级边界

- 无 DeepSeek Key：推荐使用确定性排序；评价进入人工审核。
- 无高德 Key 或高德脚本加载失败：前端使用校园示意地图。
- 图片或远端媒体加载失败：前端展示项目占位图，不阻断详情和评价流程。
- SQLite 开发模式不依赖 Redis、PostGIS 或独立 Worker；Compose 环境为后续缓存、限流和空间查询升级保留组件。
