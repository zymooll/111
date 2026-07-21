import { App as AntApp } from 'antd';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UsersPage } from './UsersPage';

const api = vi.hoisted(() => ({
  users: vi.fn().mockResolvedValue({
    items: [
      { id: 'user-1', username: '正常用户', email: 'active@example.edu.cn', status: 'active', reviewCount: 1, impactViews: 3, favoriteCount: 2, createdAt: '2026-07-01', lastActive: '2026-07-22', dietaryTags: [] },
      { id: 'user-2', username: '待验证用户', email: 'pending@example.edu.cn', status: 'unverified', reviewCount: 0, impactViews: 0, favoriteCount: 0, createdAt: '2026-07-02', lastActive: '2026-07-22', dietaryTags: [] },
      { id: 'user-3', username: '冻结用户', email: 'frozen@example.edu.cn', status: 'frozen', reviewCount: 2, impactViews: 5, favoriteCount: 1, createdAt: '2026-07-03', lastActive: '2026-07-21', dietaryTags: [] },
    ],
    total: 3,
  }),
  updateUser: vi.fn(),
  resetPassword: vi.fn(),
}));

vi.mock('../api/client', () => ({ adminApi: api }));

describe('UsersPage mock-sized summaries', () => {
  it('reports the current result and visible status counts without legacy scale claims', async () => {
    render(<AntApp><UsersPage /></AntApp>);

    await waitFor(() => expect(api.users).toHaveBeenCalled());
    for (const label of ['当前筛选结果', '本页正常', '本页待验证', '本页已冻结']) {
      expect(screen.getByText(label).parentElement).toHaveTextContent(label === '当前筛选结果' ? '3' : '1');
    }
    expect(screen.queryByText('12,846')).not.toBeInTheDocument();
  });
});
