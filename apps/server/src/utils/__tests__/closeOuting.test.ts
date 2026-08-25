import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Types } from 'mongoose'
import mongoose from 'mongoose'
import { closeOuting } from '../closeOuting'
import Outing, { ClosureReason, OutingStatus } from '../../models/Outing'
import Consumption, { ConsumptionStatus } from '../../models/Consumption'
import PointsTransaction from '../../models/PointsTransaction'
import Redemption, { RedemptionStatus } from '../../models/Redemption'
import Group from '../../models/Group'
import Bar from '../../models/Bar'
import Notification from '../../models/Notification'
import { writeAuditLog } from '../auditLogService'
import * as consumptionQr from '../consumptionQr'
import * as redemptionQr from '../redemptionQr'

vi.mock('../../models/Outing', async () => {
  const actual = await vi.importActual<typeof import('../../models/Outing')>('../../models/Outing')
  return {
    ...actual,
    default: { findById: vi.fn(), find: vi.fn() },
  }
})
vi.mock('../../models/Consumption', async () => {
  const actual = await vi.importActual<typeof import('../../models/Consumption')>(
    '../../models/Consumption'
  )
  return {
    ...actual,
    default: { find: vi.fn() },
  }
})
vi.mock('../../models/PointsTransaction', () => ({
  default: { find: vi.fn() },
}))
vi.mock('../../models/Redemption', async () => {
  const actual = await vi.importActual<typeof import('../../models/Redemption')>('../../models/Redemption')
  return {
    ...actual,
    default: { find: vi.fn() },
  }
})
vi.mock('../../models/Group', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../models/Group')>()
  return {
    ...actual,
    default: { findById: vi.fn() },
  }
})
vi.mock('../../models/Bar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../models/Bar')>()
  return {
    ...actual,
    default: { findById: vi.fn() },
  }
})
vi.mock('../../models/Notification', async () => {
  const actual = await vi.importActual<typeof import('../../models/Notification')>(
    '../../models/Notification'
  )
  return {
    ...actual,
    default: { insertMany: vi.fn() },
  }
})
vi.mock('../auditLogService', () => ({
  writeAuditLog: vi.fn(),
}))
vi.mock('../consumptionQr', () => ({
  invalidate: vi.fn(),
}))
vi.mock('../redemptionQr', () => ({
  invalidate: vi.fn(),
}))

describe('closeOuting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(PointsTransaction.find).mockReturnValue({
      session: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
    } as any)
    // Sin canjes HELD pendientes por default; los tests que sí los ejercitan
    // sobreescriben este mock puntualmente.
    vi.mocked(Redemption.find).mockReturnValue({
      session: vi.fn().mockResolvedValue([]),
    } as any)
    vi.mocked(Notification.insertMany).mockResolvedValue([] as any)
    vi.mocked(writeAuditLog).mockReset()
    vi.mocked(consumptionQr.invalidate).mockResolvedValue(undefined)
    vi.mocked(redemptionQr.invalidate).mockResolvedValue(undefined)
  })

  it('is idempotent when already COMPLETED with summary', async () => {
    const summary = {
      checkInCount: 1,
      confirmedCount: 1,
      totalAmount: 5000,
      pointsAwarded: 5,
      redemptionCount: 0,
      abandonedCount: 0,
      disputedCount: 0,
      closedAt: new Date(),
    }
    const outing = {
      _id: new Types.ObjectId(),
      status: OutingStatus.COMPLETED,
      summary,
    }
    vi.mocked(Outing.findById).mockResolvedValue(outing as any)

    const result = await closeOuting(outing._id.toString(), {
      reason: ClosureReason.MANUAL,
      actorUserId: new Types.ObjectId(),
    })

    expect(result?.alreadyClosed).toBe(true)
    expect(result?.summary).toEqual(summary)
  })

  it('closes ACTIVE as COMPLETED, abandons pending/disputed and notifies', async () => {
    const session = {
      startTransaction: vi.fn(),
      commitTransaction: vi.fn(),
      abortTransaction: vi.fn(),
      endSession: vi.fn(),
      inTransaction: vi.fn().mockReturnValue(false),
    }
    vi.spyOn(mongoose, 'startSession').mockResolvedValue(session as any)

    const outingId = new Types.ObjectId()
    const groupId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const actorId = new Types.ObjectId()
    const save = vi.fn().mockResolvedValue(undefined)

    const pending = {
      _id: new Types.ObjectId(),
      status: ConsumptionStatus.PENDING_LEADER_CONFIRMATION,
      save,
    }
    const disputed = {
      _id: new Types.ObjectId(),
      status: ConsumptionStatus.DISPUTED,
      save,
    }

    const fresh = {
      _id: outingId,
      group: groupId,
      bar: barId,
      status: OutingStatus.ACTIVE,
      checkedInAt: new Date('2026-08-12T22:00:00Z'),
      save,
    }

    vi.mocked(Outing.findById)
      .mockResolvedValueOnce({
        _id: outingId,
        status: OutingStatus.ACTIVE,
        group: groupId,
        bar: barId,
        checkedInAt: fresh.checkedInAt,
      } as any)
      .mockReturnValueOnce({
        session: vi.fn().mockResolvedValue(fresh),
      } as any)

    vi.mocked(Consumption.find)
      .mockReturnValueOnce({
        session: vi.fn().mockResolvedValue([pending, disputed]),
      } as any)
      .mockReturnValueOnce({
        session: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([{ amount: 12_000, pointsAwarded: 12 }]),
        }),
      } as any)

    vi.mocked(Group.findById).mockReturnValue({
      select: vi.fn().mockReturnValue({
        session: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue({
            memberships: [{ user: actorId }],
          }),
        }),
      }),
    } as any)

    vi.mocked(Bar.findById).mockReturnValue({
      select: vi.fn().mockReturnValue({
        session: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue({ name: 'El bar' }),
        }),
      }),
    } as any)

    const result = await closeOuting(outingId.toString(), {
      reason: ClosureReason.MANUAL,
      closedBy: actorId,
      actorUserId: actorId,
    })

    expect(result?.alreadyClosed).toBe(false)
    expect(fresh.status).toBe(OutingStatus.COMPLETED)
    expect(pending.status).toBe(ConsumptionStatus.ABANDONED)
    expect(disputed.status).toBe(ConsumptionStatus.ABANDONED)
    expect(result?.summary.abandonedCount).toBe(2)
    expect(result?.summary.disputedCount).toBe(1)
    expect(result?.summary.confirmedCount).toBe(1)
    expect(Notification.insertMany).toHaveBeenCalled()
    expect(consumptionQr.invalidate).toHaveBeenCalledTimes(2)
    expect(consumptionQr.invalidate).toHaveBeenCalledWith(pending._id.toString(), session)
    expect(session.commitTransaction).toHaveBeenCalled()
  })

  it('abandons HELD redemptions of the outing when closing (LB-68, segunda pasada)', async () => {
    const session = {
      startTransaction: vi.fn(),
      commitTransaction: vi.fn(),
      abortTransaction: vi.fn(),
      endSession: vi.fn(),
      inTransaction: vi.fn().mockReturnValue(false),
    }
    vi.spyOn(mongoose, 'startSession').mockResolvedValue(session as any)

    const outingId = new Types.ObjectId()
    const groupId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const actorId = new Types.ObjectId()
    const save = vi.fn().mockResolvedValue(undefined)

    const heldRedemption = {
      _id: new Types.ObjectId(),
      status: RedemptionStatus.HELD,
      invalidatedAt: null as Date | null,
      save,
    }

    const fresh = {
      _id: outingId,
      group: groupId,
      bar: barId,
      status: OutingStatus.ACTIVE,
      checkedInAt: new Date('2026-08-12T22:00:00Z'),
      save,
    }

    vi.mocked(Outing.findById)
      .mockResolvedValueOnce({
        _id: outingId,
        status: OutingStatus.ACTIVE,
        group: groupId,
        bar: barId,
        checkedInAt: fresh.checkedInAt,
      } as any)
      .mockReturnValueOnce({
        session: vi.fn().mockResolvedValue(fresh),
      } as any)

    vi.mocked(Consumption.find)
      .mockReturnValueOnce({ session: vi.fn().mockResolvedValue([]) } as any)
      .mockReturnValueOnce({
        session: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
      } as any)

    vi.mocked(Redemption.find).mockReturnValue({
      session: vi.fn().mockResolvedValue([heldRedemption]),
    } as any)

    const result = await closeOuting(outingId.toString(), {
      reason: ClosureReason.MANUAL,
      closedBy: actorId,
      actorUserId: actorId,
    })

    expect(result?.alreadyClosed).toBe(false)
    expect(Redemption.find).toHaveBeenCalledWith(
      expect.objectContaining({ outing: outingId, status: RedemptionStatus.HELD })
    )
    expect(heldRedemption.status).toBe(RedemptionStatus.ABANDONED)
    expect(heldRedemption.invalidatedAt).not.toBeNull()
    expect(redemptionQr.invalidate).toHaveBeenCalledWith(heldRedemption._id.toString(), session)
    expect(session.commitTransaction).toHaveBeenCalled()
  })

  it('closes PENDING as NO_SHOW without group notification when no confirmed consumptions', async () => {
    const session = {
      startTransaction: vi.fn(),
      commitTransaction: vi.fn(),
      abortTransaction: vi.fn(),
      endSession: vi.fn(),
      inTransaction: vi.fn().mockReturnValue(false),
    }
    vi.spyOn(mongoose, 'startSession').mockResolvedValue(session as any)

    const outingId = new Types.ObjectId()
    const save = vi.fn().mockResolvedValue(undefined)
    const fresh = {
      _id: outingId,
      group: new Types.ObjectId(),
      bar: new Types.ObjectId(),
      status: OutingStatus.PENDING,
      save,
    }

    vi.mocked(Outing.findById)
      .mockResolvedValueOnce({ _id: outingId, status: OutingStatus.PENDING } as any)
      .mockReturnValueOnce({ session: vi.fn().mockResolvedValue(fresh) } as any)

    vi.mocked(Consumption.find)
      .mockReturnValueOnce({ session: vi.fn().mockResolvedValue([]) } as any)
      .mockReturnValueOnce({
        session: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
      } as any)

    const result = await closeOuting(outingId.toString(), {
      reason: ClosureReason.BAR_CLOSED,
      actorUserId: new Types.ObjectId(),
    })

    expect(fresh.status).toBe(OutingStatus.NO_SHOW)
    expect(result?.summary.confirmedCount).toBe(0)
    expect(Notification.insertMany).not.toHaveBeenCalled()
  })

  it('commits the transaction when abandoning consumptions AND HELD redemptions together (no NoSuchTransaction 251)', async () => {
    const session = {
      startTransaction: vi.fn(),
      commitTransaction: vi.fn(),
      abortTransaction: vi.fn(),
      endSession: vi.fn(),
      inTransaction: vi.fn().mockReturnValue(false),
    }
    vi.spyOn(mongoose, 'startSession').mockResolvedValue(session as any)

    const outingId = new Types.ObjectId()
    const groupId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const actorId = new Types.ObjectId()
    const save = vi.fn().mockResolvedValue(undefined)

    const pending = {
      _id: new Types.ObjectId(),
      status: ConsumptionStatus.PENDING_LEADER_CONFIRMATION,
      save,
    }
    const disputed = {
      _id: new Types.ObjectId(),
      status: ConsumptionStatus.DISPUTED,
      save,
    }
    const heldRedemption = {
      _id: new Types.ObjectId(),
      status: RedemptionStatus.HELD,
      invalidatedAt: null as Date | null,
      save,
    }

    const fresh = {
      _id: outingId,
      group: groupId,
      bar: barId,
      status: OutingStatus.ACTIVE,
      checkedInAt: new Date('2026-08-12T22:00:00Z'),
      save,
    }

    vi.mocked(Outing.findById)
      .mockResolvedValueOnce({
        _id: outingId,
        status: OutingStatus.ACTIVE,
        group: groupId,
        bar: barId,
        checkedInAt: fresh.checkedInAt,
      } as any)
      .mockReturnValueOnce({
        session: vi.fn().mockResolvedValue(fresh),
      } as any)

    vi.mocked(Consumption.find)
      .mockReturnValueOnce({
        session: vi.fn().mockResolvedValue([pending, disputed]),
      } as any)
      .mockReturnValueOnce({
        session: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue([{ amount: 12_000, pointsAwarded: 12 }]),
        }),
      } as any)

    vi.mocked(Redemption.find).mockReturnValue({
      session: vi.fn().mockResolvedValue([heldRedemption]),
    } as any)

    vi.mocked(Group.findById).mockReturnValue({
      select: vi.fn().mockReturnValue({
        session: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue({
            memberships: [{ user: actorId }],
          }),
        }),
      }),
    } as any)

    vi.mocked(Bar.findById).mockReturnValue({
      select: vi.fn().mockReturnValue({
        session: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue({ name: 'El bar' }),
        }),
      }),
    } as any)

    await expect(
      closeOuting(outingId.toString(), {
        reason: ClosureReason.MANUAL,
        closedBy: actorId,
        actorUserId: actorId,
      })
    ).resolves.toBeDefined()

    expect(fresh.status).toBe(OutingStatus.COMPLETED)
    expect(pending.status).toBe(ConsumptionStatus.ABANDONED)
    expect(disputed.status).toBe(ConsumptionStatus.ABANDONED)
    expect(heldRedemption.status).toBe(RedemptionStatus.ABANDONED)
    expect(consumptionQr.invalidate).toHaveBeenCalledTimes(2)
    expect(consumptionQr.invalidate).toHaveBeenCalledWith(pending._id.toString(), session)
    expect(redemptionQr.invalidate).toHaveBeenCalledWith(heldRedemption._id.toString(), session)
    expect(session.abortTransaction).not.toHaveBeenCalled()
    expect(session.commitTransaction).toHaveBeenCalled()
  })
})
