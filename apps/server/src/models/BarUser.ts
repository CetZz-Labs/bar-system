import { Document, model, Schema, Types } from "mongoose";

export enum BarUserRole {
    OWNER = 'OWNER',
    WAITER = 'WAITER',
    MANAGER = 'MANAGER',
    CASHIER = 'CASHIER',
}

export interface IBarUser extends Document {
    bar: Types.ObjectId;
    user: Types.ObjectId;
    role: BarUserRole;
    createdAt: Date;
    updatedAt: Date;
}

const barUserSchema = new Schema<IBarUser>({
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
        default: BarUserRole.OWNER,
    },
}, {
    timestamps: true,
});

// Un usuario puede tener múltiples bares, pero solo un rol por bar
barUserSchema.index({ bar: 1, user: 1 }, { unique: true });

const BarUser = model<IBarUser>('BarUser', barUserSchema);

export default BarUser;
