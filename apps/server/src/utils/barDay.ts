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
