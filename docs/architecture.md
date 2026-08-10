# Arquitectura — "La Banda"

> Este documento define las **políticas arquitectónicas inmutables** del
> monorepo. No es una sugerencia de estilo: es la especificación contra la
> cual el subagente `reviewer` audita todo código nuevo, checkpoint por
> checkpoint, según `CHECKPOINTS.md`. Ante cualquier ambigüedad, este
> documento tiene prioridad sobre la intuición o preferencia puntual de un
> agente o de un ticket.
>
> Ver también: `.claude/rules/backend.md` y `.claude/rules/frontend.md` (el
> "Skills Digest" operativo de cada capa, derivado de estas mismas reglas) y
> `AGENTS.md` (cómo se aplican estas reglas dentro del ciclo de vida de un
> ticket).

---

## 1. Principio de aislamiento (el monorepo)

**"La Banda"** es un monorepo gestionado con **pnpm** (workspaces declarados
en `pnpm-workspace.yaml`) que aloja dos aplicaciones **totalmente
desacopladas**:

- `apps/server` — Backend (Node, Express, MongoDB).
- `apps/client` — Frontend (React, Vite).

Ambas aplicaciones se despliegan, versionan y ejecutan de forma
independiente. Comparten el mismo repositorio por conveniencia operativa
(un solo `pnpm install`, un solo historial de git), **no** porque compartan
código en tiempo de ejecución ni en tiempo de compilación.

### Regla de oro: no existe `packages/` compartido

No hay, ni debe crearse, un directorio `packages/` (ni ningún otro mecanismo
de workspace interno) que exponga código, tipos o utilidades compartidas
entre `apps/server` y `apps/client`. `pnpm-workspace.yaml` lista únicamente
`apps/client` y `apps/server` como miembros del workspace — esto es
deliberado, no un olvido.

**Consecuencias concretas de esta regla:**

- `apps/client` **nunca** importa un archivo, tipo, interfaz o constante
  desde `apps/server/`, y viceversa. Ninguna ruta de import cruza el límite
  `apps/client/` ↔ `apps/server/`, bajo ninguna circunstancia, ni siquiera
  para un tipo trivial como un enum de roles.
- Si el frontend necesita representar la forma de una respuesta del backend
  (por ejemplo, el shape de un `User` o un `Group` devuelto por la API), esa
  interfaz **se re-declara manualmente** en `apps/client/src/types/`. No se
  genera automáticamente, no se infiere desde el modelo Mongoose, no se
  comparte vía un paquete interno.
- La sincronización entre el contrato real del backend y el tipo declarado en
  el frontend es **responsabilidad humana/documental**, no una garantía que
  el compilador o el build del monorepo verifiquen por sí solos. Un cambio en
  un modelo de `apps/server/src/models/` **no** produce automáticamente un
  error de tipos en `apps/client` — el `implementer` debe actualizar ambos
  lados de forma explícita si un ticket lo requiere.
- Este aislamiento es intencional en el estado actual del proyecto y **no se
  resuelve** introduciendo un `packages/shared` "de paso" dentro de un
  ticket no relacionado. Cualquier cambio a esta política de aislamiento es
  una decisión arquitectónica de fondo, no una implementación incidental.

---

## 2. Arquitectura del backend (`apps/server`)

### Stack

- **Runtime:** Node.js.
- **Framework HTTP:** Express **5.2.1**.
- **Lenguaje:** TypeScript.
- **Base de datos:** MongoDB, accedida exclusivamente vía **Mongoose**
  (esquemas, validación de datos, hooks de negocio).

### Patrón de capas estricto (3 pasos)

El backend sigue una cadena lineal de responsabilidad, sin capas
intermedias:

```
routes/  →  controllers/  →  models/
```

**1. `routes/`** — Define los endpoints HTTP (verbo + path) y encadena la
validación de entrada con `express-validator` (`body()`, `param()`,
`query()`, seguido de un middleware que corta la request si hay errores de
validación). Esta es la **única** capa donde se valida el shape de la
petición entrante.

> ❌ **Prohibido usar Zod (ni ninguna otra librería de schema validation) en
> esta capa, ni en ninguna otra del backend.** `express-validator` es la
> única herramienta de validación de transporte autorizada.

**2. `controllers/`** — Implementados como **clases con métodos estáticos**
(nunca se instancian). Cada método maneja una request HTTP ya validada:
orquesta la lógica de negocio, llama a los modelos, y construye la respuesta
(`res.status(x).json(...)`). Los controladores son el único lugar donde vive
la lógica de orquestación del backend.

**3. `models/`** — Esquemas de Mongoose (`Schema`, `model`) junto con sus
interfaces TypeScript asociadas. Las reglas de negocio que pertenecen al
dato en sí (hashing de contraseña antes de guardar, generación de slugs
únicos, índices que garantizan invariantes como "un solo outing activo por
grupo") se implementan como hooks de Mongoose (`pre('save')`, índices únicos,
índices TTL) directamente en el modelo.

Los controladores se comunican **directamente** con los modelos. No hay
ninguna capa de abstracción entre ambos.

### ❌ Antipatrón prohibido: capa de `services/`

Está **estrictamente prohibido** inyectar, crear, o siquiera sugerir una
carpeta `services/`, un patrón repositorio, un DAO, o cualquier capa
intermedia entre `controllers/` y `models/`. La arquitectura de 3 pasos
(`routes` → `controllers` → `models`) es completa y deliberada tal como
está — no le falta una capa, y agregar una no es una "mejora" válida dentro
del alcance de un ticket.

Si un `implementer` o `explorer` identifica lógica duplicada entre varios
controladores, la extracción correcta es hacia `utils/` (funciones puras,
sin estado, sin acceso directo a Mongoose salvo que ya sea el patrón
existente), nunca hacia una nueva capa de servicios.

### Autenticación

La autenticación se basa **exclusivamente** en JWT (`jsonwebtoken`),
transmitido al cliente vía **cookie `httpOnly`** (no en el body de la
respuesta, no en un header custom, no accesible desde JavaScript en el
navegador). El hashing de contraseñas se hace con `bcrypt`. No existe
mecanismo de refresh token, OAuth, ni 2FA más allá de códigos de un solo uso
enviados por email — cualquier extensión de este esquema es una decisión
arquitectónica que debe documentarse aquí antes de implementarse, no
introducirse ad hoc dentro de un ticket funcional.

---

## 3. Arquitectura del frontend (`apps/client`)

### Stack

- **Framework:** React **19.2**, como **SPA pura** construida con **Vite**.
  No hay SSR, no hay App Router ni ningún otro mecanismo de Next.js — el
  enrutamiento es 100% client-side.
- **Lenguaje:** TypeScript en modo **estricto** (`strict: true`).
- **Estilos:** Tailwind CSS **v4**.

### Flujo de datos (capa de red)

El frontend sigue un flujo de responsabilidad igualmente lineal, de arriba
hacia abajo:

```
types/  →  API/  →  hooks/ (o mutaciones locales en views/)
```

**1. `types/`** — Interfaces y contratos de datos declarados a mano,
representando la forma de los datos que el frontend consume y envía. Es el
punto de entrada de cualquier nuevo contrato de datos en el cliente (ver §1:
estos tipos nunca se importan desde el backend).

**2. `API/`** — Funciones puras basadas en `axios`, y **solo** en `axios`:
reciben parámetros tipados, hacen la petición HTTP, y devuelven datos
tipados o lanzan un error estandarizado. No contienen JSX, no disparan
toasts, no navegan, no conocen React Query. La instancia de `axios` está
configurada de forma centralizada con `withCredentials: true`, requisito
indispensable para que la cookie `httpOnly` de sesión viaje en cada
petición.

**3. `hooks/` y `views/`** — El consumo de la capa `API/` se gestiona
**exclusivamente** mediante `@tanstack/react-query` **v5**: `useQuery` para
lecturas, `useMutation` para escrituras. Los hooks reutilizables y
transversales (ej. sesión de usuario) viven en `hooks/`; el consumo local a
una sola vista se hace directamente en el componente de `views/`.

### ❌ Antipatrones prohibidos

- **Prohibido usar manejadores de estado global** (Redux, Zustand, Recoil, o
  equivalentes) **para datos de servidor**. El estado de servidor vive
  exclusivamente en la caché de React Query. Context API solo se admite para
  estado de UI estrictamente local y acotado — nunca como sustituto de React
  Query.
- **Prohibido usar App Router de Next.js**, o cualquier convención propia de
  Next.js (`pages/`, `app/`, server components, `getServerSideProps`, etc.).
  "La Banda" es una SPA pura, enrutada con **React Router v7** (el paquete
  unificado `react-router`, no `react-router-dom`).
- **Prohibido usar `fetch` nativo** para llamadas a la API: toda petición
  HTTP pasa por la instancia centralizada de `axios` descrita en §3.2.
