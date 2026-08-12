/**
 * "Día del bar": ventana [closingHour de ayer/hoy → next closingHour).
 * Default closingHour = 06:00 (LB-53).
 */

export function parseClosingHour(closingHour: string): { hours: number; minutes: number } {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(closingHour.trim());
    if (!match) {
        return { hours: 6, minutes: 0 };
    }
    return { hours: Number(match[1]), minutes: Number(match[2]) };
}

export function getBarDayRange(now: Date, closingHour = '06:00'): { start: Date; end: Date } {
    const { hours, minutes } = parseClosingHour(closingHour);

    const endCandidate = new Date(now);
    endCandidate.setHours(hours, minutes, 0, 0);

    let end: Date;
    let start: Date;

    if (now.getTime() < endCandidate.getTime()) {
        // Antes del cierre de hoy → el día del bar empezó ayer a closingHour
        end = endCandidate;
        start = new Date(endCandidate);
        start.setDate(start.getDate() - 1);
    } else {
        // Después (o igual) al cierre de hoy → día del bar corre hasta mañana
        start = endCandidate;
        end = new Date(endCandidate);
        end.setDate(end.getDate() + 1);
    }

    return { start, end };
}

/** True si el turno iniciado en `shiftStartedAt` ya cruzó el cierre del bar. */
export function isShiftPastBarClose(shiftStartedAt: Date, now: Date, closingHour = '06:00'): boolean {
    const dayWhenStarted = getBarDayRange(shiftStartedAt, closingHour);
    return now.getTime() >= dayWhenStarted.end.getTime();
}

/**
 * Día de la semana del "día del bar" al que pertenece `date`, con el mismo
 * criterio de índice que `IScheduleSlot.day`/`Date.getDay()`: 0=Sunday...
 * 6=Saturday. Ej: un consumo a las 03:00 del martes en un bar que cierra a
 * las 06:00 devuelve 1 (lunes), porque ese horario todavía pertenece al
 * "lunes de bar" (LB-59).
 */
export function getBarDayOfWeek(date: Date, closingHour = '06:00'): number {
    return getBarDayRange(date, closingHour).start.getDay();
}
