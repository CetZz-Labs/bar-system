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

### [2026-08-12] - LB-59: Puntos por asistencia — config del bar por día de semana + acreditación al 1er consumo
- **Dominio afectado:** Monorepo (Backend + Frontend)
- **Subagentes involucrados:** Explorer (`progress/explorers/exp_LB-59.md` —
  escrito por el Leader ante la falta puntual de herramienta `Write` del
  subagente `explorer` en esa corrida; corregido después en
  `.claude/agents/explorer.md` para que el rol pueda escribir su propio
  reporte de ahí en más), Implementer (`progress/implementers/impl_LB-59.md`),
  Reviewer (`progress/reviewers/review_LB-59.md`).
- **Resumen de Cambios:** Campo `Bar.attendancePointsByDay` (7 enteros
  lunes-domingo, 0-1000, default 0), expuesto vía `GET/PATCH
  /bar/:id/perfil` con validación `express-validator` + Mongoose en ambas
  capas. Snapshot no-retroactivo en `Outing` (`attendancePointsSnapshot`,
  `attendancePointsAwarded: boolean`), calculado en `createOuting` sobre el
  día de bar (respetando `closingTime` de LB-53) de `scheduledFor` — no del
  momento de creación del POST. Nueva colección `PointsTransaction`
  (autorizada explícitamente por este ticket, mismo mecanismo que
  `Consumption` en LB-60) + campo `Group.pointsBalance`. Util idempotente
  `awardAttendancePointsIfFirst(outingId)` en
  `apps/server/src/utils/attendancePoints.ts` (NO en `services/`, carpeta
  inexistente en esta arquitectura) — transaccional, chequea el flag antes
  de escribir, valor 0 marca el flag sin generar historial ("silencio
  total"), con índice único adicional en `PointsTransaction.outing` como
  defensa en profundidad. Contrato publicado para que LB-61 (Franco
  Espinoza) lo invoque al confirmar el primer consumo — este ticket NO
  implementó ese endpoint de confirmación. Frontend: 7 inputs numéricos
  nuevos en `BarProfileView.tsx`, integrados al mismo form/mutation
  existente (no uno nuevo), sin `zodResolver` conectado (consistente con el
  resto del repo). 2 observaciones no bloqueantes documentadas: `Outing`
  legado sin migración de bares preexistentes sin el campo (se comportan
  como 0 en todos los días), y `updateOuting` no recalcula el snapshot si
  se cambia el `barId` de una salida `PENDING` (deuda angosta, ticket de
  seguimiento sugerido, no abierto todavía).
- **Veredicto del Reviewer:** `[APPROVED]` - C1-C4 de `CHECKPOINTS.md`
  verificados contra el código real y los 6 comandos de verificación
  corridos en vivo por el propio Reviewer (incluye coverage 96%+ en
  `utils/`+`middleware/`, por encima del umbral 80%).

### [2026-08-12] - LB-63: Recalcular attendancePointsSnapshot al cambiar el bar de una salida PENDING
- **Dominio afectado:** Backend
- **Subagentes involucrados:** (sin Explorer — bug ya diagnosticado con
  precisión por el Reviewer de LB-59, sin ambigüedad arquitectónica),
  Implementer (`progress/implementers/impl_LB-63.md`), Reviewer
  (`progress/reviewers/review_LB-63.md`).
- **Resumen de Cambios:** Ticket de seguimiento creado a partir de un
  hallazgo no bloqueante del Reviewer al cerrar LB-59.
  `OutingController.updateOuting` recalcula ahora `attendancePointsSnapshot`
  contra el bar nuevo cuando el `barId` cambia en el PATCH de una salida
  `PENDING` (mismo cálculo que `createOuting`: `getBarDayOfWeek` +
  `ATTENDANCE_POINTS_DAY_KEYS`), usando la `scheduledFor` efectiva
  post-edición si el mismo PATCH también la cambia. Si `barId` no cambia (o
  no viene), el snapshot queda intacto. El guard de estado existente
  (`OutingStatus !== PENDING` → 409) ya cortaba la ejecución antes del
  bloque nuevo, confirmado con test en runtime. No se tocó
  `attendancePointsAwarded`. 5 tests nuevos en
  `outingUpdate.test.ts`, 308/308 tests en verde.
- **Veredicto del Reviewer:** `[APPROVED]` - C1-C4 verificados contra el
  código real (`git diff --stat`, comparación línea por línea contra
  `createOuting`), comandos corridos en vivo, exención de
  `test:coverage` verificada de forma independiente (el ticket no tocó
  `utils/`/`middleware/`).

### [2026-08-12] - LB-64: Página 404 con botón para volver a la ruta anterior
- **Dominio afectado:** Frontend
- **Subagentes involucrados:** Explorer (`progress/explorers/exp_LB-64.md`),
  Implementer (`progress/implementers/impl_LB-64.md`), Reviewer
  (`progress/reviewers/review_LB-64.md`).
- **Resumen de Cambios:** Ticket pedido directamente por el usuario (no
  viene de spec de PM), con decisiones de UX confirmadas vía
  `AskUserQuestion` antes de crearlo: 404 visible (no redirect automático
  invisible) + botón "Volver" basado en `navigate(-1)` de react-router v7
  (sin sessionStorage/Context/Redux). Nueva vista
  `apps/client/src/views/NotFound.tsx` (mismo nivel que `views/Home.tsx`,
  patrón visual replicado de `GroupDetailView.tsx`/`JoinGroupView.tsx`).
  `<Route path="*">` agregado en `router.tsx` como hijo suelto de
  `<Routes>`, deliberadamente **fuera** de `AuthLayout`/`MainLayout` — el
  Explorer detectó que ambos layouts tienen guards de sesión que
  interceptarían la ruta 404 si quedara anidada dentro (`MainLayout`
  fuerza `/login` sin sesión, `AuthLayout` redirige si hay sesión activa).
  El botón "Volver" chequea `window.history.state?.idx` (sin precedente
  previo en el repo) para decidir entre `navigate(-1)` real o fallback a
  `/` cuando el usuario llegó directo a una URL rota sin navegación previa
  en la SPA. 2 tests nuevos (cubren mensaje 404 y camino de fallback; el
  camino de `navigate(-1)` con historial real queda sin cobertura por
  falta de infraestructura de test para simular profundidad de historial
  — limitación documentada, no bloqueante).
- **Veredicto del Reviewer:** `[APPROVED]` - C1/C3/C4 verificados contra
  el código real y los 3 comandos de verificación corridos en vivo por el
  propio Reviewer (157 tests en verde, sin regresiones). C2 no aplica
  (ticket 100% frontend).
