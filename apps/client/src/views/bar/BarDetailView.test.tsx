import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { Routes, Route } from 'react-router';
import { renderWithProviders } from '@/test/renderWithProviders';
import BarDetailView from './BarDetailView';
import * as BarAPI from '@/API/BarAPI';
import * as RewardAPI from '@/API/RewardAPI';
import { toast } from 'sonner';
import type { BarPublicDetail } from '@/types/bar';
import type { Reward } from '@/types/reward';

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

vi.mock('@/API/BarAPI');
vi.mock('@/API/RewardAPI');

// GroupPickerModal (LB-76) tiene su propio archivo de test dedicado;
// acá se mockea para aislar BarDetailView de su lógica interna.
vi.mock('./components/GroupPickerModal', () => ({
  default: () => null,
}));

const mockBarDetail: BarPublicDetail = {
  id: 'bar-1',
  name: 'El Bar de Juan',
  address: { street: 'Calle Falsa', number: '123', city: 'CABA' },
  closingTime: '06:00',
  attendancePointsByDay: {
    monday: 0,
    tuesday: 0,
    wednesday: 0,
    thursday: 0,
    friday: 100,
    saturday: 150,
    sunday: 0,
  },
  hasActiveCheckIn: false,
};

const mockRewards: Reward[] = [
  {
    id: 'reward-1',
    bar: 'bar-1',
    name: 'Chopp gratis',
    description: 'Un chopp de regalo',
    pointsRequired: 100,
    unlimitedStock: false,
    stock: 10,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const renderBarDetail = () =>
  renderWithProviders(
    <Routes>
      <Route path="/bar/:id" element={<BarDetailView />} />
    </Routes>,
    { route: '/bar/bar-1' }
  );

describe('BarDetailView (LB-76)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(RewardAPI.getAvailableRewardsForBar).mockResolvedValue(mockRewards);
  });

  it('renders the bar info, the points grid, and the reward list without a "Canjear" button', async () => {
    vi.mocked(BarAPI.getBarDetail).mockResolvedValue(mockBarDetail);

    renderBarDetail();

    await waitFor(() => {
      expect(screen.getAllByText('El Bar de Juan').length).toBeGreaterThan(0);
    });

    expect(screen.getByText(/Calle Falsa 123, CABA/)).toBeInTheDocument();
    expect(screen.getByText('Cierra a las 06:00')).toBeInTheDocument();

    expect(screen.getByText('Puntos por asistencia')).toBeInTheDocument();
    expect(screen.getByText('Viernes')).toBeInTheDocument();
    expect(screen.getByText('100 pts')).toBeInTheDocument();
    expect(screen.getByText('150 pts')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Chopp gratis')).toBeInTheDocument();
    });
    expect(screen.getByText('Un chopp de regalo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /canjear/i })).not.toBeInTheDocument();
  });

  it('shows the "Estás acá ahora" badge only when hasActiveCheckIn is true', async () => {
    vi.mocked(BarAPI.getBarDetail).mockResolvedValue({
      ...mockBarDetail,
      hasActiveCheckIn: true,
    });

    renderBarDetail();

    await waitFor(() => {
      expect(screen.getByText('Estás acá ahora')).toBeInTheDocument();
    });
  });

  it('does not show the "Estás acá ahora" badge when hasActiveCheckIn is false', async () => {
    vi.mocked(BarAPI.getBarDetail).mockResolvedValue(mockBarDetail);

    renderBarDetail();

    await waitFor(() => {
      expect(screen.getAllByText('El Bar de Juan').length).toBeGreaterThan(0);
    });

    expect(screen.queryByText('Estás acá ahora')).not.toBeInTheDocument();
  });

  it('shows an error toast and the error state when the bar query fails', async () => {
    vi.mocked(BarAPI.getBarDetail).mockRejectedValue({
      type: 'server',
      message: 'Error del servidor',
    });

    renderBarDetail();

    // El componente pisa el `retry: false` global de renderWithProviders con
    // su propio `retry: 1` (BarDetailView.tsx), así que hay un reintento con
    // backoff antes de que la query quede en error — mismo ajuste de timeout
    // que GroupsListView.test.tsx para su caso de error.
    await waitFor(
      () => {
        expect(toast.error).toHaveBeenCalledWith('No pudimos cargar la información de este bar');
      },
      { timeout: 3000 }
    );

    expect(screen.getByText('Error al cargar la información del bar')).toBeInTheDocument();
  });

  it('shows an error toast when the rewards query fails, without breaking the rest of the view', async () => {
    vi.mocked(BarAPI.getBarDetail).mockResolvedValue(mockBarDetail);
    vi.mocked(RewardAPI.getAvailableRewardsForBar).mockRejectedValue({
      type: 'server',
      message: 'Error del servidor',
    });

    renderBarDetail();

    // Mismo motivo que el test anterior: getAvailableRewardsForBar también
    // usa `retry: 1` a nivel de componente.
    await waitFor(
      () => {
        expect(toast.error).toHaveBeenCalledWith('No pudimos cargar las recompensas de este bar');
      },
      { timeout: 3000 }
    );

    expect(screen.getAllByText('El Bar de Juan').length).toBeGreaterThan(0);
  });
});
