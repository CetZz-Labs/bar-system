import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import jwt from 'jsonwebtoken'
import QRCode from 'qrcode'
import Redemption from '../../models/Redemption'
import {
  generate,
  validate,
  invalidate,
  isBlocked,
  registerFailedAttempt,
  resetAttempts,
} from '../redemptionQr'
import { Types } from 'mongoose'

// Precedente exacto: apps/server/src/utils/__tests__/consumptionQr.test.ts
// (LB-60), calcado contra redemptionQr.ts (LB-68) — mismo contrato,
// mismo Map de rate limiting propio (no compartido con consumptionQr.ts).

vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn(),
    verify: vi.fn(),
  },
}))

vi.mock('qrcode', () => ({
  default: {
    toBuffer: vi.fn(),
  },
}))

vi.mock('../../models/Redemption', () => ({
  default: {
    findOne: vi.fn(),
    updateOne: vi.fn(),
  },
}))

function buildQuery(data: any) {
  const query: any = {}
  query.select = vi.fn().mockReturnValue(query)
  query.lean = vi.fn().mockResolvedValue(data)
  return query
}

describe('redemptionQr.generate', () => {
  beforeEach(() => {
    vi.mocked(jwt.sign).mockReset().mockReturnValue('signed-jwt-token' as never)
    vi.mocked(QRCode.toBuffer).mockReset().mockResolvedValue(Buffer.from('fake-png'))
    vi.mocked(Redemption.findOne).mockReset()
  })

  it('signs a JWT with the redemptionId and a 20 minute expiry', async () => {
    vi.mocked(Redemption.findOne).mockReturnValue(buildQuery(null) as any)
    const redemptionId = new Types.ObjectId().toString()

    await generate(redemptionId)

    expect(jwt.sign).toHaveBeenCalledWith(
      { redemptionId },
      process.env.JWT_SECRET,
      { expiresIn: '20m' }
    )
  })

  it('renders the signed token as a base64 PNG data URI using QRCode.toBuffer', async () => {
    vi.mocked(Redemption.findOne).mockReturnValue(buildQuery(null) as any)
    const redemptionId = new Types.ObjectId().toString()

    const result = await generate(redemptionId)

    expect(QRCode.toBuffer).toHaveBeenCalledWith('signed-jwt-token', {
      type: 'png',
      width: 512,
      margin: 2,
    })
    expect(result.qrToken).toBe('signed-jwt-token')
    expect(result.qrData).toBe(`data:image/png;base64,${Buffer.from('fake-png').toString('base64')}`)
  })

  it('returns a 6-digit numeric manual code and an expiresAt ~20 minutes ahead', async () => {
    vi.mocked(Redemption.findOne).mockReturnValue(buildQuery(null) as any)
    const redemptionId = new Types.ObjectId().toString()

    const before = Date.now()
    const result = await generate(redemptionId)
    const after = Date.now()

    expect(result.manualCode).toMatch(/^\d{6}$/)
    expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 20 * 60 * 1000 - 1000)
    expect(result.expiresAt.getTime()).toBeLessThanOrEqual(after + 20 * 60 * 1000 + 1000)
  })

  it('retries the manual code when it collides with a currently active one', async () => {
    vi.mocked(Redemption.findOne)
      .mockReturnValueOnce(buildQuery({ _id: 'existing' }) as any)
      .mockReturnValueOnce(buildQuery(null) as any)

    const result = await generate(new Types.ObjectId().toString())

    expect(Redemption.findOne).toHaveBeenCalledTimes(2)
    expect(result.manualCode).toMatch(/^\d{6}$/)
  })

  it('throws when it cannot find a unique manual code after the max retries', async () => {
    vi.mocked(Redemption.findOne).mockReturnValue(buildQuery({ _id: 'existing' }) as any)

    await expect(generate(new Types.ObjectId().toString())).rejects.toThrow(
      'No se pudo generar un código manual único después de múltiples intentos'
    )
  })
})

describe('redemptionQr.validate', () => {
  beforeEach(() => {
    vi.mocked(jwt.verify).mockReset()
    vi.mocked(Redemption.findOne).mockReset()
  })

  it('resolves via a valid signed JWT that matches the stored qrToken', async () => {
    const redemptionId = new Types.ObjectId().toString()
    vi.mocked(jwt.verify).mockReturnValue({ redemptionId } as never)
    vi.mocked(Redemption.findOne).mockReturnValue(
      buildQuery({
        _id: redemptionId,
        invalidatedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      }) as any
    )

    const result = await validate('some-jwt')

    expect(result).toEqual({ valid: true, redemptionId })
  })

  it('falls back to a manual code lookup when the token is not a valid/current JWT', async () => {
    vi.mocked(jwt.verify).mockImplementation(() => {
      throw new Error('invalid signature')
    })
    const redemptionId = new Types.ObjectId().toString()
    vi.mocked(Redemption.findOne).mockReturnValue(
      buildQuery({
        _id: redemptionId,
        invalidatedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      }) as any
    )

    const result = await validate('123456')

    expect(result).toEqual({ valid: true, redemptionId })
  })

  it('returns valid:false when nothing matches', async () => {
    vi.mocked(jwt.verify).mockImplementation(() => {
      throw new Error('invalid signature')
    })
    vi.mocked(Redemption.findOne).mockReturnValue(buildQuery(null) as any)

    const result = await validate('999999')

    expect(result.valid).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('returns valid:false when the redemption was explicitly invalidated', async () => {
    vi.mocked(jwt.verify).mockImplementation(() => {
      throw new Error('invalid signature')
    })
    vi.mocked(Redemption.findOne).mockReturnValue(
      buildQuery({
        _id: 'id',
        invalidatedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      }) as any
    )

    const result = await validate('123456')

    expect(result).toEqual({ valid: false, error: expect.stringContaining('ya no es válido') })
  })

  it('returns valid:false when the code/token expired', async () => {
    vi.mocked(jwt.verify).mockImplementation(() => {
      throw new Error('invalid signature')
    })
    vi.mocked(Redemption.findOne).mockReturnValue(
      buildQuery({
        _id: 'id',
        invalidatedAt: null,
        expiresAt: new Date(Date.now() - 60_000),
      }) as any
    )

    const result = await validate('123456')

    expect(result).toEqual({ valid: false, error: expect.stringContaining('expiró') })
  })
})

describe('redemptionQr.invalidate', () => {
  it('sets invalidatedAt on the given redemption', async () => {
    const redemptionId = new Types.ObjectId().toString()
    vi.mocked(Redemption.updateOne).mockResolvedValue({} as any)

    await invalidate(redemptionId)

    expect(Redemption.updateOne).toHaveBeenCalledWith(
      { _id: redemptionId },
      { invalidatedAt: expect.any(Date) }
    )
  })

  it('forwards an optional transaction session to updateOne', async () => {
    const redemptionId = new Types.ObjectId().toString()
    const session = { id: 'txn-session' } as any
    vi.mocked(Redemption.updateOne).mockResolvedValue({} as any)

    await invalidate(redemptionId, session)

    expect(Redemption.updateOne).toHaveBeenCalledWith(
      { _id: redemptionId },
      { invalidatedAt: expect.any(Date) },
      { session }
    )
  })
})

describe('redemptionQr rate limiting', () => {
  const userId = 'user-rate-limit-test-redemption'

  afterEach(() => {
    vi.useRealTimers()
    resetAttempts(userId)
  })

  it('is not blocked before reaching the failed attempt threshold', () => {
    resetAttempts(userId)
    for (let i = 0; i < 4; i++) registerFailedAttempt(userId)
    expect(isBlocked(userId)).toBe(false)
  })

  it('blocks the user after 5 consecutive failed attempts', () => {
    resetAttempts(userId)
    for (let i = 0; i < 5; i++) registerFailedAttempt(userId)
    expect(isBlocked(userId)).toBe(true)
  })

  it('unblocks the user automatically after the 10 minute window elapses', () => {
    vi.useFakeTimers()
    resetAttempts(userId)
    for (let i = 0; i < 5; i++) registerFailedAttempt(userId)
    expect(isBlocked(userId)).toBe(true)

    vi.advanceTimersByTime(10 * 60 * 1000 + 1)

    expect(isBlocked(userId)).toBe(false)
  })

  it('resetAttempts clears the counter for a user', () => {
    resetAttempts(userId)
    for (let i = 0; i < 5; i++) registerFailedAttempt(userId)
    expect(isBlocked(userId)).toBe(true)

    resetAttempts(userId)

    expect(isBlocked(userId)).toBe(false)
  })
})
