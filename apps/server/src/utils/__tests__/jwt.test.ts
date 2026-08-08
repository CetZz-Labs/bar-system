import { vi, describe, it, expect } from 'vitest'
import jwt from 'jsonwebtoken'
import { Types } from 'mongoose'
import { generateJWT } from '../jwt'

vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn(),
  },
}))

describe('generateJWT', () => {
  it('returns a string token', () => {
    vi.mocked(jwt.sign).mockReturnValue('mock-token' as never)
    const payload = { id: new Types.ObjectId() }
    const result = generateJWT(payload)
    expect(typeof result).toBe('string')
    expect(result).toBe('mock-token')
  })

  it('calls jwt.sign with payload and JWT_SECRET', () => {
    vi.mocked(jwt.sign).mockReturnValue('token' as never)
    const mockId = new Types.ObjectId()
    const payload = { id: mockId }
    generateJWT(payload)
    expect(jwt.sign).toHaveBeenCalledWith(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: '15d' }
    )
  })

  it('sets expiresIn to 15 days', () => {
    vi.mocked(jwt.sign).mockReturnValue('token' as never)
    const payload = { id: new Types.ObjectId() }
    generateJWT(payload)
    const callArgs = vi.mocked(jwt.sign).mock.calls[0]
    expect(callArgs[2]).toEqual({ expiresIn: '15d' })
  })

  it('throws when JWT_SECRET is undefined', () => {
    const originalJWT_SECRET = process.env.JWT_SECRET
    delete process.env.JWT_SECRET
    vi.mocked(jwt.sign).mockImplementation(() => {
      throw new Error('secretOrPublicKey is not valid')
    })
    const payload = { id: new Types.ObjectId() }
    expect(() => generateJWT(payload)).toThrow()
    process.env.JWT_SECRET = originalJWT_SECRET
  })

  it('accepts an extended payload with barId and role, and a custom expiresIn', () => {
    vi.mocked(jwt.sign).mockReturnValue('cashier-token' as never)
    const mockId = new Types.ObjectId()
    const mockBarId = new Types.ObjectId()
    const payload = { id: mockId, barId: mockBarId, role: 'CASHIER' }

    const result = generateJWT(payload, '12h')

    expect(result).toBe('cashier-token')
    expect(jwt.sign).toHaveBeenCalledWith(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    )
  })
})