/**
 * Puntos por consumo confirmado (LB-61).
 * Tasa: $1.000 = 1 punto. Redondeo hacia abajo (Math.floor).
 */
export function pointsFromAmount(amount: number): number {
    if (!Number.isFinite(amount) || amount < 0) return 0;
    return Math.floor(amount / 1000);
}
