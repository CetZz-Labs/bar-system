import { Document, model, Schema, Types } from "mongoose";

// Colección nueva, autorizada explícitamente por LB-68 (amplía la lista
// cerrada de colecciones de backend.md §3, mismo precedente ya sentado por
// Consumption.ts en LB-60 y Reward.ts en LB-67). Registra el canje de una
// recompensa (Reward, LB-67) que el LÍDER/CO-LÍDER genera con QR + código
// manual de 6 dígitos de fallback (utils/redemptionQr.ts). El cajero valida
// y entrega en LB-69 (fuera de este alcance) — acá el canje queda en
// estado HELD (reserva).
//
// Deliberado: mientras el canje está HELD, NO se muta ningún campo
// persistente fuera de esta colección (ni Group.pointsBalance ni
// Reward.stock, ni se crea ningún PointsTransaction). La disponibilidad de
// puntos/stock se calcula en vivo (ver utils/redemptionAvailability.ts)
// restando los HELD vigentes sobre lo efectivamente acreditado/existente.
// Esto permite que cancelar o expirar un HELD sea tan simple como cambiar
// `status` acá, sin tener que revertir nada en otros documentos.
export enum RedemptionStatus {
    HELD = 'HELD',
    // Reservados para LB-69 (validación por el cajero) — se declaran acá
    // para no romper el contrato del ticket hermano, no se llega a estos
    // estados en LB-68.
    VALIDATED = 'VALIDATED',
    REJECTED = 'REJECTED',
    CANCELLED = 'CANCELLED',
    EXPIRED = 'EXPIRED',
    // LB-68 (segunda pasada): mismo criterio que Consumption.ABANDONED —
    // el canje HELD queda sin resolver porque la salida se cerró (closeOuting.ts)
    // antes de que el cajero llegara a validarlo o el líder lo cancelara.
    ABANDONED = 'ABANDONED',
}

export interface IRedemption extends Document {
    group: Types.ObjectId;
    outing: Types.ObjectId;
    bar: Types.ObjectId;
    reward: Types.ObjectId;
    /** Líder o co-líder que generó el canje (ownership/auditoría). */
    leader: Types.ObjectId;
    /** Snapshot congelado al momento de generar: sobrevive a una edición
     * posterior de la recompensa (ABM del OWNER, LB-67). */
    rewardNameSnapshot: string;
    pointsRequiredSnapshot: number;
    status: RedemptionStatus;
    qrToken: string;
    manualCode: string;
    expiresAt: Date;
    invalidatedAt?: Date | null;
    /** Preparado para LB-69 (rechazo por el cajero), no usado en LB-68. */
    rejectionReason?: string;
    createdAt: Date;
    updatedAt: Date;
}

const redemptionSchema = new Schema<IRedemption>({
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
        index: true,
    },
    reward: {
        type: Schema.Types.ObjectId,
        ref: 'Reward',
        required: true,
        index: true,
    },
    leader: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    rewardNameSnapshot: {
        type: String,
        required: true,
        trim: true,
    },
    pointsRequiredSnapshot: {
        type: Number,
        required: true,
        min: 1,
        validate: {
            validator: Number.isInteger,
            message: 'pointsRequiredSnapshot debe ser un número entero',
        },
    },
    status: {
        type: String,
        enum: Object.values(RedemptionStatus),
        default: RedemptionStatus.HELD,
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
    // Vencimiento manual (sin TTL index de Mongo), mismo patrón que
    // Consumption.expiresAt (LB-60): la evaluación es lazy, en el momento en
    // que algún endpoint la necesita (ver utils/redemptionExpiry.ts).
    expiresAt: {
        type: Date,
        required: true,
    },
    invalidatedAt: {
        type: Date,
        default: null,
    },
    rejectionReason: {
        type: String,
        trim: true,
    },
}, {
    timestamps: true,
});

// Disponibilidad de puntos en vivo por grupo+bar (utils/redemptionAvailability.ts)
// y listado del líder para un grupo.
redemptionSchema.index({ group: 1, bar: 1, status: 1, expiresAt: 1 });
redemptionSchema.index({ group: 1, createdAt: -1 });
// Disponibilidad de stock en vivo por recompensa (utils/redemptionAvailability.ts).
redemptionSchema.index({ reward: 1, status: 1, expiresAt: 1 });

const Redemption = model<IRedemption>('Redemption', redemptionSchema);

export default Redemption;
