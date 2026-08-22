import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router';
import { renderWithProviders } from '@/test/renderWithProviders';
import CashierRedemptionsView from './CashierRedemptionsView';
import * as CashierRedemptionAPI from '@/API/CashierRedemptionAPI';
import { toast } from 'sonner';
import type { CashierRedemptionPreview, CashierRedemptionValidateResult } from '@/types/cashierRedemption';

vi.mock('motion/react', async () => {
  const { mockMotion } = await import('@/test/mocks/motion');
  return mockMotion();
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

vi.mock('@/API/CashierRedemptionAPI');

const preview: CashierRedemptionPreview = {
  redemptionId: 'r1',
  group: { id: 'g1', name: 'Los Pibes' },
  leader: { id: 'u1', name: 'Juan Perez' },
  rewardName: 'Chopp gratis',
  pointsRequired: 100,
  createdAt: new Date('2026-08-21T22:00:00Z').toISOString(),
  expiresAt: new Date('2026-08-21T22:20:00Z').toISOString(),
};

const renderView = () =>
  renderWithProviders(
    <Routes>
      <Route path="/bar/:barId/cajero/canjes" element={<CashierRedemptionsView />} />
    </Routes>,
    { route: '/bar/bar-1/cajero/canjes' }
  );

describe('CashierRedemptionsView (LB-69)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('looks up a redemption by manual code and shows the preview', async () => {
    vi.mocked(CashierRedemptionAPI.lookupRedemption).mockResolvedValue(preview);
    const user = userEvent.setup();
    renderView();

    await user.type(screen.getByLabelText('Código de canje'), '123456');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    await waitFor(() => {
      expect(CashierRedemptionAPI.lookupRedemption).toHaveBeenCalledWith('123456');
    });
    expect(await screen.findByText('Chopp gratis')).toBeInTheDocument();
    expect(screen.getByText('Los Pibes')).toBeInTheDocument();
    expect(screen.getByText('Juan Perez')).toBeInTheDocument();
  });

  it('delivers the redemption after confirming the modal', async () => {
    vi.mocked(CashierRedemptionAPI.lookupRedemption).mockResolvedValue(preview);
    const result: CashierRedemptionValidateResult = {
      redemptionId: 'r1',
      status: 'VALIDATED',
      pointsBalance: 400,
      stockRemaining: 4,
      availablePoints: 300,
    };
    vi.mocked(CashierRedemptionAPI.validateRedemption).mockResolvedValue(result);

    const user = userEvent.setup();
    renderView();

    await user.type(screen.getByLabelText('Código de canje'), '123456');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    await screen.findByText('Chopp gratis');

    await user.click(screen.getByRole('button', { name: /entregar/i }));
    expect(screen.getByText('Confirmar entrega')).toBeInTheDocument();

    const confirmButtons = screen.getAllByRole('button', { name: 'Entregar' });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(CashierRedemptionAPI.validateRedemption).toHaveBeenCalledWith('123456', 'deliver', undefined);
    });
    expect(toast.success).toHaveBeenCalledWith('Canje entregado');
  });

  it('rejects the redemption with a predefined reason', async () => {
    vi.mocked(CashierRedemptionAPI.lookupRedemption).mockResolvedValue(preview);
    const result: CashierRedemptionValidateResult = {
      redemptionId: 'r1',
      status: 'REJECTED',
      rejectionReason: 'Sin stock físico',
      availablePoints: 400,
    };
    vi.mocked(CashierRedemptionAPI.validateRedemption).mockResolvedValue(result);

    const user = userEvent.setup();
    renderView();

    await user.type(screen.getByLabelText('Código de canje'), '123456');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    await screen.findByText('Chopp gratis');

    await user.click(screen.getByRole('button', { name: /rechazar/i }));
    expect(screen.getByText('Rechazar canje')).toBeInTheDocument();

    const rejectSubmitButtons = screen.getAllByRole('button', { name: 'Rechazar' });
    await user.click(rejectSubmitButtons[rejectSubmitButtons.length - 1]);

    await waitFor(() => {
      expect(CashierRedemptionAPI.validateRedemption).toHaveBeenCalledWith('123456', 'reject', 'Sin stock físico');
    });
    expect(toast.success).toHaveBeenCalledWith('Canje rechazado');
  });

  it('requires free text when the "Otro" reason is selected', async () => {
    vi.mocked(CashierRedemptionAPI.lookupRedemption).mockResolvedValue(preview);
    const user = userEvent.setup();
    renderView();

    await user.type(screen.getByLabelText('Código de canje'), '123456');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    await screen.findByText('Chopp gratis');

    await user.click(screen.getByRole('button', { name: /rechazar/i }));
    await user.click(screen.getByLabelText('Otro'));
    const rejectSubmitButtons = screen.getAllByRole('button', { name: 'Rechazar' });
    await user.click(rejectSubmitButtons[rejectSubmitButtons.length - 1]);

    expect(await screen.findByText('Contanos el motivo')).toBeInTheDocument();
    expect(CashierRedemptionAPI.validateRedemption).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Contanos qué pasó'), 'El líder se arrepintió');
    const rejectSubmitButtonsAgain = screen.getAllByRole('button', { name: 'Rechazar' });
    await user.click(rejectSubmitButtonsAgain[rejectSubmitButtonsAgain.length - 1]);

    await waitFor(() => {
      expect(CashierRedemptionAPI.validateRedemption).toHaveBeenCalledWith(
        '123456',
        'reject',
        'El líder se arrepintió'
      );
    });
  });
});
