# Convenciones — "La Banda"

> Este documento establece las reglas **inmutables** de estilo, nomenclatura
> y manejo de errores del monorepo. No es una guía de preferencias: es la
> especificación contra la cual el subagente `reviewer` audita todo código
> nuevo. Código que no cumpla estas convenciones se **rechaza**, sin
> excepción por "es solo un detalle de estilo".
>
> Ver también: `docs/architecture.md` (capas y aislamiento),
> `.claude/rules/backend.md` y `.claude/rules/frontend.md` (aplicación
> operativa de estas reglas por capa).

---

## 1. Política de idioma y deuda técnica (regla de oro)

### Contexto

El proyecto heredó una mezcla de rutas y variables en español e inglés — por
ejemplo, endpoints como `/registro`, `/mis-bares`, `/activos`, `/perfil`
conviven en la API actual junto con nombres en inglés. Esto es **deuda
técnica heredada**, no un patrón válido a replicar.

### Regla inmutable

Todo **código nuevo** — nombres de archivos, variables, funciones, rutas de
API, modelos, tipos, mensajes de log internos — debe escribirse
**estrictamente en inglés**.

- Las correcciones de la deuda técnica existente en español se hacen de
  forma **progresiva**, únicamente cuando un ticket ya toca ese archivo o
  ruta por otro motivo. No se abren tickets solo para traducir código legado.
- Está **prohibido introducir código nuevo en español**, bajo cualquier
  circunstancia, **excepto** los textos literales de la interfaz visibles
  para el usuario final (copys, labels, mensajes de UI en español, ya que
  "La Banda" es un producto de cara al usuario en Argentina/LatAm).

> **Ejemplo de aplicación:** si un ticket agrega un endpoint nuevo dentro de
> `barRoute.ts` (que hoy mezcla `/registro`, `/activos`, etc.), el endpoint
> **nuevo** se escribe en inglés (ej. `/status`, no `/estado`), aunque
> conviva en el mismo archivo con rutas legadas en español que no se tocan.

---

## 2. Nomenclatura (naming conventions)

| Elemento | Convención | Ejemplo |
|---|---|---|
| Archivos y directorios | `kebab-case` estricto | `group-controller.ts`, `auth-layout.tsx` |
| Clases, interfaces y tipos | `PascalCase` | `UserController`, `GroupResponseDto` |
| Funciones, métodos y variables | `camelCase` | `getBarById`, `isPending` |
| Constantes globales | `UPPER_SNAKE_CASE` | `JWT_EXPIRES_IN` |

Estas reglas aplican a **todo archivo nuevo** creado en `apps/server` o
`apps/client`, sin excepción.

> **Nota sobre archivos legados:** el código actual del backend nombra sus
> controladores en `PascalCase.ts` (ej. `AuthController.ts`,
> `GroupController.ts`) en lugar de `kebab-case`. Esos archivos existentes
> **no se renombran retroactivamente** solo para cumplir esta convención —
> renombrar un archivo activo es un cambio de alto riesgo (rompe imports en
> todo el árbol) que requiere su propio ticket explícito, no un efecto
> colateral de una tarea no relacionada. Todo archivo **nuevo**, sin
> embargo, sigue `kebab-case` desde el día uno.

---

## 3. Tipado estricto (TypeScript)

- **Prohibido el uso de `any`**, en cualquiera de sus formas (`any` explícito,
  parámetros sin anotar que Typescript infiere como `any` implícito, `as any`
  para forzar un cast). Toda variable, parámetro de función, y respuesta de
  API debe tener un tipo o interfaz definida explícitamente.
- Tampoco se admite el casteo forzado (`as MiTipo`) como sustituto de una
  validación o tipado real — un cast oculta errores que el compilador
  debería estar atrapando.
- En el frontend, si se necesita representar un tipo de un payload que viene
  del backend, ese tipo se declara **manualmente** en
  `apps/client/src/types/`, respetando el aislamiento del monorepo descrito
  en `docs/architecture.md` §1 — nunca se importa ni se infiere desde
  `apps/server/`.

---

## 4. Manejo de errores (error handling)

### Backend (Express 5)

- **Prohibido exponer errores crudos de MongoDB/Mongoose al cliente.** Un
  `ValidationError`, un `CastError`, o el mensaje interno de una excepción de
  Mongoose nunca llega tal cual en la respuesta HTTP — se traduce a un
  mensaje controlado y seguro para el consumidor de la API.
- Se debe aprovechar la **resolución nativa de promesas de Express 5**
  (los rejects de handlers `async` se propagan sin necesidad de wrappers
  manuales) y delegar el manejo final del error a un **middleware de error
  centralizado**.
- Ese middleware centralizado devuelve **siempre** un JSON estructurado y
  consistente, por ejemplo:

  ```json
  { "success": false, "message": "Error description" }
  ```

  Ningún endpoint devuelve un formato de error distinto ad hoc.

### Frontend (React)

- Toda `useQuery` y `useMutation` de `@tanstack/react-query` debe capturar
  su estado `isError` y mostrar **siempre** un mensaje amigable al usuario
  usando la librería de notificaciones **`sonner`** (toasts).
- **Prohibido usar `alert()` nativo**, o cualquier otro mecanismo de feedback
  de error que no pase por `sonner` (ej. `console.error` como única señal
  visible, mensajes de error silenciosos, o modales custom no estandarizados
  para este propósito).
- El mensaje mostrado al usuario debe ser legible y accionable, no el error
  crudo devuelto por `axios` o por el backend — la capa `API/` es la
  responsable de traducir el error de red a un formato consumible antes de
  que llegue a la UI (ver `.claude/rules/frontend.md` §3 sobre la
  arquitectura de capas).
