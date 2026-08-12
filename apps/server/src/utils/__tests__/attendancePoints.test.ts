import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import mongoose, { Types } from 'mongoose'
import Outing from '../../models/Outing'
import Group from '../../models/Group'
import Bar from '../../models/Bar'
import PointsTransaction from '../../models/PointsTransaction'
import { awardAttendancePointsIfFirst } from '../attendancePoints'

vi.mock('../../models/Outing', () => ({
  default: {
    findById: vi.fn(),
  },
}))

vi.mock('../../models/Group', () => ({
  default: {
    updateOne: vi.fn(),
  },
}))

vi.mock('../../models/Bar', () => ({
  default: {
    findById: vi.fn(),
  },
  ATTENDANCE_POINTS_DAY_KEYS: [
    'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
  ],
}))

vi.mock('../../models/PointsTransaction', () => ({
  default: {
    create: vi.fn(),
  },
  PointsTransactionType: {
    ATTENDANCE: 'ATTENDANCE',
  },
}))

vi.mock('mongoose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('mongoose')>()
  return {
    ...actual,
    default: {
      ...actual.default,
      startSession: vi.fn(),
    },
  }
})

function buildMockSession() {
  return {
    startTransaction: vi.fn(),
    commitTransaction: vi.fn().mockResolvedValue(undefined),
    abortTransaction: vi.fn().mockResolvedValue(undefined),
    endSession: vi.fn(),
    inTransaction: vi.fn().mockReturnValue(true),
  }
}

// "now" congelado para todos los tests vía fake timers: Tue Oct 6 2026, 22:00.
// Con closingTime '06:00' (default de los mocks de Bar acá abajo), el día de
// bar de este instante es martes (índice 2, ver utils/barDay.ts).
const FAKE_NOW = new Date(2026, 9, 6, 22, 0, 0)

// Mapa `IAttendancePointsByDay` con todos los días en 0 salvo los que se
// pasen explícitamente por `overrides`.
function buildAttendanceSnapshotMap(overrides: Partial<Record<
  'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday',
  number
>> = {}) {
  return {
    sunday: 0,
    monday: 0,
    tuesday: 0,
    wednesday: 0,
    thursday: 0,
    friday: 0,
    saturday: 0,
    ...overrides,
  }
}

function buildOutingDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    group: new Types.ObjectId(),
    bar: new Types.ObjectId(),
    // Ya no se usa para resolver el monto (LB-65) — se deja con un valor
    // deliberadamente distinto del día de "now" (FAKE_NOW, martes) para que
    // los tests que dependan de `attendancePointsSnapshot.tuesday` fallen
    // ruidosamente si algún día alguien vuelve a leer `scheduledFor` acá.
    scheduledFor: new Date(2026, 9, 4, 22, 0, 0), // Sunday Oct 4 2026
    attendancePointsSnapshot: buildAttendanceSnapshotMap({ tuesday: 50 }),
    attendancePointsAwarded: false,
    save: vi.fn().mockResolvedValue(true),
    ...overrides,
  }
}

function buildBarSelectQuery(data: unknown) {
  const query: any = {}
  query.select = vi.fn().mockReturnValue(query)
  query.session = vi.fn().mockReturnValue(query)
  query.lean = vi.fn().mockResolvedValue(data)
  return query
}

describe('awardAttendancePointsIfFirst', () => {
  let mockSession: ReturnType<typeof buildMockSession>

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FAKE_NOW)

    mockSession = buildMockSession()
    vi.mocked(mongoose.startSession).mockReset().mockResolvedValue(mockSession as any)
    vi.mocked(Outing.findById).mockReset()
    vi.mocked(Group.updateOne).mockReset().mockResolvedValue({} as any)
    vi.mocked(Bar.findById).mockReset().mockReturnValue(
      buildBarSelectQuery({ name: 'Bar de Prueba', closingTime: '06:00' }) as any
    )
    vi.mocked(PointsTransaction.create).mockReset().mockResolvedValue([{}] as any)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('outing not found', () => {
    it('returns awarded:false and touches nothing else', async () => {
      vi.mocked(Outing.findById).mockReturnValue({ session: vi.fn().mockResolvedValue(null) } as any)

      const result = await awardAttendancePointsIfFirst(new Types.ObjectId().toString())

      expect(result).toEqual({ awarded: false })
      expect(Group.updateOne).not.toHaveBeenCalled()
      expect(PointsTransaction.create).not.toHaveBeenCalled()
      expect(mockSession.abortTransaction).toHaveBeenCalled()
    })
  })

  describe('idempotency', () => {
    it('does nothing (and does not duplicate) when attendancePointsAwarded is already true', async () => {
      const outing = buildOutingDoc({ attendancePointsAwarded: true })
      vi.mocked(Outing.findById).mockReturnValue({ session: vi.fn().mockResolvedValue(outing) } as any)

      const result = await awardAttendancePointsIfFirst(outing._id.toString())

      expect(result).toEqual({ awarded: false })
      expect(outing.save).not.toHaveBeenCalled()
      expect(Group.updateOne).not.toHaveBeenCalled()
      expect(PointsTransaction.create).not.toHaveBeenCalled()
      expect(mockSession.abortTransaction).toHaveBeenCalled()
      expect(mockSession.commitTransaction).not.toHaveBeenCalled()
    })

    it('a second invocation after a successful award is a no-op (no double credit)', async () => {
      const outing = buildOutingDoc({
        attendancePointsAwarded: false,
        attendancePointsSnapshot: buildAttendanceSnapshotMap({ tuesday: 20 }),
      })
      vi.mocked(Outing.findById).mockReturnValue({ session: vi.fn().mockResolvedValue(outing) } as any)

      const first = await awardAttendancePointsIfFirst(outing._id.toString())
      expect(first).toEqual({ awarded: true, amount: 20 })
      expect(Group.updateOne).toHaveBeenCalledTimes(1)

      // Simulate the flag now being persisted as true for the retrigger.
      outing.attendancePointsAwarded = true
      const second = await awardAttendancePointsIfFirst(outing._id.toString())

      expect(second).toEqual({ awarded: false })
      expect(Group.updateOne).toHaveBeenCalledTimes(1)
      expect(PointsTransaction.create).toHaveBeenCalledTimes(1)
    })
  })

  describe('zero-point snapshot', () => {
    it('marks the outing as awarded but creates no PointsTransaction and no Group increment', async () => {
      const outing = buildOutingDoc({ attendancePointsSnapshot: buildAttendanceSnapshotMap() })
      vi.mocked(Outing.findById).mockReturnValue({ session: vi.fn().mockResolvedValue(outing) } as any)

      const result = await awardAttendancePointsIfFirst(outing._id.toString())

      expect(result).toEqual({ awarded: false })
      expect(outing.attendancePointsAwarded).toBe(true)
      expect(outing.save).toHaveBeenCalledWith({ session: mockSession })
      expect(Group.updateOne).not.toHaveBeenCalled()
      expect(PointsTransaction.create).not.toHaveBeenCalled()
      expect(mockSession.commitTransaction).toHaveBeenCalled()
    })
  })

  describe('positive snapshot', () => {
    it('credits the group, marks the outing as awarded and writes a PointsTransaction with the expected label', async () => {
      const groupId = new Types.ObjectId()
      const barId = new Types.ObjectId()
      const outing = buildOutingDoc({
        group: groupId,
        bar: barId,
        attendancePointsSnapshot: buildAttendanceSnapshotMap({ tuesday: 50 }),
      })
      vi.mocked(Outing.findById).mockReturnValue({ session: vi.fn().mockResolvedValue(outing) } as any)
      vi.mocked(Bar.findById).mockReturnValue(
        buildBarSelectQuery({ name: 'Bar de Prueba', closingTime: '06:00' }) as any
      )

      const result = await awardAttendancePointsIfFirst(outing._id.toString())

      expect(result).toEqual({ awarded: true, amount: 50 })
      expect(outing.attendancePointsAwarded).toBe(true)
      expect(outing.save).toHaveBeenCalledWith({ session: mockSession })
      expect(Group.updateOne).toHaveBeenCalledWith(
        { _id: groupId },
        { $inc: { pointsBalance: 50 } },
        { session: mockSession }
      )
      expect(PointsTransaction.create).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            group: groupId,
            outing: outing._id,
            bar: barId,
            type: 'ATTENDANCE',
            amount: 50,
            label: expect.stringContaining('Asistencia — Bar de Prueba ('),
          }),
        ],
        { session: mockSession }
      )
      expect(mockSession.commitTransaction).toHaveBeenCalled()
    })

    it('falls back to a generic label when the bar cannot be found', async () => {
      const outing = buildOutingDoc({ attendancePointsSnapshot: buildAttendanceSnapshotMap({ tuesday: 10 }) })
      vi.mocked(Outing.findById).mockReturnValue({ session: vi.fn().mockResolvedValue(outing) } as any)
      vi.mocked(Bar.findById).mockReturnValue(buildBarSelectQuery(null) as any)

      await awardAttendancePointsIfFirst(outing._id.toString())

      expect(PointsTransaction.create).toHaveBeenCalledWith(
        [expect.objectContaining({ label: expect.stringContaining('Asistencia — el bar (') })],
        { session: mockSession }
      )
    })
  })

  describe('transactional rollback', () => {
    it('aborts the transaction and rethrows when Group.updateOne fails', async () => {
      const outing = buildOutingDoc({ attendancePointsSnapshot: buildAttendanceSnapshotMap({ tuesday: 30 }) })
      vi.mocked(Outing.findById).mockReturnValue({ session: vi.fn().mockResolvedValue(outing) } as any)
      vi.mocked(Group.updateOne).mockRejectedValue(new Error('DB error'))

      await expect(awardAttendancePointsIfFirst(outing._id.toString())).rejects.toThrow('DB error')

      expect(mockSession.abortTransaction).toHaveBeenCalled()
      expect(mockSession.commitTransaction).not.toHaveBeenCalled()
      expect(PointsTransaction.create).not.toHaveBeenCalled()
    })
  })

  describe('day resolution (LB-65 — resolved at invocation time from now(), not from the frozen snapshot moment)', () => {
    it('reads the amount from the day-of-bar key of now(), ignoring outing.scheduledFor entirely', async () => {
      // FAKE_NOW (set in beforeEach) is Tue Oct 6 2026, 22:00 -> bar day 'tuesday'
      // with the default closingTime '06:00'. `outing.scheduledFor` (from
      // buildOutingDoc) is deliberately a *different* day (Sunday) with a very
      // different amount on that key, to prove it's never read.
      const outing = buildOutingDoc({
        attendancePointsSnapshot: buildAttendanceSnapshotMap({ sunday: 999, tuesday: 50 }),
      })
      vi.mocked(Outing.findById).mockReturnValue({ session: vi.fn().mockResolvedValue(outing) } as any)

      const result = await awardAttendancePointsIfFirst(outing._id.toString())

      expect(result).toEqual({ awarded: true, amount: 50 })
      expect(Group.updateOne).toHaveBeenCalledWith(
        expect.anything(),
        { $inc: { pointsBalance: 50 } },
        expect.anything()
      )
    })

    it('re-resolves the day if the wall-clock day changes between two otherwise-identical outings', async () => {
      // Same bar (closingTime '06:00'), same snapshot map, but the two
      // invocations happen on different bar-days.
      const snapshot = buildAttendanceSnapshotMap({ monday: 15, tuesday: 50 })

      vi.setSystemTime(new Date(2026, 9, 6, 22, 0, 0)) // Tue Oct 6 2026, 22:00 -> 'tuesday'
      const tuesdayOuting = buildOutingDoc({ attendancePointsSnapshot: snapshot })
      vi.mocked(Outing.findById).mockReturnValue({ session: vi.fn().mockResolvedValue(tuesdayOuting) } as any)
      const tuesdayResult = await awardAttendancePointsIfFirst(tuesdayOuting._id.toString())
      expect(tuesdayResult).toEqual({ awarded: true, amount: 50 })

      vi.setSystemTime(new Date(2026, 9, 5, 22, 0, 0)) // Mon Oct 5 2026, 22:00 -> 'monday'
      const mondayOuting = buildOutingDoc({ attendancePointsSnapshot: snapshot })
      vi.mocked(Outing.findById).mockReturnValue({ session: vi.fn().mockResolvedValue(mondayOuting) } as any)
      const mondayResult = await awardAttendancePointsIfFirst(mondayOuting._id.toString())
      expect(mondayResult).toEqual({ awarded: true, amount: 15 })
    })
  })
})
