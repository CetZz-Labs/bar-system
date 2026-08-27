import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePushNotifications } from './usePushNotifications';

vi.mock('@/API/pushApi', () => ({
  subscribePush: vi.fn(),
  unsubscribePush: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { subscribePush, unsubscribePush } from '@/API/pushApi';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const mockSubscribePush = vi.mocked(subscribePush);
const mockUnsubscribePush = vi.mocked(unsubscribePush);
const mockUseAuth = vi.mocked(useAuth);

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

interface MockSub {
  endpoint: string;
  expirationTime: number | null;
  toJSON: () => { keys: { p256dh: string; auth: string } };
  unsubscribe: ReturnType<typeof vi.fn>;
}

function buildMockSubscription(): MockSub {
  return {
    endpoint: 'https://push.example/sub-1',
    expirationTime: null,
    toJSON: () => ({ keys: { p256dh: 'p256dh-value', auth: 'auth-value' } }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  };
}

let getSubscription: ReturnType<typeof vi.fn>;
let subscribe: ReturnType<typeof vi.fn>;
let requestPermission: ReturnType<typeof vi.fn>;

function installBrowserPushApis(permission: NotificationPermission = 'default') {
  getSubscription = vi.fn().mockResolvedValue(null);
  subscribe = vi.fn().mockResolvedValue(buildMockSubscription());
  requestPermission = vi.fn().mockResolvedValue('granted');

  const registration = { pushManager: { getSubscription, subscribe } };

  vi.stubGlobal('navigator', {
    ...navigator,
    userAgent: 'vitest-agent',
    serviceWorker: {
      ready: Promise.resolve(registration),
      register: vi.fn().mockResolvedValue(registration),
    },
  });
  vi.stubGlobal('PushManager', class {});
  vi.stubGlobal('Notification', { permission, requestPermission });
}

describe('usePushNotifications (LB-80)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv(
      'VITE_VAPID_PUBLIC_KEY',
      'BGSU5BBWSB_Nx8yFducuSQvS8rvzhrfkUHY69X1WmMIz-H8k7T0VeoNLgAe36VDIXtOE_Ue90af1SoKUoVVYicQ',
    );
    mockUseAuth.mockReturnValue({
      data: { _id: 'u1', name: 'Test', lastName: 'User', email: 't@e.com', isActive: true, role: 'user' },
      isError: false,
      isLoading: false,
      logoutUser: vi.fn(),
      isProfileComplete: true,
    });
    installBrowserPushApis('default');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports support and mirrors Notification.permission', async () => {
    installBrowserPushApis('granted');
    const { result } = renderHook(() => usePushNotifications(), { wrapper: createWrapper() });

    expect(result.current.supported).toBe(true);
    expect(result.current.permission).toBe('granted');
    await waitFor(() => expect(getSubscription).toHaveBeenCalled());
  });

  it('enable(): requests permission, subscribes via PushManager and POSTs the subscription', async () => {
    mockSubscribePush.mockResolvedValue({ message: 'ok' });
    const { result } = renderHook(() => usePushNotifications(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.enable();
    });

    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true }),
    );
    // React Query pasa (variables, context) al mutationFn: sólo nos importa
    // el primer argumento.
    expect(mockSubscribePush.mock.calls[0][0]).toEqual({
      endpoint: 'https://push.example/sub-1',
      keys: { p256dh: 'p256dh-value', auth: 'auth-value' },
      expirationTime: null,
      userAgent: 'vitest-agent',
    });
    expect(toast.success).toHaveBeenCalledWith('Notificaciones push activadas');
    expect(result.current.isSubscribed).toBe(true);
  });

  it('enable(): stays silent-with-toast and does not subscribe when permission is denied', async () => {
    requestPermission.mockResolvedValue('denied');
    const { result } = renderHook(() => usePushNotifications(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.enable();
    });

    expect(subscribe).not.toHaveBeenCalled();
    expect(mockSubscribePush).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
    expect(result.current.permission).toBe('denied');
  });

  it('enable(): does nothing when there is no authenticated user', async () => {
    mockUseAuth.mockReturnValue({
      data: null,
      isError: false,
      isLoading: false,
      logoutUser: vi.fn(),
      isProfileComplete: false,
    });
    const { result } = renderHook(() => usePushNotifications(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.enable();
    });

    expect(requestPermission).not.toHaveBeenCalled();
    expect(mockSubscribePush).not.toHaveBeenCalled();
  });

  it('disable(): unsubscribes on the server and in the browser', async () => {
    const sub = buildMockSubscription();
    getSubscription.mockResolvedValue(sub);
    mockUnsubscribePush.mockResolvedValue(undefined);
    const { result } = renderHook(() => usePushNotifications(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.disable();
    });

    expect(mockUnsubscribePush.mock.calls[0][0]).toBe('https://push.example/sub-1');
    expect(sub.unsubscribe).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('Notificaciones push desactivadas');
    expect(result.current.isSubscribed).toBe(false);
  });

  it('reports no support and refuses enable() when PushManager is absent', async () => {
    vi.stubGlobal('PushManager', undefined);
    const { result } = renderHook(() => usePushNotifications(), { wrapper: createWrapper() });

    expect(result.current.supported).toBe(false);

    await act(async () => {
      await result.current.enable();
    });

    expect(requestPermission).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Tu navegador no soporta notificaciones push');
  });
});
