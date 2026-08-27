import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import PushNotificationsSection from './PushNotificationsSection';
import type { PushPreferences } from '@/types/push';

vi.mock('@/hooks/usePushNotifications', () => ({
  usePushNotifications: vi.fn(),
}));

vi.mock('@/API/pushApi', () => ({
  updatePushPreferences: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { usePushNotifications } from '@/hooks/usePushNotifications';
import { updatePushPreferences } from '@/API/pushApi';

const mockUsePush = vi.mocked(usePushNotifications);
const mockUpdatePrefs = vi.mocked(updatePushPreferences);

const enable = vi.fn();
const disable = vi.fn();

function pushState(overrides: Partial<ReturnType<typeof usePushNotifications>> = {}) {
  return {
    supported: true,
    permission: 'default' as NotificationPermission,
    isSubscribed: false,
    enable,
    disable,
    isBusy: false,
    ...overrides,
  };
}

const allOn: PushPreferences = { salidas: true, consumos: true, canjes: true };

describe('PushNotificationsSection (LB-80)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePush.mockReturnValue(pushState());
    mockUpdatePrefs.mockResolvedValue(allOn);
  });

  it('renders the three category rows with canjes disabled and non-desactivable copy', () => {
    renderWithProviders(<PushNotificationsSection preferences={allOn} />);

    expect(screen.getByRole('switch', { name: 'Salidas' })).toBeEnabled();
    expect(screen.getByRole('switch', { name: 'Consumos' })).toBeEnabled();

    const canjes = screen.getByRole('switch', { name: 'Canjes' });
    expect(canjes).toBeDisabled();
    expect(canjes).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/no se puede desactivar/i)).toBeInTheDocument();
  });

  it('calls updatePushPreferences when an editable toggle is flipped', async () => {
    renderWithProviders(<PushNotificationsSection preferences={allOn} />);

    await userEvent.click(screen.getByRole('switch', { name: 'Salidas' }));

    await waitFor(() => {
      expect(mockUpdatePrefs).toHaveBeenCalled();
    });
    expect(mockUpdatePrefs.mock.calls[0][0]).toEqual({ salidas: false });
  });

  it('does not call updatePushPreferences when the canjes toggle is clicked', async () => {
    renderWithProviders(<PushNotificationsSection preferences={allOn} />);

    await userEvent.click(screen.getByRole('switch', { name: 'Canjes' }));

    expect(mockUpdatePrefs).not.toHaveBeenCalled();
  });

  it('activates push from the enable button when not subscribed', async () => {
    renderWithProviders(<PushNotificationsSection preferences={allOn} />);

    await userEvent.click(screen.getByRole('button', { name: 'Activar' }));

    expect(enable).toHaveBeenCalledTimes(1);
    expect(disable).not.toHaveBeenCalled();
  });

  it('deactivates push from the button when already subscribed', async () => {
    mockUsePush.mockReturnValue(pushState({ isSubscribed: true }));
    renderWithProviders(<PushNotificationsSection preferences={allOn} />);

    await userEvent.click(screen.getByRole('button', { name: 'Desactivar' }));

    expect(disable).toHaveBeenCalledTimes(1);
  });

  it('shows a blocked-permission hint when permission is denied', () => {
    mockUsePush.mockReturnValue(pushState({ permission: 'denied' }));
    renderWithProviders(<PushNotificationsSection preferences={allOn} />);

    expect(screen.getByText(/bloqueaste las notificaciones/i)).toBeInTheDocument();
  });

  it('renders a fallback when push is not supported', () => {
    mockUsePush.mockReturnValue(pushState({ supported: false }));
    renderWithProviders(<PushNotificationsSection preferences={allOn} />);

    expect(screen.getByText(/no soporta notificaciones push/i)).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: 'Salidas' })).not.toBeInTheDocument();
  });

  it('defaults missing preferences to all-on', () => {
    renderWithProviders(<PushNotificationsSection />);

    expect(screen.getByRole('switch', { name: 'Salidas' })).toHaveAttribute('aria-checked', 'true');
  });
});
