import { Document, model, Schema, Types } from "mongoose";
import { attendancePointsByDaySchema, IAttendancePointsByDay } from "./Bar";

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
    checkedInAt?: Date;
    checkedInBy?: Types.ObjectId;
    // Snapshot no-retroactivo (LB-59, rework LB-65) del mapa COMPLETO
    // `Bar.attendancePointsByDay` vigente al crear (o al cambiar de bar en
    // updateOuting) la salida. Antes de LB-65 acá se guardaba un `number` ya
    // resuelto contra el día de bar de `scheduledFor` en el momento de la
    // creación — pero ese día podía diferir del día de bar real en el que
    // se termina acreditando (LB-61), porque `scheduledFor` puede caer cerca
    // del `closingTime` del bar. LB-65 separa las dos decisiones: acá solo
    // se congelan los VALORES de config vigentes (regla no-retroactiva); QUÉ
    // día de ese mapa corresponde usar se resuelve recién en el momento real
    // de la acreditación, en `utils/attendancePoints.ts`.
    attendancePointsSnapshot: IAttendancePointsByDay;
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
    checkedInAt: {
        type: Date,
    },
    checkedInBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
    },
    attendancePointsSnapshot: {
        type: attendancePointsByDaySchema,
        default: () => ({}),
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
