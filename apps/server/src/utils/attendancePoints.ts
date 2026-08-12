import mongoose from "mongoose";
import Outing from "../models/Outing";
import Group from "../models/Group";
import Bar, { ATTENDANCE_POINTS_DAY_KEYS } from "../models/Bar";
import PointsTransaction, { PointsTransactionType } from "../models/PointsTransaction";
import { getBarDayOfWeek, getBarDayRange } from "./barDay";

/**
 * Contrato para LB-61 (confirmación del primer consumo de una salida — todavía
 * no implementado en este repo, ver progress/explorers/exp_LB-59.md §4).
 *
 * awardAttendancePointsIfFirst(outingId: string) -> Promise<{ awarded: boolean; amount?: number }>
 *
 * Misma firma que antes de LB-65. LB-61 debe invocar esta función en el
 * momento exacto en que confirma el primer `Consumption` de una salida
 * (transición a `ConsumptionStatus.CONFIRMED`), pasándole el `outingId` de
 * esa salida (como string, `ObjectId` también sirve porque Mongoose lo
 * castea). No hace falta que LB-61 chequee de antemano si ya se acreditó: la
 * función es **idempotente por salida** vía el flag `Outing.attendancePointsAwarded`.
 *
 * Cambio de comportamiento por LB-65 (rework de LB-59): `outing.attendancePointsSnapshot`
 * ya NO es un monto (`number`) resuelto de antemano — es el mapa COMPLETO
 * `Bar.attendancePointsByDay` congelado (no-retroactivo) en `createOuting`/
 * `updateOuting`. Esta función es ahora la que decide QUÉ día de ese mapa
 * corresponde usar, y lo hace acá adentro, en el momento REAL de la
 * invocación (`now = new Date()`, la hora en la que LB-61 confirma el primer
 * consumo) — nunca contra `outing.scheduledFor` ni ninguna otra fecha
 * guardada en la salida. Motivo: `scheduledFor` puede caer cerca del
 * `closingTime` del bar, y el día de bar real de la acreditación puede
 * diferir del que se hubiera calculado en la creación de la salida (ver
 * progress/explorers/exp_snapshot-vs-checkin.md).
 *
 * Comportamiento:
 * 1. Si la salida no existe: no hace nada, devuelve `{ awarded: false }`.
 * 2. Si `outing.attendancePointsAwarded` ya es `true` (reintento, doble
 *    confirmación, race condition ya resuelta por otra invocación): no hace
 *    nada, devuelve `{ awarded: false }`.
 * 3. Calcula el día de bar de `now` con `getBarDayOfWeek(now, bar.closingTime)`
 *    y lee `outing.attendancePointsSnapshot[ATTENDANCE_POINTS_DAY_KEYS[día]]`.
 *    Si ese monto es 0 (o el bar no tiene `closingTime` propio, se usa el
 *    default `'06:00'`): NO acredita nada, NO crea ningún `PointsTransaction`
 *    (silencio total, por spec), pero SÍ marca `attendancePointsAwarded = true`
 *    para no volver a evaluarla. Devuelve `{ awarded: false }`.
 * 4. Si es > 0: incrementa `Group.pointsBalance` en ese monto, marca
 *    `outing.attendancePointsAwarded = true` y crea un `PointsTransaction`
 *    (`type: ATTENDANCE`) con
 *    `label: "Asistencia — {bar.name} ({día de bar de "now", dd/mm/aaaa})"`.
 *    Devuelve `{ awarded: true, amount }`.
 *
 * Todo el paso 3/4 corre dentro de una única transacción Mongo
 * (`session.startTransaction()`, mismo patrón que `OutingController.ts`) para
 * blindar contra doble acreditación si LB-61 llegara a invocar esta función
 * dos veces en paralelo para la misma salida (ej. doble tap del cajero
 * escaneando + reintento de red). El índice único `{ outing: 1 }` de
 * `PointsTransaction` (ver ese modelo) es la defensa en profundidad adicional
 * si dos transacciones concurrentes llegaran a leer el flag en `false` al
 * mismo tiempo.
 *
 * IMPORTANTE — lo que esta función NO hace: no valida el estado de la salida
 * (`OutingStatus`). Es responsabilidad de LB-61 no invocarla para salidas
 * `CANCELLED` o en cualquier estado donde no corresponda acreditar puntos;
 * este util solo resuelve la mecánica de acreditación e idempotencia.
 */
export async function awardAttendancePointsIfFirst(
    outingId: string
): Promise<{ awarded: boolean; amount?: number }> {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const outing = await Outing.findById(outingId).session(session);
        if (!outing) {
            await session.abortTransaction();
            return { awarded: false };
        }

        if (outing.attendancePointsAwarded) {
            await session.abortTransaction();
            return { awarded: false };
        }

        const bar = await Bar.findById(outing.bar).select('name closingTime').session(session).lean();

        const now = new Date();
        const barDayIndex = getBarDayOfWeek(now, bar?.closingTime);
        const amount = outing.attendancePointsSnapshot[ATTENDANCE_POINTS_DAY_KEYS[barDayIndex]] ?? 0;

        if (!amount || amount <= 0) {
            outing.attendancePointsAwarded = true;
            await outing.save({ session });
            await session.commitTransaction();
            return { awarded: false };
        }

        outing.attendancePointsAwarded = true;
        await outing.save({ session });

        await Group.updateOne(
            { _id: outing.group },
            { $inc: { pointsBalance: amount } },
            { session }
        );

        await PointsTransaction.create([{
            group: outing.group,
            outing: outing._id,
            bar: outing.bar,
            type: PointsTransactionType.ATTENDANCE,
            amount,
            label: `Asistencia — ${bar?.name ?? 'el bar'} (${formatBarDayLabel(now, bar?.closingTime)})`,
        }], { session });

        await session.commitTransaction();
        return { awarded: true, amount };
    } catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction().catch(() => { });
        }
        throw error;
    } finally {
        session.endSession();
    }
}

/** "dd/mm/aaaa" del día de bar (no del calendario) al que pertenece `date`. */
function formatBarDayLabel(date: Date, closingHour = '06:00'): string {
    const { start } = getBarDayRange(date, closingHour);
    return start.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
