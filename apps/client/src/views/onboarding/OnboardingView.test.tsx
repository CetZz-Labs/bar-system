import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import OnboardingView from './OnboardingView';

// Mock the useAuth hook
vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

// Mock the UserAPI module
vi.mock('@/API/UserAPI', () => ({
  updateUserProfile: vi.fn(),
  uploadAvatar: vi.fn(),
}));

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock motion
vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
}));

// Mock react-router useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import { useAuth } from '@/hooks/useAuth';
import { updateUserProfile, uploadAvatar } from '@/API/UserAPI';

const mockUseAuth = vi.mocked(useAuth);
const mockUpdateUserProfile = vi.mocked(updateUserProfile);
const mockUploadAvatar = vi.mocked(uploadAvatar);

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/onboarding']}>{children}</MemoryRouter>
    </QueryClientProvider>
  );

  return Wrapper;
};

describe('OnboardingView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      data: { id: '1', email: 'test@example.com', name: '' },
      isLoading: false,
      isError: false,
      logoutUser: vi.fn(),
      isProfileComplete: false,
    } as any);
    mockUpdateUserProfile.mockResolvedValue('OK');
    mockUploadAvatar.mockResolvedValue({ avatarUrl: 'https://example.com/avatar.jpg' });
  });

  it('should render the onboarding form with email', () => {
    render(<OnboardingView />, { wrapper: createWrapper() });

    expect(screen.getByText('Completá tu perfil')).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Alex García')).toBeInTheDocument();
    // Date input is rendered with name="birthdate"
    expect(screen.getByRole('textbox', { name: '' })).toBeInTheDocument();
  });

  it('should have submit button disabled initially', () => {
    render(<OnboardingView />, { wrapper: createWrapper() });

    const submitButton = screen.getByRole('button', { name: /CONTINUAR/ });
    expect(submitButton).toBeDisabled();
  });

  it('should enable submit button when form is valid', async () => {
    const user = userEvent.setup();
    render(<OnboardingView />, { wrapper: createWrapper() });

    const nameInput = screen.getByPlaceholderText('Alex García');
    const dateInput = document.querySelector('input[name="birthdate"]') as HTMLInputElement;

    await user.type(nameInput, 'Alex García');
    await user.type(dateInput, '2000-01-15');

    await waitFor(() => {
      const submitButton = screen.getByRole('button', { name: /CONTINUAR/ });
      expect(submitButton).not.toBeDisabled();
    });
  });

  it('should show validation error for single-word name', async () => {
    const user = userEvent.setup();
    render(<OnboardingView />, { wrapper: createWrapper() });

    const nameInput = screen.getByPlaceholderText('Alex García');
    await user.type(nameInput, 'Alex');
    await user.tab(); // trigger blur/validation

    await waitFor(() => {
      expect(screen.getByText('Ingresá nombre y apellido')).toBeInTheDocument();
    });
  });

  it('should call updateUserProfile on valid submit', async () => {
    const user = userEvent.setup();
    render(<OnboardingView />, { wrapper: createWrapper() });

    const nameInput = screen.getByPlaceholderText('Alex García');
    const dateInput = document.querySelector('input[name="birthdate"]') as HTMLInputElement;

    await user.type(nameInput, 'Alex García');
    await user.type(dateInput, '2000-01-15');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /CONTINUAR/ })).not.toBeDisabled();
    });

    await user.click(screen.getByRole('button', { name: /CONTINUAR/ }));

    await waitFor(() => {
      expect(mockUpdateUserProfile).toHaveBeenCalled();
    });

    // Verify the first argument (the profile data)
    const firstCall = mockUpdateUserProfile.mock.calls[0];
    expect(firstCall[0]).toEqual({
      name: 'Alex',
      lastName: 'García',
      birthdate: '2000-01-15',
    });
  });

  it('should not call uploadAvatar when no file is staged', async () => {
    const user = userEvent.setup();
    render(<OnboardingView />, { wrapper: createWrapper() });

    const nameInput = screen.getByPlaceholderText('Alex García');
    const dateInput = document.querySelector('input[name="birthdate"]') as HTMLInputElement;

    await user.type(nameInput, 'Alex García');
    await user.type(dateInput, '2000-01-15');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /CONTINUAR/ })).not.toBeDisabled();
    });

    await user.click(screen.getByRole('button', { name: /CONTINUAR/ }));

    await waitFor(() => {
      expect(mockUpdateUserProfile).toHaveBeenCalled();
    });

    expect(mockUploadAvatar).not.toHaveBeenCalled();
  });
});
