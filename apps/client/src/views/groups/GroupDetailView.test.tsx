import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { Routes, Route } from 'react-router';
import { renderWithProviders } from '@/test/renderWithProviders';
import GroupDetailView from './GroupDetailView';
import * as GroupAPI from '@/API/GroupAPI';
import type { GroupDetail } from '@/types/group';

const renderGroupDetail = (route: string) =>
  renderWithProviders(
    <Routes>
      <Route path="/groups/:slug" element={<GroupDetailView />} />
    </Routes>,
    { route }
  );

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

// Mock getGroupQRUrl and getGroupRequests
vi.mock('@/API/GroupAPI', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/API/GroupAPI')>();
  return {
    ...actual,
    getGroupQRUrl: vi.fn(() => 'https://api.example.com/groups/test-group/qr'),
    getGroupRequests: vi.fn(() => Promise.resolve([])),
  };
});

// Mock clipboard
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn().mockResolvedValue(undefined),
  },
});

const mockGroup: GroupDetail = {
  id: 'group-1',
  name: 'Los De Siempre',
  slug: 'los-de-siempre',
  type: 'OPEN',
  description: 'Banda de rock',
  avatarUrl: '/uploads/group-avatars/photo.jpg',
  memberCount: 3,
  members: [
    { id: 'u1', name: 'Juan Pérez', avatarUrl: '/uploads/avatars/juan.jpg', role: 'LEADER' },
    { id: 'u2', name: 'Ana García', avatarUrl: null, role: 'CO_LEADER' },
    { id: 'u3', name: 'Pedro López', avatarUrl: null, role: 'MEMBER' },
  ],
  inviteCode: 'BAN4K2',
  inviteLink: 'labanda.app/unirse/BAN4K2',
  canManage: true,
  currentUserRole: 'LEADER',
};

describe('GroupDetailView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    vi.spyOn(GroupAPI, 'getGroupBySlug').mockImplementation(() => new Promise(() => {}));

    renderGroupDetail('/groups/los-de-siempre');

    expect(screen.getByText('Grupo')).toBeInTheDocument();
    // Skeleton presence: multiple divs with bg-surface-2
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders group details correctly', async () => {
    vi.spyOn(GroupAPI, 'getGroupBySlug').mockResolvedValue(mockGroup);

    renderGroupDetail('/groups/los-de-siempre');

    await waitFor(() => {
      expect(screen.getByText('Los De Siempre')).toBeInTheDocument();
    });

    expect(screen.getByText('Banda de rock')).toBeInTheDocument();
    expect(screen.getByText('Abierto')).toBeInTheDocument();
    expect(screen.getByText('3 miembros')).toBeInTheDocument();
  });

  it('renders member list with correct roles', async () => {
    vi.spyOn(GroupAPI, 'getGroupBySlug').mockResolvedValue(mockGroup);

    renderGroupDetail('/groups/los-de-siempre');

    await waitFor(() => {
      expect(screen.getByText('Juan Pérez')).toBeInTheDocument();
    });

    expect(screen.getByText('Líder')).toBeInTheDocument();
    expect(screen.getByText('Co-líder')).toBeInTheDocument();
    expect(screen.getByText('Miembro')).toBeInTheDocument();
  });

  it('shows invite section for LEADER', async () => {
    vi.spyOn(GroupAPI, 'getGroupBySlug').mockResolvedValue(mockGroup);

    renderGroupDetail('/groups/los-de-siempre');

    await waitFor(() => {
      expect(screen.getByText('CÓDIGO DE INVITACIÓN')).toBeInTheDocument();
    });

    expect(screen.getByText('BAN4K2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /compartir link/i })).toBeInTheDocument();
  });

  it('shows invite section for CO_LEADER', async () => {
    vi.spyOn(GroupAPI, 'getGroupBySlug').mockResolvedValue({
      ...mockGroup,
      canManage: false,
      currentUserRole: 'CO_LEADER',
    });

    renderGroupDetail('/groups/los-de-siempre');

    await waitFor(() => {
      expect(screen.getByText('CÓDIGO DE INVITACIÓN')).toBeInTheDocument();
    });
  });

  it('hides invite section for MEMBER', async () => {
    vi.spyOn(GroupAPI, 'getGroupBySlug').mockResolvedValue({
      ...mockGroup,
      inviteCode: undefined,
      inviteLink: undefined,
      canManage: false,
      currentUserRole: 'MEMBER',
    });

    renderGroupDetail('/groups/los-de-siempre');

    await waitFor(() => {
      expect(screen.getByText('Los De Siempre')).toBeInTheDocument();
    });

    expect(screen.queryByText('CÓDIGO DE INVITACIÓN')).not.toBeInTheDocument();
  });

  it('shows settings button for LEADER', async () => {
    vi.spyOn(GroupAPI, 'getGroupBySlug').mockResolvedValue(mockGroup);

    renderGroupDetail('/groups/los-de-siempre');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /configuración del grupo/i })).toBeInTheDocument();
    });
  });

  it('hides settings button for non-leader', async () => {
    vi.spyOn(GroupAPI, 'getGroupBySlug').mockResolvedValue({
      ...mockGroup,
      canManage: false,
      currentUserRole: 'CO_LEADER',
    });

    renderGroupDetail('/groups/los-de-siempre');

    await waitFor(() => {
      expect(screen.getByText('Los De Siempre')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /configuración del grupo/i })).not.toBeInTheDocument();
  });

  it('renders 404 error state', async () => {
    vi.spyOn(GroupAPI, 'getGroupBySlug').mockRejectedValue({
      type: 'server',
      message: 'Grupo no encontrado',
      status: 404,
    });

    renderGroupDetail('/groups/no-existe');

    await waitFor(() => {
      expect(screen.getByText('Grupo no encontrado')).toBeInTheDocument();
    });
  });

  it('renders 403 error state', async () => {
    vi.spyOn(GroupAPI, 'getGroupBySlug').mockRejectedValue({
      type: 'server',
      message: 'No tenés acceso',
      status: 403,
    });

    renderGroupDetail('/groups/privado');

    await waitFor(() => {
      expect(screen.getByText('Acceso denegado')).toBeInTheDocument();
    });
  });

  it('renders generic server error state', async () => {
    vi.spyOn(GroupAPI, 'getGroupBySlug').mockRejectedValue({
      type: 'server',
      message: 'Error interno',
      status: 500,
    });

    renderGroupDetail('/groups/test');

    await waitFor(() => {
      expect(screen.getByText('Error del servidor')).toBeInTheDocument();
    });
  });
});
