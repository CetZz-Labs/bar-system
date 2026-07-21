import { describe, it, expect, vi, beforeEach } from 'vitest';
import { throwStandardError, toastApiError } from './apiError';

// Mock axios
vi.mock('axios', () => ({
  isAxiosError: vi.fn(),
}));

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}));

import { isAxiosError } from 'axios';
import { toast } from 'sonner';

describe('throwStandardError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw validation error when axios error has errors array', () => {
    const mockError = {
      response: {
        data: {
          errors: [
            { path: 'email', msg: 'Email is required' },
            { path: 'password', msg: 'Password is too short' },
          ],
        },
      },
    };

    (isAxiosError as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);

    expect(() => throwStandardError(mockError)).toThrowError();
    try {
      throwStandardError(mockError);
    } catch (error) {
      expect(error).toEqual({
        type: 'validation',
        details: mockError.response.data.errors,
      });
    }
  });

  it('should throw server error when axios error has message', () => {
    const mockError = {
      response: {
        data: {
          message: 'Internal server error',
        },
      },
    };

    (isAxiosError as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);

    try {
      throwStandardError(mockError);
    } catch (error) {
      expect(error).toEqual({
        type: 'server',
        message: 'Internal server error',
      });
    }
  });

  it('should throw unknown error for non-axios errors', () => {
    const mockError = new Error('Network error');

    (isAxiosError as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);

    try {
      throwStandardError(mockError);
    } catch (error) {
      expect(error).toEqual({
        type: 'unknown',
        message: 'Ocurrió un error inesperado al conectar con el servidor.',
      });
    }
  });

  it('should throw unknown error when axios error has no response', () => {
    const mockError = {};

    (isAxiosError as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);

    try {
      throwStandardError(mockError);
    } catch (error) {
      expect(error).toEqual({
        type: 'unknown',
        message: 'Ocurrió un error inesperado al conectar con el servidor.',
      });
    }
  });
});

describe('toastApiError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show toast for each validation error', () => {
    const apiError = {
      type: 'validation',
      details: [
        { path: 'email', msg: 'Email is required' },
        { path: 'password', msg: 'Password is too short' },
      ],
    };

    toastApiError(apiError);

    expect(toast.error).toHaveBeenCalledTimes(2);
    expect(toast.error).toHaveBeenCalledWith('Email is required');
    expect(toast.error).toHaveBeenCalledWith('Password is too short');
  });

  it('should show toast for server error', () => {
    const apiError = {
      type: 'server',
      message: 'Internal server error',
    };

    toastApiError(apiError);

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith('Internal server error');
  });

  it('should show toast for unknown error', () => {
    const apiError = {
      type: 'unknown',
      message: 'Something went wrong',
    };

    toastApiError(apiError);

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith('Something went wrong');
  });

  it('should show fallback toast for invalid error format', () => {
    const invalidError = { invalid: true };

    toastApiError(invalidError);

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith('Ocurrió un error inesperado.');
  });
});