import { describe, it, expect } from 'vitest'
import { Types } from 'mongoose'
import PushSubscription from '../../models/PushSubscription'

// Validación local (validateSync, sin DB) del schema de PushSubscription
// (LB-80), mismo enfoque que Reward.test.ts / AuditLog.test.ts: no hay
// mongodb-memory-server en el repo, así que el índice único de `endpoint` se
// verifica a nivel de configuración de schema, no contra una base real.

function buildDoc(overrides: Record<string, unknown> = {}) {
  return new PushSubscription({
    user: new Types.ObjectId(),
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
    keys: { p256dh: 'BPa...key', auth: 'auth-secret' },
    ...overrides,
  })
}

describe('PushSubscription model (LB-80)', () => {
  it('is valid with the minimum required fields', () => {
    expect(buildDoc().validateSync()).toBeUndefined()
  })

  it('requires user', () => {
    const doc = buildDoc({ user: undefined })
    expect(doc.validateSync()?.errors.user).toBeDefined()
  })

  it('requires endpoint', () => {
    const doc = buildDoc({ endpoint: undefined })
    expect(doc.validateSync()?.errors.endpoint).toBeDefined()
  })

  it('requires keys.p256dh and keys.auth', () => {
    const doc = buildDoc({ keys: {} })
    const error = doc.validateSync()
    expect(error?.errors['keys.p256dh']).toBeDefined()
    expect(error?.errors['keys.auth']).toBeDefined()
  })

  it('defaults expirationTime to null', () => {
    expect(buildDoc().expirationTime).toBeNull()
  })

  it('accepts an optional userAgent', () => {
    const doc = buildDoc({ userAgent: 'Mozilla/5.0 (Test)' })
    expect(doc.validateSync()).toBeUndefined()
    expect(doc.userAgent).toBe('Mozilla/5.0 (Test)')
  })

  it('declares a unique index on endpoint', () => {
    const indexes = PushSubscription.schema.indexes()
    const endpointIndex = indexes.find(([fields]) => fields.endpoint === 1)

    expect(endpointIndex).toBeDefined()
    const [, options] = endpointIndex!
    expect(options.unique).toBe(true)
  })

  it('indexes user for lookup when fanning out a push', () => {
    const indexes = PushSubscription.schema.indexes()
    const userIndex = indexes.find(([fields]) => fields.user === 1)
    expect(userIndex).toBeDefined()
  })

  it('does not give the keys subdocument its own _id', () => {
    const doc = buildDoc()
    expect((doc.keys as unknown as { _id?: unknown })._id).toBeUndefined()
  })
})
