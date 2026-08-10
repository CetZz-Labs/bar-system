import { Document, model, Schema, Types } from 'mongoose';

/** ACTIVE = salida agendada (activa); IN_PROGRESS = check-in iniciado (en curso) */
export enum OutingStatus {
    ACTIVE = 'ACTIVE',
    IN_PROGRESS = 'IN_PROGRESS',
    COMPLETED = 'COMPLETED',
    CANCELLED = 'CANCELLED',
}

export interface IOutingInvitee {
    user: Types.ObjectId;
}

export interface IOuting extends Document {
    group: Types.ObjectId;
    bar: Types.ObjectId;
    leader: Types.ObjectId;
    status: OutingStatus;
    scheduledFor: Date;
    note?: string;
    invitedMembers: IOutingInvitee[];
    startedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const outingSchema = new Schema<IOuting>(
    {
        group: {
            type: Schema.Types.ObjectId,
            ref: 'Group',
            required: true,
            index: true,
        },
        bar: {
            type: Schema.Types.ObjectId,
            ref: 'Bar',
            required: true,
            index: true,
        },
        leader: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        status: {
            type: String,
            enum: Object.values(OutingStatus),
            default: OutingStatus.ACTIVE,
            index: true,
        },
        scheduledFor: {
            type: Date,
            required: true,
            index: true,
        },
        note: {
            type: String,
            trim: true,
            maxlength: 280,
        },
        invitedMembers: {
            type: [
                {
                    user: {
                        type: Schema.Types.ObjectId,
                        ref: 'User',
                        required: true,
                    },
                },
            ],
            default: [],
        },
        startedAt: {
            type: Date,
        },
    },
    { timestamps: true }
);

outingSchema.index({ bar: 1, status: 1, scheduledFor: 1 });
outingSchema.index({ group: 1, status: 1 });

const Outing = model<IOuting>('Outing', outingSchema);

export default Outing;
