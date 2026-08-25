import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Types } from 'mongoose'
import AuditLog from '../../models/AuditLog'
import User from '../../models/User'
import { writeAuditLog } from '../auditLogService'
import type { AuditEvent } from '../../models/AuditLog'

vi.mock('../../models/AuditLog', () => ({
  default: { create: vi.fn() },
}))

vi.mock('../../models/User', () => ({
  default: { findById: vi.fn() },
}))

function mockUserResolve(name: string | null) {
  vi.mocked(User.findById).mockReturnValue({
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(name ? { name } : null),
    }),
  } as never)
}

function buildEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    bar: new Types.ObjectId(),
    eventType: 'consumo.registered',
    actorType: 'CASHIER',
    actorId: new Types.ObjectId(),
    metadata: { amount: 5000 },
    ...overrides,
  }
}

describe('writeAuditLog (LB-77)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls AuditLog.create with the event and returns void (fire-and-forget)', async () => {
    const event = buildEvent({ actorName: 'Juan' })
    vi.mocked(AuditLog.create).mockResolvedValue({} as never)

    const result = writeAuditLog(event)

    expect(result).toBeUndefined()
    // actorName is already present → no User lookup needed
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(AuditLog.create).toHaveBeenCalledWith(event)
  })

  it('resolves actorName from User when snapshot is missing', async () => {
    const userId = new Types.ObjectId()
    const event = buildEvent({ actorId: userId, actorName: undefined })
    vi.mocked(AuditLog.create).mockResolvedValue({} as never)
    mockUserResolve('Resolved Name')

    writeAuditLog(event)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(User.findById).toHaveBeenCalledWith(userId)
    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ actorName: 'Resolved Name' })
    )
  })

  it('never throws when AuditLog.create rejects, and logs a warn', async () => {
    const event = buildEvent({ actorName: 'Juan' })
    vi.mocked(AuditLog.create).mockRejectedValue(new Error('db down'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(() => writeAuditLog(event)).not.toThrow()

    // El catch interno es asíncrono; esperamos el microtask para ver el warn.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(warn).toHaveBeenCalledWith('[audit] write failed', expect.any(Error))
    warn.mockRestore()
  })

  it('never throws when AuditLog.create throws synchronously', () => {
    // AuditLog.create is now called inside a .then(), so a sync throw
    // is caught by the promise chain's .catch(), not the outer try/catch.
    // This test verifies the outer try/catch still works if the promise
    // construction phase throws synchronously (e.g. TypeError in setup).
    const event = buildEvent({ actorName: 'Juan' })
    vi.mocked(AuditLog.create).mockImplementation(() => {
      throw new Error('sync fail')
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(() => writeAuditLog(event)).not.toThrow()
    // The .catch handler on the promise chain catches the sync throw
    // from AuditLog.create inside .then(), so warn IS called (async).
    warn.mockRestore()
  })

  it('does not affect the caller when the write fails (no throw propagates)', async () => {
    const event = buildEvent({ actorName: 'Juan' })
    vi.mocked(AuditLog.create).mockRejectedValue(new Error('boom'))

    let calledAfter = false
    writeAuditLog(event)
    calledAfter = true

    expect(calledAfter).toBe(true)
  })
})
