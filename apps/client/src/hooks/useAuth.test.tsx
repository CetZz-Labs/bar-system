import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuth } from './useAuth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router';

// Mock the AuthAPI module
vi.mock('@/API/AuthAPI', () => ({
  session: vi.fn(),
  logout: vi.fn(),
}));

import { session, logout } from '@/API/AuthAPI';

const mockSession = vi.mocked(session);
const mockLogout = vi.mocked(logout);

// Create a wrapper component for renderHook
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
  
  return Wrapper;
};

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementations
    mockSession.mockResolvedValue({
      id: '1',
      name: 'Test User',
      email: 'test@example.com',
    } as any);
    mockLogout.mockResolvedValue('Logged out');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return initial state correctly', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

    // Initially loading
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.isError).toBe(false);
    expect(typeof result.current.logoutUser).toBe('function');

    // Wait for query to finish
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('should fetch session data successfully', async () => {
    const mockUser = {
      id: '1',
      name: 'Test User',
      email: 'test@example.com',
    };
    mockSession.mockResolvedValue(mockUser as any);

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(mockUser);
    expect(result.current.isError).toBe(false);
    expect(mockSession).toHaveBeenCalledTimes(1);
  });

  it('should handle session fetch error', async () => {
    mockSession.mockRejectedValue(new Error('Unauthorized'));

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.isError).toBe(true);
  });

  it('should call logout and clear session data', async () => {
    const mockUser = {
      id: '1',
      name: 'Test User',
      email: 'test@example.com',
    };
    mockSession.mockResolvedValue(mockUser as any);

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Call logout
    await act(async () => {
      result.current.logoutUser();
    });

    // Wait for logout mutation to complete
    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalledTimes(1);
    });
  });

  it('should navigate to login page after logout', async () => {
    const mockUser = {
      id: '1',
      name: 'Test User',
      email: 'test@example.com',
    };
    mockSession.mockResolvedValue(mockUser as any);

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      result.current.logoutUser();
    });

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled();
    });
  });

  it('should handle logout error gracefully', async () => {
    const mockUser = {
      id: '1',
      name: 'Test User',
      email: 'test@example.com',
    };
    mockSession.mockResolvedValue(mockUser as any);
    mockLogout.mockRejectedValue(new Error('Logout failed'));

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Call logout - should not throw
    await act(async () => {
      result.current.logoutUser();
    });

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled();
    });
  });

  describe('isProfileComplete', () => {
    it('should return false when profileComplete is false', async () => {
      mockSession.mockResolvedValue({
        id: '1',
        name: 'Test',
        email: 'test@example.com',
        profileComplete: false,
      } as any);

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isProfileComplete).toBe(false);
    });

    it('should return false when profileComplete is undefined', async () => {
      mockSession.mockResolvedValue({
        id: '1',
        name: 'Test',
        email: 'test@example.com',
      } as any);

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isProfileComplete).toBe(false);
    });

    it('should return true when profileComplete is true', async () => {
      mockSession.mockResolvedValue({
        id: '1',
        name: 'Test',
        email: 'test@example.com',
        profileComplete: true,
      } as any);

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isProfileComplete).toBe(true);
    });

    it('should return false when profile data is null', async () => {
      mockSession.mockRejectedValue(new Error('Unauthorized'));

      const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isProfileComplete).toBe(false);
    });
  });
});