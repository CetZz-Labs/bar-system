import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Types } from 'mongoose'
import type { PushPayload } from '../pushService'

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}))

vi.mock('../../models/PushSubscription', () => ({
  default: {
    find: vi.fn(),
    deleteOne: vi.fn(),
  },
}))

vi.mock('../../models/User', () => ({
  default: {
    find: vi.fn(),
  },
}))

// La entrega real es fire-and-forget (`void deliver(...)`): hay varios
// `await` encadenados (User.find -> PushSubscription.find -> Promise.all),
// así que hay que dejar drenar la microtask queue antes de assertar.
async function flush() {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

function subDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    user: new Types.ObjectId(),
    endpoint: `https://push.example/${Math.random()}`,
    keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
    expirationTime: null,
    ...overrides,
  }
}

function mockUserFindReturns(ids: Types.ObjectId[]) {
  return {
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(ids.map((id) => ({ _id: id }))),
    }),
  }
}

function mockSubFindReturns(docs: ReturnType<typeof subDoc>[]) {
  return { lean: vi.fn().mockResolvedValue(docs) }
}

async function setup() {
  const webpush = (await import('web-push')).default
  const PushSubscription = (await import('../../models/PushSubscription')).default
  const User = (await import('../../models/User')).default
  const { sendPushToUsers } = await import('../pushService')
  return { webpush, PushSubscription, User, sendPushToUsers }
}

const basePayload: PushPayload = {
  category: 'salidas',
  title: 'Check-in confirmado',
  body: 'Se confirmó el check-in de la salida del grupo',
  relatedOuting: 'outing-1',
}

describe('sendPushToUsers (LB-80)', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    process.env.VAPID_SUBJECT = 'mailto:dev@labanda.local'
    process.env.VAPID_PUBLIC_KEY = 'test-public-key'
    process.env.VAPID_PRIVATE_KEY = 'test-private-key'
  })

  it('is a no-op (no throw, no webpush call) when userIds is empty', async () => {
    const { webpush, sendPushToUsers } = await setup()

    expect(() => sendPushToUsers([], basePayload)).not.toThrow()
    await flush()

    expect(webpush.setVapidDetails).not.toHaveBeenCalled()
    expect(webpush.sendNotification).not.toHaveBeenCalled()
  })

  it('warns and no-ops when VAPID env vars are missing (does not throw, does not send)', async () => {
    delete process.env.VAPID_PRIVATE_KEY
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { webpush, sendPushToUsers } = await setup()

    expect(() => sendPushToUsers([new Types.ObjectId()], basePayload)).not.toThrow()
    await flush()

    expect(webpush.setVapidDetails).not.toHaveBeenCalled()
    expect(webpush.sendNotification).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(
      '[push] VAPID env vars missing — push notifications disabled',
    )
  })

  it('configures VAPID once and sends the JSON payload to every subscription of eligible users', async () => {
    const { webpush, PushSubscription, User, sendPushToUsers } = await setup()
    const userId = new Types.ObjectId()
    const subA = subDoc({ user: userId })
    const subB = subDoc({ user: userId })

    vi.mocked(User.find).mockReturnValue(mockUserFindReturns([userId]) as never)
    vi.mocked(PushSubscription.find).mockReturnValue(mockSubFindReturns([subA, subB]) as never)
    vi.mocked(webpush.sendNotification).mockResolvedValue({} as never)

    sendPushToUsers([userId], basePayload)
    await flush()

    expect(webpush.setVapidDetails).toHaveBeenCalledTimes(1)
    expect(webpush.setVapidDetails).toHaveBeenCalledWith(
      'mailto:dev@labanda.local',
      'test-public-key',
      'test-private-key',
    )
    expect(webpush.sendNotification).toHaveBeenCalledTimes(2)
    const [, payloadArg] = vi.mocked(webpush.sendNotification).mock.calls[0]
    expect(JSON.parse(payloadArg as string)).toEqual(basePayload)
  })

  it('filters out users whose notificationPreferences[category] is false', async () => {
    const { webpush, PushSubscription, User, sendPushToUsers } = await setup()
    const optedIn = new Types.ObjectId()
    const optedOut = new Types.ObjectId()

    // El query de User sólo devuelve al opted-in.
    vi.mocked(User.find).mockReturnValue(mockUserFindReturns([optedIn]) as never)
    vi.mocked(PushSubscription.find).mockReturnValue(
      mockSubFindReturns([subDoc({ user: optedIn })]) as never,
    )
    vi.mocked(webpush.sendNotification).mockResolvedValue({} as never)

    sendPushToUsers([optedIn, optedOut], { ...basePayload, category: 'consumos' })
    await flush()

    expect(User.find).toHaveBeenCalledWith(
      expect.objectContaining({
        'notificationPreferences.consumos': { $ne: false },
      }),
    )
    expect(PushSubscription.find).toHaveBeenCalledWith({ user: { $in: [optedIn.toString()] } })
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1)
  })

  it('ignores preferences entirely for the "canjes" category (never queries User)', async () => {
    const { webpush, PushSubscription, User, sendPushToUsers } = await setup()
    const userId = new Types.ObjectId()

    vi.mocked(PushSubscription.find).mockReturnValue(
      mockSubFindReturns([subDoc({ user: userId })]) as never,
    )
    vi.mocked(webpush.sendNotification).mockResolvedValue({} as never)

    sendPushToUsers([userId], { ...basePayload, category: 'canjes' })
    await flush()

    expect(User.find).not.toHaveBeenCalled()
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1)
  })

  it.each([404, 410])('deletes the subscription when the push endpoint returns %i', async (status) => {
    const { webpush, PushSubscription, User, sendPushToUsers } = await setup()
    const userId = new Types.ObjectId()
    const dead = subDoc({ user: userId })

    vi.mocked(User.find).mockReturnValue(mockUserFindReturns([userId]) as never)
    vi.mocked(PushSubscription.find).mockReturnValue(mockSubFindReturns([dead]) as never)
    vi.mocked(PushSubscription.deleteOne).mockResolvedValue({} as never)
    vi.mocked(webpush.sendNotification).mockRejectedValue(
      Object.assign(new Error('gone'), { statusCode: status }),
    )

    sendPushToUsers([userId], basePayload)
    await flush()

    expect(PushSubscription.deleteOne).toHaveBeenCalledWith({ _id: dead._id })
  })

  it('warns but does not delete the subscription on a non-404/410 send error', async () => {
    const { webpush, PushSubscription, User, sendPushToUsers } = await setup()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const userId = new Types.ObjectId()

    vi.mocked(User.find).mockReturnValue(mockUserFindReturns([userId]) as never)
    vi.mocked(PushSubscription.find).mockReturnValue(
      mockSubFindReturns([subDoc({ user: userId })]) as never,
    )
    vi.mocked(webpush.sendNotification).mockRejectedValue(new Error('network blip'))

    sendPushToUsers([userId], basePayload)
    await flush()

    expect(PushSubscription.deleteOne).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith('[push] sendNotification failed', expect.any(Error))
  })

  it('never throws and warns when the delivery pipeline rejects', async () => {
    const { User, sendPushToUsers } = await setup()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    vi.mocked(User.find).mockImplementation(() => {
      throw new Error('mongo down')
    })

    let reachedNextLine = false
    expect(() => sendPushToUsers([new Types.ObjectId()], basePayload)).not.toThrow()
    reachedNextLine = true
    await flush()

    expect(reachedNextLine).toBe(true)
    expect(warn).toHaveBeenCalledWith('[push] delivery failed', expect.any(Error))
  })

  it('does nothing when no subscriptions exist for the eligible users', async () => {
    const { webpush, PushSubscription, User, sendPushToUsers } = await setup()
    const userId = new Types.ObjectId()

    vi.mocked(User.find).mockReturnValue(mockUserFindReturns([userId]) as never)
    vi.mocked(PushSubscription.find).mockReturnValue(mockSubFindReturns([]) as never)

    sendPushToUsers([userId], basePayload)
    await flush()

    expect(webpush.sendNotification).not.toHaveBeenCalled()
  })

  it('de-duplicates repeated user ids before querying subscriptions', async () => {
    const { webpush, PushSubscription, User, sendPushToUsers } = await setup()
    const userId = new Types.ObjectId()

    vi.mocked(User.find).mockReturnValue(mockUserFindReturns([userId]) as never)
    vi.mocked(PushSubscription.find).mockReturnValue(
      mockSubFindReturns([subDoc({ user: userId })]) as never,
    )
    vi.mocked(webpush.sendNotification).mockResolvedValue({} as never)

    sendPushToUsers([userId, userId, userId], basePayload)
    await flush()

    const userQuery = vi.mocked(User.find).mock.calls[0][0] as { _id: { $in: string[] } }
    expect(userQuery._id.$in).toEqual([userId.toString()])
  })
})
