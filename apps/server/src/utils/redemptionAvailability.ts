import { ClientSession } from "mongoose";
import PointsTransaction from "../models/PointsTransaction";
import Redemption, { RedemptionStatus } from "../models/Redemption";
import { IReward } from "../models/Reward";

/**
 * Disponibilidad de puntos/stock para el canje de recompensas (LB-68).
 *
 * Calculada EN VIVO, nunca persistida: durante el HOLD de un canje no se
 * muta ni Group.pointsBalance ni Reward.stock (ver comentario de cabecera
 * de models/Redemption.ts), así que la disponibilidad real en un momento
 * dado siempre se resuelve restando los HELD vigentes sobre lo
 * efectivamente acreditado/existente.
 *
 * NO usa el pipeline de agregación de Mongo: no hay precedente de
 * `aggregate` en todo el repo (grep confirmado en
 * progress/explorers/exp_LB-68.md), y el patrón ya establecido para sumar
 * colecciones relacionadas es `find().lean()` + `reduce` en JS (ver
 * utils/closeOuting.ts `buildSummary`). Se sigue ese mismo criterio acá.
 */

/**
 * Saldo de puntos del grupo disponible EN UN BAR puntual: suma de
 * PointsTransaction.amount para {group, bar} (todo lo alguna vez
 * acreditado, LB-59/LB-61) menos la suma de pointsRequiredSnapshot de los
 * Redemption {group, bar, status: HELD, expiresAt vigente} (lo
 * actualmente reservado por canjes pendientes).
 *
 * NOTA — diseño propio de este ticket, no verificado contra
 * `contratos/balance-history-endpoints.md` del vault de Obsidian de LB-70
 * (esa máquina no tenía el vault montado al escribir esto). A reconciliar
 * cuando se trabaje LB-70.
 */
export async function getAvailablePointsForBar(
    groupId: string,
    barId: string,
    session?: ClientSession
): Promise<number> {
    const earnedQuery = PointsTransaction.find({ group: groupId, bar: barId }).select('amount');
    if (session) earnedQuery.session(session);
    const earnedRows = await earnedQuery.lean();
    const earned = earnedRows.reduce((sum, row) => sum + (row.amount ?? 0), 0);

    const heldQuery = Redemption.find({
        group: groupId,
        bar: barId,
        status: RedemptionStatus.HELD,
        expiresAt: { $gt: new Date() },
    }).select('pointsRequiredSnapshot');
    if (session) heldQuery.session(session);
    const heldRows = await heldQuery.lean();
    const held = heldRows.reduce((sum, row) => sum + (row.pointsRequiredSnapshot ?? 0), 0);

    return earned - held;
}

/**
 * Stock disponible de una recompensa: si `unlimitedStock` es true, no hay
 * límite (devuelve `null`, sin comparar contra nada). Si no, es
 * `reward.stock` menos la cantidad de Redemption {reward, status: HELD,
 * expiresAt vigente} — los canjes pendientes que ya "apartaron" una unidad.
 */
export async function getAvailableStock(
    reward: Pick<IReward, '_id' | 'unlimitedStock' | 'stock'>,
    session?: ClientSession
): Promise<number | null> {
    if (reward.unlimitedStock) return null;

    const heldCountQuery = Redemption.countDocuments({
        reward: reward._id,
        status: RedemptionStatus.HELD,
        expiresAt: { $gt: new Date() },
    });
    if (session) heldCountQuery.session(session);
    const heldCount = await heldCountQuery;

    return (reward.stock ?? 0) - heldCount;
}
