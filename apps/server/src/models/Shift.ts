import { Document, model, Schema, Types } from "mongoose";
import { BarUserRole } from "./BarUser";

export enum ShiftEndReason {
    MANUAL = 'MANUAL',
    KICKED_OUT = 'KICKED_OUT',
    BAR_CLOSED = 'BAR_CLOSED',
}

export enum ShiftSummaryStatus {
    PENDING = 'PENDING',
    VIEWED = 'VIEWED',
}

export interface IShiftSummary {
    status: ShiftSummaryStatus;
    totalConsumptions: number;
    confirmedConsumptions: number;
    pendingConsumptions: number;
    rejectedConsumptions: number;
    disputedConsumptions: number;
    totalAmount: number;
    pointsAwarded: number;
    redemptionCount: number;
    redemptionsAvailable: boolean;
    generatedAt: Date;
}

export interface IShift extends Document {
    bar: Types.ObjectId;
    user: Types.ObjectId;
    role: BarUserRole;
    deviceInfo: string;
    ip?: string;
    startedAt: Date;
    endedAt?: Date;
    endReason?: ShiftEndReason;
    summary?: IShiftSummary;
}

const shiftSummarySchema = new Schema<IShiftSummary>({
    status: {
        type: String,
        enum: Object.values(ShiftSummaryStatus),
        required: true,
    },
    totalConsumptions: { type: Number, required: true, min: 0 },
    confirmedConsumptions: { type: Number, required: true, min: 0 },
    pendingConsumptions: { type: Number, required: true, min: 0 },
    rejectedConsumptions: { type: Number, required: true, min: 0 },
    disputedConsumptions: { type: Number, required: true, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    pointsAwarded: { type: Number, required: true, min: 0 },
    redemptionCount: { type: Number, required: true, min: 0 },
    redemptionsAvailable: { type: Boolean, required: true },
    generatedAt: { type: Date, required: true },
}, { _id: false });

const shiftSchema = new Schema<IShift>({
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
    role: {
        type: String,
        enum: Object.values(BarUserRole),
        required: true,
    },
    deviceInfo: {
        type: String,
        required: true,
        trim: true,
    },
    ip: {
        type: String,
        trim: true,
    },
    startedAt: {
        type: Date,
        required: true,
        default: Date.now,
    },
    endedAt: {
        type: Date,
    },
    endReason: {
        type: String,
        enum: Object.values(ShiftEndReason),
    },
    summary: {
        type: shiftSummarySchema,
    },
});

shiftSchema.index({ bar: 1, user: 1, endedAt: 1 });
shiftSchema.index({ user: 1, endedAt: 1 });
// LB-94: cubre ShiftSummaryController.history — filtro {bar, endedAt:{$ne:null},
// startedAt:{$gte,$lte}} + sort({startedAt:-1}) (ShiftSummaryController.ts:176-190).
// Ninguno de los índices existentes tiene `startedAt` como prefijo/sort útil
// (ver progress/explorers/exp_LB-94.md §3.1).
shiftSchema.index({ bar: 1, startedAt: -1 });

const Shift = model<IShift>('Shift', shiftSchema);

export default Shift;
