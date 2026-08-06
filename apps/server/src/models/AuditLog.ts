import { Document, model, Schema, Types } from "mongoose";

export enum AuditAction {
    CASHIER_LOGIN = 'CASHIER_LOGIN',
    CASHIER_LOGOUT = 'CASHIER_LOGOUT',
    CASHIER_KICKED_OUT = 'CASHIER_KICKED_OUT',
    SHIFT_AUTO_CLOSED = 'SHIFT_AUTO_CLOSED',
}

export interface IAuditLog extends Document {
    bar: Types.ObjectId;
    user: Types.ObjectId;
    action: AuditAction;
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
}, {
    timestamps: true,
});

const AuditLog = model<IAuditLog>('AuditLog', auditLogSchema);

export default AuditLog;
