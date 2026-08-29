/**
 * LB-94 — load test del dashboard OWNER (`GET /api/bars/:barId/dashboard`).
 *
 * IMPORTANTE (LB-94): el usuario pidió explícitamente dejar este script
 * armado y documentado, pero SIN correrlo hoy — la medición queda para más
 * adelante. No lo ejecutes contra ningún ambiente (ni siquiera local) salvo
 * indicación explícita de un humano.
 *
 * Qué hace: dispara `amount` requests concurrentes (`connections` conexiones
 * en paralelo, ver ticket: "100 requests concurrentes") contra el endpoint
 * del dashboard usando la API programática de `autocannon`, e imprime
 * latencia p50/p95 (aproximado con p97_5, ver nota abajo)/p99 y requests/seg.
 *
 * Requisitos previos:
 *   1. El servidor de `apps/server` corriendo (`pnpm dev` o `pnpm start`)
 *      apuntando a una base con datos de volumen representativos — ver
 *      `scripts/seed-lb94-volume.ts` (tampoco ejecutado todavía).
 *   2. Un usuario OWNER válido de `BAR_ID`, con su cookie de sesión
 *      (`access_token`, JWT httpOnly) a mano. Para conseguirla sin tocar
 *      cookies del browser: loguearse normalmente contra
 *      `POST /api/auth/login` con curl/Postman guardando cookies, o copiar
 *      el valor de `access_token` desde DevTools → Application → Cookies
 *      tras loguearse como OWNER de ese bar en el navegador.
 *
 * Variables de entorno requeridas:
 *   SERVER_URL    URL base del servidor corriendo (ej. http://localhost:4000)
 *   BAR_ID        ObjectId de un bar de prueba (con datos de volumen ideal)
 *   ACCESS_TOKEN  Valor del JWT de la cookie `access_token` de un OWNER de
 *                 ese bar (ver `src/middleware/auth.ts` — `authenticate()`
 *                 lee `req.cookies.access_token`)
 *
 * Variables de entorno opcionales:
 *   PERIOD        today|week|month (default: month — el rango más pesado,
 *                 el que más expone el problema de LB-94 en un bar con
 *                 mucho histórico)
 *   CONNECTIONS   conexiones concurrentes (default: 100)
 *   AMOUNT        cantidad total de requests a disparar (default: 100)
 *
 * Uso (desde apps/server):
 *   SERVER_URL=http://localhost:4000 BAR_ID=<id> ACCESS_TOKEN=<jwt> \
 *     npx tsx scripts/load-test-dashboard.ts
 */
import autocannon from 'autocannon';

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Falta la variable de entorno ${name}`);
    }
    return value;
}

async function main(): Promise<void> {
    const serverUrl = requireEnv('SERVER_URL').replace(/\/$/, '');
    const barId = requireEnv('BAR_ID');
    const accessToken = requireEnv('ACCESS_TOKEN');

    const period = process.env.PERIOD ?? 'month';
    const connections = Number(process.env.CONNECTIONS ?? 100);
    const amount = Number(process.env.AMOUNT ?? 100);

    const result = await autocannon({
        url: `${serverUrl}/api/bars/${barId}/dashboard?period=${period}`,
        connections,
        amount,
        headers: {
            cookie: `access_token=${accessToken}`,
        },
    });

    console.log('--- LB-94 load test: GET /api/bars/:barId/dashboard ---');
    console.log(`period=${period} | conexiones=${connections} | requests=${amount}`);
    console.log('');
    console.log(`Requests totales: ${result.requests.total}`);
    console.log(`Requests/seg (promedio): ${result.requests.average}`);
    console.log('Latencia (ms):');
    console.log(`  promedio: ${result.latency.average}`);
    console.log(`  p50: ${result.latency.p50}`);
    // autocannon no expone un percentil 95 exacto — p97_5 es el más cercano
    // disponible en su Histogram (ver @types/autocannon Histogram).
    console.log(`  p95 (aprox., autocannon expone p97_5): ${result.latency.p97_5}`);
    console.log(`  p99: ${result.latency.p99}`);
    console.log('');
    console.log(`Errores: ${result.errors} | Timeouts: ${result.timeouts} | non-2xx: ${result.non2xx}`);

    const objetivoMs = 500;
    if (result.latency.p99 > objetivoMs) {
        console.warn(`\n[LB-94] p99 (${result.latency.p99}ms) supera el objetivo de <${objetivoMs}ms.`);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
