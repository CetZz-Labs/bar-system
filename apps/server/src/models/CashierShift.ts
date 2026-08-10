import { Document, model, Schema, Types } from 'mongoose';
import { BarUserRole } from './BarUser';

export enum CashierShiftStatus {
    ACTIVE = 'ACTIVE',
    CLOSED = 'CLOSED',
}

export interface ICashierShift extends Document {
    user: Types.ObjectId;
    bar: Types.ObjectId;
    role: BarUserRole.OWNER | BarUserRole.CASHIER;
    status: CashierShiftStatus;
    startedAt: Date;
    endedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const cashierShiftSchema = new Schema<ICashierShift>(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        bar: {
            type: Schema.Types.ObjectId,
            ref: 'Bar',
            required: true,
            index: true,
        },
        role: {
            type: String,
            enum: [BarUserRole.OWNER, BarUserRole.CASHIER],
            required: true,
        },
        status: {
            type: String,
            enum: Object.values(CashierShiftStatus),
            default: CashierShiftStatus.ACTIVE,
            index: true,
        },
        startedAt: {
            type: Date,
            required: true,
            default: Date.now,
        },
        endedAt: {
            type: Date,
        },
    },
    { timestamps: true }
);

cashierShiftSchema.index({ user: 1, status: 1 });

const CashierShift = model<ICashierShift>('CashierShift', cashierShiftSchema);

export default CashierShift;
