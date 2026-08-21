import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Routes, Route, MemoryRouter, useLocation } from 'react-router';
import CashierLayout from './CashierLayout';
import type { CashierShiftSummaryRecovery } from '@/types/cashier';

// Mock the useCashierAuth hook
vi.mock('@/hooks/useCashierAuth', () => ({
  useCashierAuth: vi.fn(),
}));

import { useCashierAuth } from '@/hooks/useCashierAuth';

const mockUseCashierAuth = vi.mocked(useCashierAuth);
type CashierAuthResult = ReturnType<typeof useCashierAuth>;

describe('CashierLayout', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should show loading state while cashier session is loading', () => {
    mockUseCashierAuth.mockReturnValue({
      data: null,
      isLoading: true,
      isError: false,
      logoutCashier: vi.fn(),
      autoClosedRecovery: null,
    } satisfies CashierAuthResult);

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

  it('should redirect to /login when there is no cashier session (LB-66: no more per-bar login route)', () => {
    mockUseCashierAuth.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      logoutCashier: vi.fn(),
      autoClosedRecovery: null,
    } satisfies CashierAuthResult);

    render(
      <MemoryRouter initialEntries={['/bar/bar-1/cajero']}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route element={<CashierLayout />}>
            <Route path="/bar/:barId/cajero" element={<div>Panel Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Login Page')).toBeInTheDocument();
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
      autoClosedRecovery: null,
    } satisfies CashierAuthResult);

    render(
      <MemoryRouter initialEntries={['/bar/bar-1/cajero']}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route element={<CashierLayout />}>
            <Route path="/bar/:barId/cajero" element={<div>Panel Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Panel Content')).toBeInTheDocument();
  });

  it('should navigate automatic-close recovery to the full summary with its payload', () => {
    const recovery: CashierShiftSummaryRecovery = {
      shiftId: 'shift-closed',
      summary: {
        status: 'PENDING',
        totalConsumptions: 2,
        confirmedConsumptions: 1,
        pendingConsumptions: 1,
        rejectedConsumptions: 0,
        disputedConsumptions: 0,
        totalAmount: 1000,
        pointsAwarded: 10,
        redemptionCount: 0,
        redemptionsAvailable: false,
        generatedAt: '2026-08-19T04:00:00.000Z',
      },
    };
    mockUseCashierAuth.mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
      logoutCashier: vi.fn(),
      autoClosedRecovery: recovery,
    } satisfies CashierAuthResult);

    function RecoveryDestination() {
      const location = useLocation();
      const state = location.state as { summary?: { totalAmount: number } } | null;
      return <div>{state?.summary?.totalAmount}</div>;
    }

    render(
      <MemoryRouter initialEntries={['/bar/bar-1/cajero']}>
        <Routes>
          <Route path="/bar/:barId/cajero/cierre/:shiftId" element={<RecoveryDestination />} />
          <Route element={<CashierLayout />}>
            <Route path="/bar/:barId/cajero" element={<div>Panel Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('1000')).toBeInTheDocument();
  });
});
