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

### [2026-08-17] - LB-68: Iniciar canje de recompensa (líder) — PAUSADO a mitad de implementación (no cerrado)
- **Dominio afectado:** Backend (parcial)
- **Subagentes involucrados:** Explorer (`progress/explorers/exp_LB-68.md`),
  Implementer (`progress/implementers/impl_LB-68-paused.md` — reporte de
  pausa, no el cierre normal `impl_LB-68.md`). Sin Reviewer todavía — el
  ticket no llegó a esa etapa.
- **Contexto:** el vault de Obsidian se actualizó a mitad de sesión con
  specs/contratos de Sprint 3 que no existían al arrancar (ruta del vault
  corregida de un path hardcodeado en `AGENTS.md` a `progress/vault.local.md`,
  local por-desarrollador — ver entrada de infraestructura más abajo). El
  spec real de LB-68 reveló que depende de **LB-72** ("Ver recompensas
  disponibles"), que a su vez estaba bloqueado por LB-70 (Franco Espinoza,
  saldo por bar, sin empezar). El usuario decidió (vía `AskUserQuestion`)
  pausar LB-68 y resolver LB-72 primero.
- **Resumen de lo ya construido (sin rutear, código muerto hasta que se
  retome):** colección nueva `Redemption` (autorizada por el ticket, patrón
  `Consumption`), `utils/redemptionQr.ts` (módulo paralelo a
  `consumptionQr.ts`, no reusado tal cual porque ese estaba acoplado a
  `Consumption` en 3/4 funciones — hallazgo del Explorer), `utils/redemptionAvailability.ts`
  (`getAvailablePointsForBar`/`getAvailableStock`, disponibilidad de puntos y
  stock calculada en vivo, SIN mutar `Group.pointsBalance`/`Reward.stock`
  durante el `HOLD` — decisión de arquitectura deliberada para que la reserva
  sea cancelable/expirable sin dejar rastro que revertir), `utils/redemptionExpiry.ts`
  (expiración lazy, sin cron, mismo patrón que `closeBar.ts`),
  `RedemptionController` (`create`/`cancel`/`list`/`getAvailablePoints`,
  ninguno rutado en `server.ts` todavía). `AuditLog.AuditAction` extendido
  con `REDEMPTION_GENERATED/CANCELLED/EXPIRED`. `pointsHub.ts` gana
  `emitAvailablePointsForBar` (evento `available_points_updated`).
  `tsc --noEmit` limpio, 378/378 tests server sin regresiones.
- **Pendiente explícito para cuando se retome** (documentado en el archivo de
  pausa): mover el consumo de `getAvailablePointsForBar` para que lo use el
  endpoint de LB-72 en vez de exponer uno propio (ya resuelto por LB-72, ver
  entrada siguiente); corregir el path de creación a
  `POST /api/groups/:groupId/redemptions` (anidado, no `/api/redemptions`
  plano); agregar estado `ABANDONED` a `Redemption` + lógica en
  `closeOuting.ts` para abandonar canjes `HELD` al cerrar la salida (LB-62),
  mismo patrón que ya existe ahí para `Consumption` vía `toAbandon` — el
  Leader había descartado esto por error al delegar la primera vez, corregido
  después de leer el spec real; rutas, tests, y todo el frontend (no
  empezado).
- **Veredicto:** N/A — ticket no cerrado, en pausa. No se transicionó en
  Jira. **Actualización: retomado y CERRADO el mismo día — ver la entrada
  siguiente a esta, después de la de LB-72, con el detalle completo del
  cierre.**

### [2026-08-17] - LB-72: Ver recompensas disponibles (líder/grupo)
- **Dominio afectado:** Monorepo (Backend + Frontend)
- **Subagentes involucrados:** Explorer (`progress/explorers/exp_LB-72.md`),
  Implementer (`progress/implementers/impl_LB-72.md`), Reviewer
  (`progress/reviewers/review_LB-72.md`).
- **Contexto:** bloqueaba a LB-68 (ver entrada anterior) y a su vez estaba
  bloqueado por LB-70 (Franco Espinoza, "saldo por bar", sin empezar) — el
  contrato del vault (`contratos/balance-history-endpoints.md`) anticipaba
  explícitamente que LB-70 y LB-72 comparten el cálculo de saldo por bar
  ("¿mismo servicio interno?"). Resuelto sin esperar a Franco: el Explorer
  encontró que el trabajo pausado de LB-68 ya había construido exactamente
  ese cálculo (`utils/redemptionAvailability.ts:getAvailablePointsForBar`,
  compilando y sin persistir nada) — LB-72 lo reusó tal cual en vez de
  reinventarlo o esperar.
- **Resumen de cambios:** endpoint único `GET /api/groups/:groupId/rewards`
  → `{ rewards, balance }` (`GroupRewardsController.getAvailable`,
  `routes/groupRewardsRoute.ts` con `Router({mergeParams:true})`, montado en
  `server.ts` antes del catch-all de `/api/groups`, mismo patrón que
  `outingRoute.ts`). El `barId` que manda el cliente por query string se
  ignora deliberadamente — el backend resuelve el bar internamente vía
  `Outing.findOne({group, status: ACTIVE})`, igual criterio que
  `RewardController.getAvailableRewards`/`RedemptionController.getAvailablePoints`
  (decisión de arquitectura del Leader, ningún endpoint de este dominio
  confía en un bar provisto por el cliente). Índice nuevo `{group,bar}` en
  `PointsTransaction` (aditivo, sin precedente previo, señalado como gap real
  por el Explorer). Frontend: vista nueva `GroupRewardsView.tsx` (no una
  "tab" literal como decía el texto del ticket — no existe sistema de tabs en
  el repo, es una vista-ruta hermana `/groups/:slug/recompensas`, mismo
  patrón de navegación que `ConfirmConsumptionView.tsx`), botón "Recompensas"
  condicional a LEADER/CO_LEADER en `GroupDetailView.tsx`, barra de progreso
  construida a mano con Tailwind (sin componente reusable en el repo),
  `useGroupPointsSocket` extendido con un tercer callback opcional
  (`onAvailablePoints`) para escuchar `available_points_updated` en la misma
  conexión/room existente, sin abrir un socket nuevo. Botón "Canjear" queda
  deshabilitado ("Próximamente", sin `onClick`) porque LB-68 (quien lo
  implementaría) está pausado. Ningún archivo de LB-68 fue modificado por
  este ticket — solo se importó `getAvailablePointsForBar` sin tocarlo,
  verificado explícitamente por el Reviewer vía `git status`/`git diff`.
  383/383 tests server, 176/176 tests client, tsc/eslint/build limpios en
  ambos lados.
- **Veredicto del Reviewer:** `[APPROVED]` (primera pasada) - C1-C4
  verificados contra el código real y los 5 comandos de verificación
  corridos en vivo por el propio Reviewer. 3 hallazgos no bloqueantes: (1)
  `frontend.md` exige toasts `sonner` también para errores de queries, pero
  el patrón real ya aprobado (`BarRewardsView.tsx`, LB-67) solo los usa para
  mutaciones — `GroupRewardsView` sigue ese precedente real, no el texto
  literal de la regla, señalado para que el Leader decida si actualiza
  `frontend.md` o abre una tarea aparte; (2) el Implementer duplicó la query
  Mongoose de recompensas disponibles (`Reward.find` + `toRewardDTO`) en vez
  de envolver/extender `RewardController.getAvailableRewards` como pedía
  literalmente el Leader — justificado porque `RewardController.ts` no
  exporta esas funciones y es de otro ticket ya cerrado (mismo patrón de
  duplicación intencional que ese archivo ya documenta para
  `isMongoDuplicateKeyError`), riesgo de desincronización futura si el
  filtro cambia de un lado y no del otro; (3) el endpoint backend no
  restringe por rol (cualquier miembro del grupo puede pegarle directo, la
  restricción a LEADER/CO_LEADER vive solo en el botón del frontend) — mismo
  criterio que `RewardController.getAvailableRewards`, no contradice ningún
  criterio de aceptación literal del ticket.

### [2026-08-17] - Infraestructura: ruta del vault de Obsidian movida de `AGENTS.md` a archivo local por-desarrollador
- **Dominio afectado:** Harness de IA (`AGENTS.md`, `progress/`), no
  `apps/server`/`apps/client`.
- **Contexto:** `AGENTS.md` (compartido, versionado) tenía hardcodeado un
  path de Windows específico de una máquina (`G:\_dev\cetzzOrganization\...`)
  para el vault de Obsidian del equipo. El usuario señaló que, al ser
  `AGENTS.md` compartido por todo el equipo, cada desarrollador terminaría
  pisando esa línea con su propia ruta local.
- **Resumen de cambios:** creado `progress/vault.local.md` (cubierto por el
  patrón `progress/*` ya existente en `.gitignore` — no se versiona) con la
  ruta real del vault en la máquina de este usuario. `AGENTS.md` editado para
  apuntar genéricamente a `progress/vault.local.md` en vez de a un path fijo,
  con instrucción de que cada desarrollador cree el suyo si no existe
  todavía. Hecho directamente por el Leader (no es código de negocio de
  `apps/server`/`apps/client`, es documentación del propio arnés de
  orquestación).
- **Veredicto:** N/A — no aplica ciclo de Reviewer, es infraestructura del
  harness, no una feature del producto.

### [2026-08-17] - LB-68: Iniciar canje de recompensa (líder) — QR + reserva — CIERRE (retomado tras LB-72)
- **Dominio afectado:** Monorepo (Backend + Frontend)
- **Subagentes involucrados:** Explorer (`progress/explorers/exp_LB-68.md`,
  reusado también `exp_LB-72.md`), Implementer (tres pasadas:
  `progress/implementers/impl_LB-68-paused.md` — primera, solo backend,
  pausada por el bloqueo de LB-72; `progress/implementers/impl_LB-68.md`
  secciones 1-8 — segunda pasada, completa el ticket; sección 9 — tercera
  pasada, fix de cobertura), Reviewer (`progress/reviewers/review_LB-68.md`,
  dos pasadas: primera `[CHANGES_REQUESTED]`, segunda `[APPROVED]`).
- **Resumen de cambios (acumulado de las 3 pasadas):** endpoint anidado
  `POST/PATCH/GET /api/groups/:groupId/redemptions[...]`
  (`groupRedemptionsRoute.ts`, `Router({mergeParams:true})`, montado en
  `server.ts` antes del catch-all de `/api/groups`, mismo patrón que
  `groupRewardsRoute.ts` de LB-72). Colección nueva `Redemption`
  (`HELD/VALIDATED/REJECTED/CANCELLED/EXPIRED/ABANDONED`), disponibilidad de
  puntos/stock calculada en vivo sin mutar `Group.pointsBalance`/`Reward.stock`
  durante el HOLD (`utils/redemptionAvailability.ts`, mismo archivo que ya
  reusa `GroupRewardsController` de LB-72 sin duplicarlo), expiración lazy
  sin cron (`utils/redemptionExpiry.ts`), módulo paralelo de QR/rate-limiting
  propio (`utils/redemptionQr.ts`, TTL 20 min, no comparte `Map` con
  `consumptionQr.ts`). `closeOuting.ts` gana un bloque nuevo que abandona
  (`ABANDONED`) los `Redemption` `HELD` de la salida al cerrarla, mismo
  patrón que ya existía ahí para `Consumption` vía `toAbandon` — libera el
  hold de inmediato en vez de esperar el TTL. `RedemptionController.getAvailablePoints`
  (endpoint de la primera pasada, nunca ruteado) fue eliminado por quedar
  100% redundante con el endpoint de LB-72. `cancel` scopea por
  `{_id, group}` (no solo `{_id}`), mismo criterio que
  `OutingController.cancelOuting`, para que un canje no sea cancelable a
  través de una URL con `groupId` ajeno. Frontend: el botón "Canjear" de
  `GroupRewardsView.tsx` (dejado deshabilitado por LB-72 a propósito) queda
  conectado — modal de confirmación con el texto exacto pedido por el
  ticket, QR + código manual + vencimiento al confirmar (estilo replicado
  de `CashierOutingView.tsx`/LB-60, sin componente compartido porque no
  existe ninguno en el repo), listado de canjes `HELD` propios con botón
  cancelar, saldo en vivo vía el `onAvailablePoints` que ya había extendido
  LB-72 más un update optimista con la respuesta de `create`. Ningún archivo
  de LB-72 fue modificado en ninguna de las 3 pasadas (verificado
  explícitamente por el Reviewer, no solo declarado por el Implementer).
- **Ciclo de revisión:** primera pasada del Reviewer `[CHANGES_REQUESTED]`
  — único bloqueo real: `pnpm --filter @bar/server test:coverage` fallaba
  (branches 78.44% < 80%) porque `redemptionQr.ts` (10.9% stmts) y
  `redemptionExpiry.ts` (0% stmts) quedaban siempre mockeados en los tests
  del controller, nunca ejercitados de forma real, y `getAvailableStock`
  tampoco tenía cobertura directa — el Implementer había corrido solo
  `vitest run` (que sí pasaba) y nunca `test:coverage`, el comando real que
  exige `CHECKPOINTS.md` C4 cuando se toca `utils/`. Todo lo demás (C1-C3,
  criterios de aceptación literales, decisiones de arquitectura, integración
  sin regresión con LB-72, scoping de `cancel`) ya había quedado verificado
  y correcto en esa primera pasada. Tercera pasada del Implementer: agregó
  exclusivamente 3 archivos de test nuevos (`redemptionQr.test.ts` —21
  tests, calcado del precedente `consumptionQr.test.ts`—,
  `redemptionExpiry.test.ts`, `redemptionAvailability.test.ts`), CERO
  archivos de producción tocados. `test:coverage` pasó a
  94.27%/88.33%/93.75%/95.02% (stmts/branches/funcs/lines), 416/416 tests
  totales.
- **Veredicto del Reviewer:** `[APPROVED]` (segunda pasada, tras el fix de
  cobertura) — C1-C4 verificados en vivo por el propio Reviewer en ambas
  pasadas (incluye `test:coverage` corrido dos veces, antes y después del
  fix), sin necesidad de re-auditar C1-C3/criterios de aceptación que ya
  habían quedado correctos en la primera pasada.

### [2026-08-20] - LB-76: Detalle de un bar (ficha para el cliente)
- **Dominio afectado:** Monorepo (Backend + Frontend)
- **Subagentes involucrados:** Explorer (`progress/explorers/exp_LB-76.md`),
  Implementer (`progress/implementers/impl_LB-76.md`, con una sección de
  fixup post-review al final), Reviewer (`progress/reviewers/review_LB-76.md`
  — primera pasada, y `progress/reviewers/review_LB-76-round2.md` — segunda
  pasada).
- **Contexto:** el vault tenía la spec completa
  (`specs/spec-LB-76-detalle-bar.md`) pero el contrato `reward-catalog.md`
  de LB-67 (owner Facundo) seguía "pendiente" sin completar — se ignoró, el
  código real ya mergeado de LB-67/LB-72 fue la fuente de verdad. El
  Explorer confirmó que **ningún endpoint existente permitía pedir recursos
  de un bar (perfil o recompensas) dado un `barId` directo sin pasar por
  `verifyBarAccess`(rol `BarUser`) o por `groupId`+`Outing` `ACTIVE`** — LB-76
  necesitaba ambos como vista pública para cualquier cliente logueado, sin
  rol y sin check-in. Ambigüedad de producto resuelta vía `AskUserQuestion`:
  el botón "Crear salida en este bar" usa un selector de grupo intermedio
  (modal nuevo), no query-param+auto-open ni restricción a un solo grupo.
- **Resumen de cambios:** dos endpoints nuevos bajo el prefijo singular
  existente `/api/bar` (no se agravó la inconsistencia `/api/bar` vs.
  `/api/bars` ya señalada en LB-67): `GET /api/bar/:id/detail`
  (`BarController.getPublicBarDetail` — 404 si el bar no existe o no está
  `ACTIVE`, sin `verifyBarAccess`, devuelve `name`/`address`/`closingTime`/
  `attendancePointsByDay` + `hasActiveCheckIn` calculado resolviendo los
  grupos del usuario y buscando una `Outing` `ACTIVE` en ese bar — sin
  filtrar grupo ni id de salida en el payload) y `GET
  /api/bar/:id/rewards/available` (`RewardController.getAvailableRewardsForBar`
  — mismo filtro `status:ACTIVE, deletedAt:null, stock disponible` que ya
  usaban `getAvailableRewards`/`GroupRewardsController.getAvailable`, pero
  resuelto directo del `barId` en vez de vía `groupId`+`Outing`). Ninguno de
  los endpoints preexistentes (`getBarProfile`, `listRewards`,
  `getAvailableRewards`, `GroupRewardsController.getAvailable`) fue
  modificado. Frontend: `Bar` gana `closingTime` (faltaba en el tipo pese a
  que el backend ya lo devolvía desde antes), vista nueva
  `BarDetailView.tsx` (ruta `/bar/:id`, distinta de `/bar/:id/perfil` que es
  edición del dueño) con info del bar, grilla de puntos de solo lectura
  (mismo layout que `BarProfileView.tsx` pero sin `<Input>`), `RewardCard`
  duplicado de `GroupRewardsView.tsx` sin el botón "Canjear" (mismo patrón
  de duplicación intencional ya aceptado en el repo), badge "Estás acá
  ahora" condicional a `hasActiveCheckIn`. `GroupPickerModal.tsx` nuevo
  (lista los grupos del usuario, navega a `/groups/:slug` con
  `state.preselectedBarId` — state de navegación, no query string).
  `OutingFormModal`/`OutingSection` ganan un prop opcional
  `preselectedBarId` (usado en el `reset()` inicial); `GroupDetailView`
  lee ese `state` una vez, auto-abre el modal de crear salida, y limpia el
  `state` con `navigate(..., {replace:true})` para que un refresh no lo
  reabra. Limitación documentada y aceptada por el Reviewer: si el grupo
  elegido en el picker tiene al usuario como `MEMBER` (no
  `LEADER`/`CO_LEADER`), el modal no se auto-abre — mismo guard
  `canManageOuting` que ya regía la creación de salidas, no es una regresión
  de este ticket.
- **Ciclo de revisión:** primera pasada del Reviewer `[CHANGES_REQUESTED]`
  — único motivo: `CHECKPOINTS.md` §C4 exige al menos un test junto a todo
  archivo de UI nuevo, y `BarDetailView.tsx`/`GroupPickerModal.tsx` no
  tenían ninguno (el Implementer había interpretado una instrucción
  ambigua del Leader como permiso para omitirlos; el Reviewer confirmó que
  esa instrucción no tiene autoridad sobre `CHECKPOINTS.md`). C1-C3 y el
  resto de C4 (5 comandos corridos en vivo) ya estaban correctos en esa
  primera pasada. Fixup: 8 tests nuevos (5 en `BarDetailView.test.tsx`, 3 en
  `GroupPickerModal.test.tsx`), cero archivos de producción tocados.
- **Veredicto del Reviewer:** `[APPROVED]` (segunda pasada, tras el fixup de
  tests) — gap de C4 verificado cerrado en vivo (188/188 tests client, lint
  limpio), C1-C3 confirmados sin cambios desde la primera pasada vía
  timestamps/`git diff --stat`.
- **Reapertura post-cierre (mismo día, tercera pasada):** con el ticket ya
  `Finalizada` en Jira, una prueba manual del usuario (con datos de prueba
  sembrados directamente en Mongo por el Leader — 4 `Reward` en un bar de
  prueba y una `Outing` existente movida a `ACTIVE` en ese bar para simular
  el check-in, ver nota operativa más abajo) encontró un gap real de UX no
  cubierto por los criterios literales del ticket: si el grupo elegido en
  `GroupPickerModal` ya tenía una `Outing` `PENDING`/`ACTIVE` (en cualquier
  bar), `OutingFormModal` caía en modo edición (`isEditMode = !!outing`) e
  ignoraba `preselectedBarId` por completo, sin avisar al usuario por qué
  el bar elegido en la ficha no aparecía precargado. Se reabrió el ticket en
  Jira (`En curso`) y se autorizó el fixup vía `AskUserQuestion`. Cambio
  aplicado: único archivo tocado,
  `apps/client/src/views/groups/components/OutingSection.tsx` — nuevo
  `useEffect` (gateado por `useRef` para dispararse una sola vez por
  montaje, no en cada refetch) que dispara `toast.info` de `sonner` cuando
  `preselectedBarId && canManageOuting && activeOuting`, aclarando además
  en qué bar está la salida existente si difiere del bar elegido. No se
  cambió el comportamiento (edición sigue prevaleciendo sobre creación),
  solo se lo comunicó. Sin test nuevo dedicado (archivo modificado, no
  nuevo, con `OutingSection.test.tsx` preexistente — mismo criterio de C4
  aplicado en la ronda 1).
- **Veredicto del Reviewer (tercera pasada):** `[APPROVED]`
  (`review_LB-76-round3.md`) — diff real confirmado como único archivo
  tocado, lógica del toast verificada línea por línea, 188/188 tests client
  y lint limpio corridos en vivo. Ticket vuelto a `Finalizada` en Jira.
- **Nota operativa (no versionada, no forma parte del código):** para la
  prueba manual se sembraron datos de prueba directo en la base de Atlas
  compartida (`LaBanda`) vía un script descartable corrido por el Leader
  desde el scratchpad de sesión (nunca escrito dentro de `apps/server`):
  4 `Reward` activas en el bar `6a3b1aa29fe4ddd4346bb4e4`, y la `Outing`
  `PENDING`/`ACTIVE` preexistente del primer grupo del usuario de prueba
  `correo2@correo.com` fue reutilizada/movida a `ACTIVE` en ese mismo bar
  para simular el check-in (el modelo solo permite una `Outing`
  `PENDING`/`ACTIVE` por grupo a la vez). Si esa salida formaba parte de
  otra prueba en curso de otro desarrollador, quedó pisada — no hay rollback
  automático, señalado explícitamente al usuario en el momento.
- **Reapertura #2 (mismo día, cuarta y quinta pasada):** el toast del fixup
  anterior no alcanzó — el usuario probó el flujo con la `Outing` ya
  `ACTIVE` (en curso, con check-in confirmado) y el modal de "Editar
  salida" se seguía abriendo igual, algo sin sentido de negocio (el propio
  código ya reconocía en `canEditOuting` que editar solo aplica a `PENDING`,
  pero el auto-open no respetaba esa regla; el backend además rechazaría
  cualquier guardado con 409). Causa raíz real: `modalOpen` se inicializaba
  en `true` de forma síncrona (`useState(() => !!preselectedBarId &&
  canManageOuting)`), antes de que la query de `activeOuting` resolviera,
  sin mirar su `status` en absoluto. Fix (mismo único archivo,
  `OutingSection.tsx`): `modalOpen` arranca en `false`; un ajuste de estado
  derivado durante el render (mismo patrón que `BarProfileView.tsx` —
  `setState` síncrono dentro de un efecto lo marca ESLint como error real,
  `react-hooks/set-state-in-effect`), gateado para correr una sola vez,
  abre el modal solo si no hay `activeOuting` o si su `status` es
  `PENDING`; para cualquier otro estado (`ACTIVE` incluido) el modal no se
  abre y el toast cambia de texto ("no se puede crear ni editar otra hasta
  que termine" en vez de prometer una edición que no va a pasar). El
  Reviewer (cuarta pasada) confirmó el fix correcto pero rechazó por falta
  de tests dedicados a esa lógica — criterio elevado explícitamente por el
  antecedente de que esa misma zona ya produjo un bug real invisible en dos
  rondas `[APPROVED]` previas. Fixup de solo-tests: 4 casos nuevos en
  `OutingSection.test.tsx` (creación silenciosa, edición+toast mismo bar,
  bloqueo+toast mismo bar — el que reproduce el bug real —, bloqueo+toast
  bar distinto), 192/192 tests en verde.
- **Veredicto del Reviewer (quinta pasada):** `[APPROVED]`
  (`review_LB-76-round5.md`) — confirmó por lectura que el test de bloqueo
  rompería contra el código viejo (no es un selector roto ni un falso
  positivo), diff acotado a un solo archivo de test verificado por
  timestamp, lint/test corridos en vivo. Nota no bloqueante: falta test
  dedicado para la combinación `PENDING` + bar distinto (solo se cubrió
  `PENDING` + mismo bar), no bloqueante porque el riesgo real (auto-abrir
  para un status no editable) ya queda cubierto por las 4 combinaciones
  de `status` probadas. Ticket vuelto a `Finalizada` en Jira — cinco
  rondas de review en total para este ticket, tres fixups post-aprobación
  inicial motivados por pruebas manuales del usuario que la suite
  automatizada no había capturado.
