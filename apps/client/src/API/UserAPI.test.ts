import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getUserGroups, getUserProfile, updateUserProfile, uploadAvatar } from './UserAPI';

// Mock the axios instance
vi.mock('@/libs/axios', () => ({
  __esModule: true,
  default: {
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
  },
}));

// Mock throwStandardError
vi.mock('@/utils/apiError', () => ({
  throwStandardError: vi.fn((error: unknown) => {
    throw error;
  }),
}));

import api from '@/libs/axios';
import { throwStandardError } from '@/utils/apiError';

const mockApi = vi.mocked(api);
const mockThrowStandardError = vi.mocked(throwStandardError);

describe('UserAPI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getUserProfile', () => {
    it('should return user profile data on success', async () => {
      const mockProfile = {
        _id: '1',
        name: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        isActive: true,
        role: 'user',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };
      mockApi.get.mockResolvedValueOnce({ data: mockProfile });

      const result = await getUserProfile();

      expect(mockApi.get).toHaveBeenCalledWith('/users/profile');
      expect(result).toEqual(mockProfile);
    });
  });

  describe('getUserGroups', () => {
    it('should return groups array on success', async () => {
      const mockGroups = [
        { groupId: '1', name: 'Group A', role: 'admin' as const, avatarUrl: 'https://example.com/a.jpg' },
        { groupId: '2', name: 'Group B', role: 'member' as const },
      ];
      mockApi.get.mockResolvedValueOnce({ data: mockGroups });

      const result = await getUserGroups();

      expect(mockApi.get).toHaveBeenCalledWith('/users/groups');
      expect(result).toEqual(mockGroups);
    });

    it('should call throwStandardError on failure', async () => {
      const mockError = new Error('Network error');
      mockApi.get.mockRejectedValueOnce(mockError);

      await expect(getUserGroups()).rejects.toThrow('Network error');
      expect(mockThrowStandardError).toHaveBeenCalledWith(mockError);
    });
  });

  describe('updateUserProfile', () => {
    it('should return message on success', async () => {
      mockApi.put.mockResolvedValueOnce({ data: 'Profile updated' });

      const result = await updateUserProfile({ name: 'Jane', lastName: 'Doe' });

      expect(mockApi.put).toHaveBeenCalledWith('/users/profile', { name: 'Jane', lastName: 'Doe' });
      expect(result).toBe('Profile updated');
    });
  });

  describe('uploadAvatar', () => {
    it('should return avatarUrl on success', async () => {
      mockApi.post.mockResolvedValueOnce({ data: 'https://example.com/avatar.jpg' });
      const file = new File([''], 'avatar.jpg', { type: 'image/jpeg' });

      const result = await uploadAvatar(file);

      expect(mockApi.post).toHaveBeenCalledWith(
        '/users/avatar',
        expect.any(FormData),
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      expect(result).toBe('https://example.com/avatar.jpg');
    });
  });
});
