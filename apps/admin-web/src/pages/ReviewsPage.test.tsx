import { App as AntApp } from 'antd';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReviewsPage } from './ReviewsPage';

const api = vi.hoisted(() => ({
  reviews: vi.fn(),
  moderateReview: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../api/client', () => ({ adminApi: api }));

function review(id: string, name: string, status = 'pending_manual') {
  return {
    id,
    userName: '演示同学',
    userId: 'U1',
    itemName: name,
    merchantName: '林语餐厅',
    rating: 4,
    content: `${name} 的演示评价内容`,
    images: [],
    status,
    riskLevel: 'medium',
    createdAt: '2026-07-22 12:00',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.reviews.mockImplementation((query: { cursor?: string | null; limit?: number; status?: string }) => {
    if (query.limit === 1) return Promise.resolve({ items: [], nextCursor: null, hasMore: false, total: 7 });
    if (query.status === 'hidden') return Promise.resolve({ items: [review('R900', '隐藏评价', 'hidden')], nextCursor: null, hasMore: false, total: 1 });
    if (!query.cursor) return Promise.resolve({ items: [review('R1', '第一页评价')], nextCursor: 'cursor-2', hasMore: true, total: 7 });
    return Promise.resolve({ items: [review('R2', '第二页评价')], nextCursor: null, hasMore: false, total: 7 });
  });
});

describe('ReviewsPage cursor navigation', () => {
  it('pages forward and back with the server cursor instead of an offset', async () => {
    render(<AntApp><ReviewsPage /></AntApp>);

    expect(await screen.findByText('第一页评价')).toBeVisible();
    expect(screen.getByText(/共 7 条评价/)).toBeVisible();

    const next = screen.getByRole('button', { name: /下一页/ });
    await waitFor(() => expect(next).toBeEnabled());
    fireEvent.click(next);

    expect(await screen.findByText('第二页评价')).toBeVisible();
    expect(api.reviews).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: 'cursor-2', limit: 10, status: 'pending_manual' }),
      expect.any(AbortSignal),
    );
    expect(screen.getByText(/第 2 页/)).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: /上一页/ }));
    expect(await screen.findByText('第一页评价')).toBeVisible();
  });

  it('offers restore only for hidden reviews', async () => {
    render(<AntApp><ReviewsPage /></AntApp>);

    await screen.findByText('第一页评价');
    expect(screen.queryByRole('button', { name: /恢复/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '已隐藏' }));

    await screen.findByText('隐藏评价');
    fireEvent.click(screen.getByRole('button', { name: /恢复/ }));
    fireEvent.click(await screen.findByRole('button', { name: '恢复发布' }));

    await waitFor(() => expect(api.moderateReview).toHaveBeenCalledWith('R900', 'restore'));
  });
});
