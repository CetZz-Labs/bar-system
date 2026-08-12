# La Banda — Bitácora Histórica y Memoria de Arquitectura

### Documento de Registro Persistente (Append-Only)

> Este archivo registra las decisiones clave tomadas en el proyecto. **Ningún
> subagente debe borrar ni sobreescribir entradas pasadas**; todo nuevo
> registro se añade **al final** de la página, respetando el orden
> cronológico. Esta es la memoria de largo plazo del arnés — sobrevive a
> cualquier sesión individual.

---

## Línea base del proyecto (Brownfield Baseline Initial State)

> Estado del código en el momento en que se construyó el arnés de IA
> (`AGENTS.md`, `CHECKPOINTS.md`, `.claude/rules/`, `.claude/agents/`,
> `CLAUDE.md`). Toda entrada posterior de esta bitácora se lee en relación a
> esta línea base.

- **Monorepo `pnpm`**, compuesto por:
  - `apps/server` — Node.js, Express **5.2.1**, TypeScript, MongoDB vía
    **Mongoose** (sin ORM alternativo).
  - `apps/client` — React **19.2** SPA (sin SSR/Next.js), Vite, TypeScript,
    **TanStack Query v5**, Tailwind CSS **v4**.
- **Aislamiento de capas:** no existe paquete `packages/` compartido entre
  `apps/server` y `apps/client`. Los contratos y DTOs necesarios se replican
  **manualmente** en `apps/client/src/types/` — no hay generación automática
  ni tipos importados desde el backend.
- **Autenticación:** JWT enviado mediante cookie `HttpOnly`. El cliente Axios
  está configurado con `withCredentials: true` para propagar esa cookie en
  cada request.
- **Integración de gestión:** conexión directa a **Jira mediante servidor
  MCP**, usada exclusivamente por el subagente `leader` para lectura y
  transición de tickets.

---

## Decisiones arquitectónicas y deuda técnica inicial detectada

### ADR-01 — Validación en el backend

Se **prohíbe** el uso de `zod` en `apps/server` para mantener consistencia
con el par ya establecido `express-validator` (validación de transporte a
nivel de rutas) + `Mongoose` (validación de esquema a nivel de modelo). `zod`
se usa **únicamente** en `apps/client`, como resolver de `react-hook-form`.

- **Estado:** vigente, codificado en `.claude/rules/backend.md`.

### ADR-02 — Rutas en inglés

Deuda técnica identificada: rutas legadas en español conviven en la API
actual (ej. `/registro`, `/mis-bares`, `/activos`, `/activar`, `/perfil`).

- **Regla:** toda ruta nueva, o todo refactor de una ruta existente, debe
  hacerse **estrictamente en inglés**. Las rutas legadas en español no se
  tocan de forma reactiva — se migran solo cuando un ticket las toca por
  otro motivo.
- **Estado:** vigente, codificado en `.claude/rules/backend.md`.

### ADR-03 — Inconsistencia JWT vs. cookie

Deuda de sincronización identificada entre la firma del JWT (expira a los
**15 días**) y el `maxAge` de la cookie `HttpOnly` que lo transporta (expira
a las **15 horas**). El efecto práctico es que la cookie se invalida en el
navegador mucho antes de que el token firmado expire realmente.

- **Pendiente:** unificar ambos valores a **7 días**.
- **Estado:** deuda técnica abierta, sin ticket asignado todavía en Jira al
  momento de esta línea base.

---

## Plantilla de registro de tickets (append-only)

> Copiar este bloque para cada ticket cerrado y completarlo. Se añade
> siempre al final del archivo, después de la última entrada existente.

```markdown
### [YYYY-MM-DD] - [TICKET-ID]: Nombre del Ticket
- **Dominio afectado:** (Backend / Frontend / Monorepo)
- **Subagentes involucrados:** Implementer (`progress/implementers/impl_XXX.md`), Reviewer (`progress/reviewers/review_XXX.md`).
- **Resumen de Cambios:** Breve descripción de qué se creó o refactorizó.
- **Veredicto del Reviewer:** `[APPROVED]` - Cumplimiento verificado contra `CHECKPOINTS.md`.
```

---

## Registro de tickets

### [2026-08-07] - LB-51: Cancelar una salida
- **Dominio afectado:** Monorepo (Backend + Frontend)
- **Subagentes involucrados:** Explorer (`progress/explorers/exp_LB-51.md`),
  Implementer (`progress/implementers/impl_LB-51.md` y
  `progress/implementers/impl_LB-51-fixups.md`), Reviewer
  (`progress/reviewers/review_LB-51.md` y
  `progress/reviewers/review_LB-51-round2.md`).
- **Resumen de Cambios:** Nuevo endpoint `PATCH
  /api/groups/:groupId/outings/:outingId/cancel` (`OutingController.cancelOuting`)
  — solo líder/co-líder (403 si no), 409 si la salida ya no está `PENDING`,
  respuesta idempotente si ya estaba `CANCELLED` (no duplica notificación),
  setea `status = CANCELLED` + `canceledBy` + `canceledAt` dentro de una
  transacción Mongo, notifica in-app a los `invitees` con nuevo
  `NotificationType.OUTING_CANCELLED`. Frontend: botón "Cancelar salida" en
  `OutingSection.tsx` (mismo guard que "Editar"), modal de confirmación,
  mutación con `sonner` + invalidación de `["outings", "active", groupId]`.
  **Ronda adicional autorizada por el usuario:** el primer veredicto del
  Reviewer fue `CHANGES_REQUESTED` únicamente por C4 (deuda técnica
  preexistente no relacionada al ticket: test frágil en `groupInvite.test.ts`
  dependiente de `process.env.FRONTEND_URL` no controlado, y 38 problemas de
  `eslint` en 13 archivos del client). El usuario autorizó expandir el
  alcance del Implementer para resolver ambas causas (14 archivos tocados
  fuera del diff original de LB-51, incluyendo un cambio de comportamiento
  menor no-regresivo en el loading de `GroupDetailView.tsx`/
  `PendingRequestsList.tsx`, evaluado y aceptado por el Reviewer en la
  segunda pasada).
- **Veredicto del Reviewer:** `[APPROVED]` (segunda pasada, tras el fixup de
  C4) - Cumplimiento verificado contra `CHECKPOINTS.md` C1-C4, los 5
  comandos de verificación en verde.

### [2026-08-10] - LB-60: Registrar consumo y generar QR de confirmación (cajero)
- **Dominio afectado:** Monorepo (Backend + Frontend)
- **Subagentes involucrados:** Explorer (`progress/explorers/exp_LB-60.md`),
  Implementer (`progress/implementers/impl_LB-60.md`,
  `impl_LB-60-fixups.md`, `impl_LB-60-cashier-rework.md` — esta última
  hecha directamente por el Leader ante la indisponibilidad temporal del
  subagente `implementer`), Reviewer (`progress/reviewers/review_LB-60.md`,
  `review_LB-60-round2.md` y `review_LB-60-final.md`, esta última la
  auditoría de cierre real).
- **Resumen de Cambios:** Rol `CASHIER` en `BarUserRole`, modelo
  `Consumption` (colección nueva, autorizada explícitamente por este
  ticket), componente reutilizable de QR + código manual de 6 dígitos
  (`generate/validate/invalidate`, con rate limiting en memoria para LB-61)
  en `utils/consumptionQr.ts`, endpoints `POST/PATCH/GET
  /api/outings/:outingId/consumptions[...]`. **Rework de auth:** se
  descubrió que LB-53 (ya en `development`) construyó un sistema completo
  de sesión de cajero (`Shift`, `AuditLog`, `authenticateCashier` +
  `req.cashierContext`, `BarUserRole` reducido a `OWNER | CASHIER`) —
  `ConsumptionController` se reescribió para usar ese flujo real en vez de
  `authenticate()` genérico, y la auditoría de creación pasa a `AuditLog`
  real. Frontend: `CashierOutingView.tsx` (registrar consumo, warning de
  monto > $500.000, mostrar/regenerar QR y código, listar pendientes),
  enganchada desde `CashierSearchView.tsx` para salidas ya `ACTIVE`.
  Sin desglose por catálogo (LB-58 no existe todavía) ni endpoint de
  confirmación (LB-61, fuera de alcance). De paso se agregó a
  `backend.md` la prohibición de `any` en producción y se retipó todo el
  backend existente que la violaba, y se corrigieron varios gates
  preexistentes ajenos al ticket (coverage de `middleware/`/`cashierSearch.ts`
  en el backend, mocks/bugs en `CashierAPI.ts`/tests de cajero en el
  frontend) para poder dejar los 6 comandos de `CHECKPOINTS.md` C4 en verde.
- **Veredicto del Reviewer:** `[APPROVED]` (auditoría de cierre,
  `review_LB-60-final.md`) - C1-C4 verificados contra el código real en
  disco y los 6 comandos de verificación corridos en vivo por el propio
  Reviewer. 5 hallazgos no bloqueantes documentados para LB-61/LB-58 y
  para higiene de código.

### [2026-08-11] - LB-55: Confirmar check-in de un grupo
- **Dominio afectado:** Monorepo (Backend + Frontend)
- **Subagentes involucrados:** Explorer (`progress/explorers/exp_LB-55.md`),
  Implementer (`progress/implementers/impl_LB-55.md`), Reviewer
  (`progress/reviewers/review_LB-55.md`).
- **Resumen de Cambios:** Nuevo endpoint `PATCH /api/outings/:outingId/check-in`
  (`OutingController.confirmCheckIn`), protegido con `authenticateCashier` —
  403 si la salida no pertenece al bar del cajero, 404 si no existe, 409 si el
  status no es `PENDING` (CANCELLED/COMPLETED), 409 si está fuera de la
  ventana horaria (`now < scheduledFor` o `now > scheduledFor +
  checkInWindowHours`). Nuevo campo `Bar.checkInWindowHours` (default 4,
  configurable por bar). `Outing` gana `checkedInAt`/`checkedInBy`; al
  confirmar, `status` pasa a `ACTIVE` dentro de una transacción Mongo que
  también crea notificaciones `NotificationType.OUTING_CHECKED_IN` (nuevo)
  para el LEADER y CO_LEADER del grupo (no todos los invitees). Idempotente:
  doble tap sobre una salida ya `ACTIVE` responde 200 sin re-notificar ni
  pisar `checkedInAt`/`checkedInBy`. Frontend: reemplazado el placeholder
  `toast.message('Check-in: pendiente LB-55')` en `CashierSearchView.tsx` por
  una mutación real (`CashierAPI.confirmCheckIn`) con toast de éxito/error
  (`sonner`) y navegación a la vista de la salida.
  **Decisión de alcance:** el criterio de aceptación pedía "notificación
  push", pero el repo no tiene infraestructura de push real (sin
  `web-push`/`firebase-admin`/etc. en `apps/server/package.json`) — se
  implementó como notificación in-app, mismo patrón que
  `OUTING_CREATED`/`UPDATED`/`CANCELLED`, verificado explícitamente por el
  Reviewer como la única interpretación consistente con las librerías
  autorizadas de `.claude/rules/backend.md`.
- **Veredicto del Reviewer:** `[APPROVED]` (primera pasada) - Cumplimiento
  verificado contra `CHECKPOINTS.md` C1-C4, los 5 comandos de verificación en
  verde (293/293 tests server, 154/154 tests client, lint y build limpios).

### [2026-08-11] - LB-60 (fixup): Auditoría completa + isUnusualAmount
- **Dominio afectado:** Backend
- **Subagentes involucrados:** Explorer (`progress/explorers/exp_LB-60-verify.md`),
  Implementer (`progress/implementers/impl_LB-60-fixups.md`), Reviewer
  (`progress/reviewers/review_LB-60-fixups.md`).
- **Contexto:** LB-60 ("Registrar consumo y generar QR de confirmación",
  Lautaro Zuleta) ya estaba `Finalizada` en Jira. Una auditoría de código
  independiente, pedida por el usuario tras cerrar LB-55, encontró gaps reales
  contra los criterios de aceptación literales del ticket (no solo falta de
  tests). El usuario autorizó explícitamente resolverlos en este repo aunque
  el ticket no está asignado a este agente.
- **Resumen de Cambios:** `AuditLog` gana `amount?`/`outing?`/`group?` y la
  acción `CONSUMPTION_REGENERATED`. `ConsumptionController.createConsumption`
  ahora audita monto/salida/grupo (antes solo cajero/hora/bar).
  `ConsumptionController.regenerateConsumption` antes no auditaba nada — ahora
  también deja registro completo. `Consumption` gana `isUnusualAmount:
  boolean` (default `false`), calculado en `createConsumption` contra un
  umbral de $500.000 duplicado a mano en el backend (mismo valor que
  `apps/client/src/types/consumption.ts`, por aislamiento de monorepo) — no
  bloqueante, no expuesto en ninguna respuesta HTTP, solo trazabilidad.
  Explícitamente fuera de alcance: desglose por catálogo (bloqueado por
  LB-58, inexistente) y todo lo de LB-61.
- **Veredicto del Reviewer:** `[APPROVED]` (primera pasada) - C1-C4
  verificados, 297/297 tests (suite completa server), lint limpio. Nota: este
  fixup no se reflejó en Jira (ticket ya cerrado, no asignado a este agente) —
  pendiente de decisión del usuario sobre comentar/notificar en LB-60.

### [2026-08-11] - Bug ad-hoc: listado por defecto en búsqueda de cajero (LB-54)
- **Dominio afectado:** Monorepo (Backend + Frontend)
- **Subagentes involucrados:** Explorer
  (`progress/explorers/exp_cashier-search-default-load.md`), Implementer
  (`progress/implementers/impl_cashier-search-default-load.md`), Reviewer
  (`progress/reviewers/review_cashier-search-default-load.md`).
- **Contexto:** Reportado directo por el usuario (sin ticket de Jira):
  `/bar/:barId/cajero/buscar` no listaba los grupos con salida `PENDING`/`ACTIVE`
  del bar al entrar a la vista — solo tras escribir 2+ caracteres. Causa raíz
  en dos puntos independientes: frontend (`enabled: debounced.length >= 2`
  nunca dispara con query vacía al montar) y backend
  (`searchGroupsForCashier` cortaba con `{results: []}` para cualquier
  `q.length < 2`, sin rama de "listado por defecto").
- **Resumen de Cambios:** `apps/server/src/utils/cashierSearch.ts` gana una
  rama nueva para `q.length === 0` que devuelve todas las salidas
  `PENDING`/`ACTIVE` del bar en el rango del día sin filtro de nombre;
  extraído un helper privado `fetchOutingsForBar` reusado también por la rama
  de texto ≥2 chars (sin cambio de comportamiento ahí). `q.length === 1` sigue
  devolviendo `{results: []}` sin cambios. Frontend:
  `CashierSearchView.tsx` cambia `enabled: debounced.length >= 2` a
  `debounced.length !== 1` para que la query dispare también al montar, y el
  mensaje de "sin resultados" ahora contempla el listado por defecto vacío.
- **Veredicto del Reviewer:** `[APPROVED]` (primera pasada) - C1-C4
  verificados, los 5 comandos de verificación en verde (298/298 tests server,
  155/155 tests client, lint y build limpios).
