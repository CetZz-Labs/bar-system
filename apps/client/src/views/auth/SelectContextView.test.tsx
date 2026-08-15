import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router';
import { renderWithProviders } from '@/test/renderWithProviders';
import SelectContextView from './SelectContextView';
import type { ContextOptions } from '@/types/context';

vi.mock('motion/react', async () => {
  const { mockMotion } = await import('@/test/mocks/motion');
  return mockMotion();
});

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/API/ContextAPI', () => ({
  getContextOptions: vi.fn(),
  selectContext: vi.fn(),
}));

vi.mock('@/API/CashierAPI', () => ({
  cashierSession: vi.fn(),
}));

import { useAuth } from '@/hooks/useAuth';
import { getContextOptions, selectContext } from '@/API/ContextAPI';
import { cashierSession } from '@/API/CashierAPI';

const mockUseAuth = vi.mocked(useAuth);
const mockGetContextOptions = vi.mocked(getContextOptions);
const mockSelectContext = vi.mocked(selectContext);
const mockCashierSession = vi.mocked(cashierSession);

const authenticatedUser = {
  _id: 'user-1',
  name: 'Test',
  lastName: 'User',
  email: 'test@example.com',
  isActive: true,
  role: 'USER',
  profileComplete: true,
};

const renderSelectContext = (route = '/select-context') =>
  renderWithProviders(
    <Routes>
      <Route path="/select-context" element={<SelectContextView />} />
      <Route path="/login" element={<div>Login Page</div>} />
      <Route path="/onboarding" element={<div>Onboarding Page</div>} />
      <Route path="/" element={<div>Home Page</div>} />
      <Route path="/bar/:barId/cajero" element={<div>Cashier Panel Page</div>} />
    </Routes>,
    { route }
  );

describe('SelectContextView (LB-66)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      data: authenticatedUser,
      isLoading: false,
      isError: false,
      logoutUser: vi.fn(),
      isProfileComplete: true,
    });
  });

  it('redirects to /login when there is no session', async () => {
    mockUseAuth.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      logoutUser: vi.fn(),
      isProfileComplete: false,
    });

    renderSelectContext();

    expect(await screen.findByText('Login Page')).toBeInTheDocument();
  });

  it('redirects to /onboarding when the profile is incomplete', async () => {
    mockUseAuth.mockReturnValue({
      data: { ...authenticatedUser, profileComplete: false },
      isLoading: false,
      isError: false,
      logoutUser: vi.fn(),
      isProfileComplete: false,
    });

    renderSelectContext();

    expect(await screen.findByText('Onboarding Page')).toBeInTheDocument();
  });

  it('skips the selector and goes home when the user has no bar roles', async () => {
    mockGetContextOptions.mockResolvedValue({ user: true, cashier: [], owner: [] } satisfies ContextOptions);

    renderSelectContext();

    expect(await screen.findByText('Home Page')).toBeInTheDocument();
  });

  it('renders "usuario" plus one option per cashier/owner bar', async () => {
    mockGetContextOptions.mockResolvedValue({
      user: true,
      cashier: [{ barId: 'bar-1', barName: 'Bar Uno' }],
      owner: [{ barId: 'bar-2', barName: 'Bar Dos' }],
    } satisfies ContextOptions);

    renderSelectContext();

    expect(await screen.findByText('Continuar como usuario')).toBeInTheDocument();
    expect(screen.getByText('Cajero de Bar Uno')).toBeInTheDocument();
    expect(screen.getByText('Dueño de Bar Dos')).toBeInTheDocument();
  });

  it('selecting "usuario" calls selectContext with mode user and navigates home', async () => {
    mockGetContextOptions.mockResolvedValue({
      user: true,
      cashier: [{ barId: 'bar-1', barName: 'Bar Uno' }],
      owner: [],
    } satisfies ContextOptions);
    mockSelectContext.mockResolvedValue({ mode: 'user' });

    const user = userEvent.setup();
    renderSelectContext();

    await user.click(await screen.findByText('Continuar como usuario'));

    await waitFor(() => {
      expect(mockSelectContext).toHaveBeenCalled();
    });
    expect(mockSelectContext.mock.calls[0][0]).toEqual(
      expect.objectContaining({ mode: 'user' })
    );
    expect(await screen.findByText('Home Page')).toBeInTheDocument();
  });

  it('selecting a cashier bar calls selectContext with mode cashier + barId and navigates to the cashier panel', async () => {
    mockGetContextOptions.mockResolvedValue({
      user: true,
      cashier: [{ barId: 'bar-1', barName: 'Bar Uno' }],
      owner: [],
    } satisfies ContextOptions);
    mockSelectContext.mockResolvedValue({ mode: 'cashier', role: 'CASHIER', bar: 'bar-1' });
    mockCashierSession.mockResolvedValue({
      role: 'CASHIER',
      bar: { id: 'bar-1', name: 'Bar Uno', closingTime: '06:00' },
      shift: { startedAt: '2026-08-15T20:00:00.000Z' },
      user: { name: 'Test', lastName: 'User' },
    });

    const user = userEvent.setup();
    renderSelectContext();

    await user.click(await screen.findByText('Cajero de Bar Uno'));

    await waitFor(() => {
      expect(mockSelectContext).toHaveBeenCalled();
    });
    expect(mockSelectContext.mock.calls[0][0]).toEqual(
      expect.objectContaining({ mode: 'cashier', barId: 'bar-1' })
    );
    expect(await screen.findByText('Cashier Panel Page')).toBeInTheDocument();
  });
});
