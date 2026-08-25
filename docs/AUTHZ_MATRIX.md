# Matriz de Autorización — Endpoints × Roles (LB-84)

> Generado como parte de LB-84 ("Auditoría de autorización end-to-end").
> Refleja el código real de `apps/server/src` **después** de los fixes de
> LB-84 (mass assignment en registro + gap OWNER/CASHIER en perfil de bar +
> eliminación de `User.role`/`Role`). Es el contrato que consume LB-85
> (AUTH-2, guardas de rol en frontend) — mantenerlo sincronizado a mano con
> el código, no hay generación automática.

## 0. Fuentes de rol vigentes (una sola por dominio, sin `User.role`)

| Dominio | Fuente de verdad | Enum | Quién la escribe |
|---|---|---|---|
| Bar (OWNER/CASHIER) | `BarUser.role` | `BarUserRole` (`OWNER`, `CASHIER`) | `BarController.registerBar` (primer `BarUser` = OWNER), `ContextController.select` (asigna según `mode`) |
| Grupo (LEADER/CO_LEADER/MEMBER) | `Group.memberships[].role` | `MembershipRole` (`LEADER`, `CO_LEADER`, `MEMBER`, `ADMIN` sin uso real) | `GroupController` (creación, invitaciones, `updateMemberRole`, sucesión en `leaveGroup`) |
| Cuenta de usuario (¿está logueado y activo?) | `User.isActive` | — | `AuthController.confirmAccount` / desactivación manual (no hay endpoint de desactivación de `User` hoy) |

`User.role` y el enum `Role` (`ADMIN`/`USER`/`OWNER`/`WAITER`) fueron
**eliminados por completo** del modelo (`apps/server/src/models/User.ts`) en
este ticket — nunca fueron una fuente real de autorización (ver
`progress/explorers/exp_LB-84.md` §1/§6), solo un gate binario "¿está
logueado y activo?" que hoy resuelve `authenticate()` sin argumentos.

`User.memberships[].role` es una copia denormalizada de
`Group.memberships[].role` usada **solo para listar** (`UserController.getUserGroups`),
nunca para autorizar — no aparece en esta matriz como mecanismo de rechazo.

---

## 1. Auth (`/api/auth`, `authRoute.ts`)

| Endpoint | Método | Rol permitido | Mecanismo |
|---|---|---|---|
| `/register` | POST | Público (crea cuenta) | Ninguno — `express-validator` + whitelist explícita de campos en `AuthController.createAccount` (LB-84: ya no acepta `role`/`isActive`/`profileComplete`/`memberships` del body) |
| `/confirm-account`, `/request-code`, `/validate-token`, `/forgot-password`, `/update-password/:token`, `/login` | POST | Público | `express-validator` únicamente |
| `/logout`, `/session`, `/onboarding`, `/onboarding/profile`, `/profile` (PUT), `/update-password` | GET/POST/PUT | Cualquier usuario autenticado y activo | `authenticate()` (JWT + `User.isActive`, sin distinción de rol) |

## 2. Users (`/api/users`, `userRoute.ts`)

Todas las rutas están detrás de `router.use(authenticate())` — self-scoped
(`req.user._id`), no hay recurso ajeno que impersonar.

| Endpoint | Método | Rol permitido | Mecanismo |
|---|---|---|---|
| `/profile` (GET/PUT), `/avatar` (POST), `/groups` (GET) | GET/PUT/POST | Cualquier usuario autenticado y activo | `authenticate()`, siempre sobre `req.user._id` |

## 3. Bars (`/api/bar`, `barRoute.ts` + `/api/bars`, `barsRoute.ts`)

| Endpoint | Método | Rol permitido | Fuente | Mecanismo |
|---|---|---|---|---|
| `/api/bar/registro` | POST | Cualquier usuario autenticado con perfil completo | — | `authenticate()` + `requireCompleteProfile` |
| `/api/bar/activos`, `/api/bar/mis-bares`, `/api/bar/:id/detail`, `/api/bar/:id/rewards/available`, `/api/bars` (listado LB-79) | GET | Cualquier usuario autenticado | — | `authenticate()` |
| `/api/bar/:id/perfil` (GET) | GET | Cualquier `BarUser` del bar (OWNER o CASHIER) | `BarUser.role` | `authenticate()` + `verifyBarAccess` (403 si no hay `BarUser`) |
| `/api/bar/:id/perfil` (PATCH), `/api/bar/:id/logo`, `/api/bar/:id/cover` | PATCH/POST | **Solo OWNER** | `BarUser.role` | `authenticate()` + `verifyBarAccess` + chequeo inline `role !== BarUserRole.OWNER` → 403 (**LB-84: antes cualquier CASHIER pasaba, fix crítico #2 del ticket**) |
| ~~`/api/bar/:id/activar`~~ | ~~PATCH~~ | — | — | **Eliminado en LB-84** (endpoint huérfano gateado por `Role.ADMIN`, sin uso real desde el frontend ni panel admin construido — ver `BarController`, ya no existe `activateBar`) |

## 4. Bar Drink Categories (`/api/bar/:barId/categories`, `drinkCategoryRoute.ts`)

| Endpoint | Método | Rol permitido | Fuente | Mecanismo |
|---|---|---|---|---|
| `GET /` (listCategories) | GET | Cualquier `BarUser` del bar | `BarUser.role` | `authenticate()`, sin chequeo de rol adicional en el controller |
| `POST /`, `PUT /:categoryId`, `PATCH /:categoryId/status`, `DELETE /:categoryId` | POST/PUT/PATCH/DELETE | **Solo OWNER** | `BarUser.role` | `authenticate()` + chequeo inline `barUser.role !== BarUserRole.OWNER` → 403 (`DrinkCategoryController`) |

## 5. Bar Rewards — ABM (`/api/bars/:barId/rewards`, `rewardRoute.ts`)

| Endpoint | Método | Rol permitido | Fuente | Mecanismo |
|---|---|---|---|---|
| `GET /` (listRewards) | GET | Cualquier `BarUser` del bar | `BarUser.role` | `authenticate()`, sin chequeo de rol adicional |
| `POST /`, `PUT /:rewardId`, `DELETE /:rewardId` | POST/PUT/DELETE | **Solo OWNER** | `BarUser.role` | `authenticate()` + `resolveOwnerAccess` (403 a CASHIER) |

## 6. Rewards disponibles / canje de recompensas (grupo)

| Endpoint | Método | Rol permitido | Fuente | Mecanismo |
|---|---|---|---|---|
| `GET /api/bar/:id/rewards/available` | GET | Cualquier usuario autenticado | — | `authenticate()` (resuelve el bar directo por `:id`) |
| `GET /api/rewards/available?groupId=` | GET | Miembro del grupo | `Group.memberships` | `authenticate()`, `RewardController.getAvailableRewards` valida membresía |
| `GET /api/groups/:groupId/rewards` | GET | Miembro del grupo | `Group.memberships` | `authenticate()`, `GroupRewardsController.getAvailable` |
| `POST /api/groups/:groupId/redemptions` (create), `PATCH /:id/cancel` | POST/PATCH | **LEADER o CO_LEADER** del grupo | `Group.memberships` | `authenticate()` + `assertLeaderOrCoLeader(groupId, userId)` → 403 |
| `GET /api/groups/:groupId/redemptions` (list) | GET | **LEADER o CO_LEADER** del grupo | `Group.memberships` | `authenticate()` + `assertLeaderOrCoLeader` → 403 |
| `POST /api/redemptions/:tokenOrCode/lookup`, `/validate` | POST | Cajero (OWNER o CASHIER) del bar del canje | `BarUser` vía `cashierContext` | `authenticateCashier` (JWT `barId` + `BarUser` fresco) + `CashierRedemptionController` valida que `redemption.bar` coincide con `cashierContext.bar` |

## 7. Dashboard / Audit Logs / Reports (OWNER-only, `mergeParams :barId`)

| Endpoint | Método | Rol permitido | Fuente | Mecanismo |
|---|---|---|---|---|
| `GET /api/bars/:barId/dashboard`, `PATCH /consumptions/:consumptionId/resolve` | GET/PATCH | **Solo OWNER** | `BarUser.role` | `authenticate()` + `resolveOwnerAccess` (`DashboardController`) |
| `GET /api/bars/:barId/audit-logs` (incl. `?format=csv`) | GET | **Solo OWNER** | `BarUser.role` | `authenticate()` + `resolveOwnerAccess` (`AuditLogController`) |
| `GET /api/bars/:barId/reports` | GET | **Solo OWNER** | `BarUser.role` | `authenticate()` + `resolveOwnerAccess` (`ReportController`) |

## 8. Cashier panel (`/api/cashier`, `cashierRoute.ts`)

| Endpoint | Método | Rol permitido | Fuente | Mecanismo |
|---|---|---|---|---|
| `GET /session`, `POST /logout`, `GET /groups/search` | GET/POST | Cajero (OWNER u CASHIER) con turno activo | `BarUser` + `Shift` | `authenticateCashier` (JWT `{id,barId,role}` + `BarUser` fresco + `Shift` activo + auto-cierre por horario) |
| `POST /shift/close` | POST | Cajero con turno activo o cierre manual pendiente de retry | `BarUser` + `Shift` | `authenticateCashierForClose` |
| `GET /shifts/history` | GET | Cualquier usuario autenticado, filtrando por `barId` propio | — | `authenticate()` (el controller resuelve el `barId` recibido contra los bares del usuario) |
| `GET /shifts/pending-summary` | GET | Cajero u OWNER activo del bar (sin exigir turno vigente) | `BarUser` | `authenticateCashierSummary` |
| `GET /shifts/:shiftId/summary`, `/pdf`, `/csv` | GET | Cajero (su propio turno) u OWNER (cualquier turno del bar) | `BarUser`/`Shift` | `authenticateShiftSummary` (cajero o `authenticate()` genérico) + el controller valida ownership del `shiftId` a nivel de recurso |

## 9. Contexto (`/api/context`, `contextRoute.ts`)

| Endpoint | Método | Rol permitido | Fuente | Mecanismo |
|---|---|---|---|---|
| `GET /options` | GET | Cualquier usuario autenticado | `BarUser` (para armar las opciones) | `authenticate()` |
| `POST /select` | POST | Cualquier usuario autenticado; `mode: cashier/owner` exige `BarUser` con el rol pedido | `BarUser.role` | `authenticate()` + `BarUser.findOne({bar,user,role})` (403 si no existe el vínculo con ese rol exacto) — incluye kick-out de `Shift` previo (`ShiftEndReason.KICKED_OUT`, cubierto por test de regresión, ver §11) |

## 10. Consumptions / Check-in / Close (cajero, sobre una `Outing` puntual)

| Endpoint | Método | Rol permitido | Fuente | Mecanismo |
|---|---|---|---|---|
| `POST /api/outings/:outingId/consumptions`, `PATCH /:consumptionId/regenerate`, `GET /pending` | POST/PATCH/GET | Cajero (OWNER/CASHIER) del bar de la `Outing` | `BarUser` vía `cashierContext` | `authenticateCashier` + el controller valida `outing.bar === cashierContext.bar` |
| `PATCH /api/outings/:outingId/check-in` | PATCH | Cajero del bar de la `Outing` | ídem | `authenticateCashier` |
| `PATCH /api/outings/:outingId/close` | PATCH | Cajero del bar de la `Outing` | ídem | `authenticateCashier` |
| `POST /api/consumptions/lookup`, `/:consumptionId/accept`, `/:consumptionId/reject` | POST | **LEADER o CO_LEADER** del grupo dueño del consumo | `Group.memberships` | `authenticate()` + `isLeaderOrCoLeader` resuelto vía `Group.memberships` fresco (`LeaderConsumptionController`) |

## 11. Groups (`/api/groups`, `groupRoute.ts`)

| Endpoint | Método | Rol permitido | Fuente | Mecanismo |
|---|---|---|---|---|
| `POST /` (createGroup), `POST /join`, `GET /invite/:inviteCode`, `GET /search` | POST/GET | Cualquier usuario autenticado (perfil completo para crear/unirse) | — | `authenticate()` (+ `requireCompleteProfile` en crear/join); `/invite/:inviteCode` usa `optionalAuthenticate` |
| `GET /:slug` (getGroupBySlug), `GET /:slug/qr` | GET | **Miembro** del grupo | `Group.memberships` | `authenticate()` + chequeo inline `isMember` → 403 |
| `GET /:slug/requests`, `POST /:slug/requests/:requestId/approve`\|`reject` | GET/POST | **LEADER o CO_LEADER** del grupo | `Group.memberships` | `authenticate()` + chequeo inline sobre `group.leader`/`memberships` |
| `PATCH /:slug/members/:memberId/role`, `DELETE /:slug/members/:memberId` | PATCH/DELETE | **LEADER** del grupo (`group.leader`, no el array de roles) | `Group.leader` | `authenticate()` + chequeo inline `group.leader.toString() !== userId` → 403 |
| `POST /:slug/leave`, `/mark-departures-seen`, `/mark-successions-seen` | POST | **Miembro** del grupo | `Group.memberships` | `authenticate()` + chequeo inline `isMember` |
| `GET /:id`, `GET /:id/members` | GET | **Cualquier usuario autenticado, sin chequeo de membresía** | — | `authenticate()` únicamente — **ver hallazgo abierto en §12** |

## 12. Group Balance (`/api/groups/:groupId`, `groupBalanceRoute.ts`)

| Endpoint | Método | Rol permitido | Fuente | Mecanismo |
|---|---|---|---|---|
| `GET /balance`, `GET /history` | GET | **Miembro** del grupo | `Group.memberships` | `authenticate()` + `GroupBalanceController` valida `isMember` contra `Group.memberships` fresco → 403 |

## 13. Outings (`/api/groups/:groupId/outings`, `outingRoute.ts`)

| Endpoint | Método | Rol permitido | Fuente | Mecanismo |
|---|---|---|---|---|
| `POST /` (createOuting), `PATCH /:outingId` (update), `PATCH /:outingId/cancel` | POST/PATCH | **LEADER o CO_LEADER** del grupo | `Group.memberships` | `authenticate()` + `getLeaderOrCoLeaderRole(group.memberships, userId)` → 403 a `MEMBER` |
| `GET /active` | GET | **Miembro** del grupo | `Group.memberships` | `authenticate()` + chequeo inline `isMember` → 403 |

---

## Hallazgo abierto (NO corregido en LB-84 — fuera del alcance autorizado del ticket)

**`GET /api/groups/:id` (`getGroupById`) y `GET /api/groups/:id/members`
(`getGroupMembers`) no verifican membresía del solicitante contra el grupo
solicitado** — a diferencia de `getGroupBySlug` (que sí lo hace), cualquier
usuario autenticado puede consultar nombre/slug/`memberCount` y la lista
completa de miembros (nombre, apellido, avatar, rol) de **cualquier grupo**
por ID, sin ser miembro. Esto es exactamente el patrón de "impersonar
recurso ajeno" que el ticket pidió auditar (`apps/server/src/controllers/GroupController.ts:1088-1156`).
No se corrigió porque el alcance de LB-84 fue delegado explícitamente solo
a los fixes #1 (mass assignment) y #2 (OWNER/CASHIER en `BarController`) —
corregirlo por cuenta propia hubiera violado el alcance de la tarea. Queda
documentado acá y en `progress/implementers/impl_LB-84.md` para que el
Leader abra un ticket de seguimiento.
