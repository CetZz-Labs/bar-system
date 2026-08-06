import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCashierAuth } from './useCashierAuth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';

// Mock the CashierAPI module
vi.mock('@/API/CashierAPI', () => ({
  cashierSession: vi.fn(),
  cashierLogout: vi.fn(),
}));

import { cashierSession, cashierLogout } from '@/API/CashierAPI';

const mockCashierSession = vi.mocked(cashierSession);
const mockCashierLogout = vi.mocked(cashierLogout);

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
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );

  return Wrapper;
};

describe('useCashierAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCashierSession.mockResolvedValue({
      role: 'CASHIER',
      bar: { id: 'bar-1', name: 'Bar Test', closingTime: '06:00' },
      shift: { startedAt: '2026-08-06T20:00:00.000Z' },
      user: { name: 'Test', lastName: 'Cashier' },
    } as any);
    mockCashierLogout.mockResolvedValue('Turno cerrado' as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return initial loading state', async () => {
    const { result } = renderHook(() => useCashierAuth('bar-1'), { wrapper: createWrapper() });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.isError).toBe(false);
    expect(typeof result.current.logoutCashier).toBe('function');

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('should fetch cashier session data successfully', async () => {
    const mockSession = {
      role: 'OWNER',
      bar: { id: 'bar-1', name: 'Bar Test', closingTime: '06:00' },
      shift: { startedAt: '2026-08-06T20:00:00.000Z' },
      user: { name: 'Test', lastName: 'Owner' },
    };
    mockCashierSession.mockResolvedValue(mockSession as any);

    const { result } = renderHook(() => useCashierAuth('bar-1'), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(mockSession);
    expect(result.current.isError).toBe(false);
    expect(mockCashierSession).toHaveBeenCalledTimes(1);
  });

  it('should handle invalid/expired session (401) gracefully', async () => {
    mockCashierSession.mockRejectedValue({ type: 'server', message: 'No autorizado', status: 401 });

    const { result } = renderHook(() => useCashierAuth('bar-1'), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.isError).toBe(true);
  });

  it('should call logout and clear cashier session data', async () => {
    const { result } = renderHook(() => useCashierAuth('bar-1'), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      result.current.logoutCashier();
    });

    await waitFor(() => {
      expect(mockCashierLogout).toHaveBeenCalledTimes(1);
    });
  });

  it('should handle logout error gracefully without throwing', async () => {
    mockCashierLogout.mockRejectedValue(new Error('Logout failed'));

    const { result } = renderHook(() => useCashierAuth('bar-1'), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      result.current.logoutCashier();
    });

    await waitFor(() => {
      expect(mockCashierLogout).toHaveBeenCalled();
    });
  });
});
