# Esquema de Base de Datos — La Banda (MongoDB / Mongoose)

> Este documento es el **mapa mental inmutable** de la base de datos para
> cualquier agente que intente modificar modelos de Mongoose o consultar
> datos en `apps/server`. Antes de tocar un modelo, un controlador que
> consulta datos, o de asumir la forma de un documento, este archivo (y el
> código real en `apps/server/models/`) es la fuente de verdad — no la
> memoria del agente ni documentación histórica de otro dominio.

---

## 1. Reglas generales de persistencia

- El proyecto utiliza **exclusivamente MongoDB**, gestionado a través del
  ODM **Mongoose**.
- **Prohibido** intentar ejecutar consultas SQL o proponer migraciones
  relacionales clásicas (tablas, joins SQL, foreign keys de motor
  relacional). El modelo de datos es documental, no relacional.
- Todo modelo nuevo o campo nuevo debe declararse **explícitamente** en su
  archivo Mongoose correspondiente dentro de `apps/server/models/`. No se
  asumen campos implícitos ni se agregan datos "sueltos" sin schema.
- **No existe actualmente ningún sistema de "Gamificación", "Misiones" o
  "Puntos".** Si se requiere implementar a futuro, se debe diseñar **desde
  cero**, sin asumir colecciones preexistentes ni reutilizar nombres de
  documentación histórica que describía ese dominio como si ya existiera.

---

## 2. Colecciones existentes (mapa de dominio)

### Colección: `users`

- **Descripción:** almacena los perfiles de los usuarios y su nivel de
  acceso global en la plataforma.
- **Campos clave:** `name`, `email`, `password` (hasheado).
- **Roles globales:** soporta los roles `ADMIN`, `USER`, `OWNER`, `WAITER`.
- **Relaciones:** contiene un array embebido `memberships[]` para
  representar los grupos a los que pertenece el usuario.

### Colección: `bars`

- **Descripción:** representa a los establecimientos (bares/boliches)
  registrados en el sistema.
- **Campos clave:** `name`, `slug` (único, utilizado para URLs), `address`
  (subdocumento embebido), `schedule` (horarios).
- **Estado:** se controla mediante el campo `status`, que admite los valores
  `pending`, `active`, `rejected`.

### Colección: `groups`

- **Descripción:** agrupaciones sociales de usuarios (ej: "Grupo de amigos
  para salir").
- **Campos clave:** `name`, `slug` (único), `inviteCode` (código único para
  unirse).
- **Relaciones:** contiene un array embebido `memberships[]` que estipula el
  rol del usuario **dentro del grupo** (`ADMIN`, `MEMBER`, `LEADER`,
  `CO_LEADER`).

### Colecciones de soporte y operación

| Colección | Descripción |
|---|---|
| `bar_users` | Tabla de unión/relación para vincular a un empleado/dueño con un bar específico. Maneja roles locales (`OWNER`, `MANAGER`). |
| `outings` | Representa un evento o "salida" planificada por un grupo. **Restricción:** posee un índice único que garantiza que solo puede haber **un (1) outing activo por grupo** a la vez. |
| `join_requests` | Solicitudes para unirse a grupos. Posee un índice **TTL** para que expiren automáticamente. |
| `group_bans` | Registro de usuarios expulsados de un grupo. |
| `notifications` | Sistema de alertas in-app. |
| `tokens` | Almacena los OTP (One Time Passwords) de 6 dígitos. Posee un índice **TTL de 10 minutos**. |

---

## 3. Advertencia sobre roles (deuda técnica / complejidad)

Existen **tres sistemas de roles solapados** que los agentes deben manejar
con extremo cuidado, ya que operan en niveles distintos y **no son
intercambiables**:

1. **Rol global** — en `users` (`ADMIN`, `USER`, `OWNER`, `WAITER`).
2. **Rol local de bar** — en `bar_users` (`OWNER`, `MANAGER`, y afines).
3. **Rol local de grupo** — dentro del array `memberships` en `groups` y en
   `users` (`ADMIN`, `MEMBER`, `LEADER`, `CO_LEADER`).

Antes de escribir una autorización basada en rol, hay que identificar
**cuál de los tres sistemas** corresponde a la operación en cuestión — un
`OWNER` global no es lo mismo que un `OWNER` de `bar_users`, y un `ADMIN` de
`users` no es lo mismo que un `ADMIN` dentro de `memberships` de un grupo.
