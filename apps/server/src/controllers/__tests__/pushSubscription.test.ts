import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Types } from 'mongoose'
import { PushSubscriptionController } from '../../controllers/PushSubscriptionController'
import PushSubscription from '../../models/PushSubscription'
import User from '../../models/User'
import { buildMockRequest, buildMockResponse } from '../../__tests__/helpers/mockHelpers'
import type { Request } from 'express'

vi.mock('../../models/PushSubscription', () => ({
  default: {
    findOneAndUpdate: vi.fn(),
    deleteOne: vi.fn(),
  },
}))

vi.mock('../../models/User', () => ({
  default: {
    findByIdAndUpdate: vi.fn(),
  },
}))

const userId = new Types.ObjectId()

function reqWith(overrides: Partial<Request> = {}) {
  return buildMockRequest({
    user: { _id: userId } as never,
    get: vi.fn().mockReturnValue('Mozilla/5.0 (Test Device)') as never,
    ...overrides,
  })
}

const validSubBody = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
  expirationTime: null,
}

describe('PushSubscriptionController (LB-80)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('subscribe', () => {
    it('upserts by endpoint and responds 201', async () => {
      vi.mocked(PushSubscription.findOneAndUpdate).mockResolvedValue({} as never)
      const req = reqWith({ body: { ...validSubBody } })
      const res = buildMockResponse()

      await PushSubscriptionController.subscribe(req, res)

      expect(PushSubscription.findOneAndUpdate).toHaveBeenCalledWith(
        { endpoint: validSubBody.endpoint },
        expect.objectContaining({
          user: userId,
          endpoint: validSubBody.endpoint,
          keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
          expirationTime: null,
        }),
        expect.objectContaining({ upsert: true }),
      )
      expect(res.status).toHaveBeenCalledWith(201)
    })

    it('is idempotent: a second call with the same endpoint upserts again (no duplicate path)', async () => {
      vi.mocked(PushSubscription.findOneAndUpdate).mockResolvedValue({} as never)
      const res1 = buildMockResponse()
      const res2 = buildMockResponse()

      await PushSubscriptionController.subscribe(reqWith({ body: { ...validSubBody } }), res1)
      await PushSubscriptionController.subscribe(reqWith({ body: { ...validSubBody } }), res2)

      expect(PushSubscription.findOneAndUpdate).toHaveBeenCalledTimes(2)
      expect(PushSubscription.findOneAndUpdate).toHaveBeenNthCalledWith(
        2,
        { endpoint: validSubBody.endpoint },
        expect.any(Object),
        expect.objectContaining({ upsert: true }),
      )
      expect(res2.status).toHaveBeenCalledWith(201)
    })

    it('falls back to the User-Agent header when userAgent is not in the body', async () => {
      vi.mocked(PushSubscription.findOneAndUpdate).mockResolvedValue({} as never)
      const req = reqWith({ body: { ...validSubBody } })
      const res = buildMockResponse()

      await PushSubscriptionController.subscribe(req, res)

      expect(PushSubscription.findOneAndUpdate).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ userAgent: 'Mozilla/5.0 (Test Device)' }),
        expect.any(Object),
      )
    })
  })

  describe('unsubscribe', () => {
    it('deletes the subscription by endpoint scoped to the user and responds 204', async () => {
      vi.mocked(PushSubscription.deleteOne).mockResolvedValue({ deletedCount: 1 } as never)
      const req = reqWith({ body: { endpoint: validSubBody.endpoint } })
      const res = buildMockResponse()

      await PushSubscriptionController.unsubscribe(req, res)

      expect(PushSubscription.deleteOne).toHaveBeenCalledWith({
        endpoint: validSubBody.endpoint,
        user: userId,
      })
      expect(res.status).toHaveBeenCalledWith(204)
    })

    it('accepts the endpoint from the query string', async () => {
      vi.mocked(PushSubscription.deleteOne).mockResolvedValue({ deletedCount: 1 } as never)
      const req = reqWith({ body: {}, query: { endpoint: validSubBody.endpoint } })
      const res = buildMockResponse()

      await PushSubscriptionController.unsubscribe(req, res)

      expect(PushSubscription.deleteOne).toHaveBeenCalledWith({
        endpoint: validSubBody.endpoint,
        user: userId,
      })
    })
  })

  describe('updatePreferences', () => {
    function mockUserUpdateResolves(prefs: Record<string, boolean>) {
      vi.mocked(User.findByIdAndUpdate).mockReturnValue({
        select: vi.fn().mockResolvedValue({ notificationPreferences: prefs }),
      } as never)
    }

    it('updates salidas and consumos', async () => {
      mockUserUpdateResolves({ salidas: false, consumos: true, canjes: true })
      const req = reqWith({ body: { salidas: false, consumos: true } })
      const res = buildMockResponse()

      await PushSubscriptionController.updatePreferences(req, res)

      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        userId,
        {
          $set: {
            'notificationPreferences.canjes': true,
            'notificationPreferences.salidas': false,
            'notificationPreferences.consumos': true,
          },
        },
        { new: true },
      )
      expect(res.status).toHaveBeenCalledWith(200)
    })

    it('ignores canjes:false in the body and always forces canjes to true (no 400)', async () => {
      mockUserUpdateResolves({ salidas: true, consumos: true, canjes: true })
      const req = reqWith({ body: { canjes: false, salidas: true } })
      const res = buildMockResponse()

      await PushSubscriptionController.updatePreferences(req, res)

      const setArg = vi.mocked(User.findByIdAndUpdate).mock.calls[0][1] as {
        $set: Record<string, boolean>
      }
      expect(setArg.$set['notificationPreferences.canjes']).toBe(true)
      expect(setArg.$set).not.toHaveProperty('notificationPreferences.canjes', false)
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.status).not.toHaveBeenCalledWith(400)
    })

    it('only sets the fields that arrived as booleans', async () => {
      mockUserUpdateResolves({ salidas: true, consumos: false, canjes: true })
      const req = reqWith({ body: { consumos: false } })
      const res = buildMockResponse()

      await PushSubscriptionController.updatePreferences(req, res)

      const setArg = vi.mocked(User.findByIdAndUpdate).mock.calls[0][1] as {
        $set: Record<string, boolean>
      }
      expect(setArg.$set).toEqual({
        'notificationPreferences.canjes': true,
        'notificationPreferences.consumos': false,
      })
    })

    it('responds 404 when the user is gone', async () => {
      vi.mocked(User.findByIdAndUpdate).mockReturnValue({
        select: vi.fn().mockResolvedValue(null),
      } as never)
      const req = reqWith({ body: { salidas: true } })
      const res = buildMockResponse()

      await PushSubscriptionController.updatePreferences(req, res)

      expect(res.status).toHaveBeenCalledWith(404)
    })
  })
})
