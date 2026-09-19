import { describe, it, expect, vi, beforeEach } from 'vitest';
import { activateCashierAccount } from './AuthAPI';

vi.mock('@/libs/axios', () => ({
  __esModule: true,
  default: {
    post: vi.fn(),
  },
}));

vi.mock('@/utils/apiError', () => ({
  throwStandardError: vi.fn((error: unknown) => {
    throw error;
  }),
}));

import api from '@/libs/axios';
import { throwStandardError } from '@/utils/apiError';

const mockApi = vi.mocked(api);
const mockThrowStandardError = vi.mocked(throwStandardError);

// LB-115: solo cubre la función nueva agregada a AuthAPI.ts
// (activateCashierAccount) — el resto de las funciones de este archivo
// queda fuera de alcance de este ticket.
describe('AuthAPI.activateCashierAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POSTs the token + new password to /auth/activate-cashier-account', async () => {
    mockApi.post.mockResolvedValueOnce({ data: 'Cuenta activada, ya podés iniciar sesión' });

    const result = await activateCashierAccount({
      token: '123456',
      password: 'newPassword123',
      confirmPassword: 'newPassword123',
    });

    expect(mockApi.post).toHaveBeenCalledWith('/auth/activate-cashier-account', {
      token: '123456',
      password: 'newPassword123',
      confirmPassword: 'newPassword123',
    });
    expect(result).toBe('Cuenta activada, ya podés iniciar sesión');
  });

  it('calls throwStandardError on failure', async () => {
    const mockError = new Error('Network error');
    mockApi.post.mockRejectedValueOnce(mockError);

    await expect(
      activateCashierAccount({ token: '123456', password: 'newPassword123', confirmPassword: 'newPassword123' })
    ).rejects.toThrow('Network error');
    expect(mockThrowStandardError).toHaveBeenCalledWith(mockError);
  });
});
