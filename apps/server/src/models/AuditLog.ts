import { Document, model, Schema, Types } from "mongoose";

export enum AuditAction {
    CASHIER_LOGIN = 'CASHIER_LOGIN',
    CASHIER_LOGOUT = 'CASHIER_LOGOUT',
    CASHIER_KICKED_OUT = 'CASHIER_KICKED_OUT',
    SHIFT_AUTO_CLOSED = 'SHIFT_AUTO_CLOSED',
    CONSUMPTION_CREATED = 'CONSUMPTION_CREATED',
    CONSUMPTION_REGENERATED = 'CONSUMPTION_REGENERATED',
    CONSUMPTION_CONFIRMED = 'CONSUMPTION_CONFIRMED',
    CONSUMPTION_REJECTED = 'CONSUMPTION_REJECTED',
    CONSUMPTION_DISPUTED = 'CONSUMPTION_DISPUTED',
    OUTING_CLOSED = 'OUTING_CLOSED',
    OUTING_AUTO_CLOSED = 'OUTING_AUTO_CLOSED',
    // LB-68: canje de recompensas (líder). REDEMPTION_VALIDATED/REJECTED
    // quedan para LB-69 (validación por el cajero), no se agregan acá
    // porque LB-68 no llega a esos estados.
    REDEMPTION_GENERATED = 'REDEMPTION_GENERATED',
    REDEMPTION_CANCELLED = 'REDEMPTION_CANCELLED',
    REDEMPTION_EXPIRED = 'REDEMPTION_EXPIRED',
}

export interface IAuditLog extends Document {
    bar: Types.ObjectId;
    user: Types.ObjectId;
    action: AuditAction;
    deviceInfo?: string;
    ip?: string;
    amount?: number;
    outing?: Types.ObjectId;
    group?: Types.ObjectId;
    /** LB-68: referencia al canje auditado (REDEMPTION_*). Opcional, mismo
     * criterio que `outing`/`group`: no todas las acciones lo usan. */
    redemption?: Types.ObjectId;
    createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>({
    bar: {
        type: Schema.Types.ObjectId,
        ref: 'Bar',
        required: true,
        index: true,
    },
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    action: {
        type: String,
        enum: Object.values(AuditAction),
        required: true,
    },
    deviceInfo: {
        type: String,
        trim: true,
    },
    ip: {
        type: String,
        trim: true,
    },
    amount: {
        type: Number,
    },
    outing: {
        type: Schema.Types.ObjectId,
        ref: 'Outing',
    },
    group: {
        type: Schema.Types.ObjectId,
        ref: 'Group',
    },
    redemption: {
        type: Schema.Types.ObjectId,
        ref: 'Redemption',
    },
}, {
    timestamps: true,
});

const AuditLog = model<IAuditLog>('AuditLog', auditLogSchema);

export default AuditLog;
