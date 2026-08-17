import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Types } from 'mongoose'
import { getAvailableStock } from '../redemptionAvailability'
import Redemption from '../../models/Redemption'

// getAvailableStock no tenía ningún test que ejercitara la implementación
// real (solo se probaba indirectamente y mockeada en redemption.test.ts) —
// pedido explícito del review de LB-68. getAvailablePointsForBar ya está
// cubierta sin mock por groupRewards.test.ts (LB-72), no se duplica acá.

vi.mock('../../models/Redemption', async () => {
  const actual = await vi.importActual<typeof import('../../models/Redemption')>(
    '../../models/Redemption'
  )
  return {
    ...actual,
    default: { countDocuments: vi.fn() },
  }
})

function buildCountQuery(value: number) {
  const query: any = Promise.resolve(value)
  query.session = vi.fn().mockReturnValue(query)
  return query
}

describe('getAvailableStock', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null without querying held counts when the reward has unlimited stock', async () => {
    const reward = { _id: new Types.ObjectId(), unlimitedStock: true, stock: 0 }

    const result = await getAvailableStock(reward)

    expect(result).toBeNull()
    expect(Redemption.countDocuments).not.toHaveBeenCalled()
  })

  it('subtracts the currently HELD (non-expired) count from the reward stock', async () => {
    const rewardId = new Types.ObjectId()
    const reward = { _id: rewardId, unlimitedStock: false, stock: 10 }
    vi.mocked(Redemption.countDocuments).mockReturnValue(buildCountQuery(3))

    const result = await getAvailableStock(reward)

    expect(Redemption.countDocuments).toHaveBeenCalledWith({
      reward: rewardId,
      status: 'HELD',
      expiresAt: { $gt: expect.any(Date) },
    })
    expect(result).toBe(7)
  })

  it('treats a missing stock value as 0', async () => {
    const reward = { _id: new Types.ObjectId(), unlimitedStock: false, stock: undefined as unknown as number }
    vi.mocked(Redemption.countDocuments).mockReturnValue(buildCountQuery(0))

    const result = await getAvailableStock(reward)

    expect(result).toBe(0)
  })

  it('scopes the held-count query to the given session when provided', async () => {
    const reward = { _id: new Types.ObjectId(), unlimitedStock: false, stock: 5 }
    const query = buildCountQuery(1)
    vi.mocked(Redemption.countDocuments).mockReturnValue(query)
    const session = { id: 'fake-session' } as any

    await getAvailableStock(reward, session)

    expect(query.session).toHaveBeenCalledWith(session)
  })
})
