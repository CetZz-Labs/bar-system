import { Document, model, Schema, Types } from "mongoose";

// Colección nueva, autorizada explícitamente por LB-80 (amplía la lista
// cerrada de colecciones de backend.md §3, mismo precedente ya sentado por
// Consumption.ts en LB-60, Reward.ts en LB-67 y Redemption.ts en LB-68).
//
// Guarda la suscripción Web Push (el objeto `PushSubscriptionJSON` que el
// navegador devuelve en `pushManager.subscribe()`) de un usuario para un
// dispositivo/navegador concreto. El `endpoint` identifica la suscripción de
// forma única: `POST /api/push/subscriptions` hace upsert por `endpoint`
// (idempotente), `DELETE /api/push/subscriptions` la da de baja.
//
// El envío efectivo lo hace `utils/pushService.ts` (fire-and-forget, molde
// de `utils/auditLogService.ts` de LB-77): cuando el endpoint de un push
// service devuelve 404/410 el documento se borra ahí (limpieza de
// suscripciones muertas).

export interface IPushSubscriptionKeys {
    p256dh: string;
    auth: string;
}

export interface IPushSubscription extends Document {
    user: Types.ObjectId;
    endpoint: string;
    keys: IPushSubscriptionKeys;
    userAgent?: string;
    expirationTime?: number | null;
    createdAt: Date;
    updatedAt: Date;
}

const pushSubscriptionSchema = new Schema<IPushSubscription>({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    endpoint: {
        type: String,
        required: true,
        unique: true,
    },
    // Definido como paths anidados (no sub-schema) para que Mongoose no le
    // agregue un `_id` propio al subdocumento.
    keys: {
        p256dh: {
            type: String,
            required: true,
        },
        auth: {
            type: String,
            required: true,
        },
    },
    userAgent: {
        type: String,
        trim: true,
    },
    // El navegador casi siempre lo devuelve `null`; se conserva tal cual.
    expirationTime: {
        type: Number,
        default: null,
    },
}, {
    timestamps: true,
});

const PushSubscription = model<IPushSubscription>('PushSubscription', pushSubscriptionSchema);

export default PushSubscription;
