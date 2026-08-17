import { Document, model, Schema, Types } from "mongoose";

// Colección autorizada por LB-59 / ampliada por LB-61 (consumo).
export enum PointsTransactionType {
    ATTENDANCE = 'ATTENDANCE',
    CONSUMPTION = 'CONSUMPTION',
}

export interface IPointsTransaction extends Document {
    group: Types.ObjectId;
    outing: Types.ObjectId;
    bar: Types.ObjectId;
    type: PointsTransactionType;
    amount: number;
    label: string;
    /** Solo para type=CONSUMPTION (idempotencia por consumo). */
    consumption?: Types.ObjectId;
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
    consumption: {
        type: Schema.Types.ObjectId,
        ref: 'Consumption',
    },
}, {
    timestamps: true,
});

// ATTENDANCE: una sola acreditación por salida.
pointsTransactionSchema.index(
    { outing: 1, type: 1 },
    {
        unique: true,
        partialFilterExpression: { type: PointsTransactionType.ATTENDANCE },
    }
);

// CONSUMPTION: una acreditación por consumo.
pointsTransactionSchema.index(
    { consumption: 1 },
    {
        unique: true,
        partialFilterExpression: { type: PointsTransactionType.CONSUMPTION },
    }
);

pointsTransactionSchema.index({ group: 1, createdAt: -1 });

// LB-72: getAvailablePointsForBar (utils/redemptionAvailability.ts) hace
// find({group, bar}) para calcular el saldo disponible por bar en cada
// carga de la vista de recompensas — sin este índice compuesto, ese find
// solo aprovecha el índice individual de `group` y filtra `bar` sin índice
// dedicado. Aditivo, no cambia comportamiento, solo performance.
pointsTransactionSchema.index({ group: 1, bar: 1 });

const PointsTransaction = model<IPointsTransaction>('PointsTransaction', pointsTransactionSchema);

export default PointsTransaction;
