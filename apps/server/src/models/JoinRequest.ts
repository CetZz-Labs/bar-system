import { Document, model, Schema, Types } from "mongoose";

export enum JoinRequestStatus {
    PENDING = 'PENDING',
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED',
}

export interface IJoinRequest extends Document {
    group: Types.ObjectId;
    user: Types.ObjectId;
    status: JoinRequestStatus;
    createdAt: Date;
    updatedAt: Date;
}

const joinRequestSchema = new Schema<IJoinRequest>({
    group: {
        type: Schema.Types.ObjectId,
        ref: 'Group',
        required: true,
        index: true,
    },
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    status: {
        type: String,
        enum: Object.values(JoinRequestStatus),
        default: JoinRequestStatus.PENDING,
    },
}, {
    timestamps: true,
});

// Un usuario solo puede tener una solicitud pendiente por grupo
joinRequestSchema.index({ group: 1, user: 1, status: 1 }, { unique: true, partialFilterExpression: { status: 'PENDING' } });

const JoinRequest = model<IJoinRequest>('JoinRequest', joinRequestSchema);

export default JoinRequest;
