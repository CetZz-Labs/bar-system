import { Document, model, Schema, Types } from "mongoose";

// Colección nueva, autorizada explícitamente por LB-59 (amplía la lista cerrada
// de colecciones de backend.md §3), mismo mecanismo de excepción documentada
// que usó Consumption.ts en LB-60. Historial append-only de acreditaciones de
// puntos sobre `Group.pointsBalance`. Por ahora solo existe el tipo ATTENDANCE
// (LB-59); tipos futuros (ej. canje/consumo) se agregarán ampliando el enum.
export enum PointsTransactionType {
    ATTENDANCE = 'ATTENDANCE',
}

export interface IPointsTransaction extends Document {
    group: Types.ObjectId;
    outing: Types.ObjectId;
    bar: Types.ObjectId;
    type: PointsTransactionType;
    amount: number;
    label: string;
    createdAt: Date;
    updatedAt: Date;
}

const pointsTransactionSchema = new Schema<IPointsTransaction>({
    group: {
        type: Schema.Types.ObjectId,
        ref: 'Group',
        required: true,
        index: true,
    },
    outing: {
        type: Schema.Types.ObjectId,
        ref: 'Outing',
        required: true,
        index: true,
    },
    bar: {
        type: Schema.Types.ObjectId,
        ref: 'Bar',
        required: true,
    },
    type: {
        type: String,
        enum: Object.values(PointsTransactionType),
        required: true,
    },
    amount: {
        type: Number,
        required: true,
        min: 1,
        validate: {
            validator: Number.isInteger,
            message: 'El monto de puntos debe ser un número entero',
        },
    },
    label: {
        type: String,
        required: true,
        trim: true,
    },
}, {
    timestamps: true,
});

// Defensa en profundidad adicional al flag `Outing.attendancePointsAwarded`
// (chequeado y seteado dentro de la misma transacción por
// utils/attendancePoints.ts): un único índice único sobre `outing` impide que
// dos acreditaciones concurrentes dupliquen el registro de asistencia de una
// misma salida. Si en el futuro esta colección suma otros `type` referidos a
// la misma salida (ej. LB-78 canje), este índice deberá volverse compuesto
// `{ outing: 1, type: 1 }`.
pointsTransactionSchema.index({ outing: 1 }, { unique: true });
pointsTransactionSchema.index({ group: 1, createdAt: -1 });

const PointsTransaction = model<IPointsTransaction>('PointsTransaction', pointsTransactionSchema);

export default PointsTransaction;
