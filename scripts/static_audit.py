from __future__ import annotations

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


def main() -> None:
    required_files = [
        "backend/app/main.py",
        "backend/app/api/auth.py",
        "backend/app/api/catalog.py",
        "backend/app/api/interactions.py",
        "backend/app/api/map.py",
        "backend/app/admin/routes.py",
        "backend/app/services/accounts.py",
        "backend/app/services/deepseek.py",
        "apps/user-web/src/pages/HomePage.tsx",
        "apps/user-web/src/pages/MapPage.tsx",
        "apps/user-web/src/pages/MinePage.tsx",
        "apps/user-web/src/pages/DishDetailPage.tsx",
        "apps/user-web/src/pages/ReviewPage.tsx",
        "apps/user-web/src/pages/ForgotPasswordPage.tsx",
        "apps/user-web/src/pages/ResetPasswordPage.tsx",
        "apps/user-web/src/pages/VerifyEmailPage.tsx",
        "apps/user-web/src/services/httpApi.ts",
        "apps/user-web/vite.config.ts",
        "apps/admin-web/src/pages/UsersPage.tsx",
        "apps/admin-web/src/pages/CatalogPage.tsx",
        "apps/admin-web/src/pages/ReviewsPage.tsx",
        "apps/admin-web/src/pages/ImportsPage.tsx",
        "apps/admin-web/src/pages/AuditLogsPage.tsx",
        "docs/API.md",
        "docs/REQUIREMENTS.md",
    ]
    for path in required_files:
        require_file(path)

    require_terms(
        "backend/app/api/auth.py",
        '"/email-verification/request"',
        '"/email-verification/confirm"',
        '"/password/forgot"',
        '"/password/reset"',
    )
    require_terms(
        "backend/app/api/catalog.py",
        '"/recommendations/feed"',
        '"/search/suggestions"',
        '"/search"',
        '"/menu-items/{menu_item_id}"',
        '"/merchants/{merchant_id}"',
    )
    require_terms(
        "backend/app/api/interactions.py",
        '"/favorites/merchants/{merchant_id}"',
        '"/menu-items/{menu_item_id}/reviews"',
        '"/me/stats"',
        '"/uploads/images"',
    )
    require_terms("backend/app/api/map.py", '"/map/merchants"')
    require_terms("backend/app/services/map_clusters.py", "has_favorite", "GCJ-02")
    require_terms(
        "backend/app/services/deepseek.py",
        "/chat/completions",
        "candidate_ids",
        "issubset",
        "response_format",
    )
    require_terms(
        "backend/app/admin/routes.py",
        '"/users"',
        '"/merchants"',
        '"/menu-items"',
        '"/reviews"',
        '"/audit-logs"',
    )
    require_terms(
        "apps/user-web/src/components/AppShell.tsx",
        "我也吃过",
        "首页",
        "地图",
        "我的",
    )
    require_terms("apps/user-web/src/pages/HomePage.tsx", "品类", "地点", "AI 推荐")
    require_terms("apps/user-web/src/pages/MapPage.tsx", "价格", "口味", "收藏")
    require_terms("apps/user-web/src/pages/MinePage.tsx", "累计阅读", "我的收藏", "我的评价")
    require_terms(
        "apps/user-web/src/services/httpApi.ts",
        "/auth/refresh",
        "/uploads/images",
        "/auth/email-verification/confirm",
        "/auth/password/reset",
    )
    require_terms(
        "apps/user-web/vite.config.ts",
        "VitePWA",
        "navigateFallback",
        "manifest",
    )

    print(f"Static audit passed: {len(required_files)} required artifacts and core route/UI contracts")


if __name__ == "__main__":
    main()
