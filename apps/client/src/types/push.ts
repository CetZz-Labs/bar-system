// LB-80: shapes de Web Push declarados a mano (aislamiento frontend.md §3 —
// no se importa nada de `apps/server/`). La sincronización con el modelo
// `PushSubscription` / `User.notificationPreferences` del backend es manual.

/** Espejo de `User.notificationPreferences` del backend. */
export interface PushPreferences {
    salidas: boolean;
    consumos: boolean;
    /** No-desactivable (confirmación de transacción, criterio LB-57). */
    canjes: boolean;
}

/** Sólo `salidas` y `consumos` son editables; `canjes` se ignora en el server. */
export interface UpdatePushPreferencesInput {
    salidas?: boolean;
    consumos?: boolean;
}

/** Cuerpo que se manda a `POST /api/push/subscriptions`. */
export interface PushSubscriptionPayload {
    endpoint: string;
    expirationTime: number | null;
    keys: {
        p256dh: string;
        auth: string;
    };
    userAgent?: string;
}
