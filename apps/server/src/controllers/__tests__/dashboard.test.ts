import { beforeEach, describe, expect, it, vi } from 'vitest'
import mongoose, { Types } from 'mongoose'
import { DashboardController } from '../DashboardController'
import Bar from '../../models/Bar'
import BarUser, { BarUserRole } from '../../models/BarUser'
import Consumption, { ConsumptionStatus } from '../../models/Consumption'
import Outing from '../../models/Outing'
import Group from '../../models/Group'
import PointsTransaction from '../../models/PointsTransaction'
import AuditLog, { AuditAction } from '../../models/AuditLog'
import * as barDashboard from '../../utils/barDashboard'
import * as pointsHub from '../../websocket/pointsHub'
import { buildMockRequest, buildMockResponse } from '../../__tests__/helpers/mockHelpers'

vi.mock('../../models/Bar', async () => {
  const actual = await vi.importActual<typeof import('../../models/Bar')>('../../models/Bar')
  return { ...actual, default: { findById: vi.fn() } }
})
vi.mock('../../models/BarUser', () => ({
  default: { findOne: vi.fn() },
  BarUserRole: { OWNER: 'OWNER', CASHIER: 'CASHIER' },
}))
vi.mock('../../models/Consumption', async () => {
  const actual = await vi.importActual<typeof import('../../models/Consumption')>('../../models/Consumption')
  return { ...actual, default: { findOne: vi.fn(), findById: vi.fn() } }
})
vi.mock('../../models/Outing', async () => {
  const actual = await vi.importActual<typeof import('../../models/Outing')>('../../models/Outing')
  return { ...actual, default: { findById: vi.fn() } }
})
vi.mock('../../models/Group', () => ({
  default: { findById: vi.fn(), findByIdAndUpdate: vi.fn() },
}))
vi.mock('../../models/PointsTransaction', async () => {
  const actual = await vi.importActual<typeof import('../../models/PointsTransaction')>('../../models/PointsTransaction')
  return { ...actual, default: { create: vi.fn() } }
})
vi.mock('../../models/AuditLog', async () => {
  const actual = await vi.importActual<typeof import('../../models/AuditLog')>('../../models/AuditLog')
  return { ...actual, default: { create: vi.fn() } }
})
vi.mock('../../utils/barDashboard', async () => {
  const actual = await vi.importActual<typeof import('../../utils/barDashboard')>('../../utils/barDashboard')
  return {
    ...actual,
    getDashboardStatCards: vi.fn(),
    getActivityTable: vi.fn(),
    getDisputesPanel: vi.fn(),
    getCashierTable: vi.fn(),
  }
})
vi.mock('../../websocket/pointsHub')

function leanQuery<T>(data: T) {
  return { select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(data) }) }
}

describe('DashboardController.getDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(barDashboard.getDashboardStatCards).mockResolvedValue({
      groupsCount: 0,
      consumptionTotalArs: 0,
      pointsAwarded: { consumption: 0, attendance: 0, total: 0 },
      redemptions: { count: 0, arsEquivalent: 0 },
    })
    vi.mocked(barDashboard.getActivityTable).mockResolvedValue([])
    vi.mocked(barDashboard.getDisputesPanel).mockResolvedValue([])
    vi.mocked(barDashboard.getCashierTable).mockResolvedValue({
      rows: [],
      totals: { checkIns: 0, consumptionArs: 0, pointsAwarded: 0, redemptionsCount: 0, redemptionsArs: 0, net: 0 },
    })
  })

  it('returns 403 when the requester is a CASHIER, not the OWNER', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.CASHIER } as any)

    const req = buildMockRequest({ user: { _id: userId } as any, params: { barId: barId.toString() }, query: {} })
    const res = buildMockResponse()

    await DashboardController.getDashboard(req, res)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(Bar.findById).not.toHaveBeenCalled()
  })

  it('returns 403 when the user has no membership in the bar', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue(null)

    const req = buildMockRequest({ user: { _id: userId } as any, params: { barId: barId.toString() }, query: {} })
    const res = buildMockResponse()

    await DashboardController.getDashboard(req, res)

    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('returns 404 when the bar does not exist', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(Bar.findById).mockReturnValue(leanQuery(null) as any)

    const req = buildMockRequest({ user: { _id: userId } as any, params: { barId: barId.toString() }, query: {} })
    const res = buildMockResponse()

    await DashboardController.getDashboard(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
  })

  it('returns 400 when a custom range exceeds 3 months', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(Bar.findById).mockReturnValue(leanQuery({ closingTime: '06:00' }) as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString() },
      query: { period: 'custom', from: '2026-01-01T00:00:00.000Z', to: '2026-06-01T00:00:00.000Z' },
    })
    const res = buildMockResponse()

    await DashboardController.getDashboard(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(barDashboard.getDashboardStatCards).not.toHaveBeenCalled()
  })

  it('resolves the OWNER + bar, forwards period/cashierId/status filters and returns the combined DTO', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const cashierId = new Types.ObjectId().toString()

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(Bar.findById).mockReturnValue(leanQuery({ closingTime: '06:00' }) as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString() },
      query: { period: 'today', cashierId, status: 'disputa' },
    })
    const res = buildMockResponse()

    await DashboardController.getDashboard(req, res)

    expect(barDashboard.getActivityTable).toHaveBeenCalledWith(
      barId.toString(),
      expect.objectContaining({ from: expect.any(Date), to: expect.any(Date) }),
      { cashierId, status: 'disputa' }
    )
    expect(barDashboard.getCashierTable).toHaveBeenCalledWith(
      barId.toString(),
      expect.objectContaining({ from: expect.any(Date), to: expect.any(Date) }),
      { cashierId, status: 'disputa' }
    )
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statCards: expect.any(Object),
        activity: [],
        disputes: [],
        cashiers: expect.any(Object),
      })
    )
  })
})

describe('DashboardController.resolveConsumptionDispute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(AuditLog.create).mockResolvedValue({} as any)
  })

  it('returns 403 when the requester is a CASHIER, not the OWNER', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const consumptionId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.CASHIER } as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString(), consumptionId: consumptionId.toString() },
      body: { outcome: 'ACCEPTED', note: 'Se verificó con el cliente' },
    })
    const res = buildMockResponse()

    await DashboardController.resolveConsumptionDispute(req, res)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(Consumption.findOne).not.toHaveBeenCalled()
  })

  it('returns 404 when the consumption does not exist for that bar (scoping, anti-crossbar)', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const consumptionId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(Consumption.findOne).mockResolvedValue(null)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString(), consumptionId: consumptionId.toString() },
      body: { outcome: 'ACCEPTED', note: 'Se verificó con el cliente' },
    })
    const res = buildMockResponse()

    await DashboardController.resolveConsumptionDispute(req, res)

    expect(Consumption.findOne).toHaveBeenCalledWith({ _id: consumptionId.toString(), bar: barId.toString() })
    expect(res.status).toHaveBeenCalledWith(404)
  })

  it('returns 409 when the consumption is not DISPUTED', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const consumptionId = new Types.ObjectId()

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(Consumption.findOne).mockResolvedValue({
      _id: consumptionId,
      status: ConsumptionStatus.CONFIRMED,
      bar: barId,
    } as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString(), consumptionId: consumptionId.toString() },
      body: { outcome: 'ACCEPTED', note: 'Se verificó con el cliente' },
    })
    const res = buildMockResponse()

    await DashboardController.resolveConsumptionDispute(req, res)

    expect(res.status).toHaveBeenCalledWith(409)
  })

  it('ACCEPTED: awards floor(amount/1000) points, credits the group and creates a PointsTransaction', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const consumptionId = new Types.ObjectId()
    const outingId = new Types.ObjectId()
    const groupId = new Types.ObjectId()

    const session = {
      startTransaction: vi.fn(),
      commitTransaction: vi.fn(),
      abortTransaction: vi.fn(),
      endSession: vi.fn(),
      inTransaction: vi.fn().mockReturnValue(false),
    }
    vi.spyOn(mongoose, 'startSession').mockResolvedValue(session as any)

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(Consumption.findOne).mockResolvedValue({
      _id: consumptionId,
      status: ConsumptionStatus.DISPUTED,
      bar: barId,
      amount: 12500,
      outing: outingId,
      pointsAwarded: undefined,
    } as any)

    const fresh = {
      _id: consumptionId,
      status: ConsumptionStatus.DISPUTED,
      amount: 12500,
      bar: barId,
      outing: outingId,
      pointsAwarded: undefined as number | undefined,
      save: vi.fn().mockResolvedValue(undefined),
    }
    vi.mocked(Consumption.findById).mockReturnValue({ session: vi.fn().mockResolvedValue(fresh) } as any)

    vi.mocked(Outing.findById).mockResolvedValue({ _id: outingId, group: groupId } as any)
    vi.mocked(Group.findByIdAndUpdate).mockResolvedValue({} as any)
    vi.mocked(PointsTransaction.create).mockResolvedValue([{}] as any)
    vi.mocked(Group.findById).mockReturnValue(leanQuery({ pointsBalance: 99 }) as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString(), consumptionId: consumptionId.toString() },
      body: { outcome: 'ACCEPTED', note: 'Se verificó con el cliente' },
    })
    const res = buildMockResponse()

    await DashboardController.resolveConsumptionDispute(req, res)

    expect(fresh.status).toBe(ConsumptionStatus.RESOLVED_BY_OWNER)
    expect(fresh.pointsAwarded).toBe(12)
    expect(fresh.save).toHaveBeenCalled()
    expect(Group.findByIdAndUpdate).toHaveBeenCalledWith(groupId, { $inc: { pointsBalance: 12 } }, { session })
    expect(PointsTransaction.create).toHaveBeenCalledWith(
      [expect.objectContaining({ amount: 12, consumption: consumptionId })],
      { session }
    )
    expect(session.commitTransaction).toHaveBeenCalled()
    expect(pointsHub.emitGroupPointsBalance).toHaveBeenCalledWith(groupId.toString(), 99)
    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.CONSUMPTION_RESOLVED_BY_OWNER })
    )
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: ConsumptionStatus.RESOLVED_BY_OWNER, resolutionOutcome: 'ACCEPTED', pointsAwarded: 12 })
    )
  })

  it('ACCEPTED: returns 409 without side effects when a concurrent request already resolved it (race check inside the transaction)', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const consumptionId = new Types.ObjectId()
    const outingId = new Types.ObjectId()

    const session = {
      startTransaction: vi.fn(),
      commitTransaction: vi.fn(),
      abortTransaction: vi.fn(),
      endSession: vi.fn(),
      inTransaction: vi.fn().mockReturnValue(false),
    }
    vi.spyOn(mongoose, 'startSession').mockResolvedValue(session as any)

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(Consumption.findOne).mockResolvedValue({
      _id: consumptionId,
      status: ConsumptionStatus.DISPUTED,
      bar: barId,
      amount: 12500,
      outing: outingId,
    } as any)
    vi.mocked(Outing.findById).mockResolvedValue({ _id: outingId, group: new Types.ObjectId() } as any)
    vi.mocked(Consumption.findById).mockReturnValue({
      session: vi.fn().mockResolvedValue({ status: ConsumptionStatus.RESOLVED_BY_OWNER }),
    } as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString(), consumptionId: consumptionId.toString() },
      body: { outcome: 'ACCEPTED', note: 'Se verificó con el cliente' },
    })
    const res = buildMockResponse()

    await DashboardController.resolveConsumptionDispute(req, res)

    expect(session.abortTransaction).toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(409)
    expect(AuditLog.create).not.toHaveBeenCalled()
    expect(PointsTransaction.create).not.toHaveBeenCalled()
  })

  it('REJECTED: does not award points nor touch the group balance, but still resolves and audits', async () => {
    const userId = new Types.ObjectId()
    const barId = new Types.ObjectId()
    const consumptionId = new Types.ObjectId()
    const outingId = new Types.ObjectId()
    const groupId = new Types.ObjectId()

    const save = vi.fn().mockResolvedValue(undefined)
    const consumption = {
      _id: consumptionId,
      status: ConsumptionStatus.DISPUTED,
      bar: barId,
      amount: 8000,
      outing: outingId,
      save,
    }

    vi.mocked(BarUser.findOne).mockResolvedValue({ role: BarUserRole.OWNER } as any)
    vi.mocked(Consumption.findOne).mockResolvedValue(consumption as any)
    vi.mocked(Outing.findById).mockResolvedValue({ _id: outingId, group: groupId } as any)

    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { barId: barId.toString(), consumptionId: consumptionId.toString() },
      body: { outcome: 'REJECTED', note: 'No corresponde el reclamo' },
    })
    const res = buildMockResponse()

    await DashboardController.resolveConsumptionDispute(req, res)

    expect(consumption.status).toBe(ConsumptionStatus.RESOLVED_BY_OWNER)
    expect(save).toHaveBeenCalled()
    expect(Group.findByIdAndUpdate).not.toHaveBeenCalled()
    expect(PointsTransaction.create).not.toHaveBeenCalled()
    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.CONSUMPTION_RESOLVED_BY_OWNER })
    )
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ status: ConsumptionStatus.RESOLVED_BY_OWNER, resolutionOutcome: 'REJECTED' })
    )
  })
})
