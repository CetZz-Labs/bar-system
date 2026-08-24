/**
 * Conversión puntos → pesos argentinos (ARS), tasa fija (LB-74).
 *
 * No existía ninguna conversión punto→ARS en el repo antes de este ticket
 * (búsqueda confirmada sin resultados, ver progress/explorers/exp_LB-74.md
 * §4). Se usa para expresar "canjes entregados" en ARS equivalentes en el
 * dashboard del bar (utils/barDashboard.ts) y en la tabla de cajeros (donde
 * se resta como costo del "neto" por cajero) — LB-78 reusa la misma
 * constante para reportes exportables, sin recalcular la tasa.
 */
export const POINTS_TO_ARS_RATE = 1000;

export function pointsToArs(points: number): number {
    return points * POINTS_TO_ARS_RATE;
}
