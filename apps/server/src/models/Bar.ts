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

// Puntos por asistencia otorgados por día de la semana (LB-59). 0 = no
// acredita nada ese día. Editable en cualquier momento por el OWNER, pero
// NO retroactivo: ver el snapshot `attendancePointsSnapshot` en Outing.ts
// y la decisión de diseño documentada en progress/implementers/impl_LB-59.md.
export interface IAttendancePointsByDay {
    monday: number;
    tuesday: number;
    wednesday: number;
    thursday: number;
    friday: number;
    saturday: number;
    sunday: number;
}

// Mapea el índice de "día de bar" (mismo criterio que IScheduleSlot.day y
// Date.getDay(): 0=Sunday...6=Saturday) a la clave correspondiente de
// IAttendancePointsByDay. Usado por OutingController.createOuting para
// tomar el snapshot de puntos vigente el día que corre la salida.
export const ATTENDANCE_POINTS_DAY_KEYS: (keyof IAttendancePointsByDay)[] = [
    'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
];

export interface IBar extends Document {
    name: string;
    slug: string;
    address: IAddress;
    phone: string;
    schedule: IScheduleSlot[];
    description?: string;
    status: BarStatus;
    logoUrl?: string;
    coverUrl?: string;
    closingTime: string;
    attendancePointsByDay: IAttendancePointsByDay;
}

const attendancePointsByDaySchema = new Schema<IAttendancePointsByDay>({
    monday: { type: Number, required: true, min: 0, max: 1000, default: 0 },
    tuesday: { type: Number, required: true, min: 0, max: 1000, default: 0 },
    wednesday: { type: Number, required: true, min: 0, max: 1000, default: 0 },
    thursday: { type: Number, required: true, min: 0, max: 1000, default: 0 },
    friday: { type: Number, required: true, min: 0, max: 1000, default: 0 },
    saturday: { type: Number, required: true, min: 0, max: 1000, default: 0 },
    sunday: { type: Number, required: true, min: 0, max: 1000, default: 0 },
}, { _id: false });

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
    closingTime: {
        type: String,
        match: /^([01]\d|2[0-3]):([0-5]\d)$/,
        default: '06:00',
    },
    // Bares registrados antes de LB-59 no tienen este campo persistido en Mongo
    // (Mongoose no lo retropuebla): `default: () => ({})` solo aplica a
    // documentos nuevos. Los controllers/utils que lo leen deben tolerar
    // `undefined` y tratarlo como "0 puntos todos los días".
    attendancePointsByDay: {
        type: attendancePointsByDaySchema,
        default: () => ({}),
    },
}, {
    timestamps: true,
});

barSchema.index({ slug: 1 }, { unique: true });
barSchema.index({ name: 1, 'address.city': 1 }, { unique: true });

const Bar = model<IBar>('Bar', barSchema);

export default Bar;
