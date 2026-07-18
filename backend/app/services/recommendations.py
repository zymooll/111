from __future__ import annotations

from app.models import MenuItem, Merchant


def fallback_reason(item: MenuItem, preferences: dict[str, object]) -> str:
    raw_tastes = preferences.get("tastes", [])
    tastes = [str(value) for value in raw_tastes] if isinstance(raw_tastes, list) else []
    matched = [tag for tag in item.tags if tag in tastes]
    if matched:
        return f"符合你偏爱的{'、'.join(matched[:2])}口味"
    if item.rating_avg >= 4.8:
        return "校园高分口碑菜品，值得一试"
    if item.review_count >= 20:
        return "近期同学评价较多，口碑稳定"
    return "结合价格、评分与校园热度为你推荐"


def deterministic_rank(
    pairs: list[tuple[MenuItem, Merchant]],
    preferences: dict[str, object],
    favorites: set[str],
) -> list[tuple[MenuItem, Merchant]]:
    raw_tastes = preferences.get("tastes", [])
    raw_areas = preferences.get("frequent_area_ids", [])
    tastes = {str(value) for value in raw_tastes} if isinstance(raw_tastes, list) else set()
    frequent_areas = (
        {str(value) for value in raw_areas} if isinstance(raw_areas, list) else set()
    )

    def score(pair: tuple[MenuItem, Merchant]) -> float:
        item, merchant = pair
        taste_matches = len(tastes.intersection(item.tags))
        return (
            item.rating_avg * 10
            + min(item.review_count, 50) * 0.08
            + taste_matches * 5
            + (2 if merchant.area_id in frequent_areas else 0)
            + (1 if merchant.id in favorites else 0)
        )

    remaining = sorted(pairs, key=score, reverse=True)
    ranked: list[tuple[MenuItem, Merchant]] = []
    merchant_uses: dict[str, int] = {}
    while remaining:
        best_index = max(
            range(len(remaining)),
            key=lambda index: score(remaining[index])
            - merchant_uses.get(remaining[index][1].id, 0) * 3,
        )
        selected = remaining.pop(best_index)
        ranked.append(selected)
        merchant_uses[selected[1].id] = merchant_uses.get(selected[1].id, 0) + 1
    return ranked
