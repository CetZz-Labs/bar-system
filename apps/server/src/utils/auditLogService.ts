import AuditLog from "../models/AuditLog";
import User from "../models/User";
import type { AuditEvent } from "../models/AuditLog";

/**
 * LB-77: escritor centralizado de auditoría, fire-and-forget.
 *
 * Contrato de comportamiento (`contratos/audit-log-events.md` §2/§3):
 * - Retorna `void` y NUNCA lanza (catch interno → `console.warn`).
 * - Es fire-and-forget: los callers la invocan SIN `await`.
 * - Un fallo del log NUNCA afecta la transacción principal ni el response.
 * - NO participa en sesiones de transacción Mongo: se llama siempre DESPUÉS
 *   de que la transacción del flujo principal ya hizo `commit`.
 *
 * Implementación base sin cola/retry (MVP): la inmutabilidad y la
 * eventualidad de la escritura son aceptables.
 */
export function writeAuditLog(event: AuditEvent): void {
    // try/catch deliberado: el contrato exige que writeAuditLog NUNCA lance.
    // Mongo nunca rechaza de forma síncrona, pero el guard cubre el caso
    // teórico de un `create` que tirara antes de devolver la promesa.
    try {
        // If caller didn't provide actorName, resolve it from User before
        // writing so future reads always have a name available.
        const resolveAndCreate = event.actorName
            ? Promise.resolve(event.actorName)
            : event.actorId
                ? User.findById(event.actorId).select("name").lean().then((u) => u?.name)
                : Promise.resolve(undefined);

        resolveAndCreate
            .then((resolvedName) => {
                const entry = {
                    ...event,
                    actorName: resolvedName || event.actorName || undefined,
                };
                return AuditLog.create(entry);
            })
            .catch((err) => {
                console.warn("[audit] write failed", err);
            });
    } catch (err) {
        console.warn("[audit] write failed", err);
    }
}
