import webpush from "web-push";
import { Types } from "mongoose";
import PushSubscription from "../models/PushSubscription";
import User from "../models/User";

/**
 * LB-80: envío centralizado de Web Push, fire-and-forget.
 *
 * Contrato de comportamiento (molde exacto de `utils/auditLogService.ts`):
 * - Retorna `void` y NUNCA lanza (catch interno → `console.warn`).
 * - Es fire-and-forget: los callers la invocan SIN `await`.
 * - Un fallo del envío NUNCA afecta la transacción principal ni el response.
 * - NO participa en sesiones de transacción Mongo: se llama siempre DESPUÉS
 *   de que la transacción del flujo principal ya hizo `commit`.
 * - Filtra por `User.notificationPreferences[category]`; la categoría
 *   `canjes` es no-desactivable (confirmación de transacción, LB-57) y
 *   siempre pasa el filtro.
 * - Si el push service devuelve 404/410 para un endpoint, borra ese
 *   `PushSubscription` (limpieza de suscripciones muertas).
 *
 * Init de VAPID lazy y una sola vez (guard de módulo). Si faltan las env
 * vars (`VAPID_SUBJECT` / `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`) se hace
 * warning y no-op: nunca rompe el arranque ni el request.
 */

export type PushCategory = 'salidas' | 'consumos' | 'canjes';

export interface PushPayload {
    category: PushCategory;
    title: string;
    body: string;
    /** Destino del `notificationclick` en el Service Worker. */
    url?: string;
    /** Id de la salida asociada (para deep-link en el cliente). */
    relatedOuting?: string;
}

let vapidConfigured = false;

function ensureVapidDetails(): boolean {
    // Guard de módulo: `setVapidDetails` se llama una sola vez.
    if (vapidConfigured) return true;

    const subject = process.env.VAPID_SUBJECT;
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;

    if (!subject || !publicKey || !privateKey) {
        console.warn('[push] VAPID env vars missing — push notifications disabled');
        return false;
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);
    vapidConfigured = true;
    return true;
}

function getErrorStatus(err: unknown): number | undefined {
    if (typeof err === 'object' && err !== null && 'statusCode' in err) {
        const status = (err as { statusCode: unknown }).statusCode;
        return typeof status === 'number' ? status : undefined;
    }
    return undefined;
}

async function resolveEligibleUserIds(
    userIds: string[],
    category: PushCategory,
): Promise<string[]> {
    // `canjes` ignora la preferencia: es no-desactivable (LB-57).
    if (category === 'canjes') return userIds;

    // `$ne: false` cubre tanto a los usuarios con la preferencia en `true`
    // como a los que todavía no tienen el campo persistido (legacy).
    const users = await User.find({
        _id: { $in: userIds },
        [`notificationPreferences.${category}`]: { $ne: false },
    })
        .select('_id')
        .lean();

    return users.map((u) => u._id.toString());
}

async function deliver(userIds: string[], payload: PushPayload): Promise<void> {
    const eligibleUserIds = await resolveEligibleUserIds(userIds, payload.category);
    if (eligibleUserIds.length === 0) return;

    const subscriptions = await PushSubscription.find({
        user: { $in: eligibleUserIds },
    }).lean();
    if (subscriptions.length === 0) return;

    const body = JSON.stringify(payload);

    await Promise.all(
        subscriptions.map(async (sub) => {
            try {
                await webpush.sendNotification(
                    {
                        endpoint: sub.endpoint,
                        keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
                        expirationTime: sub.expirationTime ?? undefined,
                    },
                    body,
                );
            } catch (err: unknown) {
                const status = getErrorStatus(err);
                if (status === 404 || status === 410) {
                    // Endpoint muerto: se borra la suscripción.
                    await PushSubscription.deleteOne({ _id: sub._id }).catch(() => { });
                    return;
                }
                console.warn('[push] sendNotification failed', err);
            }
        }),
    );
}

export function sendPushToUsers(
    userIds: Array<string | Types.ObjectId>,
    payload: PushPayload,
): void {
    try {
        if (userIds.length === 0) return;
        if (!ensureVapidDetails()) return;

        const ids = Array.from(new Set(userIds.map((id) => id.toString())));

        void deliver(ids, payload).catch((err) => {
            console.warn('[push] delivery failed', err);
        });
    } catch (err) {
        console.warn('[push] delivery failed', err);
    }
}
