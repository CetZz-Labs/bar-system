import { vi, describe, it, expect, beforeEach } from 'vitest'
import BarUser from '../../models/BarUser'
import { verifyBarAccess } from '../barAccess'
import { Types } from 'mongoose'

vi.mock('../../models/BarUser', () => ({
  default: {
    findOne: vi.fn(),
  },
  BarUserRole: {
    OWNER: 'OWNER',
    WAITER: 'WAITER',
    MANAGER: 'MANAGER',
    CASHIER: 'CASHIER',
  },
}))

describe('verifyBarAccess', () => {
  beforeEach(() => {
    vi.mocked(BarUser.findOne).mockReset()
  })

  it('returns hasAccess:false when there is no BarUser membership', async () => {
    vi.mocked(BarUser.findOne).mockResolvedValue(null)

    const result = await verifyBarAccess(new Types.ObjectId().toString(), new Types.ObjectId().toString())

    expect(result).toEqual({ hasAccess: false })
  })

  it('returns hasAccess:true with the role when a BarUser membership exists', async () => {
    vi.mocked(BarUser.findOne).mockResolvedValue({ role: 'CASHIER' } as any)

    const userId = new Types.ObjectId().toString()
    const barId = new Types.ObjectId().toString()
    const result = await verifyBarAccess(userId, barId)

    expect(BarUser.findOne).toHaveBeenCalledWith({ bar: barId, user: userId })
    expect(result).toEqual({ hasAccess: true, role: 'CASHIER' })
  })
})
