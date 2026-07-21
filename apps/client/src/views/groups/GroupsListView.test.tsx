import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { Routes, Route } from 'react-router';
import { renderWithProviders } from '@/test/renderWithProviders';
import GroupsListView from './GroupsListView';
import * as UserAPI from '@/API/UserAPI';
import type { GroupMembership } from '@/types/user';

// Mock motion/react
vi.mock('motion/react', async () => {
  const { mockMotion } = await import('@/test/mocks/motion');
  return mockMotion();
});

const mockGroups: GroupMembership[] = [
  {
    groupId: 'g1',
    slug: 'los-de-siempre',
    name: 'Los De Siempre',
    avatarUrl: '/uploads/g1.jpg',
    role: 'admin',
  },
  {
    groupId: 'g2',
    slug: 'las-chicas',
    name: 'Las Chicas',
    role: 'member',
  },
  {
    groupId: 'g3',
    slug: 'rock-city',
    name: 'Rock City',
    avatarUrl: '/uploads/g3.jpg',
    role: 'moderator',
  },
];

const renderGroupsList = () =>
  renderWithProviders(
    <Routes>
      <Route path="/groups" element={<GroupsListView />} />
      <Route path="/groups/:slug" element={<div data-testid="group-detail" />} />
    </Routes>,
    { route: '/groups' }
  );

describe('GroupsListView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    vi.spyOn(UserAPI, 'getUserGroups').mockImplementation(() => new Promise(() => {}));

    renderGroupsList();

    expect(screen.getByText('Mis grupos')).toBeInTheDocument();
    expect(screen.getByText('Cargando tus grupos...')).toBeInTheDocument();
  });

  it('renders group list correctly', async () => {
    vi.spyOn(UserAPI, 'getUserGroups').mockResolvedValue(mockGroups);

    renderGroupsList();

    await waitFor(() => {
      expect(screen.getByText('Los De Siempre')).toBeInTheDocument();
    });

    expect(screen.getByText('Las Chicas')).toBeInTheDocument();
    expect(screen.getByText('Rock City')).toBeInTheDocument();

    // Role labels
    expect(screen.getByText('Líder')).toBeInTheDocument();
    expect(screen.getByText('Miembro')).toBeInTheDocument();
    expect(screen.getByText('Co-líder')).toBeInTheDocument();
  });

  it('navigates to group detail on click', async () => {
    vi.spyOn(UserAPI, 'getUserGroups').mockResolvedValue(mockGroups);

    renderGroupsList();

    await waitFor(() => {
      expect(screen.getByText('Los De Siempre')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Los De Siempre'));

    await waitFor(() => {
      expect(screen.getByTestId('group-detail')).toBeInTheDocument();
    });
  });

  it('renders empty state when no groups', async () => {
    vi.spyOn(UserAPI, 'getUserGroups').mockResolvedValue([]);

    renderGroupsList();

    await waitFor(() => {
      expect(screen.getByText('Todavía no pertenecés a ningún grupo')).toBeInTheDocument();
    });

    // The main CTA in the empty state (not the header icon button)
    expect(screen.getByText('Crear grupo')).toBeInTheDocument();
  });

  it('renders error state with retry button', async () => {
    vi.spyOn(UserAPI, 'getUserGroups').mockRejectedValue({
      type: 'server',
      message: 'Error del servidor',
    });

    renderGroupsList();

    await waitFor(() => {
      expect(screen.getByText('Error al cargar grupos')).toBeInTheDocument();
    }, { timeout: 3000 });

    expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument();
  });
});
