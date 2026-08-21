import { Document, model, Schema, Types } from "mongoose";

// Colección nueva, autorizada explícitamente por LB-60 (amplía la lista cerrada
// de colecciones de backend.md §3). Registra el consumo que el CASHIER carga
// en la vista de "salida en curso" y el QR/código manual que el líder confirma
// en LB-61.
export enum ConsumptionStatus {
    PENDING_LEADER_CONFIRMATION = 'PENDING_LEADER_CONFIRMATION',
    CONFIRMED = 'CONFIRMED',   // seteado por LB-61
    REJECTED = 'REJECTED',     // seteado por LB-61
    DISPUTED = 'DISPUTED',     // seteado por LB-61
    ABANDONED = 'ABANDONED',   // seteado por LB-62 al cerrar la salida
}

export interface IConsumptionBreakdownItem {
    category: string;
    quantity: number;
    subtotal: number;
}

export interface IConsumption extends Document {
    outing: Types.ObjectId;
    bar: Types.ObjectId;
    cashier: Types.ObjectId;
    shift?: Types.ObjectId;
    amount: number;
    isUnusualAmount: boolean;
    breakdown?: IConsumptionBreakdownItem[];
    status: ConsumptionStatus;
    /** Rechazos del líder (LB-61). Al 4to → DISPUTED. */
    rejectCount: number;
    pointsAwarded?: number;
    qrToken: string;
    manualCode: string;
    expiresAt: Date;
    invalidatedAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

const breakdownItemSchema = new Schema<IConsumptionBreakdownItem>({
    category: {
        type: String,
        required: true,
        trim: true,
    },
    quantity: {
        type: Number,
        required: true,
        min: 1,
    },
    subtotal: {
        type: Number,
        required: true,
        min: 0,
    },
}, { _id: false });

const consumptionSchema = new Schema<IConsumption>({
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
    cashier: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    shift: {
        type: Schema.Types.ObjectId,
        ref: 'Shift',
        index: true,
    },
    amount: {
        type: Number,
        required: true,
        min: 1,
        validate: {
            validator: Number.isInteger,
            message: 'El monto debe ser un número entero',
        },
    },
    // Rastro persistente/auditable de que el monto superó el umbral de
    // advertencia (no bloqueante, sin tope duro). El warning en sí es
    // responsabilidad del frontend (apps/client/src/types/consumption.ts);
    // este campo solo deja registro server-side por si el cliente se omite.
    isUnusualAmount: {
        type: Boolean,
        default: false,
    },
    // Informativo (LB-58 no existe todavía): el monto total es la fuente de
    // verdad para los puntos, aunque el desglose no coincida con él.
    breakdown: {
        type: [breakdownItemSchema],
        default: undefined,
    },
    status: {
        type: String,
        enum: Object.values(ConsumptionStatus),
        default: ConsumptionStatus.PENDING_LEADER_CONFIRMATION,
    },
    rejectCount: {
        type: Number,
        default: 0,
        min: 0,
    },
    pointsAwarded: {
        type: Number,
        min: 0,
    },
    qrToken: {
        type: String,
        required: true,
        index: true,
    },
    manualCode: {
        type: String,
        required: true,
        index: true,
    },
    // Vencimiento manual (sin TTL index de Mongo), siguiendo el patrón de
    // JoinRequest: la salida sigue existiendo tras vencer el código, el
    // cajero solo necesita regenerar. Un TTL index borraría el documento.
    expiresAt: {
        type: Date,
        required: true,
    },
    // Marca cuándo las credenciales vigentes (qrToken/manualCode actuales)
    // fueron invalidadas explícitamente (ej. por LB-61/LB-62 a futuro). En
    // una regeneración (LB-60) no se usa: se sobreescriben directamente
    // qrToken/manualCode/expiresAt con valores nuevos e invalidatedAt vuelve
    // a null porque las credenciales frescas están activas.
    invalidatedAt: {
        type: Date,
        default: null,
    },
}, {
    timestamps: true,
});

// Para la vista de "consumos pendientes de la salida" del cajero.
consumptionSchema.index({ outing: 1, status: 1 });

const Consumption = model<IConsumption>('Consumption', consumptionSchema);

export default Consumption;
