import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { Routes, Route } from 'react-router';
import { renderWithProviders } from '@/test/renderWithProviders';
import JoinGroupView from './JoinGroupView';
import * as GroupAPI from '@/API/GroupAPI';
import * as AuthHooks from '@/hooks/useAuth';
import type { GroupInviteInfo } from "@/types/group";

const renderJoinGroup = (route: string) =>
  renderWithProviders(
    <Routes>
      <Route path="/unirse/:inviteCode" element={<JoinGroupView />} />
      <Route path="/groups/:slug" element={<div data-testid="group-detail">Group Detail</div>} />
      <Route path="/login" element={<div data-testid="login">Login</div>} />
      <Route path="/onboarding" element={<div data-testid="onboarding">Onboarding</div>} />
    </Routes>,
    { route }
  );

// Mock motion/react
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

// Mock useAuth
vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

const mockGroup: GroupInviteInfo = {
  id: 'group-1',
  name: 'Los De Siempre',
  slug: 'los-de-siempre',
  type: 'OPEN',
  description: 'Banda de rock',
  avatarUrl: '/uploads/group-avatars/photo.jpg',
  memberCount: 5,
  inviteCode: 'BAN4K2',
};

const createMockAuth = (overrides: Partial<ReturnType<typeof AuthHooks.useAuth>> = {}) => ({
  data: null,
  isError: false,
  isLoading: false,
  logoutUser: vi.fn(),
  isProfileComplete: false,
  ...overrides,
});

describe('JoinGroupView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    vi.spyOn(GroupAPI, 'getGroupByInviteCode').mockImplementation(() => new Promise(() => {}));
    vi.mocked(AuthHooks.useAuth).mockReturnValue(createMockAuth());

    renderJoinGroup('/unirse/BAN4K2');

    expect(screen.getByText('Unirse a grupo')).toBeInTheDocument();
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders group details correctly', async () => {
    vi.spyOn(GroupAPI, 'getGroupByInviteCode').mockResolvedValue(mockGroup);
    vi.mocked(AuthHooks.useAuth).mockReturnValue(createMockAuth({
      data: { _id: 'user-1', name: 'Test', lastName: 'User', email: 'test@test.com', isActive: true, role: 'user', profileComplete: true },
      isProfileComplete: true,
    }));

    renderJoinGroup('/unirse/BAN4K2');

    await waitFor(() => {
      expect(screen.getByText('Los De Siempre')).toBeInTheDocument();
    });

    expect(screen.getByText('Banda de rock')).toBeInTheDocument();
    expect(screen.getByText('Abierto')).toBeInTheDocument();
    expect(screen.getByText('5 miembros')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /unirme al grupo/i })).toBeInTheDocument();
  });

  it('shows login button for unauthenticated users', async () => {
    vi.spyOn(GroupAPI, 'getGroupByInviteCode').mockResolvedValue(mockGroup);
    vi.mocked(AuthHooks.useAuth).mockReturnValue(createMockAuth({
      data: null,
      isError: true,
    }));

    renderJoinGroup('/unirse/BAN4K2');

    await waitFor(() => {
      expect(screen.getByText('Los De Siempre')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /iniciar sesión/i })).toBeInTheDocument();
  });

  it('joins group successfully and redirects', async () => {
    vi.spyOn(GroupAPI, 'getGroupByInviteCode').mockResolvedValue(mockGroup);
    const joinSpy = vi.spyOn(GroupAPI, 'joinGroup').mockResolvedValue({
      message: 'Te uniste al grupo exitosamente',
      group: { id: 'group-1', name: 'Los De Siempre', slug: 'los-de-siempre' },
    });
    vi.mocked(AuthHooks.useAuth).mockReturnValue(createMockAuth({
      data: { _id: 'user-1', name: 'Test', lastName: 'User', email: 'test@test.com', isActive: true, role: 'user', profileComplete: true },
      isProfileComplete: true,
    }));

    renderJoinGroup('/unirse/BAN4K2');

    await waitFor(() => {
      expect(screen.getByText('Los De Siempre')).toBeInTheDocument();
    });

    const joinButton = screen.getByRole('button', { name: /unirme al grupo/i });
    fireEvent.click(joinButton);

    await waitFor(() => {
      expect(joinSpy).toHaveBeenCalledWith('BAN4K2');
    });

    await waitFor(() => {
      expect(screen.getByTestId('group-detail')).toBeInTheDocument();
    });
  });

  it('shows disabled button when user is already a member (409)', async () => {
    vi.spyOn(GroupAPI, 'getGroupByInviteCode').mockResolvedValue(mockGroup);
    vi.spyOn(GroupAPI, 'joinGroup').mockRejectedValue({
      type: 'server',
      message: 'Ya sos parte de este grupo',
      status: 409,
    });
    vi.mocked(AuthHooks.useAuth).mockReturnValue(createMockAuth({
      data: { _id: 'user-1', name: 'Test', lastName: 'User', email: 'test@test.com', isActive: true, role: 'user', profileComplete: true },
      isProfileComplete: true,
    }));

    renderJoinGroup('/unirse/BAN4K2');

    await waitFor(() => {
      expect(screen.getByText('Los De Siempre')).toBeInTheDocument();
    });

    const joinButton = screen.getByRole('button', { name: /unirme al grupo/i });
    fireEvent.click(joinButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /ya sos parte de este grupo/i })).toBeInTheDocument();
    });
  });

  it('shows disabled button when user is banned (403)', async () => {
    vi.spyOn(GroupAPI, 'getGroupByInviteCode').mockResolvedValue(mockGroup);
    vi.spyOn(GroupAPI, 'joinGroup').mockRejectedValue({
      type: 'server',
      message: 'No podés unirte a este grupo',
      status: 403,
    });
    vi.mocked(AuthHooks.useAuth).mockReturnValue(createMockAuth({
      data: { _id: 'user-1', name: 'Test', lastName: 'User', email: 'test@test.com', isActive: true, role: 'user', profileComplete: true },
      isProfileComplete: true,
    }));

    renderJoinGroup('/unirse/BAN4K2');

    await waitFor(() => {
      expect(screen.getByText('Los De Siempre')).toBeInTheDocument();
    });

    const joinButton = screen.getByRole('button', { name: /unirme al grupo/i });
    fireEvent.click(joinButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /no podés unirte a este grupo/i })).toBeInTheDocument();
    });
  });

  it('renders 404 error state for invalid invite code', async () => {
    vi.spyOn(GroupAPI, 'getGroupByInviteCode').mockRejectedValue({
      type: 'server',
      message: 'Grupo no encontrado',
      status: 404,
    });
    vi.mocked(AuthHooks.useAuth).mockReturnValue(createMockAuth({
      data: null,
      isError: true,
    }));

    renderJoinGroup('/unirse/INVALID');

    await waitFor(() => {
      expect(screen.getByText('Grupo no encontrado')).toBeInTheDocument();
    });
  });

  it('renders server error state', async () => {
    vi.spyOn(GroupAPI, 'getGroupByInviteCode').mockRejectedValue({
      type: 'server',
      message: 'Error interno',
      status: 500,
    });
    vi.mocked(AuthHooks.useAuth).mockReturnValue(createMockAuth({
      data: null,
      isError: true,
    }));

    renderJoinGroup('/unirse/BAN4K2');

    await waitFor(() => {
      expect(screen.getByText('Error del servidor')).toBeInTheDocument();
    });
  });
});
