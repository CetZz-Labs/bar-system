import { Document, model, Schema, Types } from "mongoose";

export enum NotificationType {
    OUTING_CREATED = 'OUTING_CREATED',
    OUTING_UPDATED = 'OUTING_UPDATED',
    OUTING_CANCELLED = 'OUTING_CANCELLED',
    OUTING_CHECKED_IN = 'OUTING_CHECKED_IN',
    OUTING_CLOSED = 'OUTING_CLOSED',
    GROUP_LEADERSHIP_ACQUIRED = 'GROUP_LEADERSHIP_ACQUIRED',
    CONSUMPTION_DISPUTED = 'CONSUMPTION_DISPUTED',
}

export interface INotification extends Document {
    user: Types.ObjectId;
    type: string;
    message: string;
    relatedOuting?: Types.ObjectId;
    read: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const notificationSchema = new Schema<INotification>({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    type: {
        type: String,
        required: true,
    },
    message: {
        type: String,
        required: true,
    },
    relatedOuting: {
        type: Schema.Types.ObjectId,
        ref: 'Outing',
    },
    read: {
        type: Boolean,
        default: false,
    },
}, {
    timestamps: true,
});

notificationSchema.index({ user: 1, read: 1 });

const Notification = model<INotification>('Notification', notificationSchema);

export default Notification;
