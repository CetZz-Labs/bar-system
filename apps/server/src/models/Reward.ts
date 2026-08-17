import { Document, model, Schema, Types } from "mongoose";

// Colección nueva, autorizada explícitamente por LB-67 (amplía la lista
// cerrada de colecciones de backend.md §3). ABM de recompensas del bar,
// gestionado por el OWNER. El canje en sí (QR de canje, validación,
// held/consumed) es LB-68/LB-69 y queda fuera de este alcance — acá solo
// se modela el catálogo.
export enum RewardStatus {
    ACTIVE = 'active',
    INACTIVE = 'inactive',
}

export interface IReward extends Document {
    bar: Types.ObjectId;
    name: string;
    description?: string;
    pointsRequired: number;
    unlimitedStock: boolean;
    /** Requerido solo cuando unlimitedStock=false (ver `required` condicional abajo). */
    stock?: number;
    status: RewardStatus;
    /** Soft-delete (LB-67): las lecturas del ABM y del endpoint público
     * excluyen documentos con este campo seteado. Nunca se hace un delete
     * físico para no romper referencias futuras de canje (LB-68/LB-69). */
    deletedAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

const rewardSchema = new Schema<IReward>({
    bar: {
        type: Schema.Types.ObjectId,
        ref: 'Bar',
        required: true,
        index: true,
    },
    name: {
        type: String,
        required: true,
        trim: true,
    },
    description: {
        type: String,
        trim: true,
    },
    pointsRequired: {
        type: Number,
        required: true,
        min: 1,
        validate: {
            validator: Number.isInteger,
            message: 'pointsRequired debe ser un número entero',
        },
    },
    unlimitedStock: {
        type: Boolean,
        default: false,
    },
    stock: {
        type: Number,
        required: function (this: IReward) {
            return !this.unlimitedStock;
        },
        min: 0,
        validate: {
            validator: Number.isInteger,
            message: 'stock debe ser un número entero',
        },
    },
    status: {
        type: String,
        enum: Object.values(RewardStatus),
        default: RewardStatus.ACTIVE,
    },
    deletedAt: {
        type: Date,
        default: null,
    },
}, {
    timestamps: true,
});

// Rechaza nombres duplicados de recompensa dentro del mismo bar, pero solo
// entre documentos no eliminados: el índice parcial excluye los
// soft-deleted (deletedAt seteado) para permitir reutilizar el nombre de
// una recompensa ya borrada (fixup LB-67, hallazgo no bloqueante #1 de
// progress/reviewers/review_LB-67.md).
rewardSchema.index({ bar: 1, name: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });

const Reward = model<IReward>('Reward', rewardSchema);

export default Reward;
