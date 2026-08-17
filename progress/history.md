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

### [2026-08-15] - Auditoría retroactiva: LB-61 y LB-62 (código ya mergeado sin pasar por el harness)
- **Dominio afectado:** Monorepo (Backend + Frontend)
- **Contexto:** ambos tickets llegaron a `development` vía el commit
  `2d678cf` ("feat: confirm consumption points (LB-61) and close outings
  (LB-62)"), mergeado a través de `feat/puntos` sin pasar por el ciclo
  Explorer/Implementer/Reviewer de este harness — Jira los seguía mostrando
  "Tareas por hacer". El usuario pidió auditar el código real contra los
  criterios de aceptación literales de cada ticket antes de decidir si
  correspondía cerrarlos.
- **Subagentes involucrados:** Explorer
  (`progress/explorers/exp_LB-61-LB-62-audit.md` — gap analysis estático,
  sin `Bash`), Reviewer (`progress/reviewers/review_LB-61.md` y
  `progress/reviewers/review_LB-62.md` — verificación en vivo de los
  hallazgos del Explorer, corriendo los 6 comandos de verificación).
- **LB-61 ("Confirmar QR de consumo y acreditar puntos (líder)", assignee
  Jira: Franco Espinoza, no el usuario de esta sesión — auditado y movido
  a Done igual por decisión explícita del usuario):** los 13 criterios de
  aceptación v2 cumplen contra el código real
  (`LeaderConsumptionController`, `pointsHub.ts` para el saldo en tiempo
  real vía WebSocket, `consumptionQr.ts` para rate-limiting/idempotencia,
  `consumptionPoints.ts` para el redondeo `Math.floor($1.000=1pt)`,
  `attendancePoints.ts` para el trigger de LB-59 en el primer consumo).
  Gaps de cobertura de test no bloqueantes anotados (idempotencia HTTP de
  doble `accept`, rate-limit 429, casos `DISPUTED` en
  lookup/accept/reject, `pointsHub.ts` sin test unitario).
- **LB-62 ("Cierre administrativo de salida", assignee: el usuario de esta
  sesión):** 7 de 8 criterios v3 cumplen sin observaciones (`closeOuting.ts`,
  modal de cierre manual con texto exacto, abandono e invalidación de QR de
  consumos pendientes/rechazados/en disputa, idempotencia, notificación
  condicional, exclusión de `CANCELLED`). Un hallazgo real: el
  "auto-cierre al llegar la hora de cierre del bar" no es un job/cron
  proactivo — es "cierre perezoso" (`closeBar.ts`), disparado recién en el
  próximo login de cajero/dueño a ese bar después del horario, documentado
  así explícitamente en el propio código. **Decisión de negocio del
  usuario (vía `AskUserQuestion`): se acepta el lazy-close como diseño
  válido, no como deuda bloqueante.** Detalles estructurales no
  bloqueantes: `closedBy`/`closureReason` viven en `Outing`, no dentro de
  `IOutingSummary` (el contrato HTTP igual los expone), `redemptionCount`
  hardcodeado a `0` (no hay sistema de canjes en el repo todavía, coherente
  con `backend.md`), y falta de test HTTP para `OutingController.closeOuting`
  y para los paths `CANCELLED`/`NOT_CLOSABLE`/`REJECTED` de `closeOuting.test.ts`.
- **Veredicto del Reviewer:** `[APPROVED]` para ambos tickets, por
  separado. 343/343 tests server (coverage agregado sobre `utils/`+
  `middleware/` 93.57%/88.25%/92.53%/94.08%, sobre el umbral 80% aunque
  `closeOuting.ts` individualmente da 75% stmts — el gate configurado en
  `vitest.config.ts` es agregado, no por archivo), 168/168 tests client,
  lint y build limpios en ambos. Todos los gaps encontrados son deuda de
  testing (edge cases sin cobertura), ninguno es funcionalidad faltante.

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

### [2026-08-12] - Ad-hoc: resolución de conflictos de merge `feat/puntos` → `development`
- **Dominio afectado:** Backend (conflictos de código) + documentación
  (`progress/history.md`, resuelto directamente por el Leader)
- **Subagentes involucrados:** (sin Explorer — conflictos ya relevados
  directamente por el Leader al leerlos, sin ambigüedad arquitectónica),
  Implementer (`progress/implementers/impl_merge-conflict-bar-outing.md`),
  Reviewer (`progress/reviewers/review_merge-conflict-bar-outing.md`).
- **Contexto:** el usuario ejecutó `git merge feat/puntos` parado en
  `development` (sin ticket de Jira). Conflictos reales en
  `apps/server/src/models/Bar.ts` y `apps/server/src/models/Outing.ts`
  porque `development` ya traía mergeado **LB-55** ("Confirmar check-in de
  un grupo" — `checkInWindowHours`, `checkedInAt`/`checkedInBy`,
  `OutingController.confirmCheckIn`) mientras `feat/puntos` traía
  LB-59/LB-63 (puntos por asistencia).
- **Resumen de Cambios:** fusión aditiva de ambas features en los 2
  archivos — se mantuvieron ambos lados de cada bloque de conflicto sin
  descartar ni modificar ningún campo (`IBar`/`barSchema` con
  `checkInWindowHours` + `attendancePointsByDay`; `IOuting`/`outingSchema`
  con `checkedInAt`/`checkedInBy` + `attendancePointsSnapshot`/
  `attendancePointsAwarded`, todos como campos hermanos). Verificado que
  ninguna interacción entre ambas features rompe nada: 323 tests de server
  y 160 de client en verde, lint y build limpios en ambos lados. El
  implementer no ejecutó `git add`/`git commit` a propósito; el Leader
  marcó los 3 archivos resueltos (`Bar.ts`, `Outing.ts`, `history.md`) como
  resueltos vía `git add` recién después del veredicto del Reviewer, dejando
  el `git commit` final del merge en manos del usuario.
- **Nota abierta para el usuario (no resuelta acá, fuera de alcance):** con
  LB-55 ya mergeado, existe check-in real. El diseño de LB-59 toma el
  snapshot de puntos en `createOuting` porque en su momento el check-in no
  existía en el repo — cabe evaluar si `attendancePointsSnapshot` debería
  recalcularse en `confirmCheckIn` en su lugar. Queda pendiente de decisión
  de producto, no de esta resolución de conflictos.
- **Veredicto del Reviewer:** `[APPROVED]` - C1-C4 verificados contra el
  código real (sin marcadores de conflicto remanentes, ambos campos de
  cada feature presentes y sintácticamente válidos) y los 6 comandos de
  verificación corridos en vivo por el propio Reviewer (server + client).

### [2026-08-12] - LB-65: Congelar el mapa de puntos por día en el snapshot, no el día resuelto (rework de LB-59)
- **Dominio afectado:** Backend
- **Subagentes involucrados:** Explorer (`progress/explorers/exp_snapshot-vs-checkin.md`
  — investigación pedida por el usuario, sin ticket todavía en ese momento),
  Implementer (`progress/implementers/impl_LB-65.md`), Reviewer
  (`progress/reviewers/review_LB-65.md`).
- **Contexto:** con LB-55 ("Confirmar check-in") ya mergeado en `development`,
  el usuario pidió revisar si el diseño de LB-59 (snapshot de puntos tomado
  en `createOuting` porque el check-in real no existía en ese momento)
  seguía siendo correcto. La investigación encontró, con cálculo real, que
  el "día de bar" de `scheduledFor` puede diferir del día real de
  acreditación cuando `scheduledFor` cae cerca de la hora de cierre del
  bar — y que, según los propios escenarios de la spec de LB-59, el día
  correcto a usar es el del momento en que se confirma el primer consumo
  (LB-61), no el de la creación de la salida.
- **Resumen de Cambios:** `Outing.attendancePointsSnapshot` cambia de
  `number` a `IAttendancePointsByDay` (mapa completo, reutiliza
  `attendancePointsByDaySchema` ahora exportado desde `Bar.ts`).
  `createOuting`/`updateOuting` (LB-63) ya no resuelven qué día usar —
  solo copian el mapa completo vigente del bar (por valor, no por
  referencia), preservando la regla "no retroactivo". `awardAttendancePointsIfFirst`
  (`utils/attendancePoints.ts`) calcula el día de bar sobre el momento
  REAL de su propia invocación (`new Date()`), no sobre `scheduledFor`, y
  lee el monto del mapa congelado — misma firma de función, mismo
  comportamiento de idempotencia/transacción, contrato para LB-61
  actualizado y documentado explícitamente. Tests actualizados con
  `vi.useFakeTimers()` para demostrar de forma discriminante que el monto
  sale de la clave de "now", no de `scheduledFor`. 326/326 tests en verde,
  coverage 96.81%.
- **Nota abierta para el usuario, ya resuelta:** el reviewer encontró que
  sí existe precedente real de `apps/server/src/migrations/` para este
  tipo de caso (`add-profile-complete.ts` migra un cambio de forma de
  campo análogo). Consultado, el usuario confirmó que no hay datos reales
  de `Outing` en ningún entorno persistente todavía (proyecto pre-launch)
  — no se abre script de migración, tema cerrado sin acción de código.
- **Veredicto del Reviewer:** `[APPROVED]` - C1-C4 verificados contra el
  código real y los 3 comandos de verificación corridos en vivo por el
  propio Reviewer (incluye coverage). Observación no bloqueante sobre
  migración señalada con fuerza (ver nota arriba).

### [2026-08-15] - LB-66: Login unificado + contexto de cajero + apertura de turno (rescope de LB-53)
- **Dominio afectado:** Monorepo (Backend + Frontend)
- **Subagentes involucrados:** Explorer (`progress/explorers/exp_LB-66.md`),
  Implementer (`progress/implementers/impl_LB-66.md`), Reviewer
  (`progress/reviewers/review_LB-66.md`).
- **Contexto:** rescope acordado en el kickoff de Sprint 2 (2026-08-10) de
  LB-53 (login de cajero separado, ya cerrado con JWT/cookie propios). El
  Explorer encontró que **LB-24 (selector de contexto), que el ticket
  trataba como predecesor "ya cerrado", no existe en el código** — se
  construyó desde cero. También detectó que el cierre de salidas por
  horario de LB-62 (`closeOutingsForBar`, ya en `development` vía
  `feat/puntos`, commit `2d678cf`, sin pasar por este harness) ya estaba
  fusionado con el cierre de turno pero de forma inline dentro de
  `authenticateCashier`. Se resolvieron 3 decisiones de arquitectura vía
  `AskUserQuestion` antes de implementar: (1) cookie/JWT único `access_token`
  para todo, reemplaza `cashier_access_token`; (2) `closeBar(barId)`
  extraído como función reusable en `utils/`; (3) kick-out de sesión
  duplicada limitado al contexto cajero/dueño (patrón `Shift` existente),
  sin mecanismo genérico de sesión única para el login normal de usuario.
- **Resumen de Cambios:** Nuevo `ContextController` (`POST
  /api/context/select` con `mode: user|cashier|owner` + `GET
  /api/context/options`), `contextRoute.ts`, validado con
  `express-validator`. `mode: user` re-emite `access_token` solo con `{id}`;
  `cashier`/`owner` validan `BarUser` por rol (`BarUserRole`, no
  `User.role`), aplican kick-out del `Shift` previo, invocan `closeBar`
  antes de abrir turno nuevo, y re-emiten `access_token` con
  `{id, barId, role}`. `closeBar(barId, options)` nuevo en
  `utils/closeBar.ts`: cierra TODOS los `Shift` vencidos del bar (no solo
  el del request) + invoca `closeOutingsForBar` (LB-62). `authenticateCashier`
  adaptado a leer el cookie único y a delegar el auto-cierre en `closeBar`.
  Eliminados `CashierController.login`, `POST /cashier/login`,
  `CashierLoginView.tsx` y el cookie `cashier_access_token`.
  `CashierController.logout` ahora limpia la sesión completa (antes solo la
  de cajero), documentado como decisión aceptada, no regresión oculta.
  Frontend: `SelectContextView.tsx` (dominio `auth/`), `ContextAPI.ts`,
  `types/context.ts`; `LoginView.tsx` navega a `/select-context` solo si
  hay más de una opción de contexto (salto automático preservado si el
  usuario solo tiene rol "usuario"); `CashierLayout`/`useCashierAuth` se
  mantuvieron (no eliminados) y se adaptaron al cookie único, minimizando
  blast radius sobre el panel de cajero ya funcional. Sin panel de dueño
  dedicado todavía: `mode: owner` navega al mismo panel de cajero (único
  protegido por `authenticateCashier` que existe hoy), decisión documentada
  como dentro del alcance más simple que satisface el criterio del ticket.
- **Veredicto del Reviewer:** `[APPROVED]` (primera pasada) - C1-C4
  verificados contra el código real y los 6 comandos de verificación
  corridos en vivo por el propio Reviewer (343/343 tests server incl.
  coverage 93%+ en `utils/`+`middleware/`, 168/168 tests client, lint y
  build limpios en ambos). Confirmado sin `any` en producción, sin carpeta
  `services/`, sin residuos de `cashier_access_token` ni referencias
  colgantes a los archivos eliminados. Hallazgos no bloqueantes: `authenticate()`
  sin argumentos sigue sin contemplar `Role.USER!==ADMIN` para el selector
  (deuda preexistente, no introducida por este ticket) y `ContextController.select`
  no usa transacción Mongo para cierre-de-shift-previo + creación de shift +
  auditoría (mismo comportamiento que el código eliminado, no regresión).

### [2026-08-17] - LB-67: ABM de recompensas del bar (OWNER)
- **Dominio afectado:** Monorepo (Backend + Frontend)
- **Subagentes involucrados:** Explorer (`progress/explorers/exp_LB-67.md`),
  Implementer (`progress/implementers/impl_LB-67.md`), Reviewer
  (`progress/reviewers/review_LB-67.md`).
- **Contexto:** el ticket trataba LB-58 ("mismo patrón ABM") como predecesor
  ya resuelto — el Explorer confirmó que **LB-58 no existe en el código**
  (mismo patrón de sorpresa que LB-24 en LB-66), así que el ABM se construyó
  desde cero, sin plantilla. Tampoco existía middleware/util "OWNER-only"
  reusable: `verifyBarAccess` (`utils/barAccess.ts`) resuelve el rol pero
  ningún controller lo usaba para rechazar CASHIER hasta este ticket.
- **Resumen de Cambios:** Colección nueva `Reward` (autorizada explícitamente
  por este ticket, mismo patrón de comentario que `PointsTransaction`/
  `Consumption`): `bar`, `name`, `description?`, `pointsRequired` (int≥1),
  `unlimitedStock` (bool), `stock?` (condicional), `status`
  (`active|inactive`), `deletedAt` (soft-delete), índice único `{bar,name}`
  (no parcial — ver hallazgo no bloqueante). `RewardController` nuevo:
  `listRewards` (cualquier `BarUser`), `createReward`/`updateReward`/
  `deleteReward` (solo OWNER vía `resolveOwnerAccess`, 403 a CASHIER),
  `getAvailableRewards` (`GET /api/rewards/available?groupId=`, resuelve el
  bar desde la `Outing` en `status: ACTIVE` del grupo, filtra
  `status:active`+`deletedAt:null`+stock disponible). `E11000` (nombre
  duplicado) traducido a 409 vía guard `isMongoDuplicateKeyError` (copiado
  del patrón local de `OutingController.ts`, no extraído a `utils/`).
  Validación cross-field stock/`unlimitedStock` resuelta con `.if()` de
  express-validator en el `POST`, y en el controller para el `PUT` (depende
  de estado persistido + body parcial). Frontend: `BarRewardsView.tsx`
  (dominio `bar/`, ruta `/bar/:id/rewards`), lista de tarjetas (no `<table>`,
  seguí el patrón de `MyBarsView.tsx`) con alta/edición inline vía
  `react-hook-form` + `zodResolver` (se instaló `@hookform/resolvers`, no
  estaba en el repo pese a ser obligatorio por `frontend.md`), toasts
  `sonner` en las 3 mutaciones, controles condicionados a `isOwner` (rol
  resuelto vía `getMyBars()`, no vía contexto de LB-66). 12+23 tests backend
  nuevos, 5 tests frontend nuevos — 377/377 tests server, 173/173 tests
  client, lint y build limpios en ambos.
- **Veredicto del Reviewer:** `[APPROVED]` (primera pasada) - C1-C4
  verificados contra el código real y los 5 comandos de verificación
  corridos en vivo por el propio Reviewer. 3 hallazgos no bloqueantes: (1)
  índice único `{bar,name}` no parcial — una recompensa soft-deleted sigue
  bloqueando su nombre para siempre, sugerido `partialFilterExpression:
  {deletedAt:null}` como backlog; (2) **`BarRewardsView` no tiene ningún
  punto de entrada de navegación** (sin link desde `BarProfileView.tsx` ni
  `MyBarsView.tsx`) — solo alcanzable por URL directa, el Reviewer
  recomienda abrir un ticket de seguimiento inmediato antes de considerar la
  feature usable en producción; (3) inconsistencia menor de nomenclatura
  (`/api/bar/...` singular preexistente vs. `/api/bars/...` plural nuevo),
  no viola ninguna regla, solo observación de consistencia.
- **Fixup (2da pasada, mismo día, autorizado por el usuario vía
  `AskUserQuestion`):** se resolvieron los hallazgos (1) y (2) antes de
  mergear — (3) quedó explícitamente fuera de alcance. `Reward.ts` gana
  `partialFilterExpression: { deletedAt: null }` en el índice único
  `{bar,name}` (mismo patrón que `JoinRequest.ts`/`Outing.ts`), con test
  nuevo que introspecciona `Reward.schema.indexes()` para confirmar la
  configuración real (no cosmético). `BarProfileView.tsx` gana un botón
  "RECOMPENSAS DEL BAR" (`variant="surface"`, entre `<header>` y `<form>`)
  que navega a `/bar/:id/rewards`, visible a cualquier `BarUser` (el modo
  solo-lectura de CASHIER lo maneja `BarRewardsView` internamente); se
  descartó `MyBarsView.tsx` como punto de entrada por requerir tocar el
  click-through de `BarCard`. Diff aditivo puro sobre `BarProfileView.tsx`
  (17 líneas insertadas, 0 eliminadas). 378/378 tests server (+1 vs. la
  primera pasada), 173/173 tests client, sin regresiones. Reviewer:
  `[APPROVED]` (`progress/reviewers/review_LB-67-fixup.md`), sin cambios
  requeridos.
