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

### [2026-08-25] - LB-84: Auditoría de autorización end-to-end (endpoints × roles)
- **Dominio afectado:** Backend
- **Subagentes involucrados:** Explorer (`progress/explorers/exp_LB-84.md`),
  Implementer (`progress/implementers/impl_LB-84.md`), Reviewer
  (`progress/reviewers/review_LB-84.md`).
- **Contexto:** Sprint 5 · Hardening, prioridad CRÍTICA — devs reportaron
  usuarios logueados con un rol viendo vistas/datos de otro rol. El usuario
  (dueño de producto) sospechaba que `User.role` (campo legado) convivía mal
  con `BarUser.role` (tabla intermedia usuario↔bar). El Explorer confirmó la
  sospecha y encontró **cuatro** fuentes de rol coexistiendo: `User.role`
  (enum `Role` ADMIN/USER/OWNER/WAITER, efectivamente muerto — nunca se
  asigna nada más que el default), `BarUser.role` (`BarUserRole`
  OWNER/CASHIER, fuente real a nivel bar), `Group.memberships[].role`
  (`MembershipRole`, fuente real a nivel grupo) y `User.memberships[].role`
  (copia denormalizada solo para mostrar, dual-write manual sin
  transacción, nunca usada para autorizar). El JWT no da confianza ciega en
  ningún rol firmado — todo se re-consulta fresco contra Mongo en cada
  request, así que "rol revocado mid-sesión" ya funcionaba bien de antes.
- **Resumen de Cambios:** dos gaps reales de seguridad corregidos: (1)
  mass assignment en `POST /api/auth/register`
  (`AuthController.createAccount` hacía `User.create(req.body)` sin
  whitelist — permitía auto-asignarse `role: ADMIN`, `isActive: true`,
  `profileComplete: true`; ahora extrae explícitamente solo los campos
  legítimos de registro); (2) `BarController.updateBarProfile`/
  `uploadBarLogo`/`uploadBarCover` no exigían `BarUserRole.OWNER` (un
  CASHIER podía editar nombre/teléfono/hora de cierre/tabla de puntos y
  subir logo/portada del bar) — ahora rechazan con 403 al mismo patrón
  inline que `DrinkCategoryController`. **Decisión de producto (fase de
  desarrollo, sin necesidad de compat con datos viejos):** se eliminó por
  completo `User.role`/enum `Role` de `models/User.ts`,
  `middleware/auth.ts` (`authenticate()` ya no toma parámetro de roles,
  ~30 rutas actualizadas) y el endpoint huérfano
  `PATCH /api/bars/:id/activar` + `BarController.activateBar` (confirmado
  sin uso desde el frontend, único endpoint gateado por `Role.ADMIN`,
  tratado como feature no construida en vez de inventar un reemplazo).
  Tests nuevos solo donde había gaps reales (suite nueva para
  `createAccount`, 403 CASHIER en los 3 métodos de `BarController`, JWT
  expirado, regresión de rol/cuenta revocada mid-sesión) — no se reescribió
  lo que ya cubría bien (doble sesión vía kick-out de `Shift`, cajero
  desactivado). Documentado `docs/AUTHZ_MATRIX.md` (nuevo) como matriz
  completa endpoint→rol→fuente de verdad→mecanismo, contrato para **LB-85**
  (`AUTH-2`, Franco Espinoza, segregación de vistas por rol en frontend,
  bloqueada por este ticket) — se dejó comentario en LB-85 con dos casos
  concretos encontrados a pedido del usuario: `BarProfileView.tsx` sin
  ningún guard de rol (gemelo exacto del gap #2 de backend), y `MainLayout`
  que no valida el "modo" del JWT (nada impide que una sesión cajero/dueño
  navegue por URL directa a `/groups`/`/bar/mis-bares`). Alcance
  estrictamente backend — LB-85 se encarga de los guards de frontend.
- **Hallazgos no bloqueantes, fuera de alcance (pendiente decisión del
  usuario sobre abrir tickets de seguimiento):** `GroupController.getGroupById`/
  `getGroupMembers` no verifican membresía del solicitante (cualquier
  usuario autenticado ve datos de cualquier grupo por ID) — documentado en
  `docs/AUTHZ_MATRIX.md`. Test preexistente fallando en
  `LeaderConsumptionController.accept` (`leaderConsumption.test.ts`),
  confirmado independientemente por el Reviewer (vía `git stash` contra
  baseline) como ajeno al diff de LB-84 y al dominio de auth/roles.
- **Veredicto del Reviewer:** `[APPROVED]` (primera pasada) — C1/C2/C4
  verificados contra el código real y los comandos corridos en vivo por el
  propio Reviewer (590/591 tests, único fallo confirmado preexistente;
  coverage de `middleware/`+`utils/` 89.24%/94.91%, sobre el umbral 80%).
  C3 no aplica (ticket 100% backend). Cambios sin commitear en working tree
  al momento del veredicto (22 archivos) — commit/push pendiente de
  decisión del usuario.

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

### [2026-08-21] - LB-79: Explorar bares (listado + puntos del día + filtros)
- **Dominio afectado:** Monorepo (Backend + Frontend)
- **Subagentes involucrados:** Explorer (`progress/explorers/exp_LB-79.md`),
  Implementer (`progress/implementers/impl_LB-79.md`), Reviewer
  (`progress/reviewers/review_LB-79.md`).
- **Contexto:** el contrato del ticket (`closeTime`, `hasActiveCheckin`)
  divergía de las convenciones ya establecidas por LB-76 en el mismo dominio
  (`closingTime`, `hasActiveCheckIn`). Resuelto vía `AskUserQuestion` antes
  de delegar al Implementer: se homologó a `closingTime`/`hasActiveCheckIn`.
  Se dejó comentario en LB-79 sugiriendo a quien redacta specs validar
  nombres de campo contra el código real antes de publicar el contrato.
- **Resumen de cambios:** endpoint nuevo `GET /api/bars?search=X` →
  `[{ id, name, address, closingTime, todayAttendancePoints, hasActiveCheckIn }]`
  (`BarController.listBars`, `routes/barsRoute.ts`, router plural montado en
  `server.ts` **después** de `/api/bars/:barId/rewards` existente para
  evitar riesgo de orden de mount). Sin N+1: 1 query a `Bar` (filtrada por
  `status: ACTIVE`, con `$regex` case-insensitive sin anclas + escape de
  caracteres especiales para `search`, mismo patrón que `cashierSearch.ts`),
  1 query a `User` + 1 a `Outing` (sin filtrar por bar) para resolver
  `hasActiveCheckIn` de todos los bares vía `Set` en memoria —
  `todayAttendancePoints` calculado 100% en memoria con `getBarDayOfWeek` +
  `ATTENDANCE_POINTS_DAY_KEYS` (reusado de `utils/barDay.ts`/`attendancePoints.ts`,
  sin tocar esos archivos), tolerando `attendancePointsByDay` undefined en
  bares pre-LB-59. Auth: `authenticate([Role.USER, Role.ADMIN])`, igual que
  `getPublicBarDetail` (LB-76). Frontend: `ExploreBarsView.tsx` (ruta
  `/bar/explorar`, español por consistencia con `/bar/registro`/`/bar/mis-bares`
  hermanas, aunque los identificadores de código quedaron en inglés), cards
  con patrón de `MyBarsView.tsx`, búsqueda con debounce manual (patrón de
  `CashierSearchView.tsx`, sin hook `useDebounce` reusable en el repo), tipo
  nuevo `ExploreBar` en `types/bar.ts` (espejo manual, no reusa
  `BarPublicDetail`), función nueva `exploreBars` en `API/BarAPI.ts`. Punto
  de entrada agregado en `Home.tsx` (segundo botón, no en el bottom nav
  compartido de `MainLayout` para evitar tocar un componente global). Badge
  "Estás acá" (texto acortado respecto al "Estás acá ahora" de LB-76 por
  espacio de la card) — decisión de UI confirmada por el Reviewer como no
  bloqueante. 4 tests backend nuevos (incluye verificación explícita de
  `toHaveBeenCalledTimes(1)` en `User.findById`/`Outing.find` como evidencia
  real de no-N+1), 5 tests frontend nuevos. 428/428 tests server, 197/197
  tests client (un fallo puntual de flakiness pre-existente en
  `CashierSearchView.test.tsx`, no tocado por este ticket, confirmado no
  regresivo al re-correrlo aislado), lint y build limpios en ambos lados.
- **Veredicto del Reviewer:** `[APPROVED]` (primera pasada) - C1-C4
  verificados contra el código real y los 5 comandos de verificación
  corridos en vivo por el propio Reviewer. Sin cambios requeridos. Ticket
  transicionado a "Finalizada" en Jira.

### [2026-08-21] - LB-69: Validar y entregar canje (cajero)
- **Dominio afectado:** Monorepo (Backend + Frontend)
- **Subagentes involucrados:** Explorer (`progress/explorers/exp_LB-69.md`),
  Implementer (`progress/implementers/impl_LB-69.md`), Reviewer
  (`progress/reviewers/review_LB-69.md`).
- **Contexto:** siguiente ticket en la cola del usuario tras el cierre de
  LB-68 (su único bloqueante). Rama `feat/69` creada desde `development`. El
  Explorer encontró un hueco arquitectónico real: `getAvailablePointsForBar`/
  `getAvailableStock` (`utils/redemptionAvailability.ts`, LB-68) solo restan
  `Redemption` en estado `HELD` — pasar a `VALIDATED` sin otra mutación
  habría hecho que el saldo/stock "volvieran a subir" al entregar un canje,
  contradiciendo el criterio de aceptación literal ("puntos y stock quedan
  definitivos"). **Decisión de arquitectura resuelta con el usuario vía
  `AskUserQuestion`** (sin precedente en el código, dos opciones viables):
  se optó por el mecanismo simétrico a `ATTENDANCE`/`CONSUMPTION` — nuevo
  `PointsTransactionType.REDEMPTION` (monto negativo) + decremento directo
  de `Reward.stock` — en vez de ampliar los cálculos en vivo para restar
  también `VALIDATED` sin dejar historial persistente.
- **Resumen de cambios:** endpoint nuevo `POST /api/redemptions/:tokenOrCode/validate`
  (+ `POST /:tokenOrCode/lookup` de preview, decisión del implementer dentro
  del margen que dejaba el ticket) en `CashierRedemptionController.ts`,
  montado como `/api/redemptions` (prefijo libre, sin colisión con
  `groupRedemptionsRoute.ts`), protegido con `authenticateCashier` — dirección
  invertida respecto a LB-61 (ahí el líder valida algo del cajero; acá el
  cajero valida algo del líder). `resolveHeldRedemption` encadena rate
  limiting (`redemptionQr.ts`) → resolución de token/código → expiración lazy
  puntual (`redemptionExpiry.ts`, extendido para aceptar filtro por `_id`) →
  scoping por bar del cajero (chequeo agregado por el implementer, no pedido
  explícitamente por el ticket, mismo patrón que `ConsumptionController`) →
  chequeo de estado (`ABANDONED` se interpreta como "salida cerrada", único
  motivo real de ese estado hoy) → chequeo de `Outing.status === ACTIVE`.
  `deliver`: transacción Mongo con doble-check anti-carrera, crea
  `PointsTransaction{type:REDEMPTION, amount negativo}` + `$inc` en
  `Group.pointsBalance` + `$inc:{stock:-1}` en `Reward` si no
  `unlimitedStock`, audita `REDEMPTION_VALIDATED`, notifica a
  líderes/co-líderes, emite `emitAvailablePointsForBar`. `reject`: mismo
  patrón transaccional sin ningún contador de rechazos ni transición a
  disputa (a diferencia de `LeaderConsumptionController.reject` — LB-69 es
  one-shot, `Redemption` ni siquiera tiene `rejectCount`), motivo predefinido
  + "Otro" (modelado en frontend con zod; backend solo exige string no
  vacío). Modelo `Redemption` gana `cashier`/`validatedAt` (no existían,
  a diferencia de `Consumption.cashier`). `PointsTransaction.amount` se
  relajó de `min:1` a `Number.isInteger(v) && v!==0` para admitir montos
  negativos, sin afectar `ATTENDANCE`/`CONSUMPTION` (siguen siendo positivos
  por construcción del caller). `AuditAction`/`NotificationType` ganan
  `REDEMPTION_VALIDATED`/`REDEMPTION_REJECTED`. Frontend: vista nueva
  `CashierRedemptionsView.tsx` (dominio `cashier/`, ruta
  `/bar/:barId/cajero/canjes`), reusa el lector QR/`BarcodeDetector` de
  `CashierSearchView.tsx`, modal de rechazo con `react-hook-form`+
  `zodResolver`, botón de entrada real agregado en `CashierPanelView.tsx`
  (a diferencia del hallazgo no bloqueante que tuvo `BarRewardsView` en
  LB-67, acá se agregó el punto de entrada desde el arranque). 425/425 tests
  server (coverage 94.27%), 184/184 tests client, lint/build limpios en
  ambos lados.
- **Veredicto del Reviewer:** `[APPROVED]` (primera pasada) — C1-C4
  verificados contra el código real y los 6 comandos de verificación
  corridos en vivo por el propio Reviewer. Confirmó explícitamente que el
  débito persistente queda resuelto de fondo (no solo declarado): verificó a
  mano que `getAvailablePointsForBar` resta el `PointsTransaction` negativo
  de forma permanente y que `getAvailableStock` no se recupera tras la
  entrega porque `Reward.stock` ya bajó. Confirmó también la idempotencia
  real (tanto el corte externo por estado como el doble-check transaccional
  concurrente, este último con test dedicado que verifica
  `session.abortTransaction` sin doble mutación) y que los cambios en
  archivos de LB-68/LB-72 (`Redemption.ts`, `AuditLog.ts`, `Notification.ts`,
  `PointsTransaction.ts`, `redemptionExpiry.ts`, `server.ts`) son aditivos y
  acotados. Única observación: el scoping por bar del cajero, aunque
  correcto y necesario, fue una extensión de alcance que idealmente se
  hubiera mencionado al Leader antes de implementarla — no bloqueante, sin
  cambios requeridos. Nota no bloqueante adicional: falta un test dedicado
  (distinto del de carrera concurrente) para el camino de segunda llamada
  secuencial sobre un canje ya `VALIDATED`, cubierto solo indirectamente por
  lectura de código.

### [2026-08-21] - LB-74: Dashboard del bar (OWNER)
- **Dominio afectado:** Monorepo (Backend + Frontend)
- **Subagentes involucrados:** Explorer (`progress/explorers/exp_LB-74.md`),
  Implementer (`progress/implementers/impl_LB-74.md`), Reviewer
  (`progress/reviewers/review_LB-74.md`).
- **Contexto:** siguiente ticket en la cola tras LB-69 (sus 3 bloqueantes —
  LB-67, LB-69, LB-62 — ya Done), implementado sobre la misma rama `feat/69`
  (encima del commit de LB-69, sin mergear a `development` todavía por
  decisión explícita del usuario: se juntan ambos tickets y se mergea recién
  al final). El ticket citaba un "contrato día 1"
  (`contratos/bar-dashboard-aggregations.md`) que a primera vista parecía no
  existir — el vault de Obsidian local (`C:\_dev\Cetzz\obsidian\obsidian`,
  ruta ahora documentada en `progress/vault.local.md`) estaba desactualizado
  2 commits (`SPRINT 2 - tareas`, `SPRINT 3 - specs y demas`); tras
  `git pull` apareció el contrato real, como stub sin completar (`estado:
  pendiente`, "Facundo: completá abajo"). **El Leader completó el contrato
  técnico** en el propio vault (documentación de coordinación con LB-78, no
  código) a partir de la exploración real del código + 3 decisiones de
  arquitectura/negocio resueltas con el usuario vía `AskUserQuestion` (sin
  precedente en el repo para ninguna de las tres): (1) resolución de
  disputas = estado nuevo `RESOLVED_BY_OWNER` en `Consumption` (no reusa
  `CONFIRMED`/`REJECTED`, con `resolutionOutcome`/`resolutionNote`); (2)
  "neto por cajero" = Consumo ARS − ARS equivalente de canjes entregados;
  (3) las 4 secciones del dashboard se calculan con Mongo `aggregate()`/
  `$group` — primer uso de ese patrón en todo el repo (todo lo anterior era
  `find().lean()`+`.reduce()` en JS) — sin cache (no hay Redis autorizado),
  siempre on-demand. Contrato completado y pusheado al repo del vault
  (commit `2137e09`, `CetZz-Labs/obsidian`) antes de delegar al
  `implementer`, para que LB-78 (Juan) lo pueda consumir.
- **Resumen de cambios:** `GET /api/bars/:barId/dashboard` (query
  `period|from|to|cashierId|status`, rango máximo 3 meses en `custom` → 400
  si se excede) + `PATCH /api/bars/:barId/consumptions/:consumptionId/resolve`
  (body `{outcome, note}`), ambos con `authenticate()` normal (no
  `authenticateCashier`) + `resolveOwnerAccess` — **extraída de
  `RewardController.ts` a `utils/barAccess.ts`** (segunda vez que se
  necesitaba, sin cambio de comportamiento, tests de `RewardController` sin
  diff). Módulo reusable `utils/barDashboard.ts` (6 funciones exportadas,
  independientes del controller HTTP, pensadas explícitamente para que
  LB-78 las importe sin duplicar queries — mismo criterio que
  `getAvailablePointsForBar` de LB-68/72) con las 4 secciones vía
  `aggregate()`: stat cards (grupos del período, consumo ARS, puntos
  otorgados desglosados consumo/asistencia, canjes entregados + ARS
  equivalente), tabla de actividad (una fila por `Outing`, estado derivado
  con prioridad `"disputa"` si tiene algún `Consumption.DISPUTED`, si no
  mapea `ACTIVE→"en curso"`/`COMPLETED`+`NO_SHOW→"finalizada"`/
  `PENDING→"reservada"`), panel de disputas, tabla de cajeros (con "neto" =
  consumo−canjes por columna, fila de totales sumando columnas, no
  recalculada aparte). 4 índices nuevos (`Outing{bar,checkedInAt}`/
  `{bar,scheduledFor}`, `Consumption{bar,createdAt}`/`{bar,cashier,createdAt}`,
  `PointsTransaction{bar,createdAt}`, `Redemption{bar,status,validatedAt}`)
  — ninguno existía, confirmado por el Explorer. `POINTS_TO_ARS_RATE=1000`
  en `utils/points.ts` (no existía conversión punto→ARS en el repo).
  Frontend: `BarDashboardView.tsx` (dominio `bar/`, ruta
  `/bar/:barId/dashboard`), filtros reflejados en la URL vía
  `useSearchParams` (deep-linkable, criterio explícito del ticket), modal de
  resolución de disputa con `react-hook-form`+`zod`, auto-refresh de 60s SÍ
  implementado (marcado opcional en la spec, no atrasó), botón "Ver
  registros" (LB-77, inexistente) deshabilitado "Próximamente", botón de
  entrada real desde `BarProfileView.tsx`. 453/453 tests server (coverage
  agregado 94.46%/86.64%/94%/95.47%), 190/190 tests client, lint/build
  limpios en ambos lados.
- **Decisiones del implementer dentro del margen del contrato** (evaluadas
  y aceptadas por el Reviewer, sin bloquear): default `period=today`;
  `week`/`month` como ventanas fijas de 7/30 días terminando en el día de
  bar de hoy (no calendario); el filtro `status` de la tabla de actividad
  **no** se aplica a la tabla de cajeros (se aparta de la letra literal del
  contrato, que decía que ambos filtros aplicaban a ambas tablas, pero no
  hay una fila-por-salida en la tabla de cajeros a la que mapear ese estado
  sin inventar semántica nueva — señalado como observación no bloqueante
  para que el usuario confirme o ajuste el contrato); scoping anti-crossbar
  del `resolve` con 404 genérico (no el 403 anti-enumeración que usó LB-69
  para cajeros, criterio distinto porque acá el OWNER ya está autenticado
  contra el bar puntual); dropdown de cajeros resuelto con una query extra
  a `GET /dashboard` sin filtros (no hay endpoint dedicado de "listar
  cajeros del bar" y crear uno hubiera excedido los 2 endpoints del
  contrato).
- **Veredicto del Reviewer:** `[APPROVED]` (primera pasada) — C1-C4
  verificados contra el código real y los 6 comandos de verificación
  corridos en vivo por el propio Reviewer (incluye `test:coverage`).
  Confirmó fidelidad exacta al contrato del vault (shape de ambos
  endpoints, los 4 índices con sus claves exactas, uso real de `aggregate()`
  en las 4 secciones — cero `find()+reduce()` para esta funcionalidad),
  el mecanismo completo de `RESOLVED_BY_OWNER` (otorga/no otorga puntos
  según `outcome`, scoping, auditoría), la fórmula exacta de "neto", la
  extracción limpia de `resolveOwnerAccess`, auth real (403 a `CASHIER`
  verificado con test), y que las 6 funciones de `barDashboard.ts` están
  genuinamente reusables por LB-78 (exportadas a nivel de módulo, sin
  `Request`/`Response`). 3 observaciones no bloqueantes: el apartamiento
  documentado sobre el filtro `status` en la tabla de cajeros (ver arriba),
  inconsistencia de nombre de param de ruta (`:id` en `/bar/:id/rewards` vs.
  `:barId` en la ruta nueva, cosmético), y el helper `pointsToArs()` que
  queda exportado sin uso interno (`barDashboard.ts` multiplica por la
  constante directo) — pensado a propósito para que LB-78 lo reuse.

### [2026-08-24] - LB-77: Log de auditoría del bar (eventos sensibles)
- **Dominio afectado:** Monorepo (Backend + Frontend)
- **Subagentes involucrados:** Explorer (`progress/explorers/exp_LB-77.md`), Implementer (`progress/implementers/impl_LB-77.md`), Reviewer (`progress/reviewers/review_LB-77.md`).
- **Contexto / decisiones de arquitectura:** el ticket llegó con la spec completa (`specs/spec-LB-77-log-auditoria.md`) pero el contrato técnico (`contratos/audit-log-events.md`) era un STUB sin completar. El Explorer desmintió un gap de spec que el Leader había reportado y relevó que el modelo `AuditLog` de LB-53 (shape `bar/user/action` + enum `AuditAction` de 17 valores) NO coincidía con el schema canónico de la spec (`actorType/actorId/actorName/eventType/entityType/entityId/metadata`). El Leader completó el contrato técnico (schema + interface `writeAuditLog` + 15 eventTypes con payload + contrato Vista OWNER) y el usuario confirmó la **Opción A (reshape del modelo existente)** por sobre una colección paralela.
- **Resumen de Cambios:** `models/AuditLog.ts` reshapeado al schema canónico (bar, actorType CASHIER|OWNER|SYSTEM|LEADER, actorId OPCIONAL — resuelve el caso SYSTEM que antes "inventaba" un user, actorName snapshot, eventType, entityType, entityId, metadata Mixed, deviceInfo?, ip?, createdAt); eliminados enum `AuditAction` y campos `action`/`amount`/`outing`/`group`/`redemption`. Writer centralizado `writeAuditLog(event): void` en `utils/auditLogService.ts` (NO en services/) — fire-and-forget, sin await, nunca lanza, catch → console.warn. Los 17 call sites migrados de `AuditLog.create` a `writeAuditLog` sin await. **Fix del bug transaccional grave:** `closeOuting.ts` ya no crea el log dentro de la transacción (emite `salida.closed` después del commit). Eventos faltantes agregados: `checkin.confirmed` (OutingController), `reward.created/edited/deleted` (RewardController, LB-67 no auditaba nada), `shift.opened`/`shift.closed`. Endpoint OWNER-only `GET /api/bars/:barId/audit-logs` (resolveOwnerAccess, 403 a CASHIER) con filtros from/to/eventType/actorType/actorId/entityId/q ($regex sobre actorName + campos string de metadata), paginación por cursor base64url, export CSV (`?format=csv`, reutiliza patrón `shiftSummaryExport.ts`). Frontend: `views/bar/BarAuditLogView.tsx` (dominio bar/), ruta `/bar/:barId/auditoria`, entry point real "VER REGISTROS DE AUDITORÍA" en `BarDashboardView.tsx` (no queda solo por URL directa, aprendido de LB-67), `types/audit.ts` duplicado a mano, axios central, react-query v5, toasts sonner.
- **Veredicto del Reviewer:** `[APPROVED]` - C1-C4 verificados contra el código real y los 6 comandos de verificación corridos en vivo por el propio Reviewer (server lint 0, server test 536, coverage 93.36% stmts / utils 94.45% / auditLogService 100% — sobre umbral 80%, client lint 0 errors, client build EXIT 0, client test 220). Observaciones no bloqueantes: tipos `AuditEvent`/`AuditEventType` definidos en `models/AuditLog.ts` en vez de `types/audit.ts` (desviación de ubicación sugerida, coherente); `closeOuting.ts` no emite `salida.closed` cuando no llega `actorUserId` (comportamiento conservado, fuera de alcance).

### [2026-08-24] - LB-78: Reportes exportables del bar (OWNER)
- **Dominio afectado:** Monorepo (Backend + Frontend)
- **Subagentes involucrados:** Explorer (`progress/explorers/exp_LB-78.md`), Implementer (`progress/implementers/impl_LB-78.md`), Reviewer (`progress/reviewers/review_LB-78.md`).
- **Contexto / decisiones de arquitectura:** ticket listo (bloqueantes LB-73 y LB-74 ya Done). El Explorer relevó que **NO existe infraestructura async/jobs/cron** ni modelo de reportes generados, y que **no hay librería PDF** (el unico PDF del repo es generado a mano, texto plano, sin logo/tablas). Dos decisiones confirmadas con el usuario via AskUserQuestion: (1) reporte >=30 dias → **Opcion A**: generacion SINCRONA + entrega por email con adjunto (nodemailer, ya instalado), sin cola/worker; (2) libreria PDF **`pdfmake`** autorizada explicitamente (rompe la lista cerrada de backend.md §2). El Leader completo el contrato tecnico `contratos/bar-reports-export.md` en el vault antes de delegar.
- **Resumen de Cambios:** endpoint `GET /api/bars/:barId/reports?kind=consumptions|redemptions|shifts|consolidated&format=csv|pdf&from=&to=` (una sola ruta con `kind`, no 4 rutas, por no-determinismo de params anidados en Express 5.2.1 — desviacion aprobada y documentada en el contrato). Auth `authenticate([USER,ADMIN])` + `resolveOwnerAccess` (403 CASHIER). Rango max 3 meses → 400 (reusa `exceedsMaxRange`/`MAX_RANGE_MONTHS`). Rango <30 dias → attachment 200; >=30 dias → `ReportEmail.sendReportEmail` con adjunto → 202. Modulo nuevo `utils/barReports.ts` (funciones puras, reusa `pointsToArs`/`POINTS_TO_ARS_RATE`, `getDashboardStatCards`; fuente de puntos del consolidated = `PointsTransaction`, misma que barDashboard). `buildReportPdf` con pdfmake (header nombre bar + logoUrl + periodo, tabla, totales). Frontend: `views/bar/BarReportsView.tsx` (ruta `/bar/:barId/reportes`), entry point real "VER REPORTES" en `BarDashboardView.tsx`, `API/ReportAPI.ts` (blob), `types/reports.ts` espejo manual, toasts sonner. 568 tests server / 226 client, coverage barReports.ts 97%.
- **Veredicto del Reviewer:** `[APPROVED]` - C1-C4 verificados contra el codigo real y los 6 comandos de verificacion corridos en vivo. Observaciones no bloqueantes: flake preexistente en CashierRedemptionsView.test.tsx (LB-69), desviacion de 1-ruta-con-kind documentada, warnings de lint y chunk >500kB preexistentes.
- **Nota operativa del Leader:** el contrato se escribio inicialmente en la raiz de D:\ por un bug de ruta en el comando (no en el vault); corregido moviendolo al vault y actualizado para reflejar el diseno real de 1-ruta-con-kind. El reporte del explorer no fue persistido por el subagente; se reconstruyo en disco para trazabilidad. Ambos tickets (LB-77 y LB-78) quedaron en Listo en el vault y SIN commitear en la rama `feat/LB-77-78` (commit/merge pendiente del usuario).
### [2026-08-24] - LB-78 (fixup): correcciones de reportes pedidas por el usuario
- **Dominio afectado:** Monorepo (Backend + Frontend)
- **Subagentes involucrados:** Implementer (`progress/implementers/impl_LB-78-fixup.md`), Reviewer (`progress/reviewers/review_LB-78-fixup.md`).
- **Resumen de Cambios:** (1) ESTADO en español en CSV+PDF de consumos y canjes (`CONSUMPTION_STATUS_LABELS`/`REDEMPTION_STATUS_LABELS` en `utils/barReports.ts`, con fallback al valor crudo). (2) PDF de Consumos: eliminada la 7ma columna vacia y widths `['auto','*','*','*','auto','auto']` para que grupo/cajero/estado wrappeen (fix de desborde). (3) PDF de Turnos: columnas "Inicio"/"Fin" con `formatDateTime` (DD/MM/YYYY HH:mm, hora LOCAL, no UTC) — los datos ya existian en `ShiftReportRow.startedAt/endedAt`; NO se modifico el modelo `Shift` (verificado por git). (4) Nombres de archivo en espanol: `reporte-{consumos|canjes|turnos|consolidado}-{barId}-{from}-{to}.{ext}` — `REPORT_KIND_FILE_SLUGS` duplicado a mano en server (`ReportController.fileName`) y client (`types/reports.ts` + `ReportAPI.ts`, que arma su propio fileName sin parsear Content-Disposition). Tests nuevos/actualizados.
- **Veredicto del Reviewer:** `[APPROVED]` - C1-C4 verificados contra el codigo real y los 6 comandos en verde (582 tests server / 231 client, coverage barReports.ts 97.45%). Observacion no bloqueante: bug latente en `readBlobError` (`API/ReportAPI.ts` — el mensaje del server en errores JSON queda tragado por el catch interno, el toast nunca muestra el mensaje real de 403/400); el Reviewer recomienda ticket aparte.
- **Nota:** el ticket ya estaba Listo en Jira; fixup aplicado sin transicion de estado (mismo patron que LB-60).

### [2026-08-26] - LB-80: Notificaciones push básicas (Web Push) — refinamiento de LB-57
- **Dominio afectado:** Monorepo (Backend + Frontend)
- **Subagentes involucrados:** Explorer (`progress/explorers/exp_LB-80.md` — re-exploración; la previa `exp_LB-80-viabilidad.md` del 2026-08-21 quedó parcialmente desactualizada), Implementer (`progress/implementers/impl_LB-80.md`), Reviewer (`progress/reviewers/review_LB-80.md`).
- **Contexto:** LB-57 es un stub ("A REVISAR TEMAS NOTI"), Unassigned en Jira; su refinamiento real es **LB-80** (asignado a Lautaro Zuleta). Esta feature ya se había evaluado y **diferido explícitamente el 2026-08-21**. Reabierta el 2026-08-26 por decisión del usuario. Decisiones tomadas vía `AskUserQuestion` antes de delegar: (1) se trabaja LB-80, LB-57 se reemplaza; (2) **autorizado romper `backend.md` §2**: librería `web-push` + claves VAPID + colección Mongoose nueva `PushSubscription` (mismo patrón "autorización explícita por ticket" que `pdfmake`/LB-78, `Reward`/LB-67); (3) frontend: **`vite-plugin-pwa`** autorizado, con SW propio (`strategies: injectManifest`); (4) **alcance reducido a los 3 eventos que YA emiten `Notification` in-app hoy** (check-in confirmado, disputa abierta, canje entregado) — quedan fuera `REDEMPTION_REJECTED`, "consumo pendiente de confirmación" (sin trigger in-app), umbral de puntos; (5) el **fallback in-app / centro de notificaciones NO existe** (la colección `Notification` es write-only, sin endpoint/hook/UI) → se creó **LB-98** ("Centro de notificaciones in-app", épica LB-56) como spin-off; (6) preferencias por categoría **agrupada** en `User.notificationPreferences = { salidas, consumos, canjes }`, opt-in por defecto, `canjes` no desactivable (criterio de "confirmación de transacción" de LB-57).
- **Resumen de Cambios (Backend):** `+ web-push` / `+ @types/web-push` en `apps/server/package.json`. Modelo nuevo `models/PushSubscription.ts` (`user` ref+index, `endpoint` unique, `keys.{p256dh,auth}`, `userAgent?`, `expirationTime?`, timestamps; docblock de autorización LB-80). `utils/pushService.ts` — `sendPushToUsers(userIds, payload): void`, molde exacto de `utils/auditLogService.ts`: fire-and-forget, nunca lanza (catch → `console.warn`), callers sin `await`; init lazy de `webpush.setVapidDetails` una sola vez (no-op con warning si faltan las env vars); filtra destinatarios por `notificationPreferences[category]` (`canjes` ignora la preferencia); en el `.catch` de `sendNotification`, status 404/410 → `PushSubscription.deleteOne`. `PushSubscriptionController` (clase, métodos estáticos, Mongoose directo): `subscribe` (upsert por `endpoint`, 201), `unsubscribe` (`{endpoint,user}`, 204), `updatePreferences` (`$set` de salidas/consumos solo si llegan boolean; **`canjes` forzado a `true` siempre, nunca 400**). `routes/pushRoute.ts` (`/api/push`, `authenticate()`, `express-validator` encadenado, `oneOf` body|query para el DELETE), montado en `server.ts`. `User.ts` gana `notificationPreferences` (defaults `{salidas:true,consumos:true,canjes:true}`). Enganche `sendPushToUsers` sin `await` en los 3 call sites, **siempre post-commit** — en `OutingController.confirmCheckIn` la llamada se **movió fuera del bloque transaccional** (`session.commitTransaction()` L553, push L576); en `LeaderConsumptionController.reject` solo en la rama `rejectCount === MAX_REJECTS` → `DISPUTED`; en `CashierRedemptionController.deliver` tras el `Notification.insertMany`. Los 3 usan el mismo array de userIds LEADER+CO_LEADER que el `Notification` in-app (no todos los invitees). Par VAPID de **desarrollo** generado y puesto en `apps/server/.env.example` (`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`) — cero secretos hardcodeados en fuente.
- **Resumen de Cambios (Frontend):** `+ vite-plugin-pwa` (dev). `src/sw.ts` — SW propio (`push` → `showNotification` con `data.url`; `notificationclick` → focus/`openWindow`), type-check aparte vía `tsconfig.worker.json`. `vite.config.ts` con `VitePWA({strategies:'injectManifest', filename:'sw.ts', injectRegister:false, manifest:false})` → emite `dist/sw.js`. Registro del SW explícito en `main.tsx` (fuera del árbol React, best-effort). `types/push.ts` (a mano, aislamiento). `API/pushApi.ts` (axios central `@/libs/axios`, sin `fetch`). Hook `usePushNotifications.ts` (React Query): `supported`/`permission`/`isSubscribed`/`enable()`/`disable()`; `enable()` desde gesto de usuario → `Notification.requestPermission()` → `pushManager.subscribe({applicationServerKey: VITE_VAPID_PUBLIC_KEY})` → `subscribePush`; `denied` → toast y silencio total. `views/user/PushNotificationsSection.tsx` en `ProfileView`: botón activar/desactivar + 3 toggles (`salidas`/`consumos` editables vía `useMutation` + invalidación de `['userProfile']`; `canjes` visible pero `disabled` "no se puede desactivar"), toasts `sonner`. `apps/client/.env.example` gana `VITE_VAPID_PUBLIC_KEY` (misma pública que el server).
- **Tests:** backend — `pushService.test.ts` (11 casos: filtrado por preferencias, borrado 404/410, nunca lanza, `canjes` no consulta User, no-op sin env vars, de-dup), `PushSubscription.test.ts` (9: required, `endpoint` unique), `pushSubscription.test.ts` controller (9: upsert idempotente, delete body/query, `updatePreferences` ignora `canjes:false`), + asserts nuevos en `outingCheckIn`/`leaderConsumption`/`cashierRedemption` (categoría correcta, post-commit, recipients sin members). Frontend — `usePushNotifications.test.tsx` (6), `PushNotificationsSection.test.tsx` (8).
- **Veredicto del Reviewer:** `[APPROVED]` (primera pasada, sin cambios requeridos) — C1–C4 verificados contra el código real en disco y los 6 comandos de C4 corridos en vivo por el propio Reviewer. server lint EXIT 0; client lint EXIT 0 (10 warnings preexistentes, ninguno en archivos de LB-80); client build EXIT 0 (emite `dist/sw.js`); client test 245/245; server test **622/623** — único rojo `leaderConsumption.test.ts > accept > awards floor(amount/1000)...`, **confirmado preexistente y ajeno de forma independiente** por el Reviewer vía `git stash -u` + run sobre el árbol base `42af3fe` (falla idéntico; `LeaderConsumptionController.accept` no fue tocado por LB-80, que solo toca `reject`) — ya documentado como rojo ajeno en la entrada de LB-84. `test:coverage` da exit 1 por ese mismo rojo; excluyendo ese archivo, utils/middleware 93.87%/85.98% y `pushService.ts` 93.47%/90%/90%/97.36% — sobre el umbral 80%. Observaciones no bloqueantes: `API/pushApi.ts` y `src/sw.ts` sin test dedicado (consistente con la convención del repo: 13/15 archivos de `src/API` no lo tienen, y no hay precedente de testear SW; la lógica de UI —hook y componente— sí tiene test); `test:coverage` como comando único seguirá en exit 1 hasta que se arregle el rojo preexistente de `leaderConsumption` (candidato a ticket propio).
- **Estado en Jira:** LB-80 → "Listo". LB-57 → "Listo" (entregado vía LB-80, linkeado como duplicado). Working tree **sin commitear** en `feat/push-notification` (34 archivos) — commit/merge queda a decisión del usuario. `apps/server/.env` / `apps/client/.env` locales (gitignored) recibieron las vars VAPID de dev.

### [2026-08-27] - LB-89: [S5][UX-1] Design system unificado (tokens + componentes)
- **Dominio afectado:** Frontend (`apps/client`). Sin backend → C2 de `CHECKPOINTS.md` N/A.
- **Subagentes involucrados:** Explorer (`progress/explorers/exp_LB-89.md`), Implementer
  (`progress/implementers/impl_LB-89.md` — pasada 1: fundación + barrido parcial; pasada 2:
  consolidación de docs), Reviewer (`progress/reviewers/review_LB-89.md`).
- **Contexto / reencuadre del Explorer:** el ticket pedía "unificar la UI" como si hubiera que
  diseñar tokens de cero, pero **`docs/design.md` ya existía como guía inmutable del design
  system** (auditada por el `reviewer`) y `apps/client/src/index.css` ya tenía un `@theme`
  completo (paleta lima `#C8FF00`/negro, 2 fuentes Space Grotesk + Plus Jakarta Sans, spacing,
  radius, sombras, `@layer components` con `.card`/`.chip`). El trabajo real era: completar
  primitivos faltantes, agregar el `cn()` que `frontend.md §1` referencia pero nunca se
  implementó, tematizar el `<Toaster>`, corregir drift de tokens y migrar las vistas. El
  Explorer cuantificó el drift: `<button>` inline en ~27 archivos, cards `rounded-lg` (dominio
  `bar/`) vs `rounded-xl` (`groups/`), 3 mapas de color de estado duplicados, color `amber-*`
  fuera de paleta en 8 archivos, 3 patrones de loader, ≥6 modales de formulario hand-rolled,
  copy de vacíos/errores inconsistente ("Todavía no"/"Aún no"/"Sin… aún", 3 wordings para el
  error de cámara), nombre de producto "NightOut" conviviendo con "La Banda".
- **Decisiones de producto (vía `AskUserQuestion`, dos rondas):** (1ª ronda) barrido completo de
  las ~27 vistas + docs unificadas + primitivos "nombrados + habilitadores"; `clsx` +
  `tailwind-merge` autorizados para `cn()`, **`class-variance-authority` prohibido**. (2ª ronda,
  tras ver el tamaño real) → **cerrar LB-89 con la fundación + barrido PARCIAL** y mover el resto
  del barrido a ticket de seguimiento; además **eliminar `docs/DESIGN_SYSTEM.md`** (que el ticket
  pedía crear) y consolidar TODO en `docs/design.md` como **única fuente de verdad** de diseño
  UX/UI del proyecto.
- **Resumen de Cambios (entregado):**
  - **Tokens** (`@theme` de `index.css`): `--text-md: 1.0625rem` (la clase `text-md` que `Button`
    size `lg` ya usaba era un no-op); `--color-warning #FBBF24` + `-dim` + `-border` (espejo de
    `--color-error`), 8 archivos `amber-*` migrados (grep `amber-` → 0); `--color-overlay
    rgba(0,0,0,0.6)` → utilidad `bg-overlay`, 6 backdrops de modal migrados (`bg-black/60` y
    `style` inline → 0). Radius de cards unificado a **`rounded-xl`** (20px), aplicado vía el
    primitivo `Card`; clase CSS `.card` marcada deprecada y alineada.
  - **Helper `cn()`**: `apps/client/src/utils/cn.ts` = `twMerge(clsx(inputs))`, import `@/utils/cn`.
    Deps nuevas `clsx ^2.1.1` + `tailwind-merge ^3.3.1` (autorizadas por `frontend.md §1`).
  - **8 primitivos nuevos** en `components/ui/`, cada uno con `*.test.tsx` co-ubicado: `Card`
    (`padding` none/md/lg, `interactive`), `Badge` (variantes success/warning/error/neutral) +
    `badgeStatus.ts` con `statusBadgeVariant(status)` que **reemplaza los 3 mapas de estado
    duplicados** (`BarDashboardView` `STATUS_BADGE_CLASSES`, `MyBarsView` `config`,
    `BarCategoriesView`), `Spinner` (`size`, `center`, `label`→`role="status"`), `EmptyState`
    (icono lucide + título + descripción + slot CTA), `ErrorState` (`role="alert"`, sin
    animación de entrada por `design.md §3`), `IconButton` (`aria-label` obligatorio por tipos,
    unifica las 3 variantes del botón "volver"), `Select` + `Textarea` (label auto vía `useId`,
    cadena de clases = la duplicada en `BarDashboardView`/`BarAuditLogView`/`BarReportsView`).
  - **`Modal.tsx`** extendido a modo formulario retrocompatible (`onConfirm` opcional, `footer?`,
    `hideFooter?`, `size?`, `confirmVariant?`; `Modal.test.tsx` pasa sin tocar). **`Button.tsx`**
    refactor a `cn()` + mapas de variante (sin cambio de clases; `Button.test.tsx` pasa sin
    tocar). **`<Toaster>`** de `router.tsx` tematizado (`theme="dark"`, `toastOptions.style` con
    tokens, `closeButton`; **sin `richColors`** — mete verdes/rojos ajenos a la paleta).
  - Tests nuevos para `Input.tsx` y `SegmentedControl.tsx` (antes sin test).
  - **Barrido parcial (Fase C):** nombre "NightOut" → "La Banda" (`LoginView`,
    `SelectContextView`; grep → 0); `<div>Loading...</div>` → `<Spinner size="lg">` en
    `MainLayout`/`AuthLayout`/`CashierLayout`/`SelectContextView` (+ 2 tests de layout
    actualizados de `getByText('Loading...')` a `getByRole('status',{name:'Cargando'})`); los 3
    mapas de estado → `Badge` + `statusBadgeVariant`; `MyBarsView` migrada entera (IconButton +
    Spinner + EmptyState + Card).
  - **Docs (Fase D):** `docs/design.md` ampliado — **§6** tabla de tokens completa (incl.
    `--text-md`, `--color-warning*`, `--color-overlay`), **§7** referencia de API + ejemplo JSX
    de cada componente de `components/ui/`, **§8** catálogo de copy de estados vacíos ("Todavía
    no …") y de error ("No pudimos cargar …" + "Reintentar"/"Volver", wording único para el
    error de cámara). §1–§5 normativas **intactas** (`git diff` sin líneas removidas); solo se
    reforzó la nota de cabecera declarando `design.md` como única fuente de verdad y que
    `DESIGN_SYSTEM.md` no debe volver a existir. **`docs/DESIGN_SYSTEM.md` eliminado** (nunca
    llegó a estar trackeado).
- **Pendiente → LB-99** (`[S5][UX-1b] Barrido de vistas al design system`, Tarea, Medium, Lautaro):
  9 ítems de migración de markup ya mapeados `file:line` en `impl_LB-89.md` §Pendiente —
  `<button>` inline en ~27 archivos, cards inline, ≥6 modales-form hand-rolled, inputs nativos,
  `Loader2` suelto en ~31 vistas, bloques empty/error inline en ~35 vistas, aplicar el copy
  unificado a las vistas, `cn()` en vistas, sombras no-token, + fix de la tilde faltante en el
  `title` default de `ErrorState`. Motivo de diferirlo: mantener el PR acotado y bajar el
  riesgo de merge-conflict con la fase de "polish" que los demás devs harían sobre esas mismas
  vistas.
- **Veredicto del Reviewer:** `[APPROVED]` (primera pasada, sin cambios requeridos). C1
  verificado (`git diff --stat` solo `apps/client/**` + `docs/design.md` + `pnpm-lock.yaml`;
  sin imports cruzados a `apps/server`), C3 verificado (`<Toaster>` único en `router.tsx`, sin
  CVA, deps solo `clsx`+`tailwind-merge`, primitivos resuelven color contra tokens sin
  `bg-[#...]`, a11y de `IconButton`/`Select`/`Textarea`), C2 N/A. **C4 corrido en vivo por el
  Reviewer:** `pnpm --filter @bar/client lint` exit 0 (10 warnings `react-hooks/incompatible-
  library` **preexistentes** — `GroupCreateView`/`OnboardingView` ni siquiera tocados; en
  `OutingFormModal` el único cambio es el backdrop), `build` exit 0 (`tsc -b` strict), `test`
  **308/308** (49 test files, +10 nuevos). 4 hallazgos no bloqueantes: tilde en el default de
  `ErrorState` (→ LB-99), `badgeStatus.ts` sin test propio (cubierto vía `Badge.test.tsx`),
  loading inline en `SelectContextView` que no usa el helper `center`, y el badge "inactiva" que
  pasa de ámbar a `neutral` (intencional, coincide con `design.md §7`).
- **Estado en Jira:** LB-89 → "Finalizada". LB-99 creada en "Tareas por hacer" (linkeada
  `Relates` a LB-89). Working tree de `feat/design-system` **sin commitear** (22 archivos nuevos
  + 25 modificados + 1 borrado) — commit/push a decisión del desarrollador. `pnpm install`
  corrido (lockfile actualizado por `clsx`/`tailwind-merge`).
- **Fixup post-cierre (2026-08-27, misma sesión):** el dueño de producto reportó la "x" de
  cerrar en cada toast. Implementer pasada 3 — quitada la prop `closeButton` del `<Toaster>`
  (`apps/client/src/router.tsx`); en `docs/design.md §7` la mención de `closeButton` se
  removió por completo a pedido del usuario (es config puntual del componente, no una regla de
  sistema — la nota de `richColors` sí se mantiene por ser regla de paleta). Cambio cosmético
  dentro del alcance ya aprobado; sin transición de Jira ni ciclo de review formal. `lint`/
  `build`/`test` de `@bar/client` en verde (test 308/308).
- **Commit (2026-08-27):** `5ed6efa` `feat(client): LB-89 design system unificado — tokens,
  primitivos, cn() y docs` en `feat/design-system` (46 archivos, +1693/−225). Sin push.

### [2026-08-27] - LB-90: [S5][UX-2] Polish sus vistas (estados vacíos + errores + accesibilidad)
- **Dominio afectado:** Frontend (`apps/client`). Sin backend → C2 de `CHECKPOINTS.md` N/A.
- **Subagentes involucrados:** Explorer (`progress/explorers/exp_LB-90.md`), Implementer
  (`progress/implementers/impl_LB-90.md` — se retomó el mismo agente de LB-89, con la API de los
  primitivos fresca), Reviewer (`progress/reviewers/review_LB-90.md`).
- **Contexto:** UX-2 del Sprint 5 — aplicar el design system de LB-89 + el guideline de estados
  a **las vistas propias de Lautaro**, que salieron de LB-68 (iniciar canje: QR + reserva), LB-72
  (ver recompensas disponibles líder/grupo) y LB-76 (detalle de un bar). El Explorer identificó
  los 3 archivos concretos: `views/groups/GroupRewardsView.tsx` (contiene inline `ProgressToNextReward`,
  `RewardCard`, `RedemptionQrResultCard`, modal de confirmación, sección "Canjes pendientes"),
  `views/bar/BarDetailView.tsx` (su `RewardCard` es copia propia, NO reusa la de LB-72 pese a lo
  que decía el ticket), `views/bar/components/GroupPickerModal.tsx` (modal hand-rolled). **Ninguno
  fue tocado por el barrido parcial de LB-89** — no usaban ningún primitivo nuevo. El kickoff de
  Sprint 5 (vault) confirma que LB-90 y **LB-99** ("[S5][UX-1b] Barrido de vistas") no se solapan:
  "cada dev arregla sus propias pantallas". Frontend puro (confirmado: toda la info de QR expirado
  / canje rechazado ya está client-side vía `GET /groups/:id/redemptions`).
- **Decisiones de producto (vía `AskUserQuestion`):** (1) **adopción COMPLETA** del design system
  en las 3 vistas (no solo el polish de estados) → esos 3 archivos **salen del alcance de LB-99**;
  NO se extrae un `RewardCard` compartido (cada vista mantiene su copia local, migrada in-place).
  (2) Dejar de filtrar solo `HELD` en la lista de canjes: mostrar `REJECTED` y `EXPIRED` con copy
  del catálogo. LB-69 (rechazo del cajero) no está implementado → hoy nada genera `REJECTED` real;
  UI lista y testeada con mocks. (3) Micro-animaciones: **solo** acotar a `--duration-fast`, sacar
  stagger de listas, alertas de error sin animación de entrada (`design.md §3`); **no** portar el
  "+N pts flotante" de LB-70 (sería feature nueva en sprint de hardening).
- **Resumen de Cambios:**
  - **`GroupRewardsView.tsx`:** empty → `<EmptyState>`, error → `<ErrorState>` con `onRetry`+`onBack`
    (incl. las queries `group` y `redemptions`, que antes fallaban en silencio), `Loader2` →
    `<Spinner>`, botón "Volver" → `<IconButton>`, cards (`ProgressToNextReward`, header de saldo,
    `RewardCard`, `RedemptionQrResultCard`, filas de canjes pendientes) → `<Card>` (`rounded-xl`),
    badges "Podés canjear"/"Te faltan X pts" → `<Badge>` conservando texto, `cn()`. Nueva sección
    **"Canjes recientes"** (`closedRedemptions`, máx 5) con `ClosedRedemptionCard`: `REJECTED` →
    "Este canje fue rechazado." + `Badge error`; `EXPIRED` o `HELD` vencido → "Este QR venció.
    Generá uno nuevo." + `Badge neutral`. `pendingRedemptions` = `HELD && !isExpired(expiresAt)`.
    **Timer local** `setInterval(30_000)` (con `clearInterval` en cleanup, solo si `canManageRedemptions`)
    + `refetchInterval: 60_000` acotado en la query de redemptions. A11y: botón "Canjear" en envío
    → `<Loader2 aria-hidden>` + `<span class="sr-only">Canjeando</span>` + `aria-busy`; "Cancelar"
    por fila → `aria-label` contextual `Cancelar canje de {rewardName}`; progressbar → `aria-label`.
    Motion: entrada de página `0.35` → `0.12`; `RewardCard` deja de ser `motion.div`.
  - **`BarDetailView.tsx`:** **eliminado el doble mensaje de error** — antes `useEffect`→`toast.error`
    + bloque inline "Error al cargar…"; ahora un solo `<ErrorState>` inline (`onRetry`+`onBack`),
    se quitaron ambos `toast.error` (bloqueante y no-bloqueante) y el import de `sonner`. Hueco
    silencioso de la lista de recompensas cubierto con `<ErrorState>` acotado bajo el header. Empty
    → `<EmptyState>`, `Loader2` → `<Spinner>`, "Volver" → `<IconButton>`, `RewardCard`/celdas de la
    grilla lun-dom/card de info → `<Card>`. **Contraste:** label de día de la grilla `text-text-muted`
    (#444, no pasa WCAG AA sobre surface) → `text-text-secondary` (#888, ≈5.0:1 — pasa AA texto
    normal). Badge "Estás acá ahora" → `<Badge variant="success">` con icono + texto.
  - **`GroupPickerModal.tsx`:** migrado al primitivo `<Modal>` (`hideFooter` + `size="md"` +
    `showCloseButton`). Se pierde la presentación bottom-sheet en mobile a cambio del modal centrado
    del sistema (tradeoff de consistencia, aceptado por el reviewer como observación de UX no
    bloqueante). Loader → `<Spinner>`, estado de error nuevo → `<ErrorState>`, empty → `<EmptyState>`.
  - **Primitivos compartidos (cambio acotado, señalado al reviewer):** `Button.tsx` e `IconButton.tsx`
    — se quitó `outline-none` de la cadena base y se agregó un anillo `focus-visible:outline-2
    focus-visible:outline-offset-2 focus-visible:outline-lime-border` (los botones del sistema no
    tenían indicador de foco de teclado). `Modal.tsx` — nueva prop `showCloseButton?: boolean`
    (default `false` → render idéntico al anterior) que renderiza `<IconButton aria-label="Cerrar">`,
    + cierre con `Escape` (listener en `document` con cleanup, sin leak). Retrocompatibles:
    `Button.test.tsx`/`IconButton.test.tsx` pasan sin modificarse; `Modal.test.tsx` +3 casos.
  - **`docs/design.md`** (diff +62/−0, puramente aditivo, §1–§4 y la tabla de tokens §6 sin cambios):
    §5 gana 4 bloques (foco de teclado visible, botón dentro de botón, acciones repetidas en listas,
    modales con `Escape`+`showCloseButton`) con el **focus-trap completo del `Modal` diferido**
    explícitamente como follow-up; §7 documenta el foco en `Button`/`IconButton` y la prop de `Modal`;
    §8 gana §8.4 (estados de precondición, ej. "Necesitás un check-in activo" / "Hacé check-in en un
    bar con tu grupo para ver y canjear sus recompensas"), §8.5 (canjes en estado terminal + variantes
    de `Badge`), §8.6, y una línea a §8.2.
- **Tests:** `GroupRewardsView.test.tsx` 8 → 12 (2 actualizados por el copy nuevo de "sin check-in",
  +4: EmptyState sin recompensas, ErrorState+Reintentar al fallar `getGroupRewards`, `REJECTED`/`EXPIRED`
  visibles con copy del catálogo vía mock, nombre accesible en "Canjear" mientras `isPending`).
  `BarDetailView.test.tsx` 5 → 6 (2 de error reescritos: `ErrorState` inline en vez de `toast.error`;
  +1: EmptyState con rewards `[]`). `Modal.test.tsx` 10 → 13 (+3: sin "X" por defecto, `showCloseButton`
  → `onClose`, `Escape` cierra). `GroupPickerModal.test.tsx` 3 → 3 sin cambios. Suite: 49 files /
  **316 tests** (baseline 308, +8).
- **Veredicto del Reviewer:** `[APPROVED]` (primera pasada, sin cambios requeridos). C1 verificado
  (`git status` → solo `apps/client/**` + `docs/design.md`; sin imports de `apps/server`), C3
  verificado (mutations conservan `toastApiError` → mover errores de **carga** de query a
  `ErrorState` inline no viola C3 y es coherente con `design.md §3/§4/§8.2`; `<Toaster>` sigue
  único en `router.tsx`, sin import colgante en `BarDetailView`; sin CVA, sin `bg-[#...]`; fix de
  contraste verificado ≈5.0:1). C2 N/A. **C4 corrido en vivo por el reviewer:** lint exit 0 (10
  warnings `react-hooks/incompatible-library` preexistentes, 0 en archivos de LB-90 — los 9 archivos
  con warning son de formularios ajenos), build exit 0 (`tsc -b`), test 49 files / 316 tests verdes.
  3 hallazgos no bloqueantes: `vi.mock` de `sonner` muerto en `BarDetailView.test.tsx`; el `Escape`
  del `Modal` ahora aplica a sus 11 consumidores (recomendada prueba manual de que no interrumpe
  flujos a medias); `GroupPickerModal` pierde el bottom-sheet en mobile (prueba manual en viewport
  angosto).
- **Estado en Jira:** LB-90 → "Finalizada". Comentario en **LB-99** descontando las 3 vistas de su
  alcance (y aclarando que el fix de la tilde en `ErrorState.tsx` sigue pendiente ahí — LB-90 no
  tocó ese archivo). Working tree de `feat/design-system` **sin commitear** (9 archivos modificados:
  6 de código + `docs/design.md` + 2 de test que ya estaban; en realidad 3 vistas + 3 primitivos +
  4 tests + doc) — commit/push a decisión del desarrollador. El commit de LB-89 (`5ed6efa`) sigue
  siendo el HEAD.

### [2026-08-29] - LB-96: GroupController.getGroupById/getGroupMembers sin chequeo de membresía
- **Dominio afectado:** Backend (`apps/server`).
- **Subagentes involucrados:** Explorer (`progress/explorers/exp_LB-96.md`), Implementer
  (`progress/implementers/impl_LB-96.md`), Reviewer (`progress/reviewers/review_LB-96.md`).
- **Contexto:** ticket de seguimiento de LB-84 (hallazgo documentado en `docs/AUTHZ_MATRIX.md`,
  sección "Hallazgo abierto"): `GroupController.getGroupById` (`GET /api/groups/:id`) y
  `GroupController.getGroupMembers` (`GET /api/groups/:id/members`) no verificaban que el usuario
  autenticado fuera miembro del grupo solicitado — cualquier usuario logueado podía ver
  nombre/slug/`memberCount`/`inviteCode` y la lista completa de miembros de cualquier grupo por ID.
  El Explorer confirmó que el hallazgo seguía vigente sobre `development` actualizado y documentó
  el patrón de referencia ya usado por `getGroupBySlug` (404 antes de 403, mensaje estándar
  `'No tenés acceso a este grupo'`, sin ningún helper de membresía reutilizable en el modelo
  `Group` — la comparación manual sobre `group.memberships` es el patrón consistente en todo el
  archivo).
- **Resumen de Cambios:** se replicó el patrón de `getGroupBySlug` en ambos métodos: chequeo de
  membresía tras el 404, 403 con el mismo mensaje si el usuario no está en `group.memberships`.
  Cuidado específico de no mezclar los dos patrones de comparación de `ObjectId` según si el query
  usa `.populate()` o no: `getGroupById` (sin populate) compara `m.user.toString() === userId`;
  `getGroupMembers` (con populate) compara `m.user._id.toString() === userId`. De yapa, se corrigió
  que `getGroupById` exponía `inviteCode` sin ninguna condición de rol — ahora solo se devuelve si
  el usuario es `LEADER`/`CO_LEADER`, mismo criterio que `getGroupBySlug`. No se tocaron rutas
  (`authenticate()` ya estaba encadenado y garantiza `req.user`) ni se creó ningún helper nuevo en
  el modelo `Group`.
- **Tests:** nuevos `getGroupById.test.ts` y `getGroupMembers.test.ts` (no existían tests previos
  para estos métodos), siguiendo la plantilla de `getGroupBySlug.test.ts`: 404, 403 (caso central
  del ticket), 200 (miembro, incluyendo `inviteCode` presente/ausente según rol para `getGroupById`)
  y 500. 17 tests nuevos en verde.
- **Veredicto del Reviewer:** `[APPROVED]` (primera pasada, sin cambios requeridos). Verificó el
  código real línea por línea contra `getGroupBySlug`, confirmó que no se mezclaron los patrones de
  comparación de `ObjectId` (el riesgo específico de este fix), corrió los tests nuevos y la suite
  completa del backend en vivo (632 passed, 1 failed — único fallo preexistente en
  `leaderConsumption.test.ts`, alcance de **LB-97**, confirmado ajeno al diff de este ticket vía
  `git status --short`). C1/C2/C4 verificados en verde, C3 N/A (ticket 100% backend).
- **Estado:** rama `feat/LB-96-group-membership-check` (creada desde `development` recién
  actualizado). Commit/push/transición de Jira a decisión del desarrollador tras este veredicto.

### [2026-08-29] - LB-97: Test preexistente fallando en LeaderConsumptionController.accept
- **Dominio afectado:** Backend (`apps/server`) — cambio 100% en un archivo de test.
- **Subagentes involucrados:** Explorer (`progress/explorers/exp_LB-97.md`), Implementer
  (`progress/implementers/impl_LB-97.md`), Reviewer (`progress/reviewers/review_LB-97.md`).
- **Contexto:** ticket de seguimiento de LB-84, confirmado preexistente e independiente del
  dominio de auth/roles. El Explorer (sin acceso a `Bash` en este entorno, diagnóstico por
  lectura estática exhaustiva) identificó que `leaderConsumption.test.ts` → `accept > awards
  floor(amount/1000) points and emits websocket` fallaba (500 en vez de 200) porque el test
  nunca mockeaba `PointsTransaction.aggregate` explícitamente — el automock de Vitest devolvía
  `undefined`, algo que `Model.aggregate()` real de Mongoose nunca hace (siempre resuelve a un
  array, vacío en el peor caso). Diagnóstico: bug del mock/fixture del test, no de lógica de
  negocio real — `LeaderConsumptionController.ts:264` (`barPoints[0]?.points ?? points`) ya
  maneja correctamente el caso legítimo de array vacío.
- **Resumen de Cambios:** único archivo tocado,
  `apps/server/src/controllers/__tests__/leaderConsumption.test.ts`. (1) mock explícito
  `vi.mocked(PointsTransaction.aggregate).mockResolvedValue([{ points: 12 }])`, coherente con
  el fixture (`amount: 12500` → `Math.floor(12500/1000) = 12`). (2) **Segundo issue** encontrado
  en runtime por el Implementer (no cubierto por el diagnóstico original del Explorer, que no
  pudo correr los tests): la aserción de `emitGroupPointsBalance` no contemplaba el tercer
  argumento `meta` que el controller ya emite en producción (parte de la feature de saldo vivo,
  LB-70/71/75, mergeada después de que se documentó este bug). El Implementer documentó el
  bloqueo sin auto-aprobarse (regla del harness respetada); el Leader amplió explícitamente el
  alcance del ticket por tratarse de la misma clase de problema (aserción de test desactualizada
  vs. contrato real del código) en el mismo test — se ajustó la aserción a 3 argumentos con
  `expect.objectContaining(...)` para el `meta`, siguiendo un patrón ya consolidado en el repo
  (verificado en 9 archivos de test existentes). **No se tocó `LeaderConsumptionController.ts`
  ni ningún otro archivo de producción.**
- **Veredicto del Reviewer:** `[APPROVED]` (tras la ampliación de alcance autorizada). Confirmó
  con `git diff` que el único archivo modificado es el test; verificó los valores del mock y de
  la aserción contra el código real del controller y de `pointsHub.ts`; confirmó que el patrón
  `expect.objectContaining` en el tercer argumento ya es convención del repo; corrió la suite
  completa en vivo (**633/633 tests passed**) y `tsc --noEmit` sin errores. C1/C3 N/A (no toca
  frontend ni cruza capas), C2 N/A (no se tocó código de producción ni rutas), C4 en verde.
- **Estado en Jira:** LB-97 → "Finalizada". Commiteado en `feat/LB-96-group-membership-check`
  (`5e8bfbd`), sin push (misma decisión del usuario que en LB-96: seguir encadenando tickets en
  esta rama).

### [2026-08-29] - LB-94: [S5][PERF-1] Optimización de queries pesadas (dashboard OWNER + historial)
- **Dominio afectado:** Backend (`apps/server`).
- **Subagentes involucrados:** Explorer (`progress/explorers/exp_LB-94.md`), Implementer
  (`progress/implementers/impl_LB-94.md`), Reviewer (`progress/reviewers/review_LB-94.md`).
- **Contexto:** profiling estático (sin entorno de DB disponible para el Explorer) del dashboard
  OWNER (LB-74) y el historial de movimientos (LB-71). Hallazgo principal: **no era un problema
  de índices faltantes** sino de **shape de query no-sargable** — 3 funciones de
  `apps/server/src/utils/barDashboard.ts` (`getDashboardStatCards`, `getActivityTable`,
  `getCashierTable`) filtraban por fecha sobre un campo calculado (`anchorDate`, vía
  `$addFields`+`$ifNull($checkedInAt,$scheduledFor)`) que Mongo no puede indexar ni empujar hacia
  el `$match` de `bar`, forzando un escaneo de todo el histórico no-`CANCELLED` del bar antes de
  filtrar por rango — el candidato más probable a violar el objetivo de <500ms a medida que un
  bar acumula meses de actividad. LB-71 (historial) se confirmó ya bien implementado (paginación
  por cursor + índice compuesto correcto), sin cambios necesarios. Barrido general de N+1 encontró
  un caso real y no bloqueante en `ShiftSummaryController.history` (índice faltante) y un loop
  secuencial de diseño en `closeOutingsForBar` (cierre perezoso del bar).
- **Decisiones de producto (vía `AskUserQuestion`):** (1) sumar el índice de `Shift` aunque sea
  un endpoint distinto al literal del ticket, por ser N+1 real de bajo riesgo; (2) dejar armado
  (sin ejecutar) el script de load test + seed de volumen en vez de correrlo hoy o de omitirlo
  del todo, documentado para correr en el futuro; (3) dejar `closeOutingsForBar` explícitamente
  fuera de este ticket — es una decisión de diseño (paralelizar transacciones Mongo trae riesgo
  de contención), se abre seguimiento aparte.
- **Resumen de Cambios:** `barDashboard.ts` — nuevo helper `outingAnchorDateMatch(from, to)` con
  un `$or` sargable (`checkedInAt` en rango, o `checkedInAt` null/ausente + `scheduledFor` en
  rango — verificado matemáticamente equivalente al `$ifNull` anterior en los casos límite,
  incluyendo cuando `checkedInAt` existe pero cae fuera de rango) usado por spread en las 3
  funciones; se eliminaron los stages `$addFields`/`$match` de `anchorDate` (confirmado sin
  referencias posteriores en ningún pipeline). `Shift.ts` — nuevo índice
  `{bar:1, startedAt:-1}` para `ShiftSummaryController.history`. Nueva devDependency
  `autocannon`/`@types/autocannon` + dos scripts nuevos sin ejecutar:
  `apps/server/scripts/load-test-dashboard.ts` (100 conexiones concurrentes contra el dashboard)
  y `apps/server/scripts/seed-lb94-volume.ts` (8 semanas × 20 salidas/día de datos de volumen).
  `closeOuting.ts`, `GroupBalanceController.ts` (LB-71) y `shiftSummary.ts`/
  `ShiftSummaryController.ts` quedaron explícitamente sin tocar.
- **Veredicto del Reviewer:** `[APPROVED]` (primera pasada). Verificó la equivalencia matemática
  del `$or` en los casos límite (no solo el caso feliz) contra el modelo `Outing` real, confirmó
  con `grep` que `anchorDate` no quedó referenciado en ningún stage posterior, re-verificó de
  forma independiente que los 2 scripts nuevos compilan (con un `tsconfig` de scratch, ya que
  `apps/server/tsconfig.json` no incluye `scripts/`), confirmó que no hay artefactos de ejecución
  de esos scripts en el repo, y corrió la suite completa en vivo (**634/634 tests**) + `tsc
  --noEmit` sin errores. C1/C3 N/A, C2/C4 en verde. Observación no bloqueante: los tests de
  `barDashboard.test.ts` verifican shape de pipeline sobre mocks, no comportamiento real contra
  Mongo — mismo patrón preexistente desde la creación del archivo en LB-74, no una convención
  nueva de este ticket.
- **Estado:** rama `feat/LB-96-group-membership-check`, commit `8069ace`, sin push. Pendiente tras
  este cierre: comentario en LB-94 documentando los scripts de load test listos para correr en el
  futuro, y apertura de un ticket de seguimiento para `closeOutingsForBar` (paralelización, fuera
  de alcance de este ticket).

### [2026-09-02] - LB-101: Migrar almacenamiento de imágenes (avatares/logos/portadas) a Cloudinary
- **Dominio afectado:** Backend (`apps/server`).
- **Subagentes involucrados:** Explorer (`progress/explorers/exp_LB-101.md`), Implementer
  (`progress/implementers/impl_LB-101.md`), Reviewer (`progress/reviewers/review_LB-101.md`).
- **Contexto:** el backend se despliega en Render (decisión de `progress/` del 2026-09-01), cuyo
  filesystem es efímero — los uploads escritos con `fs.writeFile` se pierden entre redeploys/
  instancias. `apps/server/src/utils/storage.ts` (`saveGroupAvatar`/`saveBarLogo`/`saveBarCover`)
  y `UserController.uploadAvatar` (que escribía a disco inline, sin pasar por `storage.ts`)
  guardaban en `uploads/<tipo>/` y devolvían rutas relativas `/uploads/...` servidas por un
  `express.static` en `server.ts`. El Explorer confirmó que `multer` ya usaba `memoryStorage()`
  (los controllers leen `req.file.buffer`), que el frontend ya resuelve URLs absolutas
  (`apps/client/src/utils/resolveImageUrl.ts:25`, rama `url.startsWith("http")`), y que no hay
  ningún entorno desplegado con URLs `/uploads/...` persistidas.
- **Decisiones de alcance (usuario, vía `AskUserQuestion`):** (1) el avatar de **usuario** entra
  en el alcance pese al texto literal del ticket ("grupo y bar") — misma clase de bug; se
  refactoriza `UserController.uploadAvatar` para pasar por una nueva `saveUserAvatar` de
  `storage.ts`. (2) Borrado de assets viejos vía **`public_id` determinístico**
  (`${CLOUDINARY_FOLDER}/<tipo>/<entityId>`) + `overwrite: true` + `invalidate: true` — un asset
  por entidad, se sobrescribe in-place; **sin** campos `*PublicId` en los modelos, **sin**
  `cloudinary.uploader.destroy()`, **sin** nombres con `Date.now()`. (3) Nada desplegado → se
  **elimina** el montaje `express.static('/uploads')` de `server.ts` (y el import `path` que
  quedaba sin uso); sin backfill ni retrocompat.
- **Resumen de Cambios:** nueva dependency `cloudinary ^2.11.0` en `@bar/server` + fila nueva en
  la tabla de librerías autorizadas de `.claude/rules/backend.md` §2. Nuevo
  `apps/server/src/config/cloudinary.ts` (patrón singleton de `config/nodemailer.ts`: guard
  `NODE_ENV !== 'production'` + `process.loadEnvFile()` dentro del propio archivo, `cloudinary.config(...)`
  a nivel módulo, importado desde `storage.ts` para garantizar el `config()` antes del primer
  upload). `utils/storage.ts` reescrito: helper privado `uploadImage(buffer, assetType, entityId)`
  con `cloudinary.uploader.upload_stream` + `stream.end(buffer)` (el SDK no acepta `Buffer` en
  `upload()`); las 4 funciones (`saveGroupAvatar`/`saveBarLogo`/`saveBarCover`/`saveUserAvatar`)
  mantienen firma `(buffer, entityId) => Promise<string>` devolviendo `secure_url`. `sharp`
  preservado EXACTO (resize 512² `cover` del avatar de grupo en `GroupController`, validación de
  dimensiones ≥200px del logo en `BarController`, sin `sharp` en cover ni en avatar de usuario) —
  solo cambió el destino. En `createGroup` se genera el `_id` up-front (`new Types.ObjectId()`,
  pasado como `_id` explícito al constructor) para que el `public_id` coincida con el documento.
  4 vars nuevas en `apps/server/.env.example` (`CLOUDINARY_CLOUD_NAME`/`API_KEY`/`API_SECRET`
  vacías + `CLOUDINARY_FOLDER=labanda/dev`), 4 env dummy en `__tests__/setup.ts`. Tests migrados
  de mock de `fs`/`fs/promises` a mock del SDK `cloudinary` (`barProfile.test.ts`,
  `uploadAvatar.test.ts`), ajuste de `groupCreation.test.ts`, nuevo
  `utils/__tests__/storage.test.ts` (verifica `public_id` determinístico + `overwrite` +
  `invalidate` + `resource_type` sin red real; `storage.ts` queda 100% coverage). `apps/client/`
  sin cambios. Fuera de alcance, no tocados: el no-op del PATCH "quitar logo/portada" en
  `BarController.updateBarProfile`, los exports muertos `uploadLogo`/`uploadCover` de
  `middleware/upload.ts`, el bug de `index.ts:7` (LB-102, pospuesto).
- **Veredicto del Reviewer:** `[APPROVED]` (primera pasada). Verificó C1–C4 contra el código real
  y los 10 puntos de alcance/decisiones; re-corrió los comandos de `apps/server` en vivo: `lint`
  (`tsc --noEmit`) exit 0, `test` **642/642** en 72 archivos, `test:coverage` 94.3% statements
  global (umbral 80% sobre `utils/**`+`middleware/**` respetado) y **100% en `src/utils/storage.ts`**.
  Confirmó: sin `any` en producción, sin capa `services/`, `apps/server/.env` no aparece en el
  diff y sigue gitignored, sin `destroy()`, sin campos `*PublicId`, sin `Date.now()` en flujos de
  imagen, `express.static('/uploads')` + import `path` eliminados de `server.ts`. Hallazgos no
  bloqueantes: `config/cloudinary.ts` llama `config()` a nivel módulo en vez de envolverlo en una
  función como `nodemailer.ts` (cosmético, mismo guard/patrón de singleton).
- **Estado en Jira:** LB-101 → **"Finalizada"** (2026-09-02, tras el fixup de abajo y la prueba
  manual del usuario). Commit `5c362dd` en `feat/production` (16 archivos), **sin push** —
  decisión del usuario de seguir acumulando en la rama.

### [2026-09-02] - LB-101 (fixup): asset_folder para Dynamic folders mode de Cloudinary
- **Dominio afectado:** Backend (`apps/server`).
- **Subagentes involucrados:** Implementer (`progress/implementers/impl_LB-101-folder-fix.md`),
  Reviewer (`progress/reviewers/review_LB-101-folder-fix.md`).
- **Contexto:** con LB-101 ya `[APPROVED]` (sin commitear), la prueba manual del usuario con
  credenciales reales encontró que el asset se subía a la **raíz** del Media Library de
  Cloudinary, no a `labanda/dev/<tipo>/`. Causa raíz: el product environment está en **dynamic
  folders mode** (default de cuentas Cloudinary creadas después del 2024-06-04), donde las barras
  del `public_id` NO determinan la carpeta visible — hay que pasar `asset_folder` explícito. El
  parámetro `folder` está deprecado para código nuevo en dynamic mode. La spec original del
  Leader ("path embebido solo en `public_id`") fue la causa; el `[APPROVED]` previo se emitió
  contra esa spec.
- **Resumen de Cambios:** una línea en `apps/server/src/utils/storage.ts` (`uploadImage()`):
  `asset_folder: \`${process.env.CLOUDINARY_FOLDER}/${assetType}\`` agregado a las opciones de
  `cloudinary.uploader.upload_stream`, con el mismo path base que el `public_id` (recomendación
  de la doc de Cloudinary). `public_id`, `overwrite`, `invalidate`, `resource_type` sin cambios.
  Sin `folder` ni `public_id_prefix`. Sin `any` propio (lo absorbe la index signature
  `[futureKey: string]: any` del `.d.ts` del SDK). Tests: `storage.test.ts` valida `asset_folder`
  + `not.toHaveProperty('folder')` en las 4 funciones; `barProfile.test.ts` lo agrega en los 2
  tests que inspeccionan opciones; `groupCreation`/`uploadAvatar` sin cambios.
- **Veredicto del Reviewer:** `[APPROVED]` (primera pasada del fixup). 7 puntos verificados
  contra el código real, comandos re-corridos en vivo: `lint` exit 0, `test` 642/642,
  `test:coverage` 94.3% global / 100% en `src/utils/storage.ts`. Salvedad no bloqueante: LB-101
  nunca se comitteó, el diff del fixup se validó por comparación de contenido + `git grep`. La
  verificación de que el asset cae realmente en `labanda/dev/<tipo>/` es prueba manual del
  usuario contra Cloudinary real, fuera del alcance del harness.
- **Estado en Jira:** LB-101 transicionada a **"Finalizada"** el 2026-09-02 (quality gate LB-101
  + fixup satisfecho, prueba manual del usuario OK). Commit `5c362dd` en `feat/production`, sin
  push. El commit incluye el fixup (no hubo commit intermedio de LB-101).

### [2026-09-02] - Ad-hoc: follow-ups menores post LB-101 (sin ticket Jira)
- **Dominio afectado:** Backend (`apps/server`).
- **Subagentes involucrados:** Implementer (`progress/implementers/impl_followups-post-LB-101.md`),
  Reviewer (`progress/reviewers/review_followups-post-LB-101.md`). Sin Explorer — ambos puntos ya
  relevados en `exp_LB-101.md` §9.6 / §9.8.
- **Contexto:** al cerrar LB-101 quedaron documentados 2 arreglos menores; el usuario autorizó
  hacerlos directamente, sin abrir ticket.
- **Resumen de Cambios:** (1) **"Quitar logo/portada" del bar ahora persiste server-side.**
  `BarController.updateBarProfile` ignoraba `logoUrl`/`coverUrl` del body (el botón del cliente
  `BarProfileView.tsx` era no-op). Ahora destructura ambos, acepta **sólo `null`** (string no-null
  → 400 vía `express-validator` en `barRoute.ts` con `.optional().custom(v => v === null)`), y al
  quitar una imagen que tenía valor llama a la nueva `deleteImage(assetType, entityId)` de
  `utils/storage.ts` (`cloudinary.uploader.destroy` con el mismo `public_id` determinístico que
  `uploadImage` + `invalidate: true`; idempotente ante `{ result: 'not found' }`; tipado sin `any`
  vía `unknown` + narrowing) y hace `$unset` del campo (`bar.logoUrl = undefined`, patrón de
  Mongoose ya usado en la misma función). El `deleteImage` ocurre antes de `bar.save()`; el guard
  `BarUserRole.OWNER` de LB-84 quedó intacto. Frontend no tocado. (2) **Exports muertos
  eliminados:** `uploadLogo`/`uploadCover` de `middleware/upload.ts` (sólo se referenciaban en su
  propio test; las rutas de bar usan `uploadSingle`). `upload`/`uploadSingle`/`createUploadMiddleware`
  intactos. `grep` de `uploadLogo|uploadCover` en `apps/server/` → 0 coincidencias.
- **Veredicto del Reviewer:** `[APPROVED]` (primera pasada). 13 puntos + C1–C4 verificados contra
  el código real, comandos re-corridos en vivo: `lint` exit 0, `test` **653/653** (+11 tests
  nuevos), `test:coverage` sin fallo de umbral, `src/utils/storage.ts` y `src/middleware/upload.ts`
  al 100% en las 4 métricas. `git status`: exactamente 7 archivos (4 producción + 3 tests),
  `apps/client/` sin cambios, sin re-modificar archivos del commit `5c362dd`.
- **Commit:** `feat/production`, sin push.

### [2026-09-06] - LB-102: Dejar el entorno listo para el primer deploy a producción (Render + Vercel)
- **Dominio afectado:** Monorepo (Backend `apps/server` + config de `apps/client`).
- **Subagentes involucrados:** Explorer (`progress/explorers/exp_LB-102.md`),
  Implementer (`progress/implementers/impl_LB-102.md`), Reviewer (`progress/reviewers/review_LB-102.md`).
- **Contexto:** primer deploy real del proyecto (pre-launch, sin datos de usuario en ningún
  entorno). Plataformas: `apps/server` → Render, `apps/client` → Vercel, imágenes → Cloudinary
  (LB-101, ya cerrado). Jira MCP se cayó al inicio de la sesión (`CONNECT_TIMEOUT`) y el usuario
  lo reconectó a mano; la descripción y los 6 puntos del ticket se leyeron de Jira una vez
  online. El mirror del vault (`12-Jira/`) estaba desactualizado (llegaba a LB-57).
- **Decisiones de producto del usuario (vía `AskUserQuestion`, 2026-09-06):** (1) **CORS:**
  soportar previews de Vercel → cambio de código, no solo doc. (2) **VAPID/push:** posponer, sin
  código (`pushService.ts` ya degrada). (3) **Pin de Node:** NO tocar el repo, lo fija el usuario
  en el dashboard de Render. (4) Adición autorizada a mitad de camino: endpoint **`GET /health`**
  (el ticket lo listaba como fuera de alcance "salvo que el usuario lo pida").
- **Resumen de Cambios (10 archivos: 4 nuevos + 6 modificados):**
  1. **`src/index.ts`** — el guard `if (NODE_ENV !== 'production')` que envolvía
     `http.createServer` + `initPointsHub` + `httpServer.listen` (sin `else`) hacía que en Render
     (`NODE_ENV=production`) el proceso conectara a Mongo pero **nunca abriera puerto**. Invertido
     a `!== 'test'` (guarda defensiva conservada, no eliminada: ningún test importa `index.ts` hoy
     pero un `listen()` incondicional dejaría un handle colgado si alguno lo hiciera). `port =
     process.env.PORT || 3000` y `listen` sin host (bind `0.0.0.0`) intactos. `console.log`
     cosmético ajustado a `Server is running on port ${port}`.
  2. **`src/utils/allowedOrigins.ts`** (nuevo) — helper compartido de allowlist CORS multi-origen:
     `parseAllowedOrigins` (lee `FRONTEND_URL` como **CSV**, trim, descarta vacíos, fallback
     `['http://localhost:5173']`), `getPreviewOriginRegex` (env **`CORS_PREVIEW_ORIGIN_REGEX`**
     opcional → `RegExp | null`), `getOriginRules` (re-lee `process.env` en cada llamada, sin
     cache de módulo), `isOriginAllowed(origin: string | undefined)` (`!origin` ⇒ true, match
     exacto ⇒ true, regex de preview ⇒ true, resto ⇒ false). Sin `any`. Consumido por
     **`config/cors.ts`** (se eliminó `ACCEPTED_ORIGINS` y el param `{ acceptedOrigins }` de
     `corsMiddleware` — único llamador `server.ts` `app.use(corsMiddleware())`) y por
     **`websocket/pointsHub.ts`** (el `cors.origin` de socket.io pasó de string único a función
     con la misma lógica). `credentials: true` intacto en ambos.
  3. **`apps/client/vercel.json`** (nuevo) — rewrite catch-all `/(.*)` → `/index.html` para la SPA
     (`react-router` v7 + `BrowserRouter`, sin SSR). No se tocó `router.tsx` ni la config de Vite.
  4. **`README.md`** — versión de pnpm alineada a `pnpm@11.22.0` (fuente: `packageManager` del
     `package.json` raíz, que NO se tocó).
  5. **`apps/server/.env.example`** — `SALT_ROUNDS=10` (opcional, comentado), `EMAIL_USER`/
     `EMAIL_PASSWORD` visibles con nota de obligatorias en prod (App Password de Gmail),
     `CORS_PREVIEW_ORIGIN_REGEX` documentada con ejemplo, nota de VAPID pospuesto, bloque
     "Deploy (Render)" con `NODE_ENV=production` / `CLOUDINARY_FOLDER=labanda/prod`. Sin secretos.
  6. **`src/server.ts`** — `GET /health` inline (siguiendo el precedente de `GET /api`), **200
     siempre**: `{ status, uptime, timestamp, dbState: mongoose.connection.readyState }`.
     **Liveness, no readiness** — el 200 no depende de Mongo, `dbState` es solo informativo, para
     que un blip de DB no ponga a Render a matar el servicio en loop. Ruta en inglés, sin
     validación, sin tocar modelos.
  - Tests nuevos: `utils/__tests__/allowedOrigins.test.ts` (match exacto, CSV, `!origin`, regex
    match/no-match, sin regex, integración), `__tests__/health.test.ts` (`GET /health` → 200 +
    forma del payload, con `config/db` mockeado).
- **Fuera de alcance, confirmado NO tocado por el Reviewer:** CI/CD (`.github/`), Dockerfile,
  `Procfile`, `render.yaml`, `.nvmrc`, `engines` (raíz y `apps/server`), helmet, rate-limiting,
  `docs/DEPLOY.md`, `config/supabase.ts`, entrada `uploads/` del `.gitignore`, deuda ADR-03
  (cookie `maxAge` vs JWT `expiresIn`).
- **Veredicto del Reviewer:** `[APPROVED]` (primera pasada). C1–C4 verificados contra el código
  real; los 6 comandos de C4 re-corridos en vivo por el propio Reviewer: `server lint` exit 0,
  `server test` **675/675** (74 archivos), `server test:coverage` 94.42% stmts / 86.66% branch
  global (umbral 80% sobre `utils/**`+`middleware/**` respetado; `allowedOrigins.ts` ~100%),
  `client lint` 0 errores (10 warnings preexistentes de `react-hooks/incompatible-library` en
  vistas no tocadas), `client build` OK, `client test` **316/316**. `git status`: exactamente los
  10 archivos del reporte, nada fuera de alcance.
- **Hallazgos no bloqueantes:** (1) `engines.node` sigue en `>=18` en el `package.json` raíz
  mientras el código usa `process.loadEnvFile()` (Node ≥ 20.6) — el ticket excluye tocar
  `engines`/`.nvmrc`, queda como riesgo operacional: **el usuario fija Node ≥ 20.6 en Render**
  (decisión de producto ya tomada). (2) `getOriginRules()` re-lee `process.env` por request (sin
  cache) — costo despreciable, aceptado. (3) Health Check Path de Render = `/health` (no `/api`).
  (4) Warnings de eslint/chunk en el client: baseline preexistente.
- **Estado en Jira:** LB-102 `Tareas por hacer` → `En curso` (2026-09-06, transición id 21, al
  arrancar el ciclo) → **`Listo`** (2026-09-06, transición id 31, tras `[APPROVED]` del Reviewer).
- **Trabajo de infra que queda para el humano (fuera del harness):** crear el Web Service en
  Render (build `pnpm install --frozen-lockfile && pnpm --filter @bar/server build`, start
  `pnpm --filter @bar/server start`, Health Check Path `/health`, Node ≥ 20.6, env vars:
  `NODE_ENV=production`, `DATABASE_URL` de Mongo Atlas, `JWT_SECRET` real, `FRONTEND_URL` del
  dominio de Vercel, las 4 de Cloudinary con `CLOUDINARY_FOLDER=labanda/prod`, `EMAIL_USER`/
  `EMAIL_PASSWORD` App Password; opcionalmente `CORS_PREVIEW_ORIGIN_REGEX`); crear el cluster de
  Mongo Atlas con IP allowlist para Render; importar `apps/client` en Vercel (preset Vite, root
  `apps/client`, env `VITE_API_URL=https://<render>/api`, `VITE_VAPID_PUBLIC_KEY` si se retoma
  push); generar la App Password de Gmail. Detalle completo en `exp_LB-102.md` §final.
- **Commits:** ninguno todavía — los cambios de LB-102 quedan sin commitear en el working tree de
  `feat/production`, que además arrastra 3 commits sin push (`5c362dd`, `7e99720`, `646461f`).
  Commit/push a criterio del usuario.