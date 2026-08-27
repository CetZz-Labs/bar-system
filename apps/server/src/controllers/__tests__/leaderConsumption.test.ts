import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LeaderConsumptionController } from '../LeaderConsumptionController'
import Consumption, { ConsumptionStatus } from '../../models/Consumption'
import Outing, { OutingStatus } from '../../models/Outing'
import Group from '../../models/Group'
import Bar from '../../models/Bar'
import Notification from '../../models/Notification'
import PointsTransaction from '../../models/PointsTransaction'
import { writeAuditLog } from '../../utils/auditLogService'
import { sendPushToUsers } from '../../utils/pushService'
import * as consumptionQr from '../../utils/consumptionQr'
import * as attendancePoints from '../../utils/attendancePoints'
import * as pointsHub from '../../websocket/pointsHub'
import { MembershipRole } from '../../models/User'
import mongoose from 'mongoose'

vi.mock('../../models/Consumption')
vi.mock('../../models/Outing')
vi.mock('../../models/Group')
vi.mock('../../models/Bar')
vi.mock('../../models/Notification')
vi.mock('../../utils/auditLogService', () => ({ writeAuditLog: vi.fn() }))
vi.mock('../../utils/pushService', () => ({ sendPushToUsers: vi.fn() }))
vi.mock('../../models/PointsTransaction')
vi.mock('../../utils/consumptionQr')
vi.mock('../../utils/attendancePoints')
vi.mock('../../websocket/pointsHub')

function mockRes() {
  const res: any = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res
}

function mockGroupMemberships(memberships: Array<{ user: string; role: MembershipRole }>) {
  return {
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue({ memberships }),
    }),
  }
}

describe('LeaderConsumptionController', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(consumptionQr.isBlocked).mockReturnValue(false)
    vi.mocked(consumptionQr.resetAttempts).mockImplementation(() => {})
    vi.mocked(consumptionQr.registerFailedAttempt).mockImplementation(() => {})
    vi.mocked(pointsHub.emitGroupPointsBalance).mockImplementation(() => {})
    vi.mocked(attendancePoints.awardAttendancePointsIfFirst).mockResolvedValue({ awarded: false })
    vi.mocked(writeAuditLog).mockReset()
    vi.mocked(Notification.insertMany).mockResolvedValue([] as any)
  })

  describe('lookup', () => {
    it('returns 403 for non owner with código inválido', async () => {
      vi.mocked(consumptionQr.validate).mockResolvedValue({
        valid: true,
        consumptionId: 'c1',
      })
      vi.mocked(Consumption.findById).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'c1',
          status: ConsumptionStatus.PENDING_LEADER_CONFIRMATION,
          outing: 'o1',
          bar: 'b1',
          amount: 5000,
          rejectCount: 0,
          createdAt: new Date(),
        }),
      } as any)
      vi.mocked(Outing.findById).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'o1',
          status: OutingStatus.ACTIVE,
          group: 'g1',
        }),
      } as any)
      vi.mocked(Group.findById).mockReturnValue(
        mockGroupMemberships([{ user: 'other', role: MembershipRole.MEMBER }]) as any
      )

      const req: any = { user: { _id: 'u1' }, body: { tokenOrCode: '123456' } }
      const res = mockRes()
      await LeaderConsumptionController.lookup(req, res)

      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.json).toHaveBeenCalledWith({ message: 'código inválido' })
      expect(consumptionQr.registerFailedAttempt).toHaveBeenCalledWith('u1')
    })

    it('returns preview for leader', async () => {
      vi.mocked(consumptionQr.validate).mockResolvedValue({
        valid: true,
        consumptionId: 'c1',
      })
      vi.mocked(Consumption.findById).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'c1',
          status: ConsumptionStatus.PENDING_LEADER_CONFIRMATION,
          outing: 'o1',
          bar: 'b1',
          amount: 12500,
          breakdown: [{ category: 'Birra', quantity: 2, subtotal: 12500 }],
          rejectCount: 0,
          createdAt: new Date('2026-08-12T22:00:00Z'),
        }),
      } as any)
      vi.mocked(Outing.findById).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'o1',
          status: OutingStatus.ACTIVE,
          group: 'g1',
        }),
      } as any)
      vi.mocked(Group.findById).mockReturnValue(
        mockGroupMemberships([{ user: 'u1', role: MembershipRole.LEADER }]) as any
      )
      vi.mocked(Bar.findById).mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue({ name: 'El bar de La Banda' }),
        }),
      } as any)

      const req: any = { user: { _id: 'u1' }, body: { tokenOrCode: '123456' } }
      const res = mockRes()
      await LeaderConsumptionController.lookup(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          consumptionId: 'c1',
          amount: 12500,
          bar: { id: 'b1', name: 'El bar de La Banda' },
        })
      )
    })
  })

  describe('reject', () => {
    it('moves to DISPUTED on 4th reject and notifies leaders', async () => {
      const save = vi.fn().mockResolvedValue(undefined)
      vi.mocked(Consumption.findById).mockResolvedValue({
        _id: 'c1',
        status: ConsumptionStatus.PENDING_LEADER_CONFIRMATION,
        rejectCount: 3,
        amount: 5000,
        bar: 'b1',
        outing: 'o1',
        save,
      } as any)
      vi.mocked(Outing.findById).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'o1',
          group: 'g1',
        }),
      } as any)
      vi.mocked(Group.findById).mockReturnValue(
        mockGroupMemberships([
          { user: 'u1', role: MembershipRole.LEADER },
          { user: 'u2', role: MembershipRole.CO_LEADER },
        ]) as any
      )
      vi.mocked(consumptionQr.invalidate).mockResolvedValue(undefined)

      const req: any = { user: { _id: 'u1' }, params: { consumptionId: 'c1' }, ip: '1.1.1.1' }
      const res = mockRes()
      await LeaderConsumptionController.reject(req, res)

      expect(save).toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: ConsumptionStatus.DISPUTED, rejectCount: 4 })
      )
      expect(Notification.insertMany).toHaveBeenCalled()

      // LB-80: push "consumos" a los mismos LEADER/CO_LEADER de la
      // notificación in-app.
      expect(sendPushToUsers).toHaveBeenCalledTimes(1)
      const [recipients, payload] = vi.mocked(sendPushToUsers).mock.calls[0]
      expect((recipients as any[]).map((r) => r.toString())).toEqual(['u1', 'u2'])
      expect(payload).toEqual(
        expect.objectContaining({ category: 'consumos', relatedOuting: 'o1' })
      )
    })

    it('LB-80: does not push on a simple reject that stays below the dispute threshold', async () => {
      const save = vi.fn().mockResolvedValue(undefined)
      vi.mocked(Consumption.findById).mockResolvedValue({
        _id: 'c1',
        status: ConsumptionStatus.PENDING_LEADER_CONFIRMATION,
        rejectCount: 0,
        amount: 5000,
        bar: 'b1',
        outing: 'o1',
        save,
      } as any)
      vi.mocked(Outing.findById).mockReturnValue({
        lean: vi.fn().mockResolvedValue({ _id: 'o1', group: 'g1' }),
      } as any)
      vi.mocked(Group.findById).mockReturnValue(
        mockGroupMemberships([{ user: 'u1', role: MembershipRole.LEADER }]) as any
      )
      vi.mocked(consumptionQr.invalidate).mockResolvedValue(undefined)

      const req: any = { user: { _id: 'u1' }, params: { consumptionId: 'c1' }, ip: '1.1.1.1' }
      const res = mockRes()
      await LeaderConsumptionController.reject(req, res)

      expect(sendPushToUsers).not.toHaveBeenCalled()
    })
  })

  describe('accept', () => {
    it('awards floor(amount/1000) points and emits websocket', async () => {
      const session = {
        startTransaction: vi.fn(),
        commitTransaction: vi.fn(),
        abortTransaction: vi.fn(),
        endSession: vi.fn(),
      }
      vi.spyOn(mongoose, 'startSession').mockResolvedValue(session as any)

      const save = vi.fn().mockResolvedValue(undefined)
      const fresh = {
        _id: 'c1',
        status: ConsumptionStatus.PENDING_LEADER_CONFIRMATION,
        amount: 12500,
        bar: 'b1',
        outing: 'o1',
        save,
      }

      vi.mocked(Consumption.findById)
        .mockResolvedValueOnce({
          _id: 'c1',
          status: ConsumptionStatus.PENDING_LEADER_CONFIRMATION,
          amount: 12500,
          bar: 'b1',
          outing: 'o1',
        } as any)
        .mockReturnValueOnce({
          session: vi.fn().mockResolvedValue(fresh),
        } as any)

      vi.mocked(Outing.findById).mockResolvedValue({
        _id: 'o1',
        status: OutingStatus.ACTIVE,
        group: 'g1',
      } as any)

      vi.mocked(Group.findById)
        .mockReturnValueOnce(
          mockGroupMemberships([{ user: 'u1', role: MembershipRole.LEADER }]) as any
        )
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            lean: vi.fn().mockResolvedValue({ pointsBalance: 42 }),
          }),
        } as any)

      vi.mocked(Group.findByIdAndUpdate).mockReturnValue({
        select: vi.fn().mockResolvedValue({ pointsBalance: 12 }),
      } as any)

      vi.mocked(PointsTransaction.create).mockResolvedValue([{}] as any)

      const req: any = { user: { _id: 'u1' }, params: { consumptionId: 'c1' }, ip: '1.1.1.1' }
      const res = mockRes()
      await LeaderConsumptionController.accept(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ConsumptionStatus.CONFIRMED,
          pointsAwarded: 12,
          pointsBalance: 42,
        })
      )
      expect(attendancePoints.awardAttendancePointsIfFirst).toHaveBeenCalledWith('o1')
      expect(pointsHub.emitGroupPointsBalance).toHaveBeenCalledWith('g1', 42)
      expect(PointsTransaction.create).toHaveBeenCalled()
    })
  })
})
