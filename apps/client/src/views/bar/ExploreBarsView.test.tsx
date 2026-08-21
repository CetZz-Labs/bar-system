import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import ExploreBarsView from './ExploreBarsView';
import * as BarAPI from '@/API/BarAPI';
import { toast } from 'sonner';
import type { ExploreBar } from '@/types/bar';

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

const mockNavigate = vi.fn();
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockBars: ExploreBar[] = [
  {
    id: 'bar-1',
    name: 'El Bar de Juan',
    address: { street: 'Calle Falsa', number: '123', city: 'CABA' },
    closingTime: '06:00',
    todayAttendancePoints: 100,
    hasActiveCheckIn: false,
  },
  {
    id: 'bar-2',
    name: 'La Esquina',
    address: { street: 'Av. Siempre Viva', number: '742', city: 'CABA' },
    closingTime: '05:00',
    todayAttendancePoints: 0,
    hasActiveCheckIn: true,
  },
];

describe('ExploreBarsView (LB-79)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the bar list with address, closing time, today points and the "Estás acá" badge only when hasActiveCheckIn', async () => {
    vi.mocked(BarAPI.exploreBars).mockResolvedValue(mockBars);

    renderWithProviders(<ExploreBarsView />);

    await waitFor(() => {
      expect(screen.getByText('El Bar de Juan')).toBeInTheDocument();
    });

    expect(screen.getByText(/Calle Falsa 123, CABA/)).toBeInTheDocument();
    expect(screen.getByText('Cierra a las 06:00')).toBeInTheDocument();
    expect(screen.getByText('100 pts por asistencia hoy')).toBeInTheDocument();

    expect(screen.getByText('La Esquina')).toBeInTheDocument();
    expect(screen.getByText('Estás acá')).toBeInTheDocument();
  });

  it('navigates to the bar detail route (/bar/:id) when a card is clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(BarAPI.exploreBars).mockResolvedValue(mockBars);

    renderWithProviders(<ExploreBarsView />);

    await waitFor(() => {
      expect(screen.getByText('El Bar de Juan')).toBeInTheDocument();
    });

    await user.click(screen.getByText('El Bar de Juan'));

    expect(mockNavigate).toHaveBeenCalledWith('/bar/bar-1');
  });

  it('debounces the search input and calls exploreBars with the trimmed query', async () => {
    const user = userEvent.setup();
    vi.mocked(BarAPI.exploreBars).mockResolvedValue(mockBars);

    renderWithProviders(<ExploreBarsView />);

    await waitFor(() => {
      expect(BarAPI.exploreBars).toHaveBeenCalledWith(undefined);
    });

    vi.mocked(BarAPI.exploreBars).mockClear();
    vi.mocked(BarAPI.exploreBars).mockResolvedValue([mockBars[0]]);

    await user.type(screen.getByLabelText('Buscar bar'), 'Juan');

    await waitFor(
      () => {
        expect(BarAPI.exploreBars).toHaveBeenCalledWith('Juan');
      },
      { timeout: 2000 }
    );
  });

  it('shows an empty state message when there are no bars for the current search', async () => {
    vi.mocked(BarAPI.exploreBars).mockResolvedValue([]);

    renderWithProviders(<ExploreBarsView />);

    await waitFor(() => {
      expect(screen.getByText('Todavía no hay bares activos para mostrar.')).toBeInTheDocument();
    });
  });

  it('shows an error toast when the query fails', async () => {
    vi.mocked(BarAPI.exploreBars).mockRejectedValue({
      type: 'server',
      message: 'Error del servidor',
    });

    renderWithProviders(<ExploreBarsView />);

    await waitFor(
      () => {
        expect(toast.error).toHaveBeenCalledWith('No pudimos cargar el listado de bares');
      },
      { timeout: 3000 }
    );
  });
});
