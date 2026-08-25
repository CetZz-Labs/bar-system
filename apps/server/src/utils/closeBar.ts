import { Types } from 'mongoose';
import Bar from '../models/Bar';
import Shift, { ShiftEndReason } from '../models/Shift';
import { getLastClosingBoundary } from './shift';
import { closeOutingsForBar, ClosureReason } from './closeOuting';
import { writeAuditLog } from './auditLogService';

export type CloseBarOptions = {
    /** Cajero/dueño cuya acción disparó el cierre (auditoría). */
    actorUserId?: Types.ObjectId | string;
    deviceInfo?: string;
    ip?: string;
    /**
     * Boundary ya calculado por el caller (para no recalcularlo dos veces
     * cuando ya se resolvió `bar.closingTime` antes de invocar `closeBar`).
     * Si no se pasa, se calcula internamente a partir de `bar.closingTime`.
     */
    boundary?: Date;
};

export type CloseBarResult = {
    closedShifts: number;
    closedOutings: number;
};

/**
 * Cierra un bar (LB-66, extraído de la lógica que antes vivía inline en
 * `authenticateCashier`, LB-53/LB-62): corta todos los turnos de cajero
 * (`Shift`) que quedaron abiertos desde antes del último horario de cierre
 * del bar (`ShiftEndReason.BAR_CLOSED`) y cierra las salidas PENDING/ACTIVE
 * de ese bar (`closeOutingsForBar`, LB-62).
 *
 * Sigue siendo "lazy": no agrega ningún cron/scheduler. Queda disponible
 * para ser invocada desde cualquier punto que necesite evaluar/forzar el
 * cierre del bar (el middleware de cajero, la apertura de un nuevo contexto
 * cajero/dueño, etc.), en vez de duplicar esta lógica en cada lugar.
 */
export async function closeBar(barId: string, options: CloseBarOptions = {}): Promise<CloseBarResult> {
    const bar = await Bar.findById(barId);
    if (!bar) {
        return { closedShifts: 0, closedOutings: 0 };
    }

    const boundary = options.boundary ?? getLastClosingBoundary(bar.closingTime);

    const staleShifts = await Shift.find({
        bar: barId,
        endedAt: null,
        startedAt: { $lt: boundary },
    });

    for (const shift of staleShifts) {
        shift.endedAt = boundary;
        shift.endReason = ShiftEndReason.BAR_CLOSED;
        await shift.save();

        writeAuditLog({
            bar: new Types.ObjectId(barId),
            actorType: 'SYSTEM',
            eventType: 'shift.closed',
            entityType: 'Turno',
            entityId: shift._id,
            metadata: { shiftId: shift._id, endReason: ShiftEndReason.BAR_CLOSED },
            deviceInfo: shift.deviceInfo,
        });
    }

    const closedOutings = await closeOutingsForBar(barId, {
        reason: ClosureReason.BAR_CLOSED,
        actorUserId: options.actorUserId,
        deviceInfo: options.deviceInfo,
        ip: options.ip,
    });

    return { closedShifts: staleShifts.length, closedOutings };
}
