import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import GroupInviteSection from './GroupInviteSection';

// Mock motion/react
vi.mock('motion/react', async () => {
  const { mockMotion } = await import('@/test/mocks/motion');
  return mockMotion();
});

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

// Mock getGroupQRUrl
vi.mock('@/API/GroupAPI', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/API/GroupAPI')>();
  return {
    ...actual,
    getGroupQRUrl: vi.fn(() => 'https://api.example.com/groups/test-group/qr'),
  };
});

// Mock navigator APIs
const mockWriteText = vi.fn().mockResolvedValue(undefined);
const mockShare = vi.fn().mockResolvedValue(undefined);

Object.assign(navigator, {
  clipboard: {
    writeText: mockWriteText,
  },
  share: mockShare,
});

const defaultProps = {
  inviteCode: 'BAN4K2',
  inviteLink: 'labanda.app/unirse/BAN4K2',
  groupName: 'Los De Siempre',
  slug: 'los-de-siempre',
};

describe('GroupInviteSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders invite code and QR', () => {
    renderWithProviders(<GroupInviteSection {...defaultProps} />);

    expect(screen.getByText('BAN4K2')).toBeInTheDocument();
    expect(screen.getByAltText('QR de invitación de Los De Siempre')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /compartir link/i })).toBeInTheDocument();
  });

  it('copies code when code text is clicked', async () => {
    renderWithProviders(<GroupInviteSection {...defaultProps} />);

    const codeButton = screen.getAllByLabelText('Copiar código de invitación')[0];
    fireEvent.click(codeButton);

    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledWith('BAN4K2');
    });
  });

  it('copies code when copy button is clicked', async () => {
    renderWithProviders(<GroupInviteSection {...defaultProps} />);

    const copyButton = screen.getAllByLabelText('Copiar código de invitación')[1];
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledWith('BAN4K2');
    });
  });

  it('shares via Web Share API when available', async () => {
    renderWithProviders(<GroupInviteSection {...defaultProps} />);

    const shareButton = screen.getByRole('button', { name: /compartir link/i });
    fireEvent.click(shareButton);

    await waitFor(() => {
      expect(mockShare).toHaveBeenCalledWith({
        title: 'Únete a Los De Siempre en La Banda',
        text: '¡Unite a Los De Siempre en La Banda! Usá el código BAN4K2 o entrá por acá: https://labanda.app/unirse/BAN4K2',
      });
    });
  });

  it('copies link to clipboard when Web Share API is not available', async () => {
    const originalShare = navigator.share;
    // @ts-expect-error removing share for test
    navigator.share = undefined;

    renderWithProviders(<GroupInviteSection {...defaultProps} />);

    const shareButton = screen.getByRole('button', { name: /compartir link/i });
    fireEvent.click(shareButton);

    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledWith(
        '¡Unite a Los De Siempre en La Banda! Usá el código BAN4K2 o entrá por acá: https://labanda.app/unirse/BAN4K2'
      );
    });

    navigator.share = originalShare;
  });

  it('opens QR fullscreen when QR is clicked', () => {
    renderWithProviders(<GroupInviteSection {...defaultProps} />);

    const qrButton = screen.getByLabelText('Ver QR en pantalla completa');
    fireEvent.click(qrButton);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Los De Siempre')).toBeInTheDocument();
  });

  it('closes QR fullscreen when close button is clicked', () => {
    renderWithProviders(<GroupInviteSection {...defaultProps} />);

    const qrButton = screen.getByLabelText('Ver QR en pantalla completa');
    fireEvent.click(qrButton);

    const closeButton = screen.getByLabelText('Cerrar');
    fireEvent.click(closeButton);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
