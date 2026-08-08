const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Dado un horario de cierre "HH:MM", calcula el timestamp más reciente
 * (hoy o ayer) en el que ocurrió ese horario de cierre, relativo a `now`.
 *
 * Ejemplos:
 * - now = hoy 08:00, closingTime = "06:00" -> boundary = hoy 06:00
 * - now = hoy 03:00, closingTime = "06:00" -> boundary = ayer 06:00
 * - now = hoy 06:00, closingTime = "06:00" -> boundary = hoy 06:00
 */
export const getLastClosingBoundary = (closingTime: string, now: Date = new Date()): Date => {
    if (!TIME_REGEX.test(closingTime)) {
        throw new Error(`closingTime inválido: ${closingTime}. Formato esperado HH:MM`);
    }

    const [hours, minutes] = closingTime.split(':').map(Number);

    const boundary = new Date(now);
    boundary.setHours(hours, minutes, 0, 0);

    if (boundary.getTime() > now.getTime()) {
        boundary.setDate(boundary.getDate() - 1);
    }

    return boundary;
};
