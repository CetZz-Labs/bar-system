import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Types } from 'mongoose'
import { expireStaleRedemptions } from '../redemptionExpiry'
import Redemption, { RedemptionStatus } from '../../models/Redemption'
import AuditLog, { AuditAction } from '../../models/AuditLog'

// Test directo de la implementación real de expireStaleRedemptions
// (mockeando solo los modelos, no la función bajo test) — pedido explícito
// del review de LB-68, ya que redemption.test.ts mockea el módulo entero
// (`vi.mock('../../utils/redemptionExpiry', ...)`) y nunca ejercita este
// cuerpo.

vi.mock('../../models/Redemption', async () => {
  const actual = await vi.importActual<typeof import('../../models/Redemption')>(
    '../../models/Redemption'
  )
  return {
    ...actual,
    default: { find: vi.fn() },
  }
})

vi.mock('../../models/AuditLog', async () => {
  const actual = await vi.importActual<typeof import('../../models/AuditLog')>(
    '../../models/AuditLog'
  )
  return {
    ...actual,
    default: { create: vi.fn() },
  }
})

describe('expireStaleRedemptions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(AuditLog.create).mockResolvedValue([] as any)
  })

  it('flips a stale HELD redemption to EXPIRED, sets invalidatedAt and writes the audit log', async () => {
    const redemptionId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const leaderId = new Types.ObjectId()
    const outingId = new Types.ObjectId()
    const groupId = new Types.ObjectId()

    const staleRedemption = {
      _id: redemptionId,
      bar: barId,
      leader: leaderId,
      outing: outingId,
      group: groupId,
      status: RedemptionStatus.HELD,
      pointsRequiredSnapshot: 50,
      expiresAt: new Date(Date.now() - 60_000),
      invalidatedAt: null as Date | null,
      save: vi.fn().mockResolvedValue(undefined),
    }

    vi.mocked(Redemption.find).mockResolvedValue([staleRedemption] as any)

    await expireStaleRedemptions({ group: groupId.toString() })

    expect(Redemption.find).toHaveBeenCalledWith({
      group: groupId.toString(),
      status: RedemptionStatus.HELD,
      expiresAt: { $lt: expect.any(Date) },
    })
    expect(staleRedemption.status).toBe(RedemptionStatus.EXPIRED)
    expect(staleRedemption.invalidatedAt).toBeInstanceOf(Date)
    expect(staleRedemption.save).toHaveBeenCalledTimes(1)

    expect(AuditLog.create).toHaveBeenCalledWith({
      bar: barId,
      user: leaderId,
      action: AuditAction.REDEMPTION_EXPIRED,
      amount: 50,
      outing: outingId,
      group: groupId,
      redemption: redemptionId,
    })
  })

  it('does not touch a redemption that is still within its TTL', async () => {
    // Redemption.find ya filtra por expiresAt: { $lt: now } en la query, así
    // que un HELD vigente jamás forma parte del resultado devuelto por el
    // modelo — se confirma que, sobre un resultado vacío, no se llama save
    // ni se genera ningún audit log.
    vi.mocked(Redemption.find).mockResolvedValue([] as any)

    await expireStaleRedemptions({ group: new Types.ObjectId().toString() })

    expect(AuditLog.create).not.toHaveBeenCalled()
  })
})
