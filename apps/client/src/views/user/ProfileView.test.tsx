import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import ProfileView from './ProfileView';

// Mock motion/react
vi.mock('motion/react', async () => {
  const { mockMotion } = await import('../../test/mocks/motion');
  return mockMotion();
});

// Mock UserAPI
vi.mock('@/API/UserAPI', () => ({
  getUserProfile: vi.fn(),
  getUserGroups: vi.fn(),
  updateUserProfile: vi.fn(),
  uploadAvatar: vi.fn(),
}));

// Mock useAuth
vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock cropImageToSquare
vi.mock('@/utils/cropImageToSquare', () => ({
  cropImageToSquare: vi.fn((file: File) => Promise.resolve(file)),
}));

import { getUserProfile, getUserGroups, updateUserProfile } from '@/API/UserAPI';
import { useAuth } from '@/hooks/useAuth';

const mockGetUserProfile = vi.mocked(getUserProfile);
const mockGetUserGroups = vi.mocked(getUserGroups);
const mockUpdateUserProfile = vi.mocked(updateUserProfile);
const mockUseAuth = vi.mocked(useAuth);

describe('ProfileView', () => {
  const mockProfile = {
    _id: '1',
    name: 'Juan',
    lastName: 'Pérez',
    email: 'juan@example.com',
    avatarUrl: 'https://example.com/avatar.jpg',
    isActive: true,
    role: 'user',
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
    birthdate: '1990-05-15',
  };

  const mockGroups = [
    { groupId: 'g1', slug: 'la-banda', name: 'La Banda', role: 'admin' as const, avatarUrl: 'https://example.com/g1.jpg' },
    { groupId: 'g2', slug: 'amigos', name: 'Amigos', role: 'member' as const },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      data: mockProfile,
      isLoading: false,
      isError: false,
      logoutUser: vi.fn(),
      isProfileComplete: true,
    } as any);
  });

  it('renders loading state initially', () => {
    mockGetUserProfile.mockImplementation(() => new Promise(() => {}));
    mockGetUserGroups.mockImplementation(() => new Promise(() => {}));

    renderWithProviders(<ProfileView />);

    expect(screen.getByText('Cargando tu perfil...')).toBeInTheDocument();
  });

  it('renders profile data after loading', async () => {
    mockGetUserProfile.mockResolvedValue(mockProfile);
    mockGetUserGroups.mockResolvedValue(mockGroups);

    renderWithProviders(<ProfileView />);

    await waitFor(() => {
      expect(screen.getByText('juan@example.com')).toBeInTheDocument();
    });

    expect(screen.getByText('Juan Pérez')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('La Banda')).toBeInTheDocument();
    });
    expect(screen.getByText('Amigos')).toBeInTheDocument();
  });

  it('shows error state when profile fails to load', async () => {
    mockGetUserProfile.mockRejectedValue(new Error('Failed'));

    renderWithProviders(<ProfileView />);

    await waitFor(() => {
      expect(screen.getByText('Error al cargar el perfil')).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('enters inline edit mode when name is clicked', async () => {
    mockGetUserProfile.mockResolvedValue(mockProfile);
    mockGetUserGroups.mockResolvedValue([]);

    renderWithProviders(<ProfileView />);

    await waitFor(() => {
      expect(screen.getByText('Juan Pérez')).toBeInTheDocument();
    });

    const nameButton = screen.getByRole('button', { name: /Juan Pérez/ });
    await userEvent.click(nameButton);

    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('Juan Pérez');
  });

  it('saves name on confirm click', async () => {
    mockGetUserProfile.mockResolvedValue(mockProfile);
    mockGetUserGroups.mockResolvedValue([]);
    mockUpdateUserProfile.mockResolvedValue('Nombre actualizado');

    renderWithProviders(<ProfileView />);

    await waitFor(() => {
      expect(screen.getByText('Juan Pérez')).toBeInTheDocument();
    });

    const nameButton = screen.getByRole('button', { name: /Juan Pérez/ });
    await userEvent.click(nameButton);

    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, 'Pedro Gómez');

    await userEvent.keyboard('{Enter}');

    await waitFor(() => {
      expect(mockUpdateUserProfile.mock.calls[0][0]).toEqual({
        name: 'Pedro',
        lastName: 'Gómez',
        birthdate: '1990-05-15',
      });
    });
  });

  it('shows validation error for short name', async () => {
    mockGetUserProfile.mockResolvedValue(mockProfile);
    mockGetUserGroups.mockResolvedValue([]);

    renderWithProviders(<ProfileView />);

    await waitFor(() => {
      expect(screen.getByText('Juan Pérez')).toBeInTheDocument();
    });

    const nameButton = screen.getByRole('button', { name: /Juan Pérez/ });
    await userEvent.click(nameButton);

    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, 'A');

    const saveButton = screen.getByRole('button', { name: 'Guardar nombre' });
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText(/Mínimo 2 caracteres/)).toBeInTheDocument();
    });

    expect(mockUpdateUserProfile).not.toHaveBeenCalled();
  });

  it('shows validation error for single word name', async () => {
    mockGetUserProfile.mockResolvedValue(mockProfile);
    mockGetUserGroups.mockResolvedValue([]);

    renderWithProviders(<ProfileView />);

    await waitFor(() => {
      expect(screen.getByText('Juan Pérez')).toBeInTheDocument();
    });

    const nameButton = screen.getByRole('button', { name: /Juan Pérez/ });
    await userEvent.click(nameButton);

    const input = screen.getByRole('textbox');
    await userEvent.clear(input);
    await userEvent.type(input, 'Pedro');

    const saveButton = screen.getByRole('button', { name: 'Guardar nombre' });
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText(/Ingresá nombre y apellido/)).toBeInTheDocument();
    });
  });

  it('cancels name editing', async () => {
    mockGetUserProfile.mockResolvedValue(mockProfile);
    mockGetUserGroups.mockResolvedValue([]);

    renderWithProviders(<ProfileView />);

    await waitFor(() => {
      expect(screen.getByText('Juan Pérez')).toBeInTheDocument();
    });

    const nameButton = screen.getByRole('button', { name: /Juan Pérez/ });
    await userEvent.click(nameButton);

    const cancelButton = screen.getByRole('button', { name: 'Cancelar edición' });
    await userEvent.click(cancelButton);

    await waitFor(() => {
      expect(screen.getByText('Juan Pérez')).toBeInTheDocument();
    });

    expect(mockUpdateUserProfile).not.toHaveBeenCalled();
  });

  it('opens logout modal and calls logout on confirm', async () => {
    const mockLogout = vi.fn();
    mockUseAuth.mockReturnValue({
      data: mockProfile,
      isLoading: false,
      isError: false,
      logoutUser: mockLogout,
      isProfileComplete: true,
    } as any);

    mockGetUserProfile.mockResolvedValue(mockProfile);
    mockGetUserGroups.mockResolvedValue([]);

    renderWithProviders(<ProfileView />);

    await waitFor(() => {
      expect(screen.getByText('Cerrar sesión')).toBeInTheDocument();
    });

    const logoutButton = screen.getByRole('button', { name: 'Cerrar sesión' });
    await userEvent.click(logoutButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    expect(screen.getByText('¿Querés cerrar sesión?')).toBeInTheDocument();

    const confirmButtons = screen.getAllByRole('button', { name: 'Cerrar sesión' });
    await userEvent.click(confirmButtons[1]);

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalledTimes(1);
    });
  });

  it('closes logout modal on cancel', async () => {
    const mockLogout = vi.fn();
    mockUseAuth.mockReturnValue({
      data: mockProfile,
      isLoading: false,
      isError: false,
      logoutUser: mockLogout,
      isProfileComplete: true,
    } as any);

    mockGetUserProfile.mockResolvedValue(mockProfile);
    mockGetUserGroups.mockResolvedValue([]);

    renderWithProviders(<ProfileView />);

    await waitFor(() => {
      expect(screen.getByText('Cerrar sesión')).toBeInTheDocument();
    });

    const logoutButton = screen.getByRole('button', { name: 'Cerrar sesión' });
    await userEvent.click(logoutButton);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    const cancelButton = screen.getByRole('button', { name: 'Cancelar' });
    await userEvent.click(cancelButton);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('renders empty groups state', async () => {
    mockGetUserProfile.mockResolvedValue(mockProfile);
    mockGetUserGroups.mockResolvedValue([]);

    renderWithProviders(<ProfileView />);

    await waitFor(() => {
      expect(screen.getByText('Todavía no pertenecés a ningún grupo')).toBeInTheDocument();
    });
  });

  it('renders groups error state with retry', async () => {
    mockGetUserProfile.mockResolvedValue(mockProfile);
    mockGetUserGroups.mockRejectedValue(new Error('Groups failed'));

    renderWithProviders(<ProfileView />);

    await waitFor(() => {
      expect(screen.getByText('Error al cargar grupos')).toBeInTheDocument();
    }, { timeout: 3000 });

    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});
