import Redemption, { RedemptionStatus } from "../models/Redemption";
import AuditLog, { AuditAction } from "../models/AuditLog";

/**
 * Expiración LAZY del TTL de 20 min de un canje (LB-68). Único patrón
 * presente en todo el repo (utils/closeBar.ts, utils/closeOuting.ts,
 * Consumption.expiresAt vía utils/consumptionQr.ts): sin cron ni
 * setInterval, se evalúa on-demand en cada punto de contacto que lo
 * necesite. Acá cubre el endpoint de listado del líder
 * (RedemptionController.list); LB-69 deberá invocar un chequeo equivalente
 * antes de validar un QR/código.
 *
 * `filter` acota qué HELD evaluar (ej. `{ group: groupId }` desde el
 * listado del líder, o `{ _id: redemptionId }` desde LB-69 para evaluar un
 * único canje ya resuelto por token/código antes de re-leerlo) para no
 * barrer la colección completa en cada request. Tipado explícito (no
 * `FilterQuery<IRedemption>` genérico de mongoose: este mongoose 9.x no lo
 * exporta como named export) acotado a los campos que efectivamente se
 * filtran hoy — ampliar si un consumidor futuro necesita acotar por otro
 * campo indexado.
 */
export async function expireStaleRedemptions(filter: { group?: string; reward?: string; _id?: string }): Promise<void> {
    const now = new Date();

    const stale = await Redemption.find({
        ...filter,
        status: RedemptionStatus.HELD,
        expiresAt: { $lt: now },
    });

    for (const redemption of stale) {
        redemption.status = RedemptionStatus.EXPIRED;
        redemption.invalidatedAt = now;
        await redemption.save();

        await AuditLog.create({
            bar: redemption.bar,
            user: redemption.leader,
            action: AuditAction.REDEMPTION_EXPIRED,
            amount: redemption.pointsRequiredSnapshot,
            outing: redemption.outing,
            group: redemption.group,
            redemption: redemption._id,
        });
    }
}
