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

export interface OwnerAccessGranted {
    ok: true;
}

export interface OwnerAccessDenied {
    ok: false;
    status: number;
    message: string;
}

/**
 * Chequeo OWNER-only reusable. Introducido originalmente por LB-67, duplicado
 * localmente dentro de RewardController.ts (no había middleware OWNER-only
 * reusable en el repo). LB-74 lo extrae acá al necesitarlo por segunda vez
 * (ver progress/explorers/exp_LB-74.md §7) — mismo comportamiento exacto que
 * la versión original, sin cambios; RewardController.ts pasa a importarla.
 */
export async function resolveOwnerAccess(userId: string, barId: string): Promise<OwnerAccessGranted | OwnerAccessDenied> {
    const { hasAccess, role } = await verifyBarAccess(userId, barId);
    if (!hasAccess) {
        return { ok: false, status: 403, message: 'No tenés acceso a este bar' };
    }
    if (role !== BarUserRole.OWNER) {
        return { ok: false, status: 403, message: 'Solo el dueño del bar puede gestionar las recompensas' };
    }
    return { ok: true };
}
