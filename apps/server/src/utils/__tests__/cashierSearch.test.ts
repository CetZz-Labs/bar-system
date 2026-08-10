import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Types } from 'mongoose'
import {
  extractInviteCodeFromQuery,
  isDirectCodeQuery,
  searchGroupsForCashier,
  getBarName,
} from '../cashierSearch'
import Group from '../../models/Group'
import Outing from '../../models/Outing'
import Bar from '../../models/Bar'
import { getBarDayRange } from '../barDay'

vi.mock('../../models/Group', () => ({
  default: { findOne: vi.fn(), find: vi.fn() },
}))

vi.mock('../../models/Outing', () => ({
  default: { findOne: vi.fn(), find: vi.fn() },
  OutingStatus: { PENDING: 'PENDING', ACTIVE: 'ACTIVE', CANCELLED: 'CANCELLED', COMPLETED: 'COMPLETED' },
}))

vi.mock('../../models/Bar', () => ({
  default: { findById: vi.fn() },
}))

vi.mock('../barDay', () => ({
  getBarDayRange: vi.fn(),
}))

describe('extractInviteCodeFromQuery', () => {
  it('parses join URLs', () => {
    expect(extractInviteCodeFromQuery('http://localhost:5173/unirse/ab12cd')).toBe('AB12CD')
    expect(extractInviteCodeFromQuery('https://labanda.app/unirse/ZZ99AA')).toBe('ZZ99AA')
  })

  it('accepts raw 6-char codes', () => {
    expect(extractInviteCodeFromQuery('ban4k2')).toBe('BAN4K2')
  })

  it('rejects short text', () => {
    expect(extractInviteCodeFromQuery('a')).toBeNull()
    expect(isDirectCodeQuery('los')).toBe(false)
  })
})

// Query builders que replican las cadenas exactas de cashierSearch.ts
function selectLeanQuery(data: any) {
  const q: any = {}
  q.select = vi.fn().mockReturnValue(q)
  q.lean = vi.fn().mockResolvedValue(data)
  return q
}

function populatePopulateLeanQuery(data: any) {
  const q: any = {}
  q.populate = vi.fn().mockReturnValue(q)
  q.lean = vi.fn().mockResolvedValue(data)
  return q
}

function selectLimitLeanQuery(data: any) {
  const q: any = {}
  q.select = vi.fn().mockReturnValue(q)
  q.limit = vi.fn().mockReturnValue(q)
  q.lean = vi.fn().mockResolvedValue(data)
  return q
}

function populatePopulateSortLeanQuery(data: any) {
  const q: any = {}
  q.populate = vi.fn().mockReturnValue(q)
  q.sort = vi.fn().mockReturnValue(q)
  q.lean = vi.fn().mockResolvedValue(data)
  return q
}

describe('searchGroupsForCashier', () => {
  const barId = new Types.ObjectId().toString()
  const start = new Date('2026-08-10T09:00:00.000Z')
  const end = new Date('2026-08-11T09:00:00.000Z')

  beforeEach(() => {
    vi.mocked(getBarDayRange).mockReset().mockReturnValue({ start, end })
    vi.mocked(Group.findOne).mockReset()
    vi.mocked(Group.find).mockReset()
    vi.mocked(Outing.findOne).mockReset()
    vi.mocked(Outing.find).mockReset()
  })

  describe('direct code query', () => {
    it('returns empty results when no group matches the invite code', async () => {
      vi.mocked(Group.findOne).mockReturnValue(selectLeanQuery(null) as any)

      const result = await searchGroupsForCashier(barId, '06:00', 'AB12CD')

      expect(result).toEqual({ results: [] })
    })

    it('returns the outing mapped to check_in when it is PENDING at this bar', async () => {
      const groupId = new Types.ObjectId()
      const outingId = new Types.ObjectId()
      const userId = new Types.ObjectId()

      vi.mocked(Group.findOne).mockReturnValue(
        selectLeanQuery({ _id: groupId, name: 'Los Pibes', inviteCode: 'AB12CD' }) as any
      )
      vi.mocked(Outing.findOne).mockReturnValue(
        populatePopulateLeanQuery({
          _id: outingId,
          status: 'PENDING',
          scheduledFor: new Date('2026-08-10T23:00:00.000Z'),
          group: { _id: groupId, name: 'Los Pibes', inviteCode: 'AB12CD' },
          invitees: [{ _id: userId, name: 'Juan', lastName: 'Perez' }, userId],
        }) as any
      )

      const result = await searchGroupsForCashier(barId, '06:00', 'AB12CD')

      expect(result).toEqual({
        results: [
          {
            outingId: outingId.toString(),
            groupId: groupId.toString(),
            name: 'Los Pibes',
            inviteCode: 'AB12CD',
            scheduledFor: new Date('2026-08-10T23:00:00.000Z').toISOString(),
            status: 'PENDING',
            members: [{ id: userId.toString(), name: 'Juan', lastName: 'Perez' }],
            action: 'check_in',
          },
        ],
      })
    })

    it('maps ACTIVE outings to the detail action', async () => {
      const groupId = new Types.ObjectId()
      const outingId = new Types.ObjectId()

      vi.mocked(Group.findOne).mockReturnValue(
        selectLeanQuery({ _id: groupId, name: 'Los Pibes', inviteCode: 'AB12CD' }) as any
      )
      vi.mocked(Outing.findOne).mockReturnValue(
        populatePopulateLeanQuery({
          _id: outingId,
          status: 'ACTIVE',
          scheduledFor: new Date('2026-08-10T23:00:00.000Z'),
          group: { _id: groupId, name: 'Los Pibes', inviteCode: 'AB12CD' },
          invitees: [],
        }) as any
      )

      const result = await searchGroupsForCashier(barId, '06:00', 'AB12CD')

      expect('results' in result && result.results[0].action).toBe('detail')
    })

    it('returns OTHER_BAR when the group has an outing at a different bar', async () => {
      const groupId = new Types.ObjectId()

      vi.mocked(Group.findOne).mockReturnValue(
        selectLeanQuery({ _id: groupId, name: 'Los Pibes', inviteCode: 'AB12CD' }) as any
      )
      vi.mocked(Outing.findOne)
        .mockReturnValueOnce(populatePopulateLeanQuery(null) as any)
        .mockReturnValueOnce(populatePopulateLeanQuery({ bar: { name: 'Otro Bar' } }) as any)

      const result = await searchGroupsForCashier(barId, '06:00', 'AB12CD')

      expect(result).toEqual({
        code: 'OTHER_BAR',
        otherBarName: 'Otro Bar',
        message: 'Este grupo tiene salida a Otro Bar, no a este. Debe cancelar esa salida y crear una nueva a este bar.',
      })
    })

    it('falls back to a generic bar name when the populated bar has no name', async () => {
      const groupId = new Types.ObjectId()

      vi.mocked(Group.findOne).mockReturnValue(
        selectLeanQuery({ _id: groupId, name: 'Los Pibes', inviteCode: 'AB12CD' }) as any
      )
      vi.mocked(Outing.findOne)
        .mockReturnValueOnce(populatePopulateLeanQuery(null) as any)
        .mockReturnValueOnce(populatePopulateLeanQuery({ bar: null }) as any)

      const result = await searchGroupsForCashier(barId, '06:00', 'AB12CD')

      expect('otherBarName' in result && result.otherBarName).toBe('otro bar')
    })

    it('returns NO_SALIDA when the group has no outing anywhere', async () => {
      const groupId = new Types.ObjectId()

      vi.mocked(Group.findOne).mockReturnValue(
        selectLeanQuery({ _id: groupId, name: 'Los Pibes', inviteCode: 'AB12CD' }) as any
      )
      vi.mocked(Outing.findOne)
        .mockReturnValueOnce(populatePopulateLeanQuery(null) as any)
        .mockReturnValueOnce(populatePopulateLeanQuery(null) as any)

      const result = await searchGroupsForCashier(barId, '06:00', 'AB12CD')

      expect(result).toEqual({
        code: 'NO_SALIDA',
        message:
          'Este grupo no tiene salida agendada a este bar. Pedíle al líder que cree una desde su app; después vuelve a buscar.',
      })
    })
  })

  describe('text query', () => {
    it('returns empty results for queries shorter than 2 characters', async () => {
      const result = await searchGroupsForCashier(barId, '06:00', 'a')

      expect(result).toEqual({ results: [] })
      expect(Group.find).not.toHaveBeenCalled()
    })

    it('returns empty results when no group name matches', async () => {
      vi.mocked(Group.find).mockReturnValue(selectLimitLeanQuery([]) as any)

      const result = await searchGroupsForCashier(barId, '06:00', 'pibes')

      expect(result).toEqual({ results: [] })
      expect(Outing.find).not.toHaveBeenCalled()
    })

    it('returns mapped outings for matching groups, skipping unpopulated ones', async () => {
      const groupId = new Types.ObjectId()
      const outingId = new Types.ObjectId()

      vi.mocked(Group.find).mockReturnValue(selectLimitLeanQuery([{ _id: groupId }]) as any)
      vi.mocked(Outing.find).mockReturnValue(
        populatePopulateSortLeanQuery([
          {
            _id: outingId,
            status: 'PENDING',
            scheduledFor: new Date('2026-08-10T23:00:00.000Z'),
            group: { _id: groupId, name: 'Los Pibes', inviteCode: 'AB12CD' },
            invitees: [],
          },
          {
            _id: new Types.ObjectId(),
            status: 'PENDING',
            scheduledFor: new Date('2026-08-10T23:00:00.000Z'),
            group: null, // no populado -> se descarta (rama de mapOutingToResult filtrada)
            invitees: [],
          },
        ]) as any
      )

      const result = await searchGroupsForCashier(barId, '06:00', 'pibes')

      expect('results' in result && result.results).toHaveLength(1)
      expect('results' in result && result.results[0].outingId).toBe(outingId.toString())
    })

    it('escapes regex special characters in the query', async () => {
      vi.mocked(Group.find).mockReturnValue(selectLimitLeanQuery([]) as any)

      await searchGroupsForCashier(barId, '06:00', 'los.pibes+')

      expect(Group.find).toHaveBeenCalledWith({
        name: { $regex: 'los\\.pibes\\+', $options: 'i' },
      })
    })
  })
})

describe('getBarName', () => {
  it('returns the bar name when found', async () => {
    vi.mocked(Bar.findById).mockReturnValue(selectLeanQuery({ name: 'La Banda Bar' }) as any)

    await expect(getBarName(new Types.ObjectId().toString())).resolves.toBe('La Banda Bar')
  })

  it('returns null when the bar does not exist', async () => {
    vi.mocked(Bar.findById).mockReturnValue(selectLeanQuery(null) as any)

    await expect(getBarName(new Types.ObjectId().toString())).resolves.toBeNull()
  })
})
