import '../test/setup';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageHeader } from './PageHeader';

describe('PageHeader', () => {
  it('renders title, description and optional action', () => {
    render(<PageHeader title="用户管理" description="管理校园用户" extra={<button type="button">新增</button>} />);
    expect(screen.getByRole('heading', { name: '用户管理' })).toBeInTheDocument();
    expect(screen.getByText('管理校园用户')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '新增' })).toBeInTheDocument();
  });
});
