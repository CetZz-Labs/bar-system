import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router';
import { renderWithProviders } from '@/test/renderWithProviders';
import BarRewardsView from './BarRewardsView';
import * as RewardAPI from '@/API/RewardAPI';
import * as BarAPI from '@/API/BarAPI';
import type { Reward } from '@/types/reward';
import type { MyBar } from '@/types/bar';

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

vi.mock('@/API/RewardAPI');
vi.mock('@/API/BarAPI');

const mockOwnerBar: MyBar = {
  id: 'bar-1',
  name: 'El Bar de Juan',
  slug: 'el-bar-de-juan',
  address: { street: 'Calle Falsa', number: '123', city: 'CABA' },
  phone: '+54 11 1234-5678',
  schedule: [{ day: 1, open: '20:00', close: '03:00' }],
  status: 'active',
  attendancePointsByDay: {
    monday: 0, tuesday: 0, wednesday: 0, thursday: 0, friday: 0, saturday: 0, sunday: 0,
  },
  role: 'OWNER',
  registeredAt: '2026-01-01T00:00:00.000Z',
};

const mockCashierBar: MyBar = { ...mockOwnerBar, role: 'CASHIER' } as unknown as MyBar;

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

const renderBarRewards = () =>
  renderWithProviders(
    <Routes>
      <Route path="/bar/:id/rewards" element={<BarRewardsView />} />
    </Routes>,
    { route: '/bar/bar-1/rewards' }
  );

describe('BarRewardsView (LB-67)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(RewardAPI.getBarRewards).mockResolvedValue(mockRewards);
    vi.mocked(RewardAPI.createReward).mockResolvedValue(mockRewards[0]);
    vi.mocked(RewardAPI.updateReward).mockResolvedValue(mockRewards[0]);
    vi.mocked(RewardAPI.deleteReward).mockResolvedValue({ message: 'ok' });
  });

  it('OWNER sees the create button and management actions for each reward', async () => {
    vi.mocked(BarAPI.getMyBars).mockResolvedValue([mockOwnerBar]);
    renderBarRewards();

    await waitFor(() => {
      expect(screen.getByText('Chopp gratis')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /nueva recompensa/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /editar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /desactivar/i })).toBeInTheDocument();
  });

  it('CASHIER sees the reward list in read-only mode (no management controls)', async () => {
    vi.mocked(BarAPI.getMyBars).mockResolvedValue([mockCashierBar]);
    renderBarRewards();

    await waitFor(() => {
      expect(screen.getByText('Chopp gratis')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /nueva recompensa/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /editar/i })).not.toBeInTheDocument();
  });

  it('submits a new reward with the expected payload and shows a success toast', async () => {
    vi.mocked(BarAPI.getMyBars).mockResolvedValue([mockOwnerBar]);
    const user = userEvent.setup();
    renderBarRewards();

    await waitFor(() => {
      expect(screen.getByText('Chopp gratis')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /nueva recompensa/i }));

    await user.type(screen.getByLabelText('NOMBRE'), 'Remera edición limitada');
    await user.clear(screen.getByLabelText('PUNTOS REQUERIDOS'));
    await user.type(screen.getByLabelText('PUNTOS REQUERIDOS'), '500');
    await user.click(screen.getByLabelText(/stock ilimitado/i));

    await user.click(screen.getByRole('button', { name: /^crear$/i }));

    await waitFor(() => {
      expect(RewardAPI.createReward).toHaveBeenCalledTimes(1);
    });

    const [barIdArg, payload] = vi.mocked(RewardAPI.createReward).mock.calls[0];
    expect(barIdArg).toBe('bar-1');
    expect(payload).toEqual(
      expect.objectContaining({
        name: 'Remera edición limitada',
        pointsRequired: 500,
        unlimitedStock: true,
        stock: undefined,
      })
    );
  });

  it('blocks submission and shows a validation error when the name is empty', async () => {
    vi.mocked(BarAPI.getMyBars).mockResolvedValue([mockOwnerBar]);
    const user = userEvent.setup();
    renderBarRewards();

    await waitFor(() => {
      expect(screen.getByText('Chopp gratis')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /nueva recompensa/i }));
    await user.clear(screen.getByLabelText('PUNTOS REQUERIDOS'));
    await user.type(screen.getByLabelText('PUNTOS REQUERIDOS'), '50');
    await user.click(screen.getByRole('button', { name: /^crear$/i }));

    await waitFor(() => {
      expect(screen.getByText('El nombre es requerido')).toBeInTheDocument();
    });

    expect(RewardAPI.createReward).not.toHaveBeenCalled();
  });

  it('deletes a reward after confirming the modal', async () => {
    vi.mocked(BarAPI.getMyBars).mockResolvedValue([mockOwnerBar]);
    const user = userEvent.setup();
    renderBarRewards();

    await waitFor(() => {
      expect(screen.getByText('Chopp gratis')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByRole('button');
    const trashButton = deleteButtons.find((btn) => btn.querySelector('svg.lucide-trash2'));
    expect(trashButton).toBeDefined();
    await user.click(trashButton!);

    await waitFor(() => {
      expect(screen.getByText('Eliminar recompensa')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /^eliminar$/i }));

    await waitFor(() => {
      expect(RewardAPI.deleteReward).toHaveBeenCalledWith('bar-1', 'reward-1');
    });
  });
});
