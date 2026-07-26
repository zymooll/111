import { describe, expect, it } from 'vitest';
import { mockApi } from './mockApi';

const fullPage = { limit: 100 };

describe('admin mock catalog consistency', () => {
  it('keeps every seeded merchant and menu item inside the editable catalog dictionaries', async () => {
    const [metadata, merchantPage, itemPage] = await Promise.all([
      mockApi.catalogMetadata(),
      mockApi.merchants(fullPage),
      mockApi.menuItems(fullPage),
    ]);
    const tags = new Set(metadata.tags.map((tag) => tag.name));

    merchantPage.items.forEach((merchant) => {
      expect(metadata.areas.find((area) => area.id === merchant.areaId)?.name).toBe(merchant.area);
      expect(metadata.categories.find((category) => category.id === merchant.categoryId)?.name).toBe(merchant.category);
    });
    itemPage.items.forEach((item) => {
      expect(metadata.categories.find((category) => category.id === item.categoryId)?.name).toBe(item.category);
      item.tags.forEach((tag) => expect(tags.has(tag), `${item.name} 缺少标签 ${tag}`).toBe(true));
    });
    expect(tags.has('演示菜单')).toBe(false);
  });

  it('derives dashboard counters from the current mock state', async () => {
    const [dashboard, users, merchants, items, pendingReviews] = await Promise.all([
      mockApi.dashboard(),
      mockApi.users(fullPage),
      mockApi.merchants({ ...fullPage, active: true }),
      mockApi.menuItems({ ...fullPage, active: true }),
      mockApi.reviews({ ...fullPage, status: 'pending_manual' }),
    ]);

    expect(dashboard).toMatchObject({
      users: users.items.length,
      merchants: merchants.items.length,
      menuItems: items.items.length,
      pendingReviews: pendingReviews.total,
    });
  });

  it('serves keyset pages that chain through next_cursor without repeating records', async () => {
    const first = await mockApi.reviews({ limit: 2 });
    const second = await mockApi.reviews({ limit: 2, cursor: first.nextCursor });

    expect(first.items).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).not.toBeNull();
    expect(second.items.map((item) => item.id)).not.toEqual(first.items.map((item) => item.id));
    expect(first.total).toBe(6);
  });

  it('marks every seeded moderation sample as a non-real review', async () => {
    const reviews = await mockApi.reviews(fullPage);

    expect(reviews.items.length).toBeGreaterThan(0);
    reviews.items.forEach((review) => {
      expect(review.content).toMatch(/^演示评价（非真实用户评价）：/);
    });
  });

  it('only restores hidden reviews back to published', async () => {
    await expect(mockApi.moderateReview('R26072205', 'restore')).rejects.toThrow('只有已隐藏的评价可以恢复发布');
    await expect(mockApi.moderateReview('R26072206', 'restore')).resolves.toBeUndefined();
  });
});
