/**
 * Allowlist de orígenes CORS compartida entre el middleware HTTP
 * (`config/cors.ts`) y el servidor WebSocket (`websocket/pointsHub.ts`).
 *
 * Fuentes de verdad:
 *  - `FRONTEND_URL`: lista separada por comas de orígenes exactos permitidos.
 *    Se hace trim de cada valor y se descartan los vacíos. Si no está seteada
 *    (o queda vacía tras el parseo) se usa el fallback de desarrollo.
 *  - `CORS_PREVIEW_ORIGIN_REGEX` (opcional): patrón que, si está seteado, se
 *    compila a `RegExp`. Cualquier `origin` que matchee ese patrón se acepta
 *    además de la lista exacta (pensado para las preview URLs de Vercel).
 *    Si no está seteada, solo se aceptan los orígenes exactos de la lista.
 */

const DEFAULT_ORIGIN = 'http://localhost:5173';

export interface OriginRules {
    /** Orígenes exactos permitidos (match por igualdad estricta). */
    allowList: string[];
    /** Patrón opcional de preview; `null` si la env var no está seteada. */
    previewRegex: RegExp | null;
}

/**
 * Parsea `FRONTEND_URL` (o el string recibido) como CSV de orígenes.
 * Devuelve `[DEFAULT_ORIGIN]` si no queda ningún valor útil.
 */
export function parseAllowedOrigins(
    raw: string | undefined = process.env.FRONTEND_URL,
): string[] {
    const list = (raw ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0);

    return list.length > 0 ? list : [DEFAULT_ORIGIN];
}

/**
 * Compila `CORS_PREVIEW_ORIGIN_REGEX` (o el string recibido) a `RegExp`.
 * Devuelve `null` cuando la variable no está seteada o está vacía.
 */
export function getPreviewOriginRegex(
    raw: string | undefined = process.env.CORS_PREVIEW_ORIGIN_REGEX,
): RegExp | null {
    const pattern = raw?.trim();
    if (!pattern) return null;
    return new RegExp(pattern);
}

/**
 * Resuelve las reglas de origen leyendo el entorno en el momento de la llamada.
 */
export function getOriginRules(): OriginRules {
    return {
        allowList: parseAllowedOrigins(),
        previewRegex: getPreviewOriginRegex(),
    };
}

/**
 * Decide si un `origin` entrante está permitido.
 *  - Sin `Origin` (curl, health checks, same-origin) → permitido.
 *  - Match exacto contra la allowlist → permitido.
 *  - Match contra el regex de preview (si está configurado) → permitido.
 *  - Cualquier otro caso → rechazado.
 */
export function isOriginAllowed(
    origin: string | undefined,
    rules: OriginRules = getOriginRules(),
): boolean {
    if (!origin) return true;
    if (rules.allowList.includes(origin)) return true;
    if (rules.previewRegex !== null && rules.previewRegex.test(origin)) return true;
    return false;
}
