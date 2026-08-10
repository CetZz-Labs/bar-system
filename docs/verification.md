# Verificación — "La Banda"

> Este documento define **cómo se verifica** que un cambio funciona, en
> ambas capas del monorepo. `CHECKPOINTS.md` §C4 es el **gate mínimo**
> obligatorio antes de cerrar un ticket; este archivo es la referencia
> detallada que explica esos comandos, qué cubren realmente, y qué no cubren
> todavía. Un `implementer` o `reviewer` que no haya leído esto puede correr
> los comandos correctos y aun así malinterpretar lo que un resultado verde
> significa.
>
> **Principio general:** una tarea no está "hecha" porque el código se ve
> bien. Está hecha cuando los comandos de esta guía terminan en verde
> **y** el `reviewer` los ejecutó él mismo (ver `.claude/agents/reviewer.md`
> — nunca se aprueba "mirando el código").

---

## 1. Backend (`apps/server`)

### Comandos

| Comando | Qué hace |
|---|---|
| `pnpm --filter @bar/server lint` | Alias de `tsc --noEmit` — chequeo de tipos estricto, sin emitir output. No es un linter de estilo (no hay ESLint en el server). |
| `pnpm --filter @bar/server test` | `vitest run` — corre toda la suite una vez, sin watch mode. |
| `pnpm --filter @bar/server test:coverage` | `vitest run --coverage` — corre la suite y genera reporte de cobertura (`text`, `lcov`, `json-summary`) vía provider `v8`. |
| `pnpm --filter @bar/server build` | `tsc` — compila a `dist/`. Útil para confirmar que no hay errores de build más allá del chequeo de tipos de `lint`. |

### Dónde viven los tests

Co-ubicados en carpetas `__tests__/` junto al código que prueban:
`src/controllers/__tests__/`, `src/middleware/__tests__/`,
`src/models/__tests__/`, `src/utils/__tests__/`. El setup global vive en
`src/__tests__/setup.ts`.

### Cobertura: qué cubre el gate y qué NO

El umbral de cobertura configurado en `vitest.config.ts` es **80%**
(statements, branches, functions, lines) — pero ese umbral **solo se mide
sobre `src/utils/**` y `src/middleware/**`**:

```ts
coverage: {
  include: ['src/utils/**/*.ts', 'src/middleware/**/*.ts'],
  exclude: [
    'src/__tests__/**', 'src/**/*.test.ts', 'src/server.ts', 'src/index.ts',
    'src/config/**', 'src/emails/**', 'src/routes/**',
    'src/controllers/**', 'src/models/**',
  ],
  thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
}
```

> ⚠️ **`controllers/`, `models/` y `routes/` están explícitamente excluidos
> del gate de cobertura.** Que `test:coverage` pase en verde **no** implica
> que un controlador o modelo nuevo esté cubierto por tests — implica
> únicamente que `utils/` y `middleware/` lo están. Si una tarea agrega o
> modifica lógica en un controller o modelo, el `reviewer` debe verificar la
> **existencia real de tests** para ese cambio (corriendo `test`, no
> `test:coverage`, y leyendo qué specs corrieron), no asumir cobertura por
> el resultado numérico del gate.

Esta es una brecha conocida de la línea base del proyecto, no un objetivo de
diseño — no se "arregla" ampliando el `include` del coverage dentro de un
ticket no relacionado a testing; eso requiere su propio ticket explícito.

---

## 2. Frontend (`apps/client`)

### Comandos

| Comando | Qué hace |
|---|---|
| `pnpm --filter @bar/client lint` | `eslint .` — linting real (reglas de `eslint-plugin-react-hooks`, `react-refresh`, `@tanstack/eslint-plugin-query`, TypeScript-ESLint). |
| `pnpm --filter @bar/client test` | `vitest run` sobre entorno `jsdom`. |
| `pnpm --filter @bar/client test:coverage` | `vitest run --coverage`. |
| `pnpm --filter @bar/client build` | `tsc -b && vite build` — chequeo de tipos por project references **más** el build real de Vite. Un error de tipos rompe el build igual que un error de bundling. |

### Dónde viven los tests

Co-ubicados junto al código (`*.test.ts` / `*.test.tsx`). Setup global en
`src/test/setup.ts`. El helper compartido `src/test/renderWithProviders.tsx`
envuelve cada componente testeado con un `QueryClientProvider` nuevo (retry
desactivado, `gcTime: 0`) y `BrowserRouter` — cualquier test de un
componente que use `useQuery`/`useMutation` o `react-router` debe usar este
helper en vez de `render` de Testing Library a secas.

> ⚠️ **No hay umbral de cobertura configurado en el frontend.**
> `vite.config.ts` no define un bloque `coverage.thresholds` — a diferencia
> del backend, `test:coverage` en el client genera el reporte pero no falla
> el comando si la cobertura es baja. El `reviewer` no puede apoyarse en un
> gate automático acá: para código de UI nuevo, verificar manualmente que
> existe al menos un test junto al archivo tocado, y que `test` corre esa
> spec (no solo que el comando global termina en verde).

---

## 3. Checklist mínima de verificación por tipo de cambio

| Cambio afecta a... | Comandos obligatorios |
|---|---|
| Solo `apps/server` | `lint` (server) → `test` (server) → si tocó `utils/`/`middleware/`: `test:coverage` (server) |
| Solo `apps/client` | `lint` (client) → `test` (client) → `build` (client) |
| Ambos | Todos los anteriores, en ambas apps |

Ningún comando se salta porque "el cambio es chico". Un `implementer` que
declara terminada una tarea sin haber corrido estos comandos está
incumpliendo `.claude/agents/implementer.md` (evidencia física obligatoria);
un `reviewer` que aprueba sin haberlos corrido él mismo está incumpliendo
`.claude/agents/reviewer.md` §"Ejecución de scripts obligatoria".

---

## 4. Cambios de UI: verificación más allá de los comandos

Los comandos de esta guía prueban que el código compila, tipa y pasa su
suite — no prueban que una vista se ve o se comporta bien. Para cambios en
`apps/client` que afecten una vista o componente visible:

- Verificar contra `docs/design.md` (tokens, componentes autorizados,
  accesibilidad) — esto no lo cubre ningún test automático hoy.
- Si el cambio toca un formulario, confirmar manualmente que los errores de
  validación aparecen inline (no como toast) y que el estado de error de
  `sonner` se dispara solo para fallos de mutación/red, no de validación de
  campo (ver `docs/conventions.md` §4 y `docs/design.md` §4).

---

## 5. Entorno local: qué necesita un `implementer` para correr esto

Para que los comandos de esta guía corran de verdad (no solo compilen), el
`implementer` necesita un entorno levantado:

- `apps/server` carga variables de entorno con `process.loadEnvFile()` desde
  un `.env` en `apps/server/` — requiere, como mínimo, `DATABASE_URL` (una
  instancia de MongoDB, no necesariamente la de producción),
  `JWT_SECRET`, `EMAIL_USER`/`EMAIL_PASSWORD` (si la tarea toca flujos de
  email) y `FRONTEND_URL`.
- `apps/client` requiere `VITE_API_URL` en `apps/client/.env` apuntando al
  backend local.
- Ninguna de las dos apps tiene hoy un `.env.example` — es una brecha de la
  línea base (ver `progress/history.md`, línea base inicial). Un
  `implementer` que necesite entorno local y no tenga acceso a los valores
  reales debe reportarlo como bloqueo, **nunca** hardcodear un secreto de
  prueba dentro del código para sortear el problema.
