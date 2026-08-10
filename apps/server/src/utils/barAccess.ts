import BarUser, { BarUserRole } from "../models/BarUser";

/**
 * Verifica si un usuario tiene membresía (cualquier rol) sobre un bar puntual.
 * Extraído de BarController para reutilizarse también desde ConsumptionController
 * (LB-60), evitando duplicar el chequeo entre controllers (backend.md §1).
 */
export async function verifyBarAccess(userId: string, barId: string): Promise<{ hasAccess: boolean; role?: BarUserRole }> {
    const barUser = await BarUser.findOne({ bar: barId, user: userId });
    if (!barUser) {
        return { hasAccess: false };
    }
    return { hasAccess: true, role: barUser.role };
}
