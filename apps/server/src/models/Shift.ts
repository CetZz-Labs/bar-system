import { Document, model, Schema, Types } from "mongoose";
import { BarUserRole } from "./BarUser";

export enum ShiftEndReason {
    MANUAL = 'MANUAL',
    KICKED_OUT = 'KICKED_OUT',
    BAR_CLOSED = 'BAR_CLOSED',
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
}

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
});

shiftSchema.index({ bar: 1, user: 1, endedAt: 1 });
shiftSchema.index({ user: 1, endedAt: 1 });

const Shift = model<IShift>('Shift', shiftSchema);

export default Shift;
