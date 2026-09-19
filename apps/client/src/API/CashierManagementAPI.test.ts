import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getBarCashiers, createCashier, updateCashier } from './CashierManagementAPI';

vi.mock('@/libs/axios', () => ({
  __esModule: true,
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
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

describe('CashierManagementAPI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getBarCashiers', () => {
    it('GETs the cashiers of the bar', async () => {
      const mockCashiers = [{ id: 'cu-1' }];
      mockApi.get.mockResolvedValueOnce({ data: mockCashiers });

      const result = await getBarCashiers('bar-1');

      expect(mockApi.get).toHaveBeenCalledWith('/bars/bar-1/cashiers');
      expect(result).toEqual(mockCashiers);
    });

    it('calls throwStandardError on failure', async () => {
      const mockError = new Error('Network error');
      mockApi.get.mockRejectedValueOnce(mockError);

      await expect(getBarCashiers('bar-1')).rejects.toThrow('Network error');
      expect(mockThrowStandardError).toHaveBeenCalledWith(mockError);
    });
  });

  describe('createCashier', () => {
    it('POSTs the new cashier payload', async () => {
      const body = { name: 'Juan', lastName: 'Perez', email: 'juan@example.com' };
      mockApi.post.mockResolvedValueOnce({ data: { id: 'cu-1' } });

      const result = await createCashier('bar-1', body);

      expect(mockApi.post).toHaveBeenCalledWith('/bars/bar-1/cashiers', body);
      expect(result).toEqual({ id: 'cu-1' });
    });
  });

  describe('updateCashier', () => {
    it('PUTs the isActive toggle', async () => {
      mockApi.put.mockResolvedValueOnce({ data: { id: 'cu-1', isActive: false } });

      const result = await updateCashier('bar-1', 'cu-1', { isActive: false });

      expect(mockApi.put).toHaveBeenCalledWith('/bars/bar-1/cashiers/cu-1', { isActive: false });
      expect(result).toEqual({ id: 'cu-1', isActive: false });
    });
  });
});
