import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import OutingSection from './OutingSection';
import * as OutingAPI from '@/API/OutingAPI';
import * as BarAPI from '@/API/BarAPI';
import { toast } from 'sonner';
import type { GroupMember } from '@/types/group';
import type { Outing } from '@/types/outing';

// Mock motion/react to avoid animation issues in tests
vi.mock('motion/react', async () => {
  const { mockMotion } = await import('@/test/mocks/motion');
  return mockMotion();
});

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@/API/OutingAPI');
vi.mock('@/API/BarAPI');

const mockMembers: GroupMember[] = [
  { id: 'u1', name: 'Juan Pérez', avatarUrl: null, role: 'LEADER' },
  { id: 'u2', name: 'Ana García', avatarUrl: null, role: 'CO_LEADER' },
  { id: 'u3', name: 'Pedro López', avatarUrl: null, role: 'MEMBER' },
];

const mockOuting: Outing = {
  _id: 'outing-1',
  group: 'group-1',
  bar: {
    _id: 'bar-1',
    name: 'Bar de Prueba',
    slug: 'bar-de-prueba',
    address: { street: 'Calle Falsa', number: '123', city: 'CABA' },
  },
  createdBy: { _id: 'u1', name: 'Juan', lastName: 'Pérez' },
  scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  note: 'Traer buena onda',
  status: 'PENDING',
  invitees: ['u1', 'u2', 'u3'],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('OutingSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(BarAPI.getActiveBars).mockResolvedValue([]);
  });

  it('does not show "Crear salida" button for MEMBER when there is no active outing', async () => {
    vi.mocked(OutingAPI.getActiveOuting).mockResolvedValue(null);

    renderWithProviders(
      <OutingSection groupId="group-1" members={mockMembers} currentUserRole="MEMBER" />
    );

    await waitFor(() => {
      expect(OutingAPI.getActiveOuting).toHaveBeenCalledWith('group-1');
    });

    expect(screen.queryByText('Crear salida')).not.toBeInTheDocument();
    expect(screen.queryByText('SALIDA')).not.toBeInTheDocument();
  });

  it('shows "Crear salida" button for LEADER when there is no active outing', async () => {
    vi.mocked(OutingAPI.getActiveOuting).mockResolvedValue(null);

    renderWithProviders(
      <OutingSection groupId="group-1" members={mockMembers} currentUserRole="LEADER" />
    );

    await waitFor(() => {
      expect(screen.getByText('Crear salida')).toBeInTheDocument();
    });
  });

  it('shows "Crear salida" button for CO_LEADER when there is no active outing', async () => {
    vi.mocked(OutingAPI.getActiveOuting).mockResolvedValue(null);

    renderWithProviders(
      <OutingSection groupId="group-1" members={mockMembers} currentUserRole="CO_LEADER" />
    );

    await waitFor(() => {
      expect(screen.getByText('Crear salida')).toBeInTheDocument();
    });
  });

  it('shows the active outing card when getActiveOuting resolves with an outing', async () => {
    vi.mocked(OutingAPI.getActiveOuting).mockResolvedValue(mockOuting);

    renderWithProviders(
      <OutingSection groupId="group-1" members={mockMembers} currentUserRole="MEMBER" />
    );

    await waitFor(() => {
      expect(screen.getByText('Bar de Prueba')).toBeInTheDocument();
    });

    expect(screen.getByText('Traer buena onda')).toBeInTheDocument();
    expect(screen.getByText('3 invitados')).toBeInTheDocument();
  });

  it('shows edit button on the active outing card for LEADER/CO_LEADER but not for MEMBER', async () => {
    vi.mocked(OutingAPI.getActiveOuting).mockResolvedValue(mockOuting);

    const { rerender } = renderWithProviders(
      <OutingSection groupId="group-1" members={mockMembers} currentUserRole="MEMBER" />
    );

    await waitFor(() => {
      expect(screen.getByText('Bar de Prueba')).toBeInTheDocument();
    });
    expect(screen.queryByText('Editar salida')).not.toBeInTheDocument();

    rerender(
      <OutingSection groupId="group-1" members={mockMembers} currentUserRole="LEADER" />
    );

    await waitFor(() => {
      expect(screen.getByText('Editar salida')).toBeInTheDocument();
    });
  });

  it('shows cancel button on the active outing card for LEADER but not for MEMBER', async () => {
    vi.mocked(OutingAPI.getActiveOuting).mockResolvedValue(mockOuting);

    const { rerender } = renderWithProviders(
      <OutingSection groupId="group-1" members={mockMembers} currentUserRole="MEMBER" />
    );

    await waitFor(() => {
      expect(screen.getByText('Bar de Prueba')).toBeInTheDocument();
    });
    expect(screen.queryByText('Cancelar salida')).not.toBeInTheDocument();

    rerender(
      <OutingSection groupId="group-1" members={mockMembers} currentUserRole="LEADER" />
    );

    await waitFor(() => {
      expect(screen.getByText('Cancelar salida')).toBeInTheDocument();
    });
  });

  it('does not show cancel button when the active outing is no longer PENDING', async () => {
    vi.mocked(OutingAPI.getActiveOuting).mockResolvedValue({ ...mockOuting, status: 'ACTIVE' });

    renderWithProviders(
      <OutingSection groupId="group-1" members={mockMembers} currentUserRole="LEADER" />
    );

    await waitFor(() => {
      expect(screen.getByText('Bar de Prueba')).toBeInTheDocument();
    });
    expect(screen.queryByText('Cancelar salida')).not.toBeInTheDocument();
  });

  it('opens a confirmation dialog and cancels the outing on confirm', async () => {
    const user = userEvent.setup();
    vi.mocked(OutingAPI.getActiveOuting).mockResolvedValue(mockOuting);
    vi.mocked(OutingAPI.cancelOuting).mockResolvedValue({ ...mockOuting, status: 'CANCELLED' });

    renderWithProviders(
      <OutingSection groupId="group-1" members={mockMembers} currentUserRole="LEADER" />
    );

    await waitFor(() => {
      expect(screen.getByText('Bar de Prueba')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Cancelar salida'));

    // Confirmation dialog appears with its own confirm button.
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Sí, cancelar'));

    await waitFor(() => {
      expect(OutingAPI.cancelOuting).toHaveBeenCalledWith('group-1', 'outing-1');
    });
    expect(toast.success).toHaveBeenCalledWith('Salida cancelada');
  });

  it('shows an error toast when cancelling fails', async () => {
    const user = userEvent.setup();
    vi.mocked(OutingAPI.getActiveOuting).mockResolvedValue(mockOuting);
    vi.mocked(OutingAPI.cancelOuting).mockRejectedValue({
      type: 'server',
      message: 'La salida ya no puede cancelarse',
      status: 409,
    });

    renderWithProviders(
      <OutingSection groupId="group-1" members={mockMembers} currentUserRole="LEADER" />
    );

    await waitFor(() => {
      expect(screen.getByText('Bar de Prueba')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Cancelar salida'));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Sí, cancelar'));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('La salida ya no puede cancelarse');
    });
  });
});
