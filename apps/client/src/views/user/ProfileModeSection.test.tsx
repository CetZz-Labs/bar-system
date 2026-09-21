import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import ProfileModeSection from './ProfileModeSection';
import type { ContextOptions } from '@/types/context';

vi.mock('@/API/ContextAPI', () => ({
  getContextOptions: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import { getContextOptions } from '@/API/ContextAPI';

const mockGetContextOptions = vi.mocked(getContextOptions);

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ProfileModeSection />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ProfileModeSection', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders nothing when the user has no bar roles', async () => {
    mockGetContextOptions.mockResolvedValue({
      user: true,
      cashier: [],
      owner: [],
    } satisfies ContextOptions);

    const { container } = renderSection();

    await waitFor(() => {
      expect(mockGetContextOptions).toHaveBeenCalled();
    });

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('Cambio de modo')).not.toBeInTheDocument();
  });

  it('renders and navigates to /select-context when the user has bar roles', async () => {
    mockGetContextOptions.mockResolvedValue({
      user: true,
      cashier: [{ barId: 'bar-1', barName: 'Bar Uno' }],
      owner: [],
    } satisfies ContextOptions);

    const user = userEvent.setup();
    renderSection();

    const button = await screen.findByRole('button', { name: /Cambiar a modo cajero \/ dueño/ });
    expect(screen.getByText('Cambio de modo')).toBeInTheDocument();

    await user.click(button);

    expect(mockNavigate).toHaveBeenCalledWith('/select-context', { state: { from: '/profile' } });
  });
});
