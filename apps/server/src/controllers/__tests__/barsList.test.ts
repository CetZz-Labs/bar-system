import { vi, describe, it, expect, beforeEach } from 'vitest'
import { Types } from 'mongoose'
import { BarController } from '../../controllers/BarController'
import Bar, { BarStatus } from '../../models/Bar'
import User from '../../models/User'
import Outing, { OutingStatus } from '../../models/Outing'
import { buildMockRequest, buildMockResponse } from '../../__tests__/helpers/mockHelpers'

// LB-79: listado de bares para explorar (GET /api/bars). Cubre el cálculo de
// `todayAttendancePoints` (sin tocar la DB por bar), `hasActiveCheckIn` sin
// N+1 (2 queries totales) y la búsqueda por nombre `?search=`.

vi.mock('../../models/Bar', () => ({
  default: {
    find: vi.fn(),
  },
  BarStatus: {
    PENDING: 'pending',
    ACTIVE: 'active',
    REJECTED: 'rejected',
  },
  ATTENDANCE_POINTS_DAY_KEYS: [
    'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
  ],
}))

vi.mock('../../models/User', () => ({
  default: {
    findById: vi.fn(),
  },
  MembershipRole: {
    ADMIN: 'ADMIN',
    MEMBER: 'MEMBER',
    LEADER: 'LEADER',
    CO_LEADER: 'CO_LEADER',
  },
}))

vi.mock('../../models/Outing', () => ({
  default: {
    find: vi.fn(),
  },
  OutingStatus: {
    PENDING: 'PENDING',
    ACTIVE: 'ACTIVE',
    CANCELLED: 'CANCELLED',
    COMPLETED: 'COMPLETED',
    NO_SHOW: 'NO_SHOW',
  },
}))

function buildSelectSortLeanQuery(data: unknown) {
  const query: Record<string, unknown> = {}
  query.select = vi.fn().mockReturnValue(query)
  query.sort = vi.fn().mockReturnValue(query)
  query.lean = vi.fn().mockResolvedValue(data)
  return query
}

function buildSelectLeanQuery(data: unknown) {
  const query: Record<string, unknown> = {}
  query.select = vi.fn().mockReturnValue(query)
  query.lean = vi.fn().mockResolvedValue(data)
  return query
}

const zeroAttendancePoints = {
  monday: 0,
  tuesday: 0,
  wednesday: 0,
  thursday: 0,
  friday: 0,
  saturday: 0,
  sunday: 0,
}

function buildMockBar(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    name: 'El Bar de Juan',
    address: {
      street: 'Av. Siempre Viva',
      number: '123',
      neighborhood: 'Centro',
      city: 'Buenos Aires',
    },
    closingTime: '06:00',
    attendancePointsByDay: { ...zeroAttendancePoints },
    ...overrides,
  }
}

beforeEach(() => {
  vi.mocked(Bar.find).mockReset()
  vi.mocked(User.findById).mockReset()
  vi.mocked(Outing.find).mockReset()
})

describe('BarController.listBars', () => {
  it('filters only ACTIVE bars, sorted by name', async () => {
    vi.mocked(Bar.find).mockReturnValue(buildSelectSortLeanQuery([]) as any)
    vi.mocked(User.findById).mockReturnValue(buildSelectLeanQuery({ memberships: [] }) as any)
    vi.mocked(Outing.find).mockReturnValue(buildSelectLeanQuery([]) as any)

    const req = buildMockRequest({ user: { _id: new Types.ObjectId() } as any, query: {} })
    const res = buildMockResponse()

    await BarController.listBars(req, res)

    expect(Bar.find).toHaveBeenCalledWith(expect.objectContaining({ status: BarStatus.ACTIVE }))
    const query = vi.mocked(Bar.find).mock.results[0].value
    expect(query.sort).toHaveBeenCalledWith({ name: 1 })
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('applies a case-insensitive partial regex on name when ?search= is present, with special chars escaped', async () => {
    vi.mocked(Bar.find).mockReturnValue(buildSelectSortLeanQuery([]) as any)
    vi.mocked(User.findById).mockReturnValue(buildSelectLeanQuery({ memberships: [] }) as any)
    vi.mocked(Outing.find).mockReturnValue(buildSelectLeanQuery([]) as any)

    const req = buildMockRequest({ user: { _id: new Types.ObjectId() } as any, query: { search: 'El (Bar)' } })
    const res = buildMockResponse()

    await BarController.listBars(req, res)

    expect(Bar.find).toHaveBeenCalledWith(
      expect.objectContaining({
        status: BarStatus.ACTIVE,
        name: { $regex: 'El \\(Bar\\)', $options: 'i' },
      })
    )
  })

  it('computes todayAttendancePoints in memory using getBarDayOfWeek, tolerating undefined attendancePointsByDay', async () => {
    const barWithPoints = buildMockBar({ attendancePointsByDay: undefined })
    vi.mocked(Bar.find).mockReturnValue(buildSelectSortLeanQuery([barWithPoints]) as any)
    vi.mocked(User.findById).mockReturnValue(buildSelectLeanQuery({ memberships: [] }) as any)
    vi.mocked(Outing.find).mockReturnValue(buildSelectLeanQuery([]) as any)

    const req = buildMockRequest({ user: { _id: new Types.ObjectId() } as any, query: {} })
    const res = buildMockResponse()

    await BarController.listBars(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith([
      expect.objectContaining({
        id: barWithPoints._id,
        name: barWithPoints.name,
        address: barWithPoints.address,
        closingTime: barWithPoints.closingTime,
        todayAttendancePoints: 0,
      }),
    ])
  })

  it('resolves hasActiveCheckIn for ALL bars with exactly 2 total queries (User + Outing), no N+1', async () => {
    const groupId = new Types.ObjectId()
    const barWithCheckIn = buildMockBar()
    const barWithoutCheckIn = buildMockBar()

    vi.mocked(Bar.find).mockReturnValue(buildSelectSortLeanQuery([barWithCheckIn, barWithoutCheckIn]) as any)
    vi.mocked(User.findById).mockReturnValue(buildSelectLeanQuery({ memberships: [{ group: groupId }] }) as any)
    vi.mocked(Outing.find).mockReturnValue(buildSelectLeanQuery([{ bar: barWithCheckIn._id }]) as any)

    const req = buildMockRequest({ user: { _id: new Types.ObjectId() } as any, query: {} })
    const res = buildMockResponse()

    await BarController.listBars(req, res)

    expect(User.findById).toHaveBeenCalledTimes(1)
    expect(Outing.find).toHaveBeenCalledTimes(1)
    expect(Outing.find).toHaveBeenCalledWith(
      expect.objectContaining({
        group: { $in: [groupId] },
        status: OutingStatus.ACTIVE,
      })
    )
    expect(res.json).toHaveBeenCalledWith([
      expect.objectContaining({ id: barWithCheckIn._id, hasActiveCheckIn: true }),
      expect.objectContaining({ id: barWithoutCheckIn._id, hasActiveCheckIn: false }),
    ])
  })
})
