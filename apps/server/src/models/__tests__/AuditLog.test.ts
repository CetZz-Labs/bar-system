import { describe, it, expect } from 'vitest'
import { Types } from 'mongoose'
import AuditLog, {
    ACTOR_TYPES,
    AUDIT_EVENT_TYPES,
    type ActorType,
    type AuditEventType,
} from '../../models/AuditLog'

// Validación local (validateSync, sin DB) del reshape de AuditLog (LB-77) —
// mismo patrón que models/__tests__/Reward.test.ts.

function buildAuditDoc(overrides: Record<string, unknown> = {}) {
    return new AuditLog({
        bar: new Types.ObjectId(),
        actorType: 'CASHIER' as ActorType,
        actorId: new Types.ObjectId(),
        eventType: 'consumo.registered' as AuditEventType,
        ...overrides,
    })
}

describe('AuditLog model (LB-77 reshape)', () => {
    it('is valid with the required canonical fields (bar, actorType, eventType)', () => {
        const doc = buildAuditDoc()
        const error = doc.validateSync()
        expect(error).toBeUndefined()
    })

    it('is valid for actorType SYSTEM without actorId (resolves the old user-required tension)', () => {
        const doc = buildAuditDoc({ actorType: 'SYSTEM' as ActorType, actorId: undefined })
        const error = doc.validateSync()
        expect(error).toBeUndefined()
    })

    it('stores metadata as Mixed (record) and optional fields', () => {
        const doc = buildAuditDoc({
            metadata: { consumptionId: new Types.ObjectId(), amount: 5000 },
            entityType: 'Consumo',
            entityId: new Types.ObjectId(),
            deviceInfo: 'POS-1',
            ip: '127.0.0.1',
        })
        expect(doc.metadata).toEqual(expect.objectContaining({ amount: 5000 }))
        expect(doc.entityType).toBe('Consumo')
    })

    it('requires bar', () => {
        const doc = new AuditLog({ actorType: 'CASHIER', eventType: 'consumo.registered' })
        const error = doc.validateSync()
        expect(error?.errors.bar).toBeDefined()
    })

    it('requires actorType', () => {
        const doc = new AuditLog({ bar: new Types.ObjectId(), eventType: 'consumo.registered' })
        const error = doc.validateSync()
        expect(error?.errors.actorType).toBeDefined()
    })

    it('requires eventType', () => {
        const doc = new AuditLog({ bar: new Types.ObjectId(), actorType: 'CASHIER' })
        const error = doc.validateSync()
        expect(error?.errors.eventType).toBeDefined()
    })

    it('rejects an invalid actorType value', () => {
        const doc = buildAuditDoc({ actorType: 'CASHIER_DUEÑO' })
        const error = doc.validateSync()
        expect(error?.errors.actorType).toBeDefined()
    })

    it('rejects an eventType not in the canonical list', () => {
        const doc = buildAuditDoc({ eventType: 'consumo.archived' })
        const error = doc.validateSync()
        expect(error?.errors.eventType).toBeDefined()
    })

    it('exposes the 15 canonical eventTypes plus the conserved extra ones', () => {
        // Los 15 del contrato:
        for (const e of [
            'checkin.confirmed',
            'consumo.registered',
            'consumo.confirmed',
            'consumo.rejected',
            'dispute.opened',
            'dispute.resolved',
            'redemption.generated',
            'redemption.delivered',
            'redemption.rejected',
            'salida.closed',
            'shift.opened',
            'shift.closed',
            'reward.created',
            'reward.edited',
            'reward.deleted',
        ]) {
            expect(AUDIT_EVENT_TYPES).toContain(e)
        }
        // Conservados bajo eventType equivalente:
        expect(AUDIT_EVENT_TYPES).toContain('consumo.regenerated')
        expect(AUDIT_EVENT_TYPES).toContain('redemption.cancelled')
        expect(AUDIT_EVENT_TYPES).toContain('redemption.expired')
        expect(AUDIT_EVENT_TYPES).toContain('shift.kicked_out')
    })

    it('exposes the four actor types', () => {
        expect(ACTOR_TYPES).toEqual(['CASHIER', 'OWNER', 'SYSTEM', 'LEADER'])
    })
})
