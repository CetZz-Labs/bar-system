import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Routes, Route, MemoryRouter } from 'react-router';
import CashierLayout from './CashierLayout';

// Mock the useCashierAuth hook
vi.mock('@/hooks/useCashierAuth', () => ({
  useCashierAuth: vi.fn(),
}));

import { useCashierAuth } from '@/hooks/useCashierAuth';

const mockUseCashierAuth = vi.mocked(useCashierAuth);

describe('CashierLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show loading state while cashier session is loading', () => {
    mockUseCashierAuth.mockReturnValue({
      data: null,
      isLoading: true,
      isError: false,
      logoutCashier: vi.fn(),
    } as any);

    render(
      <MemoryRouter initialEntries={['/bar/bar-1/cajero']}>
        <Routes>
          <Route element={<CashierLayout />}>
            <Route path="/bar/:barId/cajero" element={<div>Panel Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('should redirect to the bar-specific login route when there is no cashier session', () => {
    mockUseCashierAuth.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      logoutCashier: vi.fn(),
    } as any);

    render(
      <MemoryRouter initialEntries={['/bar/bar-1/cajero']}>
        <Routes>
          <Route path="/bar/:barId/cajero/login" element={<div>Cashier Login Page</div>} />
          <Route element={<CashierLayout />}>
            <Route path="/bar/:barId/cajero" element={<div>Panel Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Cashier Login Page')).toBeInTheDocument();
  });

  it('should render the Outlet content when there is a valid cashier session', () => {
    mockUseCashierAuth.mockReturnValue({
      data: {
        role: 'CASHIER',
        bar: { id: 'bar-1', name: 'Bar Test', closingTime: '06:00' },
        shift: { startedAt: '2026-08-06T20:00:00.000Z' },
        user: { name: 'Test', lastName: 'Cashier' },
      },
      isLoading: false,
      isError: false,
      logoutCashier: vi.fn(),
    } as any);

    render(
      <MemoryRouter initialEntries={['/bar/bar-1/cajero']}>
        <Routes>
          <Route path="/bar/:barId/cajero/login" element={<div>Cashier Login Page</div>} />
          <Route element={<CashierLayout />}>
            <Route path="/bar/:barId/cajero" element={<div>Panel Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Panel Content')).toBeInTheDocument();
  });
});
