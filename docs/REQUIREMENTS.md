# 初版验收矩阵

本文件把产品计划转换为可验证要求，并区分“实现证据”和“最终运行证据”。

- `[x]`：当前源码与自动化测试源码已直接覆盖该要求。
- `[ ]`：仍需要最终浏览器运行、完整检查命令、合并或用户通知才能关闭。

页面存在本身不算行为证据；最终测试仍需按本文末尾的运行清单逐项记录结果。

## 用户端

- [x] 首页底部只提供首页、地图、我的三个入口，并适配移动端安全区；“我也吃过”只出现在菜品详情页底部。
  - 实现证据：`apps/user-web/src/components/AppShell.tsx` 使用三等分导航且不渲染评价入口；`DishDetailPage.tsx` 保留详情页“我也吃过”按钮。
  - 测试证据：`apps/user-web/src/App.test.tsx` 验证首页底栏没有“我也吃过”，同时验证详情页保留该操作。
- [x] 首页顶部包含头像/用户入口和搜索栏，支持品类、地点二级筛选。
  - 实现证据：`HomePage.tsx`、`FilterPage.tsx`；二级树来自 `api.getCatalog()`。
  - 测试证据：`httpApi.test.ts` 验证 `/campuses`、`/areas`、`/categories`、`/tags` 及服务端目录 ID 透传；该测试不验证地点当前营业真实性。
- [x] 推荐主体仅为菜品或套餐；卡片展示图片、名称、商家、评分、价格和个性化理由。
  - 实现证据：`components/DishCard.tsx`、`pages/HomePage.tsx`、`backend/app/api/discovery.py`。
  - 测试证据：`App.test.tsx` 首页推荐渲染；后端目录/推荐集成测试。
- [x] 菜品详情展示评价，收藏操作收藏所属商家。
  - 实现证据：`pages/DishDetailPage.tsx` 使用 `dish.merchantId` 收藏并读取公开评价。
  - 测试证据：`App.test.tsx` 验证详情评价阅读上报；后端收藏与评价测试。
- [x] 游客可浏览、搜索、地图和收藏；评价会跳转登录并保留草稿。
  - 实现证据：`pages/ReviewPage.tsx` 允许游客编辑并在发布时保存 `sessionStorage` 草稿，再带 `next` 跳转登录。
  - 测试证据：`App.test.tsx` 的游客草稿和登录返回测试；`test_auth_and_guest.py` 的游客收藏/登录合并测试。
- [x] 评价支持 1–5 星、文字和最多 9 张图片，并显示机器/人工审核状态。
  - 实现证据：`ReviewPage.tsx`、`schemas.py:ReviewCreate`、`MinePage.tsx` 审核状态标签。
  - 测试证据：`test_reviews_and_admin.py` 的评价、图片和人工审核流程。
- [x] 地图支持价格、类别、口味、收藏筛选；普通点、收藏星标和含收藏商家的聚合星标正确。
  - 实现证据：`MapPage.tsx` 动态目录筛选、高德 MarkerCluster 和示意地图回退；`services/map_clusters.py`。
  - 测试证据：`test_reviews_and_admin.py::test_map_cluster_and_favorite_star`。
- [x] “我的”展示已发布评价数、累计阅读次数、收藏、评价和退出登录。
  - 实现证据：`MinePage.tsx` 每次挂载和重新聚焦均读取 `/me/stats`，不使用登录快照。
  - 测试证据：`App.test.tsx` 的实时统计测试；后端评价阅读幂等统计测试。
- [x] 用户名或邮箱登录、邮箱验证、密码找回路径存在；第三方登录仅保留扩展接口。
  - 实现证据：用户认证页面、`backend/app/api/auth.py` 和 `AuthIdentity` 预留表。
  - 测试证据：`test_auth_and_guest.py` 的注册、刷新、邮箱验证和密码重置测试。
- [x] 用户可维护口味、避忌和预算；点击、收藏、搜索与详情阅读形成去标识化行为画像。
  - 实现证据：`PreferencesPage.tsx` 使用服务端标签和地点；`services/profiles.py` 汇总行为。
  - 测试证据：后端行为改变确定性排序、原始搜索文本不进入 DeepSeek 的测试。
- [x] PWA 可安装，公开壳可离线打开，退出后不缓存个人数据。
  - 实现证据：`vite.config.ts` 的 Manifest/Workbox；`AppState.tsx` 在退出和令牌失效时清理账号收藏、查询缓存和草稿。
  - 自动化证据：`AppState.test.tsx` 区分账号收藏清理与匿名设备收藏保留。
  - 最终运行证据：2026-07-18 生产构建后确认 Manifest、已激活并控制页面的 `sw.js`；在 Chromium 断网后重新加载 390×844 首页，公开壳与三栏导航仍可打开。

## 管理端

- [x] 管理 Web 使用独立端口和登录态。
  - 实现证据：`apps/admin-web/vite.config.ts` 固定 `5174`；`AuthContext.tsx` 使用独立 sessionStorage 令牌。
- [x] 用户可查询、冻结和恢复，不能查看或修改明文密码。
  - 实现证据：`UsersPage.tsx` 和管理 `/users` 接口；数据模型只保存 `password_hash`。
  - 测试证据：管理 CRUD 与 audience 隔离测试。
- [x] 商家及其菜品/套餐可新增、编辑、上下架和地图选点。
  - 实现证据：`CatalogPage.tsx`、`components/LocationPicker.tsx` 和管理商家/菜品接口。
  - 测试证据：`LocationPicker.test.tsx`、`CatalogPage.test.tsx`、后端管理 CRUD 测试。
- [x] 校园地点、品类和标签不是前端硬编码，并支持 CSV 导入校验。
  - 实现证据：用户端动态目录；管理端 `TagPanel`、服务端 `/areas`、`/categories`、`/tags`；`admin/imports.py`。
  - 测试证据：目录隔离、标签增改删/引用同步和 CSV 校验导入测试。
- [x] 机器审核未通过或不确定的评价进入人工队列，可通过、驳回或下架。
  - 实现证据：`review_support.py`、`ReviewsPage.tsx` 和管理 `/reviews/{id}/moderate`。
  - 测试证据：无 DeepSeek 时转人工、管理员发布和统计更新测试。
- [x] 管理员变更写入可查询的审计日志。
  - 实现证据：`AdminAuditLog.campus_id`、管理 `_audit` 辅助函数和 `/audit-logs` 游标接口。
  - 测试证据：管理审核、目录和导入测试均断言审计记录。

## 后端与 AI

- [x] FastAPI 按认证、目录、发现、地图、评价、收藏、上传、个人中心和管理端拆分路由。
  - 实现证据：`api/router.py` 分别装配 `auth.py`、`catalog.py`、`discovery.py`、`map.py`、`reviews.py`、`favorites.py`、`uploads.py`、`profile.py`、`events.py`；`interactions.py` 仅作兼容聚合。
  - 测试证据：`test_system_and_catalog.py::test_public_catalog_route_boundaries`。
- [x] 所有校园业务资源包含并强制校验 `campus_id`。
  - 实现证据：模型、`services/campuses.py`、迁移 `20260718_0002_campus_isolation_and_idempotency.py`。
  - 测试证据：`test_campus_isolation_is_required_and_enforced` 覆盖缺参、跨校园访问和非空持久化。
- [x] 商家评分只由已发布菜品评价按计划中的贝叶斯/数量权重聚合。
  - 实现证据：`services/ratings.py`；种子数据先写入带“演示评价（非真实用户评价）”前缀的 `published` 评价，再调用统一重算服务。`published` 是可见性状态，不是真实性认证。
  - 测试证据：种子评分来源、状态变化重算和商家聚合测试。
- [x] 游客收藏和行为在登录时幂等合并。
  - 实现证据：`auth.py::_merge_guest` 对收藏去重、合并偏好、迁移行为并停用游客会话。
  - 测试证据：`test_guest_preferences_favorite_and_login_merge`。
- [x] DeepSeek 只能重排数据库候选 ID，超时、限流、坏 JSON 和虚构 ID 均回退确定性排序。
  - 实现证据：`services/deepseek.py` 和 `services/recommendations.py`。
  - 测试证据：`test_deepseek_contract.py` 的候选、坏 JSON、重复/虚构 ID 和禁用测试。
- [x] DeepSeek 接收的画像不包含账号、邮箱和评价原文；纯曝光不用于推断偏好。
  - 实现证据：`services/profiles.py` 的字段白名单和 `EVENT_WEIGHTS`。
  - 测试证据：原始搜索文本不进入捕获画像；曝光不在推断权重中。
- [x] 评价文本先经过规则和 DeepSeek；模型不可用时转人工而不是阻塞或误发布。
  - 实现证据：`api/review_support.py`、`services/moderation.py`、`services/deepseek.py`。
  - 测试证据：无 DeepSeek 的人工队列流程测试。
- [x] 图片进行真实 MIME、大小、解码、重编码和 EXIF 清除校验。
  - 实现证据：`api/uploads.py` 使用 Pillow 识别格式、`verify/load`、像素限制和重新保存；评价引用验证在 `review_support.py`。
  - 测试证据：损坏图片拒绝、有效图片上传和外部图片引用拒绝测试。
- [x] API 错误采用 Problem Details，列表采用游标分页，写入与事件支持幂等。
  - 实现证据：`main.py` 全局异常处理；`services/pagination.py`；`services/idempotency.py` 和 `IdempotencyRecord`。
  - 测试证据：无效游标、405、未处理 500、评价游标不重叠、`Idempotency-Key` 重放/冲突、事件和阅读去重测试。

## 文档、质量与交付

- [x] `/docs`、`/redoc`、`/openapi.json` 可用，并提供中文 API 使用说明。
  - 实现证据：`backend/app/main.py` 显式配置三条文档路径；中文说明见 `docs/API.md` 和 `backend/API.md`。
  - 自动化证据：后端 OpenAPI 路径与核心接口边界测试。
- [x] 后端单元/集成测试、前端组件测试和关键用户/管理流程 E2E 均通过。
  - 实现证据：`scripts/check.ps1` 已串联后端测试、静态审计、依赖检查、前端类型检查/组件测试、生产构建和 `pnpm test:e2e`；CI 也有独立 E2E job。
  - 最终运行证据：2026-07-18 `scripts/check.ps1` 零退出码；后端 25 passed、用户端 17 passed、管理端 14 passed、Playwright 3 passed，类型检查、静态审计和两端生产构建通过。
- [x] 无 DeepSeek、高德 Key 时仍可运行确定性推荐和示意地图。
  - 实现证据：DeepSeek 禁用返回确定性排序；`MapPage.tsx` 未配置或加载失败时切换校园示意地图。
  - 自动化证据：DeepSeek 禁用测试、后端地图聚合测试和前端静态契约审计。
- [x] 主要阶段合并到 `main`；出现远端或本地冲突时先通知用户，再按用户确认的方案处理。
  - 最终证据：2026-07-18 用户明确授权处理冲突和上传；普通合并 `origin/main`，手工保留 Campus Foodie 主 README 并追加高校资料说明，远端 PPT 目录保持原样。
- [x] 最终测试开始前先通知用户。
  - 最终证据：实现、实际运行联调、静态审计、完整检查和合并上传全部完成后，通过当前任务交付消息通知用户开始最终测试。
- [x] 数据来源与演示边界已在文档和种子字段中区分。
  - 文档证据：`docs/sources.md` 区分校方信息、高德 POI 候选、演示菜单/评分/评价和未来真实用户内容；`docs/ASSETS.md` 记录占位图片与历史图片授权边界。
  - 持久化证据：商家/菜品描述包含 POI 来源与演示说明，种子评价包含“非真实用户评价”前缀；`published` 不作为真实性证明。
- [ ] 用户端每个推荐卡、地图点位和详情区域均显示统一的“演示数据”徽标。
  - 当前边界：数据库字段和生成评价文本已有说明，但尚无证据证明所有界面都呈现统一徽标；正式公开前需补齐或替换为经核验数据。

## 最终运行证据

以下项目在正式开始最终测试后填写，不得用静态检查替代：

- [x] `scripts/check.ps1` 完整通过：2026-07-18，后端 25、用户端 17、管理端 14、Playwright 3。
- [x] 用户端连接后端 API：含图片评价 → 管理审核发布 → 游客阅读 → 作者统计更新的 Playwright 闭环通过；游客合并和草稿恢复由组件/集成测试覆盖。该流程证明接口闭环，不证明种子评价是真实用户口碑。
- [x] 地图：无 Key 示意模式的筛选、普通/收藏/聚合星标 E2E 通过；配置高德 JS API Key 的底图模式确认 MarkerCluster 2.0、4 个独立点、1 个含收藏星标的 2 商家聚合点及点击展开，无控制台错误。该证据验证地图集成，不等同于 POI 营业核验。
- [x] 管理端：商家/菜品/标签 CRUD、CSV 校验与导入、评价审核和审计日志 E2E 通过；用户冻结恢复、地图选点由后端/组件测试覆盖。
- [x] 认证：邮箱验证、密码重置、刷新令牌轮换、游客合并和退出缓存清理由后端/组件测试覆盖。
- [x] `/docs`、`/redoc`、`/openapi.json` 自动化检查通过；OpenAPI 三份文档已重新导出；PWA Service Worker 已激活，断网后公开壳可重开。
- [x] 最终 fetch 后已纳入远端高校资料与路演 PPT，README 冲突按用户授权解决；使用带租约保护的上传更新 `main`。
