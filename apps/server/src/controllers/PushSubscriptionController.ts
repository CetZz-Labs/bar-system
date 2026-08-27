import { Request, Response } from "express";
import PushSubscription from "../models/PushSubscription";
import User from "../models/User";

// LB-80: alta/baja de suscripciones Web Push y actualización de las
// preferencias de notificación del usuario autenticado. Clase con métodos
// estáticos que hablan directo con Mongoose (3 capas de backend.md §1, sin
// capa `services/`). La validación de transporte vive en `routes/pushRoute.ts`
// (express-validator).
export class PushSubscriptionController {
    /**
     * POST /api/push/subscriptions
     * Upsert por `endpoint`: si la suscripción ya existe (mismo navegador
     * re-suscribiéndose) actualiza `keys` / `userAgent` / `user`.
     */
    static subscribe = async (req: Request, res: Response) => {
        const userId = req.user!._id;
        const { endpoint, keys, expirationTime, userAgent } = req.body as {
            endpoint: string;
            keys: { p256dh: string; auth: string };
            expirationTime?: number | null;
            userAgent?: string;
        };

        await PushSubscription.findOneAndUpdate(
            { endpoint },
            {
                user: userId,
                endpoint,
                keys: { p256dh: keys.p256dh, auth: keys.auth },
                userAgent: userAgent ?? req.get('user-agent') ?? undefined,
                expirationTime: expirationTime ?? null,
            },
            { upsert: true, new: true, setDefaultsOnInsert: true },
        );

        res.status(201).json({ message: 'Suscripción registrada' });
    };

    /**
     * DELETE /api/push/subscriptions
     * Baja por `endpoint` (body o query), acotada al usuario autenticado.
     */
    static unsubscribe = async (req: Request, res: Response) => {
        const endpoint = (req.body?.endpoint ?? req.query?.endpoint) as string;

        await PushSubscription.deleteOne({ endpoint, user: req.user!._id });

        res.status(204).send();
    };

    /**
     * PATCH /api/push/preferences
     * Actualiza `notificationPreferences` del usuario. Acepta `salidas` y
     * `consumos` (bool). `canjes` se fuerza SIEMPRE a `true` aunque venga
     * `false` (no-desactivable, criterio LB-57) — sin devolver 400.
     */
    static updatePreferences = async (req: Request, res: Response) => {
        const userId = req.user!._id;
        const { salidas, consumos } = req.body as {
            salidas?: boolean;
            consumos?: boolean;
        };

        const update: Record<string, boolean> = {
            'notificationPreferences.canjes': true,
        };
        if (typeof salidas === 'boolean') {
            update['notificationPreferences.salidas'] = salidas;
        }
        if (typeof consumos === 'boolean') {
            update['notificationPreferences.consumos'] = consumos;
        }

        const user = await User.findByIdAndUpdate(
            userId,
            { $set: update },
            { new: true },
        ).select('notificationPreferences');

        if (!user) {
            res.status(404).json({ message: 'Usuario no encontrado' });
            return;
        }

        res.status(200).json({ notificationPreferences: user.notificationPreferences });
    };
}
