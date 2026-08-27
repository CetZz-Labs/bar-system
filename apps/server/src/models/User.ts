import { Document, model, Schema, Types } from "mongoose";
import { hashPassword } from "../utils/auth";

export enum MembershipRole {
    ADMIN = 'ADMIN',
    MEMBER = 'MEMBER',
    LEADER = 'LEADER',
    CO_LEADER = 'CO_LEADER'
}

export interface IMembership {
    group: Types.ObjectId;
    role: MembershipRole;
    joinedAt: Date;
}

// LB-80: preferencias de notificación push por categoría. Opt-in por defecto
// (todo en `true`). `canjes` es NO-desactivable: es la confirmación de una
// transacción (entrega de un canje), criterio LB-57 — la ruta
// `PATCH /api/push/preferences` ignora / fuerza `canjes: true` aunque el
// cliente mande `false`.
export interface INotificationPreferences {
    salidas: boolean;
    consumos: boolean;
    canjes: boolean;
}

export interface IUser extends Document {
    name: string;
    lastName: string;
    email: string;
    password: string;
    birthdate?: Date;
    phone?: string;
    avatarUrl?: string; // or string if required
    isActive: boolean;
    profileComplete: boolean;
    memberships: IMembership[];
    notificationPreferences: INotificationPreferences;
}

const userSchema = new Schema<IUser>({
    name: {
        type: String,
        required: true,
        trim: true
    },
    lastName: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    birthdate: {
        type: Date,
    },
    phone: {
        type: String,
        trim: true,
    },
    avatarUrl: {
        type: String,
    },
    isActive: {
        type: Boolean,
        default: false
    },
    profileComplete: {
        type: Boolean,
        default: false
    },
    memberships: {
        type: [{
            group: {
                type: Schema.Types.ObjectId,
                ref: 'Group'
            },
            role: {
                type: String,
                enum: Object.values(MembershipRole),
                default: MembershipRole.MEMBER
            },
            joinedAt: {
                type: Date,
                default: Date.now
            }
        }],
        default: []
    },
    // LB-80: preferencias de notificación push por categoría (opt-in por
    // defecto). `canjes` está acá por completitud, pero es no-desactivable
    // (confirmación de transacción, criterio LB-57): el endpoint de
    // preferencias nunca lo baja a `false`.
    notificationPreferences: {
        salidas: {
            type: Boolean,
            default: true,
        },
        consumos: {
            type: Boolean,
            default: true,
        },
        canjes: {
            type: Boolean,
            default: true,
        },
    }
}, {
    timestamps: true
})

userSchema.pre('save', async function () {
    if (this.isModified('password')) {
        this.password = await hashPassword(this.password)
    }
})

const User = model<IUser>('User', userSchema)

export default User
