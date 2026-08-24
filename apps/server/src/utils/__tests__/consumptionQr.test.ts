import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import jwt from 'jsonwebtoken'
import QRCode from 'qrcode'
import Consumption from '../../models/Consumption'
import {
  generate,
  validate,
  invalidate,
  isBlocked,
  registerFailedAttempt,
  resetAttempts,
} from '../consumptionQr'
import { Types } from 'mongoose'

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

vi.mock('../../models/Consumption', () => ({
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

describe('consumptionQr.generate', () => {
  beforeEach(() => {
    vi.mocked(jwt.sign).mockReset().mockReturnValue('signed-jwt-token' as never)
    vi.mocked(QRCode.toBuffer).mockReset().mockResolvedValue(Buffer.from('fake-png'))
    vi.mocked(Consumption.findOne).mockReset()
  })

  it('signs a JWT with the consumptionId and a 30 minute expiry', async () => {
    vi.mocked(Consumption.findOne).mockReturnValue(buildQuery(null) as any)
    const consumptionId = new Types.ObjectId().toString()

    await generate(consumptionId)

    expect(jwt.sign).toHaveBeenCalledWith(
      { consumptionId },
      process.env.JWT_SECRET,
      { expiresIn: '30m' }
    )
  })

  it('renders the signed token as a base64 PNG data URI using QRCode.toBuffer', async () => {
    vi.mocked(Consumption.findOne).mockReturnValue(buildQuery(null) as any)
    const consumptionId = new Types.ObjectId().toString()

    const result = await generate(consumptionId)

    expect(QRCode.toBuffer).toHaveBeenCalledWith('signed-jwt-token', {
      type: 'png',
      width: 512,
      margin: 2,
    })
    expect(result.qrToken).toBe('signed-jwt-token')
    expect(result.qrData).toBe(`data:image/png;base64,${Buffer.from('fake-png').toString('base64')}`)
  })

  it('returns a 6-digit numeric manual code and an expiresAt ~30 minutes ahead', async () => {
    vi.mocked(Consumption.findOne).mockReturnValue(buildQuery(null) as any)
    const consumptionId = new Types.ObjectId().toString()

    const before = Date.now()
    const result = await generate(consumptionId)
    const after = Date.now()

    expect(result.manualCode).toMatch(/^\d{6}$/)
    expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 30 * 60 * 1000 - 1000)
    expect(result.expiresAt.getTime()).toBeLessThanOrEqual(after + 30 * 60 * 1000 + 1000)
  })

  it('retries the manual code when it collides with a currently active one', async () => {
    vi.mocked(Consumption.findOne)
      .mockReturnValueOnce(buildQuery({ _id: 'existing' }) as any)
      .mockReturnValueOnce(buildQuery(null) as any)

    const result = await generate(new Types.ObjectId().toString())

    expect(Consumption.findOne).toHaveBeenCalledTimes(2)
    expect(result.manualCode).toMatch(/^\d{6}$/)
  })

  it('throws when it cannot find a unique manual code after the max retries', async () => {
    vi.mocked(Consumption.findOne).mockReturnValue(buildQuery({ _id: 'existing' }) as any)

    await expect(generate(new Types.ObjectId().toString())).rejects.toThrow(
      'No se pudo generar un código manual único después de múltiples intentos'
    )
  })
})

describe('consumptionQr.validate', () => {
  beforeEach(() => {
    vi.mocked(jwt.verify).mockReset()
    vi.mocked(Consumption.findOne).mockReset()
  })

  it('resolves via a valid signed JWT that matches the stored qrToken', async () => {
    const consumptionId = new Types.ObjectId().toString()
    vi.mocked(jwt.verify).mockReturnValue({ consumptionId } as never)
    vi.mocked(Consumption.findOne).mockReturnValue(
      buildQuery({
        _id: consumptionId,
        invalidatedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      }) as any
    )

    const result = await validate('some-jwt')

    expect(result).toEqual({ valid: true, consumptionId })
  })

  it('falls back to a manual code lookup when the token is not a valid/current JWT', async () => {
    vi.mocked(jwt.verify).mockImplementation(() => {
      throw new Error('invalid signature')
    })
    const consumptionId = new Types.ObjectId().toString()
    vi.mocked(Consumption.findOne).mockReturnValue(
      buildQuery({
        _id: consumptionId,
        invalidatedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      }) as any
    )

    const result = await validate('123456')

    expect(result).toEqual({ valid: true, consumptionId })
  })

  it('returns valid:false when nothing matches', async () => {
    vi.mocked(jwt.verify).mockImplementation(() => {
      throw new Error('invalid signature')
    })
    vi.mocked(Consumption.findOne).mockReturnValue(buildQuery(null) as any)

    const result = await validate('999999')

    expect(result.valid).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('returns valid:false when the consumption was explicitly invalidated', async () => {
    vi.mocked(jwt.verify).mockImplementation(() => {
      throw new Error('invalid signature')
    })
    vi.mocked(Consumption.findOne).mockReturnValue(
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
    vi.mocked(Consumption.findOne).mockReturnValue(
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

describe('consumptionQr.invalidate', () => {
  it('sets invalidatedAt on the given consumption', async () => {
    const consumptionId = new Types.ObjectId().toString()
    vi.mocked(Consumption.updateOne).mockResolvedValue({} as any)

    await invalidate(consumptionId)

    expect(Consumption.updateOne).toHaveBeenCalledWith(
      { _id: consumptionId },
      { invalidatedAt: expect.any(Date) }
    )
  })

  it('forwards an optional transaction session to updateOne', async () => {
    const consumptionId = new Types.ObjectId().toString()
    const session = { id: 'txn-session' } as any
    vi.mocked(Consumption.updateOne).mockResolvedValue({} as any)

    await invalidate(consumptionId, session)

    expect(Consumption.updateOne).toHaveBeenCalledWith(
      { _id: consumptionId },
      { invalidatedAt: expect.any(Date) },
      { session }
    )
  })
})

describe('consumptionQr rate limiting', () => {
  const userId = 'user-rate-limit-test'

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
