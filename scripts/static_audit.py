from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def require_file(path: str) -> str:
    target = ROOT / path
    if not target.is_file():
        raise AssertionError(f"missing file: {path}")
    return target.read_text(encoding="utf-8")


def require_terms(path: str, *terms: str) -> None:
    content = require_file(path)
    missing = [term for term in terms if term not in content]
    if missing:
        raise AssertionError(f"{path} missing terms: {', '.join(missing)}")


def forbid_terms(path: str, *terms: str) -> None:
    content = require_file(path)
    present = [term for term in terms if term in content]
    if present:
        raise AssertionError(f"{path} contains forbidden terms: {', '.join(present)}")


def require_class_terms(path: str, class_name: str, *terms: str) -> None:
    content = require_file(path)
    match = re.search(
        rf"^class\s+{re.escape(class_name)}(?:\([^\n]*\))?:.*?(?=^class\s+|\Z)",
        content,
        flags=re.MULTILINE | re.DOTALL,
    )
    if match is None:
        raise AssertionError(f"{path} missing class: {class_name}")
    missing = [term for term in terms if term not in match.group(0)]
    if missing:
        raise AssertionError(
            f"{path}:{class_name} missing terms: {', '.join(missing)}"
        )


def forbid_tree_term(directory: str, term: str) -> None:
    matches = []
    for target in (ROOT / directory).rglob("*.py"):
        if term in target.read_text(encoding="utf-8"):
            matches.append(str(target.relative_to(ROOT)))
    if matches:
        raise AssertionError(f"{term!r} is forbidden in {directory}: {', '.join(matches)}")


def main() -> None:
    required_files = [
        "backend/app/main.py",
        "backend/app/models.py",
        "backend/app/schemas.py",
        "backend/app/api/auth.py",
        "backend/app/api/catalog.py",
        "backend/app/api/discovery.py",
        "backend/app/api/events.py",
        "backend/app/api/favorites.py",
        "backend/app/api/interactions.py",
        "backend/app/api/map.py",
        "backend/app/api/profile.py",
        "backend/app/api/review_support.py",
        "backend/app/api/reviews.py",
        "backend/app/api/router.py",
        "backend/app/api/uploads.py",
        "backend/app/admin/imports.py",
        "backend/app/admin/routes.py",
        "backend/app/services/accounts.py",
        "backend/app/services/campuses.py",
        "backend/app/services/deepseek.py",
        "backend/app/services/idempotency.py",
        "backend/app/services/map_clusters.py",
        "backend/app/services/pagination.py",
        "backend/app/services/profiles.py",
        "backend/app/services/ratings.py",
        "backend/app/services/recommendations.py",
        "backend/migrations/versions/20260718_0002_campus_isolation_and_idempotency.py",
        "apps/user-web/src/components/AppShell.tsx",
        "apps/user-web/src/pages/DishDetailPage.tsx",
        "apps/user-web/src/pages/FilterPage.tsx",
        "apps/user-web/src/pages/HomePage.tsx",
        "apps/user-web/src/pages/MapPage.tsx",
        "apps/user-web/src/pages/MinePage.tsx",
        "apps/user-web/src/pages/PreferencesPage.tsx",
        "apps/user-web/src/pages/ReviewPage.tsx",
        "apps/user-web/src/services/httpApi.ts",
        "apps/user-web/src/store/AppState.tsx",
        "apps/user-web/vite.config.ts",
        "apps/user-web/.env.example",
        "apps/admin-web/src/components/LocationPicker.tsx",
        "apps/admin-web/src/pages/CatalogPage.tsx",
        "apps/admin-web/src/pages/ReviewsPage.tsx",
        "apps/admin-web/src/pages/UsersPage.tsx",
        "docs/API.md",
        "docs/ARCHITECTURE.md",
        "docs/REQUIREMENTS.md",
        "backend/API.md",
    ]
    for path in required_files:
        require_file(path)

    # Focused public routers must remain split by responsibility.  The former
    # interactions module is intentionally compatibility-only and is not wired
    # into the application router.
    require_terms(
        "backend/app/api/router.py",
        "discovery_router",
        "catalog_router",
        "favorites_router",
        "reviews_router",
        "profile_router",
        "events_router",
        "uploads_router",
    )
    forbid_terms("backend/app/api/router.py", "interactions_router")
    require_terms(
        "backend/app/api/interactions.py",
        "Compatibility router",
        "favorites_router",
        "reviews_router",
        "profile_router",
        "events_router",
        "uploads_router",
    )
    require_terms(
        "backend/app/api/discovery.py",
        '"/recommendations/feed"',
        '"/search/suggestions"',
        '"/search"',
        "DeepSeekClient",
        "deterministic_rank",
    )
    require_terms(
        "backend/app/api/catalog.py",
        '"/campuses"',
        '"/areas"',
        '"/categories"',
        '"/tags"',
        '"/merchants"',
        '"/menu-items/{menu_item_id}"',
        '"/menu-items/{menu_item_id}/reviews"',
    )
    forbid_terms(
        "backend/app/api/catalog.py",
        '"/recommendations/feed"',
        '"/search/suggestions"',
    )
    require_terms("backend/app/api/favorites.py", '"/favorites/merchants/{merchant_id}"', '"/me/favorites"')
    require_terms("backend/app/api/reviews.py", '"/menu-items/{menu_item_id}/reviews"', '"/reviews/{review_id}/view"')
    require_terms("backend/app/api/profile.py", '"/me/reviews"', '"/me/stats"', '"/me/preferences"')
    require_terms("backend/app/api/events.py", '"/interactions"', "require_menu_item", "require_merchant")
    require_terms("backend/app/api/uploads.py", '"/uploads/images"', "image.verify()", "optimize=True")
    require_terms("backend/app/api/map.py", '"/map/merchants"', "campus_id: str")

    # Campus isolation is a persisted invariant for every campus-owned business
    # resource, not just a query parameter convention.
    for model in (
        "CampusArea",
        "Category",
        "Tag",
        "Merchant",
        "MenuItem",
        "Favorite",
        "Review",
        "ReviewView",
        "InteractionEvent",
        "AdminAuditLog",
        "ImportJob",
    ):
        require_class_terms("backend/app/models.py", model, "campus_id")
    require_terms(
        "backend/app/services/campuses.py",
        "def require_campus",
        "def require_area",
        "def require_category",
        "def require_tag",
        "def require_merchant",
        "def require_menu_item",
        "def require_review",
    )
    for schema in ("TagRead", "ReviewRead", "FavoriteRead", "PreferencesUpdate", "ReviewViewRequest", "InteractionBatch"):
        require_class_terms("backend/app/schemas.py", schema, "campus_id")

    # Opaque cursors are used for business lists.  Offset pagination must not
    # quietly return to public or admin route implementations.
    require_terms(
        "backend/app/services/pagination.py",
        "def encode_cursor",
        "def decode_cursor",
        "def before_cursor",
        "def page_metadata",
    )
    require_class_terms("backend/app/schemas.py", "CursorPage", "next_cursor", "has_more")
    require_class_terms("backend/app/schemas.py", "ReviewPage", "next_cursor", "has_more")
    require_class_terms("backend/app/schemas.py", "AdminReviewPage", "next_cursor", "has_more")
    forbid_tree_term("backend/app/api", ".offset(")
    forbid_tree_term("backend/app/admin", ".offset(")

    # Every unsafe request can opt into replay-safe writes with Idempotency-Key;
    # errors, including unexpected 500s, retain Problem Details format.
    require_class_terms("backend/app/models.py", "IdempotencyRecord", "idempotency_key", "request_hash", "response_body")
    require_terms(
        "backend/app/services/idempotency.py",
        'request.headers.get("idempotency-key")',
        "Idempotency-Replayed",
        "同一 Idempotency-Key 不能用于不同请求",
    )
    require_terms(
        "backend/app/main.py",
        "idempotency_middleware",
        "StarletteHTTPException",
        "RequestValidationError",
        "ResponseValidationError",
        "@app.exception_handler(Exception)",
        "application/problem+json",
    )
    require_terms(
        "backend/migrations/versions/20260718_0002_campus_isolation_and_idempotency.py",
        "campus_id",
        "idempotency_records",
    )

    require_terms(
        "backend/app/services/deepseek.py",
        "/chat/completions",
        "candidate_ids",
        "issubset",
        "response_format",
    )
    require_terms(
        "backend/app/services/profiles.py",
        "EVENT_WEIGHTS",
        "behavior_profile",
        "search_signal_count",
        "Impressions are intentionally excluded",
        "campus_id",
    )
    require_terms("backend/app/services/ratings.py", "ReviewStatus.PUBLISHED", "math.sqrt", "campus_average")
    require_terms("backend/app/services/map_clusters.py", "has_favorite", "GCJ-02")

    # User UI dictionaries are server-owned; mockData is allowed only inside the
    # explicit mock adapter and review demo fallback.
    require_terms(
        "apps/user-web/src/services/httpApi.ts",
        "async getCatalog()",
        "/campuses",
        "/areas",
        "/categories",
        "/tags",
        "campus_id",
        "getMyStats",
    )
    for page in ("HomePage.tsx", "FilterPage.tsx", "MapPage.tsx", "PreferencesPage.tsx"):
        require_terms(f"apps/user-web/src/pages/{page}", "api.getCatalog()")
        forbid_terms(f"apps/user-web/src/pages/{page}", "../data/mockData")
    require_terms("apps/user-web/src/pages/HomePage.tsx", "useInfiniteQuery", "fetchNextPage", "nextCursor")
    require_terms(
        "apps/user-web/src/pages/ReviewPage.tsx",
        "游客也可以先写草稿",
        "草稿已保留，登录后可继续发布",
        "sessionStorage.setItem",
    )
    require_terms("apps/user-web/src/pages/MinePage.tsx", "api.getMyStats()", "refetchOnMount", "退出后会清除账号派生的收藏")
    require_terms(
        "apps/user-web/src/store/AppState.tsx",
        "localStorage.removeItem(FAVORITES_KEY)",
        "queryClient.clear()",
        "setFavorites([])",
        "clearPrivateDrafts()",
    )
    require_terms(
        "apps/user-web/src/pages/MapPage.tsx",
        "VITE_AMAP_KEY",
        "webapi.amap.com/maps",
        "AMap.MarkerCluster",
        "lnglat:",
        "renderMarker:",
        "context.clusterData",
        "已切换校园示意地图",
        "has-star",
    )
    require_terms("apps/user-web/src/data/mockData.ts", "latitude:", "longitude:")
    require_terms("apps/user-web/.env.example", "VITE_CAMPUS_ID", "VITE_AMAP_KEY", "VITE_AMAP_SECURITY_CODE")
    require_terms("apps/user-web/vite.config.ts", "VitePWA", "navigateFallback", "manifest")
    require_terms("apps/user-web/src/components/AppShell.tsx", "首页", "地图", "我的")
    forbid_terms("apps/user-web/src/components/AppShell.tsx", "我也吃过", "quick-review", "/review/new")
    require_terms("apps/user-web/src/pages/DishDetailPage.tsx", "我也吃过")
    require_terms("apps/user-web/src/styles.css", "grid-template-columns: repeat(3, 1fr)", "safe-area-inset-bottom")
    forbid_terms("apps/user-web/src/styles.css", ".quick-review")

    require_terms(
        "apps/admin-web/src/components/LocationPicker.tsx",
        "在校园示意地图上选择商家位置",
        "WGS-84",
        "ArrowUp",
        "回到校园中心",
    )
    require_terms(
        "apps/admin-web/src/pages/CatalogPage.tsx",
        "LocationPicker",
        "地图选点（WGS-84）",
        "TagPanel",
        "标签字典",
        "从服务端标签字典中选择",
    )
    require_terms(
        "backend/app/admin/routes.py",
        '"/users"',
        '"/merchants"',
        '"/menu-items"',
        '"/tags"',
        '"/reviews"',
        '"/audit-logs"',
        "cursor: str | None",
        "campus_id: str",
    )

    # These tests are the executable evidence behind the structural checks.
    require_terms(
        "backend/tests/test_system_and_catalog.py",
        "def test_public_catalog_route_boundaries",
        "def test_campus_isolation_is_required_and_enforced",
        "def test_idempotency_key_replays_write_and_rejects_payload_change",
        "def test_review_cursor_pages_do_not_overlap",
        "def test_unhandled_exception_is_problem_details",
    )
    require_terms(
        "apps/user-web/src/App.test.tsx",
        "keeps the home navigation limited to home, map and mine",
        "uses nextCursor to continue loading the home feed",
        "lets a guest write a review draft and redirects only when publishing",
        "reads current profile statistics instead of the login snapshot",
    )
    require_terms(
        "apps/user-web/src/store/AppState.test.tsx",
        "removes account-derived favorites and private drafts on logout",
        "keeps anonymous device favorites available to a guest",
    )
    require_terms(
        "apps/admin-web/src/components/LocationPicker.test.tsx",
        "converts a map click into WGS-84 coordinates",
        "supports keyboard nudging and resetting to campus center",
    )
    require_terms(
        "apps/admin-web/src/pages/CatalogPage.test.tsx",
        "embeds the map picker in the merchant form",
        "loads the server tag dictionary",
    )

    require_terms("backend/API.md", "campus_id", "Idempotency-Key", "next_cursor", "Problem Details")
    require_terms("docs/API.md", "动态目录", "高德地图", "Idempotency-Key", "游标")
    require_terms("docs/ARCHITECTURE.md", "discovery.py", "校园隔离", "幂等", "游标")
    require_terms("docs/REQUIREMENTS.md", "实现证据", "最终运行证据", "Idempotency-Key")

    print(
        "Static audit passed: "
        f"{len(required_files)} artifacts plus routing, campus isolation, cursor, "
        "idempotency, dynamic catalog, AMap and evidence contracts"
    )


if __name__ == "__main__":
    main()
