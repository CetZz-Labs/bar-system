# Frontend Rules — `apps/client` ("La Banda")

> **Alcance:** este documento es la fuente de verdad inmutable para cualquier trabajo de IA sobre `apps/client`. Refleja la arquitectura **real** del código, no la aspiracional. Ante cualquier duda o conflicto con otra documentación (READMEs, comentarios, specs antiguas), **estas reglas tienen prioridad**.

---

## 1. Stack tecnológico y restricciones (SPA pura)

- **Framework:** React **19.2**, SPA pura construida con **Vite**. No es Next.js, no hay SSR, no hay routing basado en filesystem.
- **Lenguaje:** TypeScript **5.9** en modo **strict**. No se relaja `strict` ni se introduce `any` para evitar errores de tipado.
- **Enrutamiento:** `react-router` **v7** (paquete unificado). No se usa `react-router-dom` (paquete legacy, no instalado).
- **Estilos:** Tailwind CSS **v4**, usando la utilidad `cn()` (composición de `clsx` + `tailwind-merge`) para combinar clases condicionales. No se introduce CSS-in-JS ni preprocesadores adicionales.

### Estado global y fetching

- Se usa **exclusivamente** `@tanstack/react-query` **v5** para estado de servidor (fetching, caching, mutaciones) y el hook personalizado **`useAuth()`** como fuente de verdad de la sesión/autenticación.

> **Prohibido:** Redux, Zustand, o Context API para estado global. Context API solo se permite para estado de UI puro y estrictamente local (ej. un tema visual acotado a un subárbol de componentes), nunca como sustituto de React Query o `useAuth()`.

---

## 2. Librerías autorizadas y componentes

| Responsabilidad | Librería | Regla |
|---|---|---|
| Formularios | `react-hook-form` | Uso **obligatorio** en todo formulario |
| Validación de formularios | `zod` v4 | **Obligatorio** como resolver de `react-hook-form` (`@hookform/resolvers/zod` o equivalente), aunque hoy no esté conectado a la capa `API/` |
| Peticiones HTTP | `axios` | Única librería HTTP permitida; instancia **siempre** configurada con `withCredentials: true` para enviar la cookie JWT `httpOnly` |
| Iconos | `lucide-react` | — |
| Animaciones | `motion` | — |
| Notificaciones (toasts) | `sonner` | **Obligatorio** para reflejar los estados `isError` / `isSuccess` de las mutaciones y queries de React Query |

> **Prohibido:** usar `fetch` nativo para llamadas a la API. Toda petición HTTP pasa por la instancia de `axios` configurada centralmente.

---

## 3. Arquitectura de capas y aislamiento

### Flujo de capas

```
types/    → interfaces y DTOs (a mano, sin generación automática)
API/       → funciones Axios puras, sin lógica de UI ni de estado
hooks/      → hooks reutilizables sobre React Query (estado de servidor)
views/       → páginas; mutaciones locales con useMutation cuando no ameritan un hook reutilizable
```

- `API/` contiene únicamente funciones que llaman a `axios` y devuelven datos. No contiene JSX, no dispara toasts, no navega ni conoce React Query.
- La lógica de fetching/mutación vive en `hooks/` (casos transversales, ej. `useAuth()`) o directamente en `views/` vía `useMutation`/`useQuery` (casos locales a una vista).

### Aislamiento estricto respecto al backend

> **Prohibido de forma absoluta:** importar cualquier archivo, tipo o DTO desde `apps/server/`.

- No existe (ni debe crearse) una carpeta `packages/` compartida entre `apps/client` y `apps/server`.
- Todo tipo que el frontend necesite debe declararse **explícitamente a mano** en `apps/client/src/types/`, aunque eso implique duplicar una forma de dato que también existe como modelo Mongoose en el backend. La sincronización entre ambos lados es manual y documental, no de código.

---

## 4. Rutas y dominios

### Organización visual por dominio

`views/` se organiza por dominio de producto:

- `auth/`
- `bar/`
- `groups/`
- `user/`

Toda vista nueva se ubica dentro del dominio que le corresponde; no se crean vistas sueltas fuera de esta estructura salvo páginas raíz genéricas (ej. `Home`).

### Layouts principales

| Layout | Comportamiento |
|---|---|
| `AuthLayout` | Protegido contra sesiones activas: si el usuario ya está autenticado, redirige fuera de las vistas de auth (login, registro, etc.) |
| `MainLayout` | Requiere sesión: redirige a `/login` si no hay sesión activa; redirige a `/onboarding` si la sesión existe pero el perfil está incompleto |

No se agregan guards de ruta alternativos ni lógica de protección duplicada fuera de estos dos layouts.
