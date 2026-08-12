import { Document, model, Schema, Types } from "mongoose";

export enum OutingStatus {
    PENDING = 'PENDING',     // "activa": creada, sin check-in
    ACTIVE = 'ACTIVE',       // "en curso": check-in confirmado
    CANCELLED = 'CANCELLED',
    COMPLETED = 'COMPLETED',
}

export interface IOuting extends Document {
    group: Types.ObjectId;
    bar: Types.ObjectId;
    createdBy: Types.ObjectId;
    scheduledFor: Date;
    note?: string;
    status: OutingStatus;
    invitees: Types.ObjectId[];
    canceledBy?: Types.ObjectId;
    canceledAt?: Date;
    // Snapshot no-retroactivo (LB-59) de `Bar.attendancePointsByDay` para el
    // día de bar de `scheduledFor`, tomado en OutingController.createOuting.
    // Un cambio posterior en la config del bar no afecta salidas ya creadas.
    attendancePointsSnapshot: number;
    // Idempotencia (LB-59/LB-61): true una vez que awardAttendancePointsIfFirst
    // (utils/attendancePoints.ts) ya evaluó/acreditó esta salida, sin importar
    // si el snapshot era 0 o no.
    attendancePointsAwarded: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const outingSchema = new Schema<IOuting>({
    group: {
        type: Schema.Types.ObjectId,
        ref: 'Group',
        required: true,
    },
    bar: {
        type: Schema.Types.ObjectId,
        ref: 'Bar',
        required: true,
    },
    createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    scheduledFor: {
        type: Date,
        required: true,
    },
    note: {
        type: String,
        trim: true,
        maxlength: 200,
    },
    status: {
        type: String,
        enum: Object.values(OutingStatus),
        default: OutingStatus.PENDING,
    },
    invitees: {
        type: [{
            type: Schema.Types.ObjectId,
            ref: 'User',
        }],
        default: [],
    },
    canceledBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
    },
    canceledAt: {
        type: Date,
    },
    attendancePointsSnapshot: {
        type: Number,
        min: 0,
        max: 1000,
        default: 0,
    },
    attendancePointsAwarded: {
        type: Boolean,
        default: false,
    },
}, {
    timestamps: true,
});

// Defensa en profundidad: solo puede existir una salida PENDING/ACTIVE por grupo a la vez.
// Índice único parcial a nivel de DB, complementario a la validación en el controlador.
outingSchema.index(
    { group: 1 },
    {
        unique: true,
        partialFilterExpression: { status: { $in: [OutingStatus.PENDING, OutingStatus.ACTIVE] } },
    }
);

const Outing = model<IOuting>('Outing', outingSchema);

export default Outing;
