# Campus Foodie Hackathon Roadshow - Design Spec

> Human-readable design narrative: rationale, audience, style, color choices, content outline. Read once by downstream roles for context.
>
> Machine-readable execution contract: `spec_lock.md` (color / typography / icon / image short form). Executor re-reads `spec_lock.md` before every SVG page to resist context-compression drift. Keep both in sync; on divergence, `spec_lock.md` wins.

## I. Project Information

| Item | Value |
| ---- | ----- |
| **Project Name** | Campus Foodie 黑客松路演 PPT |
| **Canvas Format** | PPT 16:9 (1280x720) |
| **Page Count** | 16 |
| **Design Style** | Mode: showcase; Visual style: soft-rounded |
| **Target Audience** | 黑客松评委、参赛者、现场观众 |
| **Use Case** | 8-12 分钟路演，强调痛点、产品方案、技术可信度、可降级 AI 设计和项目增长空间 |
| **Content Strategy** | 用户确认：这是一个黑客松比赛的项目，PPT 用来做路演用的，受众是参赛者和评委。处理策略：保留源文档第 23 节的 16 页顺序和标题方向，但按路演节奏重塑页面表达。事实全部来自源文档，不引入外部事实。 |
| **Created Date** | 2026-07-18 |

---

## II. Canvas Specification

| Property | Value |
| -------- | ----- |
| **Format** | PPT 16:9 |
| **Dimensions** | 1280x720 |
| **viewBox** | `0 0 1280 720` |
| **Margins** | left/right 56px, top 48px, bottom 42px |
| **Content Area** | 1168x610, with flexible hero zones for showcase pages |

---

## III. Visual Theme

### Theme Style

- **Mode**: showcase
- **Visual style**: soft-rounded
- **Theme**: Light theme
- **Tone**: 鲜活、可信、产品感、校园生活温度与工程确定性并重

The deck should feel like a polished hackathon product pitch, not a dense course report. Each page should land one visible idea: a problem, a product moment, a system boundary, a safety promise, or a future path.

### Color Scheme

Confirmed palette: **鲜活校园科技**.

| Role | HEX | Purpose |
| ---- | --- | ------- |
| **Background** | `#FBFFF7` | Warm light page field |
| **Secondary bg** | `#EAF7EF` | Cards, section panels, soft product surfaces |
| **Primary** | `#1F8A70` | Main titles, structural anchors, product identity |
| **Accent** | `#FFB703` | Food warmth, key highlights, call-to-action accents |
| **Secondary accent** | `#3A86FF` | Technical credibility, API/data/AI emphasis |
| **Body text** | `#182026` | Main readable text |
| **Secondary text** | `#4D5A57` | Captions, labels, supporting notes |
| **Tertiary text** | `#74807C` | Footers, page numbers, minor metadata |
| **Border/divider** | `#BFD9CC` | Card borders and light separators |
| **Surface** | `#FFFFFF` | Raised card and device mockup surfaces |
| **Grid** | `#DCEBE3` | Thin lines, flow tracks, table rules |
| **Success** | `#22A06B` | Safe/pass/fallback-success states |
| **Warning** | `#E45858` | Risk, invalid model output, content review |
| **Scrim** | `#0F2F29` | Legibility overlay when a page uses tinted background blocks |

### AI Image Strategy

No AI-generated raster images are used in the default confirmed plan.

### Gradient Scheme

Use subtle same-family gradients only:

```xml
<linearGradient id="campusWash" x1="0%" y1="0%" x2="100%" y2="100%">
  <stop offset="0%" stop-color="#EAF7EF"/>
  <stop offset="100%" stop-color="#FBFFF7"/>
</linearGradient>
```

```xml
<linearGradient id="heroGreen" x1="0%" y1="0%" x2="100%" y2="0%">
  <stop offset="0%" stop-color="#1F8A70"/>
  <stop offset="100%" stop-color="#3A86FF"/>
</linearGradient>
```

---

## IV. Typography System

### Font Plan

**Typography direction**: friendly product sans with a slightly rounded Latin title character.

| Role | Chinese | English | Fallback tail |
| ---- | ------- | ------- | ------------- |
| **Title** | `"Microsoft YaHei"` | `"Trebuchet MS"` | `sans-serif` |
| **Body** | `"Microsoft YaHei"` | `Arial` | `sans-serif` |
| **Emphasis** | `"Microsoft YaHei"` | `"Trebuchet MS"` | `sans-serif` |
| **Code** | - | `Consolas, "Courier New"` | `monospace` |

**Per-role font stacks**:

- Title: `"Trebuchet MS", "Microsoft YaHei", "PingFang SC", sans-serif`
- Body: `"Microsoft YaHei", "PingFang SC", Arial, sans-serif`
- Emphasis: `"Trebuchet MS", "Microsoft YaHei", "PingFang SC", sans-serif`
- Code: `Consolas, "Courier New", monospace`

### Font Size Hierarchy

**Baseline**: Body font size = 18px.

| Purpose | Ratio to body | Current Project | Weight |
| ------- | ------------- | --------------- | ------ |
| Cover title | 2.5-5x | 72px | Bold |
| Chapter / section opener | 2-2.5x | 44px | Bold |
| Page title | 1.5-2x | 34px | Bold |
| Hero number / hero phrase | 2.5-4x when used as the page subject | 64px | Bold |
| Subtitle | 1.2-1.5x | 24px | SemiBold |
| **Body content** | **1x** | **18px** | Regular |
| Annotation / caption | 0.7-0.85x | 14px | Regular |
| Page number / footnote | 0.5-0.65x | 11px | Regular |

---

## V. Layout Principles

### Page Structure

- **Header area**: 48-110px depending on density. Showcase pages may omit traditional header and use a large title block.
- **Content area**: 560-610px. Prefer one primary visual structure per page.
- **Footer area**: 30-42px with discreet section label and page number.

### Layout Pattern Library

Use soft-rounded cards as product UI surfaces, not as a default for every object. Showcase rhythm should alternate between:

- **Hero phrase / hero diagram**: one large product claim or core metaphor.
- **Device mockup / screenshot placeholder**: native SVG phone or desktop frame with simplified UI blocks.
- **System flow**: editable SVG nodes and arrows for architecture, recommendation, audit, and fallback.
- **Capability cards**: 3-5 rounded cards when the page compares independent features.
- **Loop / roadmap**: circular or vertical flow on pages that explain closure or next steps.

### Spacing Specification

**Universal**:

| Element | Recommended Range | Current Project |
| ------- | ---------------- | --------------- |
| Safe margin from canvas edge | 40-60px | 56px |
| Content block gap | 24-40px | 30px |
| Icon-text gap | 8-16px | 12px |

**Card-based layouts**:

| Element | Recommended Range | Current Project |
| ------- | ---------------- | --------------- |
| Card gap | 20-32px | 24px |
| Card padding | 20-32px | 24px |
| Card border radius | 8-16px | 16px |
| Single-row card height | 530-600px | 520px max |
| Double-row card height | 240-285px each | 250px |
| Three-column card width | 360-380px each | 360px |

**Non-card containers**:

- Breathing pages should use large colored shapes, oversized phrases, and negative space rather than repeated cards.
- Device mockups are rounded, stable, and dimensional, but the inner UI remains flat and editable.
- Flow arrows should be thick enough for projection, with labels separated from arrow lines.

---

## VI. Icon Usage Specification

### Source

- **Built-in icon library**: `phosphor-duotone`
- **Usage method**: SVG placeholder `<use data-icon="phosphor-duotone/icon-name" .../>`
- **Reasoning**: duotone icons match the soft-rounded product aesthetic and keep the deck approachable while still feeling technical.

### Recommended Icon List

| Purpose | Icon Path | Page |
| ------- | --------- | ---- |
| Food decision | `phosphor-duotone/fork-knife` | P01, P03 |
| Food item | `phosphor-duotone/bowl-food` | P03, P06 |
| Pain point | `phosphor-duotone/warning` | P02 |
| Product magic | `phosphor-duotone/sparkle` | P03 |
| Users | `phosphor-duotone/users-three` | P04 |
| Student persona | `phosphor-duotone/student` | P04 |
| Mobile app | `phosphor-duotone/device-mobile` | P05, P06 |
| Map | `phosphor-duotone/map-pin` | P05, P07 |
| Admin desktop | `phosphor-duotone/desktop` | P05, P08 |
| Database | `phosphor-duotone/database` | P09, P10 |
| AI | `phosphor-duotone/brain` | P09, P10 |
| Review | `phosphor-duotone/chat-circle` | P07, P11 |
| Safety | `phosphor-duotone/shield-check` | P11, P13 |
| Privacy | `phosphor-duotone/lock-key` | P13 |
| Testing | `phosphor-duotone/test-tube` | P14 |
| Launch / next step | `phosphor-duotone/rocket-launch` | P16 |
| Engineering | `phosphor-duotone/gear-six` | P12 |
| Metrics | `phosphor-duotone/chart-bar` | P14, P15 |
| Code/API | `phosphor-duotone/code-block` | P12 |
| Verification | `phosphor-duotone/check-circle` | P14 |
| Journey | `phosphor-duotone/path` | P04 |
| Roadmap | `phosphor-duotone/flag` | P16 |
| Q&A | `phosphor-duotone/question` | P16 |
| Merchant | `phosphor-duotone/storefront` | P08 |
| Checklist | `phosphor-duotone/list-checks` | P08, P14 |
| Availability | `phosphor-duotone/cloud-check` | P17 fallback references if needed |
| Merge / guest flow | `phosphor-duotone/arrows-merge` | P04, P12 |
| Audit | `phosphor-duotone/clipboard-text` | P08, P11 |

---

## VII. Visualization Reference List

Catalog read: 71 templates

| Page | Template | Path | Summary-quote (verbatim from `charts_index.json`) | Usage |
| ---- | -------- | ---- | ------------------------------------------------- | ----- |
| P04 | journey_map | `templates/charts/journey_map.svg` | "Pick for multi-phase customer experience matrix with actions, emotion curve, and pain points per phase. Skip for simple linear funnel (use funnel_chart)." | Show the guest-to-review user story as a hackathon demo path |
| P05 | icon_grid | `templates/charts/icon_grid.svg` | "Pick for 4-9 parallel features/capabilities/services as icon cards 鈥?feature grid, service lineup, benefits matrix, brand values, product highlights. Skip for sequential ordering (use numbered_steps) or hierarchical layers (use pyramid_chart)." | Four product surfaces: home, map, review, admin |
| P09 | client_server_flow | `templates/charts/client_server_flow.svg` | "Pick for left-side clients + right-side servers with labeled bidirectional arrows for key interactions (request/response/push). Each module = name + 1-line description; each arrow must have an action label. Skip for non-distributed flows (use process_flow)." | Two frontends, FastAPI, database, DeepSeek, mail, map service |
| P10 | process_flow | `templates/charts/process_flow.svg` | "Pick for 3-8 sequential steps connected by simple arrows 鈥?approval workflows, customer onboarding, request handling, lifecycle stages. Skip if cyclical (use circular_stages) or stages produce named outputs (use pipeline_with_stages)." | Database recall to deterministic ranking to DeepSeek rerank to fallback |
| P11 | circular_stages | `templates/charts/circular_stages.svg` | "Pick for 4-6 stage closed loop where stages compose a cycle 鈥?PDCA, flywheel compounding loops (Attract 鈫?Engage 鈫?Delight), lifecycle, continuous improvement. Skip for linear flow (use process_flow), one-shot sequence (use numbered_steps), or wedge-based central topic (use segmented_wheel)." | Review, audit, publish, score, influence loop |
| P12 | vertical_pillars | `templates/charts/vertical_pillars.svg` | "Pick for 1脳3 / 1脳4 / 1脳5 vertical column layout where each pillar = one independent category with title + bullets 鈥?PEST (Political/Economic/Social/Technological), four-pillar strategy overview, side-by-side independent categories. Skip for 2脳2 quadrant (use quadrant_text_bullets), pricing tiers (use comparison_columns), or 2脳2 parallel aspects (use labeled_card)." | Campus isolation, cursor pagination, idempotent writes, Problem Details |
| P13 | hub_spoke | `templates/charts/hub_spoke.svg` | "Pick for 1 core capability + 4-8 surrounding capabilities (platform/ecosystem); each spoke = title or title + 1-2 line description. Skip if center is a system containing parts with their own descriptions (use module_composition), or surroundings exert inward pressure on the center (use hub_inward_arrows)." | Security boundary around identity, AI data, images, permissions, cache |
| P14 | pipeline_with_stages | `templates/charts/pipeline_with_stages.svg` | "Pick for 3-5 horizontal pipeline stages, each = title + 1-line description + output artifact, connected by arrows (data pipelines, ETL, build pipelines). Skip if any stage lacks an artifact (use process_flow or numbered_steps)." | Test and delivery pipeline from unit tests to OpenAPI and Docker |
| P15 | kpi_cards | `templates/charts/kpi_cards.svg` | "Pick for 4-8 standalone numeric metrics shown as overview cards (2x2 or 1x4) 鈥?exec summary opener, dashboard headline, quarterly recap, results-at-a-glance. Skip if metrics have target baselines (use bullet_chart) or single hero number (use gauge_chart)." | Feature highlights as outcome cards, using qualitative numbers from source |
| P16 | roadmap_vertical | `templates/charts/roadmap_vertical.svg` | "Pick for 4-8 milestones on a vertical timeline with status indicators. Skip for horizontal time emphasis (use timeline) or tasks with durations (use gantt_chart)." | Future steps and Q&A close |

**Runners-up considered**

- `layered_architecture` | rejected for P09: the page needs bidirectional client/API/server interactions, not only horizontal layers.
- `numbered_steps` | rejected for P10: the recommendation flow is not merely numbered presentation steps; it needs explicit arrows and fallback branches.
- `segmented_wheel` | rejected for P11: the review system is a closed business loop, not equally weighted aspects around a center.
- `comparison_table` | rejected for P12: the API engineering choices are independent pillars rather than dense feature rows.

---

## VIII. Image Resource List

The confirmed image approach is `placeholder`. No external raster images are required for the first generated PPT. Screenshot-heavy pages should use **native SVG device and desktop mockups** as editable placeholders. When real screenshots are available later, they can replace these frames.

| Filename | Dimensions | Ratio | Purpose | Type | Layout pattern | Acquire Via | Status | Reference | text_policy | page_role |
| -------- | ---------- | ----- | ------- | ---- | -------------- | ----------- | ------ | --------- | ----------- | --------- |
| native-svg-home-wireframe | 390x844 visual frame inside SVG | 0.46 | User home screenshot placeholder | Wireframe placeholder | #45 Background image + numbered hotspots with sidebar legend + #21 Rounded rectangle crop | placeholder | Placeholder | Draw as editable phone UI mockup, not an external file | none | local |
| native-svg-map-review-wireframe | 2 device frames inside SVG | mixed | Map and review screenshot placeholder | Wireframe placeholder | #48 Side-by-side comparison (before/after, A/B, then/now) + #21 Rounded rectangle crop | placeholder | Placeholder | Draw as two editable phone UI mockups, not external files | none | local |
| native-svg-admin-wireframe | desktop frame inside SVG | 1.78 | Admin screenshot placeholder | Wireframe placeholder | #44 Background image + native network/architecture diagram + #21 Rounded rectangle crop | placeholder | Placeholder | Draw as editable admin table and audit UI, not external file | none | local |
| native-svg-test-pipeline | wide pipeline graphic | 1.78 | Test and deployment pipeline | Diagram placeholder | #39 Background image + flow nodes drawn over the scene + #65 Image with NO text 鈥?labels added as native SVG | placeholder | Placeholder | Draw native SVG pipeline, no external file | none | local |

Image-as-canvas coverage note: because this deck uses placeholder wireframes rather than raster images, #44 and #45 are implemented as native SVG "image-as-canvas" analogues. All labels remain editable.

---

## IX. Content Outline

### Part 1: Hook and Product Promise

#### Slide 01 - 项目封面

- **Layout**: Full soft gradient field, oversized title, food/product icon cluster, one-line tagline.
- **Title**: Campus Foodie
- **Core message**: 我们让学生从“去哪吃”更快走到“今天吃什么”。
- **Visualization**: no-template-match, hero cover layout.
- **Content**: 项目名、黑客松路演、团队/成员占位、日期。视觉用食物图标、地图点、AI spark 形成产品三角。

#### Slide 02 - 背景与痛点

- **Layout**: Breathing page with one large phrase and four pain chips.
- **Title**: 选择太多，也是一种成本
- **Core message**: 校园餐饮不是缺信息，而是缺一条能快速做决定的路径。
- **Visualization**: vertical_list style derived from pain-point chips.
- **Content**: 信息分散、选择困难、个体差异、评价治理、地点不熟。让页面像一个比赛开场的痛点镜头，而不是论文背景。

#### Slide 03 - 解决方案

- **Layout**: Big central product promise, left "商家推荐" vs right "菜品级推荐" contrast.
- **Title**: 直接推荐具体菜品
- **Core message**: Campus Foodie 把推荐主体从商家前移到菜品或套餐，缩短决策链路。
- **Visualization**: no-template-match, custom before-after contrast.
- **Content**: 一句话定位，菜品级推荐、地图发现、真实评价、后台治理、DeepSeek 受约束重排。

### Part 2: User and Product Surface

#### Slide 04 - 用户与场景

- **Layout**: Journey map with five demo beats.
- **Title**: 从游客到贡献者
- **Core message**: 产品先允许轻量浏览，再在关键动作上完成身份归属。
- **Visualization**: journey_map.
- **Content**: 游客浏览、设置偏好、收藏商家、写评价草稿、登录后恢复并发布。强调游客优先体验适合高频低门槛饮食场景。

#### Slide 05 - 功能总览

- **Layout**: 2x2 icon grid with product surfaces.
- **Title**: 一个闭环，四个入口
- **Core message**: 首页、地图、评价、管理端共同组成完整餐饮决策闭环。
- **Visualization**: icon_grid.
- **Content**: 首页推荐、地图发现、我也吃过、管理审核。每个入口一句话，不堆功能清单。

#### Slide 06 - 用户端首页

- **Layout**: Large phone mockup on left, three explanatory cards on right.
- **Title**: 首页只服务一个问题
- **Core message**: 用户打开首页时，系统应当帮助他快速决定吃什么。
- **Visualization**: native SVG phone wireframe.
- **Content**: 搜索、品类和地点筛选、个性化推荐卡片。卡片展示图片、菜名、商家、评分、价格、推荐理由。

#### Slide 07 - 地图与评价

- **Layout**: Two phone mockups side by side, connected by an arrow.
- **Title**: 找得到，也评得上
- **Core message**: 地图解决位置问题，评价入口让消费体验回流成公共信息。
- **Visualization**: side-by-side comparison.
- **Content**: 地图筛选、点位聚合、收藏星标、我也吃过、图片评价、审核状态。

#### Slide 08 - 管理端

- **Layout**: Desktop dashboard placeholder with right-side audit/action stack.
- **Title**: 后台保证可治理
- **Core message**: 管理端让商家、菜品、评价、导入和审计都可维护、可追踪。
- **Visualization**: no-template-match, admin dashboard mockup.
- **Content**: 用户管理、商家与菜品管理、评价审核、CSV 预校验、审计日志。

### Part 3: Technical Credibility

#### Slide 09 - 系统架构

- **Layout**: Client/server flow, left two frontends, center FastAPI, right data and external services.
- **Title**: 模块化单体，边界清晰
- **Core message**: 初版用前后端分离的模块化单体保证开发效率，同时保留服务拆分边界。
- **Visualization**: client_server_flow.
- **Content**: 用户端 5173、管理端 5174、FastAPI 8000、SQLite/PostgreSQL、图片存储、DeepSeek、SMTP、地图。

#### Slide 10 - 推荐与 DeepSeek

- **Layout**: Linear process with a highlighted safety gate and fallback lane.
- **Title**: AI 只重排，不凭空创造
- **Core message**: 大模型只处理数据库召回的合法候选，因此智能增强不破坏系统可控性。
- **Visualization**: process_flow.
- **Content**: 数据库候选、去标识化画像、确定性排序、DeepSeek 重排、合法性验证、异常回退。

#### Slide 11 - 评价审核闭环

- **Layout**: Circular stages around "内容治理" center.
- **Title**: 评价不是结束，是闭环开始
- **Core message**: 用户评价经过规则、AI 和人工审核后，回到公开评分和影响统计。
- **Visualization**: circular_stages.
- **Content**: 图片校验、文本规则、DeepSeek 辅助、人工审核、发布聚合、阅读影响力。

#### Slide 12 - 数据与 API 工程

- **Layout**: Four vertical pillars with code-style chips.
- **Title**: 工程细节保护体验
- **Core message**: 校园隔离、游标分页、幂等写入和统一错误格式让系统在真实网络里更稳。
- **Visualization**: vertical_pillars.
- **Content**: campus_id 隔离、不透明游标、Idempotency-Key、RFC 9457 风格 Problem Details。

#### Slide 13 - 安全与隐私

- **Layout**: Center shield with five surrounding safety boundaries.
- **Title**: 把 AI 放进边界里
- **Core message**: 系统把敏感身份、原始搜索、评价原文和私有缓存隔离在模型之外。
- **Visualization**: hub_spoke.
- **Content**: 用户/管理员 audience 分离、密码哈希、图片重编码、AI 数据最小化、PWA 缓存清理。

#### Slide 14 - 测试与部署

- **Layout**: Pipeline with stages and artifacts.
- **Title**: 从能跑到可信
- **Core message**: 分层测试、静态审计、构建检查和容器化部署支撑可验收交付。
- **Visualization**: pipeline_with_stages.
- **Content**: Pytest、Vitest、Testing Library、Playwright、static_audit、OpenAPI、Docker Compose。

### Part 4: Differentiation and Close

#### Slide 15 - 特色与成果

- **Layout**: KPI-style highlight cards with one big claim.
- **Title**: 三个让项目站住的设计
- **Core message**: 菜品级推荐、可靠降级和内容治理闭环让 Campus Foodie 不只是一个套壳推荐页。
- **Visualization**: kpi_cards.
- **Content**: 菜品级、受约束 AI、游客优先、真实可用降级、多校园基础、治理闭环。

#### Slide 16 - 总结与展望

- **Layout**: Left closing thesis, right vertical roadmap, bottom Q&A cue.
- **Title**: 让校园选择更轻一点
- **Core message**: Campus Foodie 已形成 MVP 闭环，下一步围绕统一身份、实时营业数据、情境推荐和指标体系迭代。
- **Visualization**: roadmap_vertical.
- **Content**: 总结价值、局限、后续路线。最后保留 Q&A。

---

## X. Speaker Notes Requirements

One speaker note file per page, saved to `notes/`.

- **Filename**: match SVG name, e.g. `01_cover.md`, `02_pain.md`.
- **Master notes**: `notes/total.md` uses `#` headings for each slide before splitting.
- **Style**: energetic roadshow narration, short and vivid. Avoid reading text blocks verbatim.
- **Duration**: 8-12 minutes total; average 35-45 seconds per slide, with P01/P16 shorter and P09-P13 slightly longer.
- **Purpose**: persuade and demonstrate product maturity.

---

## XI. Technical Constraints Reminder

### SVG Generation Must Follow:

1. viewBox: `0 0 1280 720`
2. Background uses `<rect>` elements
3. Text wrapping uses `<tspan>`; `<foreignObject>` is forbidden
4. Transparency uses `fill-opacity` / `stroke-opacity`; `rgba()` is forbidden
5. Forbidden: `mask`, `<style>`, `class`, `foreignObject`
6. Forbidden: `textPath`, `animate*`, `script`
7. XML reserved chars in text must be escaped as `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;`
8. `marker-start` / `marker-end` may be used only with allowed marker shapes in `<defs>`
9. `clipPath` is allowed only on `<image>` elements; this deck uses native SVG placeholders and should not need it

### PPT Compatibility Rules:

- `<g opacity="...">` is forbidden; set opacity on each child element
- Image transparency uses overlay shape layers
- Inline styles only; external CSS and `@font-face` are forbidden
- Icons must come from the synchronized `phosphor-duotone` project icon inventory
