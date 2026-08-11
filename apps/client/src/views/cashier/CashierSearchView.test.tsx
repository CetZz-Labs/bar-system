import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import CashierSearchView from './CashierSearchView';
import * as CashierAPI from '@/API/CashierAPI';
import { toast } from 'sonner';
import type { CashierSearchResult } from '@/types/cashier';
import type { Outing } from '@/types/outing';

vi.mock('motion/react', async () => {
  const { mockMotion } = await import('@/test/mocks/motion');
  return mockMotion();
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

vi.mock('@/API/CashierAPI');

const mockNavigate = vi.fn();
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ barId: 'bar-1' }),
  };
});

const pendingCheckInResult: CashierSearchResult = {
  outingId: 'outing-1',
  groupId: 'group-1',
  name: 'Los Pibes',
  inviteCode: 'AB12CD',
  scheduledFor: new Date().toISOString(),
  status: 'PENDING',
  members: [{ id: 'u1', name: 'Juan', lastName: 'Perez' }],
  action: 'check_in',
};

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/bar/bar-1/cajero/buscar']}>
        <CashierSearchView />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('CashierSearchView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('confirms check-in and navigates to the outing detail on success', async () => {
    const user = userEvent.setup();
    vi.mocked(CashierAPI.searchCashierGroupsRaw).mockResolvedValue({
      ok: true,
      results: [pendingCheckInResult],
    });
    vi.mocked(CashierAPI.confirmCheckIn).mockResolvedValue({ status: 'ACTIVE' } as Outing);

    renderView();

    await user.type(screen.getByLabelText('Buscar grupo'), 'Pibes');

    expect(await screen.findByText('Los Pibes')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Iniciar check-in' }));

    await waitFor(() => {
      expect(CashierAPI.confirmCheckIn).toHaveBeenCalledWith('outing-1');
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/bar/bar-1/cajero/salida/outing-1', {
        state: { outing: pendingCheckInResult },
      });
    });
  });

  it('shows an error toast and does not navigate when the check-in fails', async () => {
    const user = userEvent.setup();
    vi.mocked(CashierAPI.searchCashierGroupsRaw).mockResolvedValue({
      ok: true,
      results: [pendingCheckInResult],
    });
    vi.mocked(CashierAPI.confirmCheckIn).mockRejectedValue({
      type: 'server',
      message: 'La ventana de check-in ya expiró',
      status: 409,
    });

    renderView();

    await user.type(screen.getByLabelText('Buscar grupo'), 'Pibes');
    expect(await screen.findByText('Los Pibes')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Iniciar check-in' }));

    await waitFor(() => {
      expect(CashierAPI.confirmCheckIn).toHaveBeenCalledWith('outing-1');
    });
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('La ventana de check-in ya expiró');
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
