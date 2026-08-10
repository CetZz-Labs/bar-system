import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router';
import CashierOutingView from './CashierOutingView';
import * as ConsumptionAPI from '@/API/ConsumptionAPI';
import { toast } from 'sonner';
import type { CashierSearchResult } from '@/types/cashier';
import type { ConsumptionQrResult, PendingConsumption } from '@/types/consumption';

vi.mock('motion/react', async () => {
  const { mockMotion } = await import('@/test/mocks/motion');
  return mockMotion();
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

vi.mock('@/API/ConsumptionAPI');

const outingState: CashierSearchResult = {
  outingId: 'outing-1',
  groupId: 'group-1',
  name: 'Los Pibes',
  inviteCode: 'AB12CD',
  scheduledFor: new Date().toISOString(),
  status: 'ACTIVE',
  members: [{ id: 'u1', name: 'Juan', lastName: 'Perez' }],
  action: 'detail',
};

function renderView(state: { outing?: CashierSearchResult } | undefined = { outing: outingState }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[{ pathname: '/bar/bar-1/cajero/salida/outing-1', state }]}>
        <Routes>
          <Route path="/bar/:barId/cajero/salida/:outingId" element={<CashierOutingView />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('CashierOutingView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ConsumptionAPI.getPendingConsumptions).mockResolvedValue([]);
  });

  it('renders the outing info passed via navigation state', async () => {
    renderView();
    expect(screen.getByText('Los Pibes')).toBeInTheDocument();
    expect(await screen.findByText('1 invitados')).toBeInTheDocument();
  });

  it('registers a consumption and shows the resulting QR + manual code', async () => {
    const user = userEvent.setup();
    const result: ConsumptionQrResult = {
      consumptionId: 'c1',
      outing: 'outing-1',
      amount: 12000,
      status: 'PENDING_LEADER_CONFIRMATION',
      qrData: 'data:image/png;base64,fake',
      manualCode: '123456',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    };
    vi.mocked(ConsumptionAPI.createConsumption).mockResolvedValue(result);

    renderView();

    await user.type(screen.getByLabelText('Monto total (ARS)'), '12000');
    await user.click(screen.getByRole('button', { name: /Generar QR y código/i }));

    await waitFor(() => {
      expect(ConsumptionAPI.createConsumption).toHaveBeenCalledWith('outing-1', { amount: 12000 });
    });
    expect(await screen.findByText('123456')).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalled();
  });

  it('does not submit invalid amounts (zero or non-integer)', async () => {
    const user = userEvent.setup();
    renderView();

    await user.type(screen.getByLabelText('Monto total (ARS)'), '0');
    await user.click(screen.getByRole('button', { name: /Generar QR y código/i }));

    expect(await screen.findByText('El monto debe ser un número entero mayor a 0')).toBeInTheDocument();
    expect(ConsumptionAPI.createConsumption).not.toHaveBeenCalled();
  });

  it('shows a confirmation modal for unusual amounts and only submits after confirming', async () => {
    const user = userEvent.setup();
    const result: ConsumptionQrResult = {
      consumptionId: 'c2',
      outing: 'outing-1',
      amount: 600000,
      status: 'PENDING_LEADER_CONFIRMATION',
      qrData: 'data:image/png;base64,fake',
      manualCode: '654321',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    };
    vi.mocked(ConsumptionAPI.createConsumption).mockResolvedValue(result);

    renderView();

    await user.type(screen.getByLabelText('Monto total (ARS)'), '600000');
    await user.click(screen.getByRole('button', { name: /Generar QR y código/i }));

    expect(screen.getByText('Monto inusual')).toBeInTheDocument();
    expect(ConsumptionAPI.createConsumption).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => {
      expect(ConsumptionAPI.createConsumption).toHaveBeenCalledWith('outing-1', { amount: 600000 });
    });
  });

  it('lists pending consumptions and regenerates their code on demand', async () => {
    const pending: PendingConsumption[] = [
      {
        _id: 'c3',
        amount: 8000,
        status: 'PENDING_LEADER_CONFIRMATION',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
      },
    ];
    vi.mocked(ConsumptionAPI.getPendingConsumptions).mockResolvedValue(pending);
    const regenerated: ConsumptionQrResult = {
      consumptionId: 'c3',
      outing: 'outing-1',
      amount: 8000,
      status: 'PENDING_LEADER_CONFIRMATION',
      qrData: 'data:image/png;base64,fake2',
      manualCode: '111222',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    };
    vi.mocked(ConsumptionAPI.regenerateConsumption).mockResolvedValue(regenerated);

    const user = userEvent.setup();
    renderView();

    expect(await screen.findByText(/8\.000/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ver código' }));

    await waitFor(() => {
      expect(ConsumptionAPI.regenerateConsumption).toHaveBeenCalledWith('outing-1', 'c3');
    });
    expect(await screen.findByText('111222')).toBeInTheDocument();
  });

  it('shows a fallback title when no outing info was passed via navigation state', () => {
    renderView({});
    expect(screen.getByText('Salida en curso')).toBeInTheDocument();
  });
});
