import { describe, it, expect } from 'vitest'
import { Types } from 'mongoose'
import Reward, { RewardStatus } from '../../models/Reward'

// Validación local (validateSync, sin DB) del schema de Reward (LB-67).
// No hay precedente de tests con mongodb-memory-server en este repo (ver
// vitest.config.ts): validateSync ejerce las reglas de Mongoose (required,
// min, enum, validadores custom) sin necesitar conexión real.

function buildRewardDoc(overrides: Record<string, unknown> = {}) {
  return new Reward({
    bar: new Types.ObjectId(),
    name: 'Chopp gratis',
    pointsRequired: 100,
    ...overrides,
  })
}

describe('Reward model', () => {
  it('is valid with the minimum required fields (non-unlimited, with stock)', () => {
    const reward = buildRewardDoc({ stock: 10 })
    const error = reward.validateSync()
    expect(error).toBeUndefined()
  })

  it('is valid without stock when unlimitedStock is true', () => {
    const reward = buildRewardDoc({ unlimitedStock: true })
    const error = reward.validateSync()
    expect(error).toBeUndefined()
  })

  it('requires stock when unlimitedStock is false', () => {
    const reward = buildRewardDoc({ unlimitedStock: false })
    const error = reward.validateSync()
    expect(error?.errors.stock).toBeDefined()
  })

  it('requires bar', () => {
    const reward = new Reward({ name: 'Chopp gratis', pointsRequired: 100, stock: 10 })
    const error = reward.validateSync()
    expect(error?.errors.bar).toBeDefined()
  })

  it('requires name', () => {
    const reward = new Reward({ bar: new Types.ObjectId(), pointsRequired: 100, stock: 10 })
    const error = reward.validateSync()
    expect(error?.errors.name).toBeDefined()
  })

  it('requires pointsRequired to be at least 1', () => {
    const reward = buildRewardDoc({ pointsRequired: 0, stock: 10 })
    const error = reward.validateSync()
    expect(error?.errors.pointsRequired).toBeDefined()
  })

  it('rejects a non-integer pointsRequired', () => {
    const reward = buildRewardDoc({ pointsRequired: 12.5, stock: 10 })
    const error = reward.validateSync()
    expect(error?.errors.pointsRequired).toBeDefined()
  })

  it('rejects negative stock', () => {
    const reward = buildRewardDoc({ stock: -1 })
    const error = reward.validateSync()
    expect(error?.errors.stock).toBeDefined()
  })

  it('defaults status to active', () => {
    const reward = buildRewardDoc({ stock: 10 })
    expect(reward.status).toBe(RewardStatus.ACTIVE)
  })

  it('rejects an invalid status value', () => {
    const reward = buildRewardDoc({ stock: 10, status: 'archived' })
    const error = reward.validateSync()
    expect(error?.errors.status).toBeDefined()
  })

  it('defaults unlimitedStock to false', () => {
    const reward = buildRewardDoc({ stock: 10 })
    expect(reward.unlimitedStock).toBe(false)
  })

  it('defaults deletedAt to null', () => {
    const reward = buildRewardDoc({ stock: 10 })
    expect(reward.deletedAt).toBeNull()
  })

  // No hay mongodb-memory-server en el repo (ver comentario de cabecera),
  // por lo que la aplicacion real del indice unico no puede probarse contra
  // una base de datos real. Se verifica en cambio la configuracion del
  // indice a nivel de schema: al ser parcial (partialFilterExpression:
  // { deletedAt: null }), Mongo NO lo aplica sobre documentos
  // soft-deleted, permitiendo crear una recompensa nueva con el mismo
  // nombre que una ya eliminada en el mismo bar (fixup LB-67, hallazgo no
  // bloqueante #1 de progress/reviewers/review_LB-67.md).
  it('defines a partial unique index on {bar, name} that excludes soft-deleted rewards', () => {
    const indexes = Reward.schema.indexes()
    const barNameIndex = indexes.find(
      ([fields]) => fields.bar === 1 && fields.name === 1
    )

    expect(barNameIndex).toBeDefined()
    const [, options] = barNameIndex!
    expect(options.unique).toBe(true)
    expect(options.partialFilterExpression).toEqual({ deletedAt: null })
  })
})
