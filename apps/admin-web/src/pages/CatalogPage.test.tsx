import { App as AntApp } from 'antd';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogPage } from './CatalogPage';

const api = vi.hoisted(() => ({
  merchants: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  menuItems: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  catalogMetadata: vi.fn().mockResolvedValue({
    areas: [{ id: 'area-1', name: '北区食堂' }],
    categories: [{ id: 'category-1', name: '米饭套餐' }],
    tags: [{ id: 'tag-1', campusId: 'campus-1', name: '清淡', kind: 'taste' }],
  }),
  tags: vi.fn().mockResolvedValue([
    { id: 'tag-1', campusId: 'campus-1', name: '清淡', kind: 'taste' },
    { id: 'tag-2', campusId: 'campus-1', name: '高蛋白', kind: 'diet', usageCount: 2 },
  ]),
  saveMerchant: vi.fn(),
  updateMerchantStatus: vi.fn(),
  deleteMerchant: vi.fn(),
  saveMenuItem: vi.fn(),
  updateMenuItemStatus: vi.fn(),
  deleteMenuItem: vi.fn(),
  saveTag: vi.fn(),
  deleteTag: vi.fn(),
}));

vi.mock('../api/client', () => ({ adminApi: api }));

describe('CatalogPage completion flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('embeds the map picker in the merchant form and synchronizes coordinates', async () => {
    render(<AntApp><CatalogPage /></AntApp>);
    await waitFor(() => expect(api.merchants).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /新增商家/ }));

    const dialog = await screen.findByRole('dialog');
    const map = within(dialog).getByRole('button', { name: '在校园示意地图上选择商家位置' });
    vi.spyOn(map, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 200,
      bottom: 100,
      width: 200,
      height: 100,
      toJSON: () => ({}),
    });
    fireEvent.click(map, { clientX: 150, clientY: 25 });

    const coordinateInputs = within(dialog).getAllByRole('spinbutton');
    await waitFor(() => {
      expect(coordinateInputs[0]).toHaveValue('31.232400');
      expect(coordinateInputs[1]).toHaveValue('121.476700');
    });
  });

  it('loads the server tag dictionary and exposes its management modal', async () => {
    render(<AntApp><CatalogPage /></AntApp>);
    fireEvent.click(screen.getByRole('tab', { name: '标签字典' }));

    expect((await screen.findAllByText('清淡')).length).toBeGreaterThan(0);
    expect(api.tags).toHaveBeenCalledTimes(1);
    expect(screen.getByText('由服务端校验')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: /新增标签/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByPlaceholderText('如：微辣、高蛋白')).toBeInTheDocument();
  });
});
