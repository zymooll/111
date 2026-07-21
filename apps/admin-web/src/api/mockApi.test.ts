import { describe, expect, it } from 'vitest';
import { mockApi } from './mockApi';

const fullPage = { page: 1, pageSize: 100 };

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

  it('derives dashboard counters and category shares from the current mock state', async () => {
    const [dashboard, users, merchants, items, pendingReviews] = await Promise.all([
      mockApi.dashboard(),
      mockApi.users(fullPage),
      mockApi.merchants(fullPage),
      mockApi.menuItems(fullPage),
      mockApi.reviews({ ...fullPage, status: 'pending_manual' }),
    ]);

    expect(dashboard).toMatchObject({
      users: users.total,
      merchants: merchants.total,
      menuItems: items.total,
      pendingReviews: pendingReviews.total,
      userGrowth: 0,
      merchantGrowth: 0,
    });
    expect(dashboard.categoryShare.reduce((total, category) => total + category.value, 0)).toBe(100);
  });

  it('marks every seeded moderation sample as a non-real review', async () => {
    const reviews = await mockApi.reviews(fullPage);

    expect(reviews.items.length).toBeGreaterThan(0);
    reviews.items.forEach((review) => {
      expect(review.content).toMatch(/^演示评价（非真实用户评价）：/);
    });
  });
});
