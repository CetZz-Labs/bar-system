import { Document, model, Schema, Types } from "mongoose";

export interface IGroupBan extends Document {
    group: Types.ObjectId;
    user: Types.ObjectId;
    reason?: string;
    createdAt: Date;
}

const groupBanSchema = new Schema<IGroupBan>({
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
    reason: {
        type: String,
        trim: true,
    },
}, {
    timestamps: true,
});

// Un usuario solo puede estar baneado una vez por grupo
groupBanSchema.index({ group: 1, user: 1 }, { unique: true });

const GroupBan = model<IGroupBan>('GroupBan', groupBanSchema);

export default GroupBan;
