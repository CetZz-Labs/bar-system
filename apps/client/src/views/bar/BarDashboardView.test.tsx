import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router';
import { renderWithProviders } from '@/test/renderWithProviders';
import BarDashboardView from './BarDashboardView';
import * as BarDashboardAPI from '@/API/BarDashboardAPI';
import type { BarDashboardResponse } from '@/types/barDashboard';

vi.mock('motion/react', async () => {
  const { mockMotion } = await import('@/test/mocks/motion');
  return mockMotion();
});

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
}));

vi.mock('@/API/BarDashboardAPI');

const baseDashboard: BarDashboardResponse = {
  period: { type: 'today', from: '2026-08-21T06:00:00.000Z', to: '2026-08-22T06:00:00.000Z' },
  statCards: {
    groupsCount: 3,
    consumptionTotalArs: 45000,
    pointsAwarded: { consumption: 45, attendance: 10, total: 55 },
    redemptions: { count: 2, arsEquivalent: 4000 },
  },
  activity: [
    {
      outingId: 'outing-1',
      groupId: 'group-1',
      groupName: 'Los Pibes',
      checkedInAt: '2026-08-21T23:00:00.000Z',
      consumptionArs: 15000,
      pointsAwarded: 15,
      cashierId: 'cashier-1',
      cashierName: 'Juan Cajero',
      status: 'en_curso',
    },
  ],
  disputes: [
    {
      consumptionId: 'consumption-1',
      outingId: 'outing-2',
      groupId: 'group-2',
      groupName: 'Las Chicas',
      amount: 8000,
      cashierId: 'cashier-1',
      cashierName: 'Juan Cajero',
      createdAt: '2026-08-21T23:30:00.000Z',
      rejectCount: 4,
    },
  ],
  cashiers: {
    rows: [
      {
        cashierId: 'cashier-1',
        cashierName: 'Juan Cajero',
        checkIns: 4,
        consumptionArs: 20000,
        pointsAwarded: 20,
        redemptionsCount: 1,
        redemptionsArs: 2000,
        net: 18000,
      },
    ],
    totals: {
      checkIns: 4,
      consumptionArs: 20000,
      pointsAwarded: 20,
      redemptionsCount: 1,
      redemptionsArs: 2000,
      net: 18000,
    },
  },
};

const renderDashboard = (route = '/bar/bar-1/dashboard') =>
  renderWithProviders(
    <Routes>
      <Route path="/bar/:barId/dashboard" element={<BarDashboardView />} />
    </Routes>,
    { route }
  );

describe('BarDashboardView (LB-74)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(BarDashboardAPI.getBarDashboard).mockResolvedValue(baseDashboard);
    vi.mocked(BarDashboardAPI.resolveConsumptionDispute).mockResolvedValue({
      consumptionId: 'consumption-1',
      status: 'RESOLVED_BY_OWNER',
      resolutionOutcome: 'ACCEPTED',
      pointsAwarded: 8,
    });
  });

  it('renders the stat cards, activity table and cashier table with the loaded data', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Los Pibes')).toBeInTheDocument();
    });

    expect(screen.getByText('3')).toBeInTheDocument(); // groupsCount
    expect(screen.getAllByText('$45.000').length).toBeGreaterThan(0); // consumptionTotalArs
    expect(screen.getAllByText('Juan Cajero').length).toBeGreaterThan(0);
  });

  it('defaults to period=today in the URL when none is provided', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(BarDashboardAPI.getBarDashboard).toHaveBeenCalledWith(
        'bar-1',
        expect.objectContaining({ period: 'today' })
      );
    });
  });

  it('reflects the selected period in the URL (deep-linkable) and refetches', async () => {
    const user = userEvent.setup();
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Los Pibes')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('radio', { name: 'Semana' }));

    await waitFor(() => {
      expect(window.location.search).toContain('period=week');
    });
    await waitFor(() => {
      expect(BarDashboardAPI.getBarDashboard).toHaveBeenCalledWith(
        'bar-1',
        expect.objectContaining({ period: 'week' })
      );
    });
  });

  it('disables the "Ver registros" button (LB-77 not implemented yet)', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Los Pibes')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /ver registros/i })).toBeDisabled();
  });

  it('shows the disputes panel and resolves a dispute with the chosen outcome and note', async () => {
    const user = userEvent.setup();
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Las Chicas')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /resolver/i }));

    await waitFor(() => {
      expect(screen.getByText('Resolver disputa')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText(/contá qué se resolvió/i), 'Se verificó con el cliente');
    await user.click(screen.getByRole('button', { name: /^aceptar$/i }));

    await waitFor(() => {
      expect(BarDashboardAPI.resolveConsumptionDispute).toHaveBeenCalledWith(
        'bar-1',
        'consumption-1',
        { outcome: 'ACCEPTED', note: 'Se verificó con el cliente' }
      );
    });
  });

  it('reflects the selected cashier filter in the URL', async () => {
    const user = userEvent.setup();
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Los Pibes')).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText('CAJERO'), 'cashier-1');

    await waitFor(() => {
      expect(window.location.search).toContain('cashierId=cashier-1');
    });
    await waitFor(() => {
      expect(BarDashboardAPI.getBarDashboard).toHaveBeenCalledWith(
        'bar-1',
        expect.objectContaining({ cashierId: 'cashier-1' })
      );
    });
  });
});
