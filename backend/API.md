# Campus Foodie API 文档

基础地址默认为 `http://127.0.0.1:8000`。交互式、始终与代码同步的接口定义以 `/docs` 与 `/openapi.json` 为准；本文说明前端集成时需要共同遵守的约定。

## 通用约定

- 用户 API 前缀：`/api/v1`。
- 管理 API 前缀：`/admin/api/v1`，使用独立 audience 的令牌，普通用户令牌不能访问。
- 鉴权：`Authorization: Bearer <access_token>`。
- 金额：整型分，例如 `1800` 表示 18 元。
- 时间：ISO 8601 UTC。
- 坐标：商家保留 WGS-84 原始坐标；地图 GeoJSON 明确返回可供高德展示的 `GCJ-02` 坐标。
- 错误：使用 RFC 9457 风格的 `application/problem+json`，包含 `status`、`title`、`detail`、`instance` 和 `request_id`。
- 分页：推荐流使用不透明 `cursor`；普通列表使用 `offset + limit`。
- 幂等：评价阅读与行为上报由客户端生成稳定 `event_id`，重复事件不会重复计数。

## 鉴权与游客合并

1. 首次打开调用 `POST /api/v1/auth/guest`，保存游客 access token。
2. 游客可浏览、修改偏好和收藏商家，但创建评价会返回 `401`。
3. 注册或登录时把游客令牌放入 `guest_token`；服务端会事务性合并游客收藏和偏好，并停用旧游客会话。
4. `POST /api/v1/auth/refresh` 会轮换刷新令牌，旧令牌立即失效。
5. 管理员通过 `POST /admin/api/v1/auth/login` 登录，不与用户端令牌混用。

账号闭环接口包括 `POST /api/v1/auth/email-verification/request`、`POST /api/v1/auth/email-verification/confirm`、`POST /api/v1/auth/password/forgot` 和 `POST /api/v1/auth/password/reset`。未验证邮箱的账号可以浏览和收藏，但不能发表或编辑评价。验证与重置令牌均为一次性令牌；密码重置成功后，该账号现有刷新会话全部失效。未配置 SMTP 时，非生产环境会在响应的 `debug_token` 中返回一次性令牌，生产环境绝不回传令牌。

`GET /api/v1/auth/providers` 返回已配置的第三方登录提供方；默认返回空数组，因此前端不会展示不可用入口。`auth_identities` 数据表和授权入口已经预留，具体 OAuth 适配器留待部署方提供密钥后接入。

## 首页、搜索与详情

- `GET /api/v1/campuses`：校园。
- `GET /api/v1/areas?campus_id=...`：树形地点。
- `GET /api/v1/categories`：树形品类。
- `GET /api/v1/tags`：口味与饮食标签。
- `GET /api/v1/search/suggestions` 与 `/search`：菜品优先的搜索建议和综合搜索。
- `GET /api/v1/recommendations/feed`：菜品/套餐推荐流；支持校园、地点、品类、关键词和最高价格筛选。
- `GET /api/v1/menu-items/{id}`：菜品详情。
- `GET /api/v1/menu-items/{id}/reviews`：只返回已公开评价。
- `GET /api/v1/merchants/{id}` 与 `/menu`：商家资料和菜单。

推荐流程先从数据库召回合法候选，再根据评分和热度确定性排序。配置 DeepSeek 后只允许模型重排候选 ID 并生成理由；模型超时、非法 JSON、重复或候选外 ID 会自动采用确定性结果。

## 评价、图片与收藏

- `POST /api/v1/uploads/images`：登录用户上传图片，返回可用于评价 `images` 数组的 URL。
- `POST /api/v1/menu-items/{id}/reviews`：创建评价；同一用户对同一菜品只有一条有效评价。
- `PATCH/DELETE /api/v1/reviews/{id}`：编辑或软删除自己的评价。
- `POST /api/v1/reviews/{id}/view`：记录一次阅读；作者自己的浏览不计，`event_id` 防止网络重试重复计数。
- `PUT/DELETE /api/v1/favorites/merchants/{id}`：收藏或取消收藏商家，重复调用安全。

评价状态包括 `pending_machine`、`pending_manual`、`published`、`rejected`、`hidden`。未配置 DeepSeek 或审核服务故障时，评价不会丢失，而是进入 `pending_manual`。只有 `published` 计入公开列表、菜品评分和“我的”统计。

## 地图

`GET /api/v1/map/merchants` 接收 `campus_id`、`bbox=west,south,east,north`、`zoom`、价格、品类、口味和收藏筛选，返回 GeoJSON FeatureCollection。

- 商家点：`properties.kind = merchant`，包含 `is_favorite`。
- 聚合点：`properties.kind = cluster`，包含 `count`、`merchant_ids`、`bounds` 和 `has_favorite`。
- 聚合成员存在收藏商家时 `has_favorite = true`，前端应显示星标。

## 我的

- `GET/PUT /api/v1/me/preferences`：游客和用户画像偏好。
- `GET /api/v1/me/favorites`：收藏商家。
- `GET /api/v1/me/reviews`：本人评价及审核状态。
- `GET /api/v1/me/stats`：已发布评价数、累计阅读次数和收藏数。
- `POST /api/v1/interactions`：批量上报曝光、点击、搜索、收藏、阅读事件。

## 管理端

- `/dashboard`：基础统计。
- `/users`：用户查询和冻结/恢复。
- `/merchants`：商家查询、创建、编辑和下架。
- `/menu-items`：菜品/套餐查询、创建、编辑和下架。
- `/categories`、`/areas`：品类和校园地点字典管理。
- `/imports/validate` 与 `/imports`：地点、商家、菜品 CSV 预校验、同步导入和任务记录。
- `/reviews`：按状态查询评价。
- `/reviews/{id}/moderate`：`publish`、`reject`、`hide`、`restore`；驳回或下架必须填写原因。
- `/audit-logs`：管理员变更审计记录。

所有商家、菜品、用户状态和评价审核修改都会记录管理员、动作、目标及必要原因。
