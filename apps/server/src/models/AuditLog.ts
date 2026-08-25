import { Document, model, Schema, Types } from "mongoose";

/**
 * LB-77: reshape del modelo AuditLog al schema canónico del contrato
 * `contratos/audit-log-events.md` (Opción A). Los campos `action`/`amount`/
 * `outing`/`group`/`redemption`/`user` del modelo LB-53 se pliegan a
 * `eventType` + `entityType/entityId` + `metadata`, y `user` (required)
 * pasa a `actorId` (opcional, resuelve el caso `actorType=SYSTEM` que no
 * tiene actor natural).
 */

export const ACTOR_TYPES = ['CASHIER', 'OWNER', 'SYSTEM', 'LEADER'] as const;
export type ActorType = typeof ACTOR_TYPES[number];

// Los 15 eventTypes canónicos del contrato + los 4 eventos "extra"
// conservados bajo un eventType equivalente (CASHIER_KICKED_OUT →
// shift.kicked_out, CONSUMPTION_REGENERATED → consumo.regenerated,
// REDEMPTION_CANCELLED → redemption.cancelled, REDEMPTION_EXPIRED →
// redemption.expired). Decisión de implementación documentada en
// progress/implementers/impl_LB-77.md: se preserva la distinción semántica
// en vez de perder información mapeando a un evento existente.
export const AUDIT_EVENT_TYPES = [
    'checkin.confirmed',
    'consumo.registered',
    'consumo.regenerated',
    'consumo.confirmed',
    'consumo.rejected',
    'dispute.opened',
    'dispute.resolved',
    'redemption.generated',
    'redemption.delivered',
    'redemption.rejected',
    'redemption.cancelled',
    'redemption.expired',
    'salida.closed',
    'shift.opened',
    'shift.closed',
    'shift.kicked_out',
    'reward.created',
    'reward.edited',
    'reward.deleted',
] as const;
export type AuditEventType = typeof AUDIT_EVENT_TYPES[number];

/** Shape del evento emitido por `writeAuditLog` (contrato §2). */
export interface AuditEvent {
    bar: Types.ObjectId;
    eventType: AuditEventType;
    actorType: ActorType;
    /** Omitir si actorType === SYSTEM (no tiene actor natural). */
    actorId?: Types.ObjectId;
    /** Snapshot del nombre del actor al momento del evento. */
    actorName?: string;
    entityType?: string;
    entityId?: Types.ObjectId;
    metadata?: Record<string, unknown>;
    deviceInfo?: string;
    ip?: string;
}

export interface IAuditLog extends Document {
    bar: Types.ObjectId;
    actorType: ActorType;
    actorId?: Types.ObjectId;
    actorName?: string;
    eventType: AuditEventType;
    entityType?: string;
    entityId?: Types.ObjectId;
    metadata?: Record<string, unknown>;
    deviceInfo?: string;
    ip?: string;
    createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>({
    bar: {
        type: Schema.Types.ObjectId,
        ref: 'Bar',
        required: true,
        index: true,
    },
    actorType: {
        type: String,
        enum: [...ACTOR_TYPES],
        required: true,
        index: true,
    },
    actorId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        index: true,
    },
    actorName: {
        type: String,
        trim: true,
    },
    eventType: {
        type: String,
        enum: [...AUDIT_EVENT_TYPES],
        required: true,
        index: true,
    },
    entityType: {
        type: String,
        trim: true,
    },
    entityId: {
        type: Schema.Types.ObjectId,
    },
    metadata: {
        type: Schema.Types.Mixed,
    },
    deviceInfo: {
        type: String,
        trim: true,
    },
    ip: {
        type: String,
        trim: true,
    },
}, {
    timestamps: true,
});

const AuditLog = model<IAuditLog>('AuditLog', auditLogSchema);

export default AuditLog;
