import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import GroupPickerModal from './GroupPickerModal';
import * as UserAPI from '@/API/UserAPI';
import type { GroupMembership } from '@/types/user';

vi.mock('motion/react', async () => {
  const { mockMotion } = await import('@/test/mocks/motion');
  return mockMotion();
});

vi.mock('@/API/UserAPI');

const mockNavigate = vi.fn();
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockGroups: GroupMembership[] = [
  {
    groupId: 'g1',
    slug: 'los-de-siempre',
    name: 'Los De Siempre',
    avatarUrl: '/uploads/g1.jpg',
    role: 'LEADER',
  },
  {
    groupId: 'g2',
    slug: 'las-chicas',
    name: 'Las Chicas',
    role: 'MEMBER',
  },
];

function renderModal(props?: Partial<{ isOpen: boolean; onClose: () => void; barId: string }>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const onClose = props?.onClose ?? vi.fn();
  return {
    onClose,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <GroupPickerModal
            isOpen={props?.isOpen ?? true}
            onClose={onClose}
            barId={props?.barId ?? 'bar-1'}
          />
        </MemoryRouter>
      </QueryClientProvider>
    ),
  };
}

describe('GroupPickerModal (LB-76)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the list of the user groups', async () => {
    vi.mocked(UserAPI.getUserGroups).mockResolvedValue(mockGroups);

    renderModal();

    await waitFor(() => {
      expect(screen.getByText('Los De Siempre')).toBeInTheDocument();
    });
    expect(screen.getByText('Las Chicas')).toBeInTheDocument();
  });

  it('navigates to the selected group with the preselected bar id in navigation state', async () => {
    const user = userEvent.setup();
    vi.mocked(UserAPI.getUserGroups).mockResolvedValue(mockGroups);
    const onClose = vi.fn();

    renderModal({ onClose, barId: 'bar-1' });

    await waitFor(() => {
      expect(screen.getByText('Los De Siempre')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Los De Siempre'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/groups/los-de-siempre', {
      state: { preselectedBarId: 'bar-1' },
    });
  });

  it('does not render anything when isOpen is false', () => {
    vi.mocked(UserAPI.getUserGroups).mockResolvedValue(mockGroups);

    renderModal({ isOpen: false });

    expect(screen.queryByText('Elegí un grupo')).not.toBeInTheDocument();
  });
});
