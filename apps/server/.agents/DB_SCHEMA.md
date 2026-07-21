## Database Schema & Domain Knowledge

### 1. Usuarios (`users`)

Los usuarios son entidades independientes. No deben conocer bares, grupos ni puntos directamente.

```js
users {
  _id,
  name,
  lastName,
  birthdate,
  email,
  password,
  role,           // USER | OWNER | WAITER | ADMIN
  avatarUrl,
  isActive,
  createdAt,
  updatedAt
}
```

**Claves del diseño**
- El rol es global
- Los puntos no viven acá
- No hay arrays que crezcan sin límite

---

### 2. Bares (`bars`) — agregado raíz

El bar es el centro operativo del sistema. Todo lo que depende exclusivamente del bar se embebe.

```js
bars {
  _id,
  name,
  address,
  logoUrl,
  isActive,
  waiters: [
    {
      userId,
      isActive,
      assignedAt
    }
  ],
  createdAt
}
```

**Por qué embebido**
- Los mozos solo existen en el contexto del bar
- No se consultan globalmente
- Se accede siempre desde el bar

---

### 3. Grupos (`groups`) — agregado social

Los grupos son estables, pequeños y muy consultados. Sus relaciones se embeben.

```js
groups {
  _id,
  name,
  logoUrl,
  leaderId,
  inviteCode,
  members: [
    {
      userId,
      joinedAt
    }
  ],
  invitations: [
    {
      email,
      invitedBy,
      status,
      expiresAt,
      createdAt
    }
  ],
  createdAt
}
```

**Ventajas**
- Validar membresía sin lookup
- Crear salidas rápido
- Listar grupos por usuario con índice en `members.userId`

---

### 4. Puntos por bar (colecciones separadas)

Los puntos **NO** se embeben en usuarios ni grupos.

#### Usuario por bar

```js
userBarPoints {
  _id,
  userId,
  barId,
  totalPoints,
  updatedAt
}
```

#### Grupo por bar

```js
groupBarPoints {
  _id,
  groupId,
  barId,
  totalPoints,
  updatedAt
}
```

**Motivo**
- Rankings
- Queries por bar
- Actualizaciones frecuentes
- Índices `{ barId, userId }` y `{ barId, groupId }`

---

### 5. Salidas (`outings`) — agregado de evento

Las salidas son eventos acotados en tamaño. La asistencia se embebe.

```js
outings {
  _id,
  groupId,
  barId,
  leaderId,
  status,  // PENDING | ACTIVE | COMPLETED | CANCELLED
  scheduledFor,
  startedAt,
  qrToken,
  attendances: [
    {
      userId,
      confirmedAt
    }
  ],
  createdAt
}
```

- El número de asistentes es limitado
- Siempre se consulta junto a la salida
- Evita N+1 lookups

---

### 6. Sesiones de asistencia QR (`attendanceSessions`)

Las sesiones son efímeras pero auditables.

```js
attendanceSessions {
  _id,
  outingId,
  groupId,
  barId,
  waiterUserId,
  qrToken,
  status,
  expiresAt,
  createdAt
}
```

**Colección separada porque:**
- Expiran
- Se validan por token
- Pueden auditarse

---

### 7. Consumos (`consumptions`) — histórico

Nunca se embeben.

```js
consumptions {
  _id,
  outingId,
  groupId,
  barId,
  waiterUserId,
  amount,
  basePoints,
  multiplier,
  tableNumber,
  createdAt
}
```

**Son:**
- Registros financieros
- Base de puntos
- Crecientes sin límite

---

### 8. Promociones y canjes

#### Promociones (`promotions`)

```js
promotions {
  _id,
  barId,
  title,
  description,
  costPoints,
  stock,
  isActive,
  validUntil,
  createdAt
}
```

#### Canjes (`redemptions`)

```js
redemptions {
  _id,
  userId,
  groupId,
  promotionId,
  barId,
  pointsSpent,
  redeemedAt
}
```

**Separados porque:**
- Stock
- Control antifraude
- Reporting

---

### 9. Transacciones de puntos (`pointsTransactions`) — auditoría total

```js
pointsTransactions {
  _id,
  userId,
  groupId,
  barId,
  type,        // EARN | REDEEM
  amount,
  description,
  createdAt
}
```

> Nunca se recalcula, nunca se borra.

---

### 10. Misiones del bar (`barMissions`)

```js
barMissions {
  _id,
  barId,
  title,
  description,
  type,
  goal,
  unit,
  rewardPoints,
  isActive,
  validUntil
}
```