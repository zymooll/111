import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { LoginPage } from './LoginPage';

const auth = vi.hoisted(() => ({
  user: null,
  login: vi.fn(),
  loading: false,
}));

vi.mock('../api/client', () => ({ apiMode: 'mock' }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => auth }));

describe('LoginPage demo claims', () => {
  it('uses neutral capabilities instead of unsupported scale statistics', () => {
    render(<MemoryRouter><LoginPage /></MemoryRouter>);

    expect(screen.getByText('校区级')).toBeInTheDocument();
    expect(screen.getByText('全流程')).toBeInTheDocument();
    expect(screen.getByText('可追溯')).toBeInTheDocument();
    expect(screen.queryByText(/12,846|1,842|98\.6%/)).not.toBeInTheDocument();
  });
});
