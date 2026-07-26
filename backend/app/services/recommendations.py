from __future__ import annotations

import heapq
from collections import defaultdict

from app.models import MenuItem, Merchant

#: 同一商家每多占一个位次，其后续菜品的有效分数就降低这么多，用于打散商家。
MERCHANT_REPEAT_PENALTY = 3.0


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


def base_score(
    item: MenuItem,
    merchant: Merchant,
    tastes: set[str],
    frequent_areas: set[str],
    favorites: set[str],
) -> float:
    taste_matches = len(tastes.intersection(item.tags))
    return (
        item.rating_avg * 10
        + min(item.review_count, 50) * 0.08
        + taste_matches * 5
        + (2 if merchant.area_id in frequent_areas else 0)
        + (1 if merchant.id in favorites else 0)
    )


def deterministic_rank(
    pairs: list[tuple[MenuItem, Merchant]],
    preferences: dict[str, object],
    favorites: set[str],
) -> list[tuple[MenuItem, Merchant]]:
    """Greedy merchant-diversity ranking in O(n log n).

    与逐轮全表取 argmax 的朴素实现输出完全一致：每一步的最优候选只可能是某个商家当前
    剩余的最高分菜品，因此只需在"每商家队首"之间比较，用堆维护即可，无需每轮重扫全表。
    """
    raw_tastes = preferences.get("tastes", [])
    raw_areas = preferences.get("frequent_area_ids", [])
    tastes = {str(value) for value in raw_tastes} if isinstance(raw_tastes, list) else set()
    frequent_areas = {str(value) for value in raw_areas} if isinstance(raw_areas, list) else set()

    scored = [
        (base_score(item, merchant, tastes, frequent_areas, favorites), item, merchant)
        for item, merchant in pairs
    ]
    # 稳定排序：分数相同的保持输入顺序，与朴素实现的并列取先者一致。
    order = sorted(range(len(scored)), key=lambda index: -scored[index][0])

    by_merchant: dict[str, list[int]] = defaultdict(list)
    for position, index in enumerate(order):
        by_merchant[scored[index][2].id].append(position)

    uses: dict[str, int] = defaultdict(int)
    cursors: dict[str, int] = defaultdict(int)

    heap: list[tuple[float, int, str]] = []
    for merchant_id, merchant_positions in by_merchant.items():
        head = merchant_positions[0]
        heapq.heappush(heap, (-scored[order[head]][0], head, merchant_id))

    ranked: list[tuple[MenuItem, Merchant]] = []
    while heap:
        _, position, merchant_id = heapq.heappop(heap)
        _, item, merchant = scored[order[position]]
        ranked.append((item, merchant))

        uses[merchant_id] += 1
        cursors[merchant_id] += 1
        merchant_positions = by_merchant[merchant_id]
        if cursors[merchant_id] < len(merchant_positions):
            head = merchant_positions[cursors[merchant_id]]
            adjusted = scored[order[head]][0] - uses[merchant_id] * MERCHANT_REPEAT_PENALTY
            heapq.heappush(heap, (-adjusted, head, merchant_id))
    return ranked
