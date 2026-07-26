"""The fast ranker must be output-identical to the naive argmax loop it replaced."""

from __future__ import annotations

import random
import time

import pytest

from app.models import MenuItem, Merchant
from app.services.recommendations import (
    MERCHANT_REPEAT_PENALTY,
    base_score,
    deterministic_rank,
)


def naive_rank(pairs, preferences, favorites):
    """The original O(n^2) implementation, kept here purely as the reference oracle."""
    raw_tastes = preferences.get("tastes", [])
    raw_areas = preferences.get("frequent_area_ids", [])
    tastes = {str(value) for value in raw_tastes} if isinstance(raw_tastes, list) else set()
    frequent_areas = {str(value) for value in raw_areas} if isinstance(raw_areas, list) else set()

    def score(pair):
        item, merchant = pair
        return base_score(item, merchant, tastes, frequent_areas, favorites)

    remaining = sorted(pairs, key=score, reverse=True)
    ranked = []
    merchant_uses: dict[str, int] = {}
    while remaining:
        best_index = max(
            range(len(remaining)),
            key=lambda index: score(remaining[index])
            - merchant_uses.get(remaining[index][1].id, 0) * MERCHANT_REPEAT_PENALTY,
        )
        selected = remaining.pop(best_index)
        ranked.append(selected)
        merchant_uses[selected[1].id] = merchant_uses.get(selected[1].id, 0) + 1
    return ranked


def build_pairs(rng: random.Random, merchant_count: int, item_count: int, tag_pool: list[str]):
    areas = [f"area-{index}" for index in range(4)]
    merchants = [
        Merchant(
            id=f"m{index:04d}",
            campus_id="campus",
            name=f"merchant-{index}",
            address="addr",
            latitude=0.0,
            longitude=0.0,
            gcj02_latitude=0.0,
            gcj02_longitude=0.0,
            area_id=rng.choice(areas),
            price_level=rng.randint(1, 4),
            business_hours="08:00-20:00",
        )
        for index in range(merchant_count)
    ]
    pairs = []
    for index in range(item_count):
        merchant = rng.choice(merchants)
        item = MenuItem(
            id=f"i{index:05d}",
            campus_id="campus",
            merchant_id=merchant.id,
            name=f"item-{index}",
            price_cents=rng.randrange(500, 4000),
            image_url="",
            # 大量重复的整数评分刻意制造并列，逼出并列时的取舍差异。
            rating_avg=float(rng.randrange(0, 11)) / 2,
            review_count=rng.randrange(0, 60),
            tags=rng.sample(tag_pool, rng.randint(0, min(3, len(tag_pool)))),
        )
        pairs.append((item, merchant))
    return pairs


@pytest.mark.parametrize("seed", range(12))
def test_fast_ranker_matches_the_naive_oracle(seed):
    rng = random.Random(seed)
    tag_pool = ["麻辣", "清淡", "微辣", "酸甜", "高蛋白"]
    pairs = build_pairs(rng, merchant_count=rng.randint(1, 8), item_count=rng.randint(0, 60), tag_pool=tag_pool)
    preferences = {
        "tastes": rng.sample(tag_pool, rng.randint(0, 3)),
        "frequent_area_ids": rng.sample([f"area-{index}" for index in range(4)], rng.randint(0, 2)),
    }
    favorites = {pair[1].id for pair in pairs if rng.random() < 0.3}

    expected = [(item.id, merchant.id) for item, merchant in naive_rank(pairs, preferences, favorites)]
    actual = [(item.id, merchant.id) for item, merchant in deterministic_rank(pairs, preferences, favorites)]
    assert actual == expected


def test_ranking_is_a_permutation_of_its_input():
    rng = random.Random(99)
    pairs = build_pairs(rng, merchant_count=5, item_count=40, tag_pool=["麻辣", "清淡"])
    ranked = deterministic_rank(pairs, {}, set())
    assert sorted(item.id for item, _ in ranked) == sorted(item.id for item, _ in pairs)


def test_ranking_spreads_merchants_across_the_head():
    rng = random.Random(7)
    pairs = build_pairs(rng, merchant_count=6, item_count=60, tag_pool=["麻辣", "清淡"])
    ranked = deterministic_rank(pairs, {}, set())
    head_merchants = [merchant.id for _, merchant in ranked[:6]]
    # 惩罚项的作用就是不让单一商家霸占首屏。
    assert len(set(head_merchants)) >= 4


def test_ranking_stays_fast_on_a_full_campus_catalogue():
    rng = random.Random(3)
    pairs = build_pairs(rng, merchant_count=40, item_count=4000, tag_pool=["麻辣", "清淡", "酸甜"])
    started = time.perf_counter()
    ranked = deterministic_rank(pairs, {"tastes": ["麻辣"]}, set())
    elapsed = time.perf_counter() - started
    assert len(ranked) == 4000
    # 朴素实现在这个规模上是数百万次比较；这里给足余量，只要不是二次复杂度就能过。
    assert elapsed < 2.0, f"ranking 4000 items took {elapsed:.2f}s"
