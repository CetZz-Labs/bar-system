import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router';
import { renderWithProviders } from '@/test/renderWithProviders';
import BarCashiersView from './BarCashiersView';
import * as CashierManagementAPI from '@/API/CashierManagementAPI';
import type { Cashier } from '@/types/cashierManagement';

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

vi.mock('@/API/CashierManagementAPI');

const mockActiveCashier: Cashier = {
  id: 'cu-1',
  bar: 'bar-1',
  role: 'CASHIER',
  isActive: true,
  user: { id: 'user-1', name: 'Juan', lastName: 'Perez', email: 'juan@example.com', accountActive: true },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const renderBarCashiers = () =>
  renderWithProviders(
    <Routes>
      <Route path="/bar/:barId/cashiers" element={<BarCashiersView />} />
    </Routes>,
    { route: '/bar/bar-1/cashiers' }
  );

describe('BarCashiersView (LB-115)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(CashierManagementAPI.getBarCashiers).mockResolvedValue([mockActiveCashier]);
    vi.mocked(CashierManagementAPI.createCashier).mockResolvedValue(mockActiveCashier);
    vi.mocked(CashierManagementAPI.updateCashier).mockResolvedValue({ ...mockActiveCashier, isActive: false });
  });

  it('lists the bar cashiers with their status', async () => {
    renderBarCashiers();

    await waitFor(() => {
      expect(screen.getByText('Juan Perez')).toBeInTheDocument();
    });

    expect(screen.getByText('juan@example.com')).toBeInTheDocument();
    expect(screen.getByText('Activo')).toBeInTheDocument();
  });

  it('shows a pending badge when the linked User has not activated their account yet', async () => {
    vi.mocked(CashierManagementAPI.getBarCashiers).mockResolvedValue([
      { ...mockActiveCashier, user: { ...mockActiveCashier.user, accountActive: false } },
    ]);
    renderBarCashiers();

    await waitFor(() => {
      expect(screen.getByText('Pendiente de activación')).toBeInTheDocument();
    });
  });

  it('submits a new cashier with the expected payload and shows a success toast', async () => {
    const user = userEvent.setup();
    renderBarCashiers();

    await waitFor(() => {
      expect(screen.getByText('Juan Perez')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /nuevo cajero/i }));

    await user.type(screen.getByLabelText('NOMBRE'), 'Ana');
    await user.type(screen.getByLabelText('APELLIDO'), 'Gomez');
    await user.type(screen.getByLabelText('EMAIL'), 'ana@example.com');

    await user.click(screen.getByRole('button', { name: /dar de alta/i }));

    await waitFor(() => {
      expect(CashierManagementAPI.createCashier).toHaveBeenCalledWith('bar-1', {
        name: 'Ana',
        lastName: 'Gomez',
        email: 'ana@example.com',
      });
    });
  });

  it('blocks submission and shows a validation error when the email is invalid', async () => {
    const user = userEvent.setup();
    renderBarCashiers();

    await waitFor(() => {
      expect(screen.getByText('Juan Perez')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /nuevo cajero/i }));
    await user.type(screen.getByLabelText('NOMBRE'), 'Ana');
    await user.type(screen.getByLabelText('APELLIDO'), 'Gomez');
    await user.type(screen.getByLabelText('EMAIL'), 'no-es-un-email');
    await user.click(screen.getByRole('button', { name: /dar de alta/i }));

    await waitFor(() => {
      expect(screen.getByText('Email inválido')).toBeInTheDocument();
    });

    expect(CashierManagementAPI.createCashier).not.toHaveBeenCalled();
  });

  it('toggles a cashier off via the Power button', async () => {
    const user = userEvent.setup();
    renderBarCashiers();

    await waitFor(() => {
      expect(screen.getByText('Juan Perez')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /desactivar/i }));

    await waitFor(() => {
      expect(CashierManagementAPI.updateCashier).toHaveBeenCalledWith('bar-1', 'cu-1', { isActive: false });
    });
  });
});
