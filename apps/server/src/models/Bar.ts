import { Document, model, Schema } from "mongoose";

export enum BarStatus {
    PENDING = 'pending',
    ACTIVE = 'active',
    REJECTED = 'rejected',
}

export interface IAddress {
    street: string;
    number: string;
    neighborhood: string;
    city: string;
}

export interface IScheduleSlot {
    day: number; // 0=Sunday, 1=Monday, ..., 6=Saturday
    open: string; // HH:MM
    close: string; // HH:MM
}

export interface IBar extends Document {
    name: string;
    slug: string;
    address: IAddress;
    phone: string;
    schedule: IScheduleSlot[];
    /** Hora de cierre del "día del bar" (HH:MM). Default 06:00 — LB-53 / LB-54 */
    closingHour: string;
    description?: string;
    status: BarStatus;
    logoUrl?: string;
    coverUrl?: string;
}

const addressSchema = new Schema<IAddress>({
    street: {
        type: String,
        required: true,
        trim: true,
    },
    number: {
        type: String,
        required: true,
        trim: true,
    },
    neighborhood: {
        type: String,
        trim: true,
    },
    city: {
        type: String,
        required: true,
        trim: true,
    },
}, { _id: false });

const barSchema = new Schema<IBar>({
    name: {
        type: String,
        required: true,
        trim: true,
    },
    slug: {
        type: String,
        unique: true,
        trim: true,
    },
    address: {
        type: addressSchema,
        required: true,
    },
    phone: {
        type: String,
        required: true,
        trim: true,
    },
    schedule: {
        type: [{
            day: {
                type: Number,
                required: true,
                min: 0,
                max: 6,
            },
            open: {
                type: String,
                required: true,
                match: /^([01]\d|2[0-3]):([0-5]\d)$/,
            },
            close: {
                type: String,
                required: true,
                match: /^([01]\d|2[0-3]):([0-5]\d)$/,
            },
        }],
        required: true,
        validate: [(val: IScheduleSlot[]) => val.length > 0, 'El horario debe tener al menos un día'],
    },
    closingHour: {
        type: String,
        trim: true,
        default: '06:00',
        match: /^([01]\d|2[0-3]):([0-5]\d)$/,
    },
    description: {
        type: String,
        trim: true,
    },
    status: {
        type: String,
        enum: Object.values(BarStatus),
        default: BarStatus.PENDING,
    },
    logoUrl: {
        type: String,
        trim: true,
    },
    coverUrl: {
        type: String,
        trim: true,
    },
}, {
    timestamps: true,
});

barSchema.index({ slug: 1 }, { unique: true });
barSchema.index({ name: 1, 'address.city': 1 }, { unique: true });

const Bar = model<IBar>('Bar', barSchema);

export default Bar;
