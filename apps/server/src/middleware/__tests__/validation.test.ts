import { vi, describe, it, expect, beforeEach } from 'vitest'
import { handleInputErrors } from '../validation'
import { buildMockRequest, buildMockResponse, buildMockNext } from '../../__tests__/helpers/mockHelpers'
import { validationResult } from 'express-validator'

vi.mock('express-validator', () => ({
  validationResult: vi.fn(),
}))

describe('handleInputErrors', () => {
  beforeEach(() => {
    vi.mocked(validationResult).mockReset()
  })

  describe('when no errors', () => {
    it('calls next()', () => {
      vi.mocked(validationResult).mockReturnValue({
        isEmpty: () => true,
        array: () => [],
      } as any)
      const req = buildMockRequest()
      const res = buildMockResponse()
      const next = buildMockNext()

      handleInputErrors(req, res, next)
      expect(next).toHaveBeenCalled()
    })

    it('does not send response', () => {
      vi.mocked(validationResult).mockReturnValue({
        isEmpty: () => true,
        array: () => [],
      } as any)
      const req = buildMockRequest()
      const res = buildMockResponse()
      const next = buildMockNext()

      handleInputErrors(req, res, next)
      expect(res.status).not.toHaveBeenCalled()
    })
  })

  describe('when errors exist', () => {
    it('returns 400 with errors array', () => {
      const mockErrors = [{ msg: 'Invalid email', path: 'email' }]
      vi.mocked(validationResult).mockReturnValue({
        isEmpty: () => false,
        array: () => mockErrors,
      } as any)
      const req = buildMockRequest()
      const res = buildMockResponse()
      const next = buildMockNext()

      handleInputErrors(req, res, next)
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({ errors: mockErrors })
    })

    it('does not call next()', () => {
      vi.mocked(validationResult).mockReturnValue({
        isEmpty: () => false,
        array: () => [{ msg: 'Error' }],
      } as any)
      const req = buildMockRequest()
      const res = buildMockResponse()
      const next = buildMockNext()

      handleInputErrors(req, res, next)
      expect(next).not.toHaveBeenCalled()
    })
  })

  describe('when errors array is empty', () => {
    it('calls next()', () => {
      vi.mocked(validationResult).mockReturnValue({
        isEmpty: () => true,
        array: () => [],
      } as any)
      const req = buildMockRequest()
      const res = buildMockResponse()
      const next = buildMockNext()

      handleInputErrors(req, res, next)
      expect(next).toHaveBeenCalled()
    })
  })
})