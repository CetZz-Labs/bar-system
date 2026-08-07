# Design System — "La Banda"

> Este documento es la guía **inmutable** del Design System y las reglas de
> interfaz visual del monorepo. El subagente `reviewer` audita todo
> componente de React o vista maquetada contra esta especificación.
>
> **Nota de procedencia:** el proyecto tuvo, en algún momento, un documento
> de diseño previo (`DESIGN_SYSTEM.md`) que describía una identidad
> "CYBER-GAMING" (glow neón, `clip-path` rombos, componentes `<CyberButton>`,
> `<CyberCard>`). Ese documento **nunca llegó a implementarse en el código**
> — el sistema real, verificado en `apps/client/src/index.css` y en
> `apps/client/src/components/ui/`, es otro: una paleta oscura lima/negro,
> minimalista, sin glow agresivo ni geometría de clip-path. **Este archivo
> reemplaza y deroga** ese documento previo como fuente de verdad. El
> `reviewer` audita contra lo que sigue, no contra el `CYBER-GAMING` original.

---

## 1. Filosofía de diseño y enfoque

**Producto:** "La Banda" — app de fidelización y nightlife para bares.

- **Mobile-first estricto, adaptable a escritorio.** El layout raíz
  (`#root`) tiene `max-width: var(--width-app)` = **430px**, centrado con
  `margin: 0 auto` — el diseño se piensa primero para el ancho de un
  teléfono, y cualquier adaptación a pantallas más grandes es secundaria a
  esa experiencia. La prioridad de usabilidad es siempre el dispositivo
  móvil.
- **Principio de sobriedad.** El fondo base es prácticamente negro
  (`--color-bg: #080808`), con superficies apenas más claras
  (`--color-surface: #111111`, `--color-surface-2: #181818`) y un único
  acento de color (lima, `#C8FF00`) usado con intención, no decorativamente.
  Esto no es solo estética: la app se usa en **ambientes nocturnos y bares
  con poca luz**, donde una interfaz de alto contraste y bajo ruido visual es
  un requisito de legibilidad real, no una preferencia de diseño.
- **Jerarquía clara y alta velocidad de escaneo.** Los datos numéricos y
  destacados usan la clase `.display-number` (tipografía `Space Grotesk`,
  bold, color lima); las etiquetas secundarias usan `.overline` (mayúsculas,
  `tracking-widest`, color muted). Esta separación tipográfica es la
  herramienta principal de jerarquía — no se recurre a decoración adicional
  para diferenciar niveles de información.

---

## 2. Configuración y tokens de Tailwind CSS v4

### Regla de Tailwind v4

Todos los tokens de color, tipografía, espaciado y utilidades de tema se
configuran **nativamente en la directiva `@theme {}`**, dentro de
`apps/client/src/index.css`. **Queda prohibido crear o buscar un archivo
`tailwind.config.js`** — Tailwind v4 no lo usa, y este proyecto no lo tiene
ni debe volver a tenerlo.

### Paleta inmutable

Los tokens vigentes, definidos en `@theme` de `index.css`, son la única
paleta autorizada:

| Token | Valor | Uso |
|---|---|---|
| `--color-bg` | `#080808` | Fondo base de la aplicación |
| `--color-surface` / `-2` / `-3` | `#111111` / `#181818` / `#202020` | Superficies apiladas (cards, inputs, modales) |
| `--color-lime` | `#C8FF00` | Acento primario único — CTAs, datos destacados, estados activos |
| `--color-lime-dim` / `-glow` / `-border` / `-hover` | variantes en `rgba()` sobre lima | Fondos sutiles, bordes y hover del acento, sin introducir un segundo color de marca |
| `--color-text-primary` | `#FFFFFF` | Texto principal |
| `--color-text-secondary` | `#888888` | Texto secundario |
| `--color-text-muted` | `#444444` | Texto terciario / labels |
| `--color-error` | `#FF4455` | Único color de error/destructivo |
| `--color-border` / `-hover` | `rgba(255,255,255,0.07)` / `0.14` | Bordes de superficie |

- **Prohibido introducir colores arbitrarios** en utilidades arbitrarias de
  Tailwind (ej. `bg-[#123456]`, `text-[#ff00ff]`). Todo color usado en un
  componente nuevo se resuelve contra un token existente de esta tabla. Si
  hiciera falta un token nuevo, se agrega a `@theme` en `index.css` y se
  documenta acá — nunca se hardcodea inline.
- No se introduce un segundo color de acento "de marca": el sistema usa
  **un solo acento** (lima). Los tokens de nivel de usuario
  (`--color-level-bronze/silver/gold/platinum/diamond`) son la única
  excepción explícita, reservados para el sistema de niveles/badges.

### Sombras y degradados

- Los únicos tokens de sombra autorizados son `--shadow-lime` /
  `--shadow-lime-sm` (glow **sutil**, `0 0 24px` / `0 0 12px` con opacidad
  ≤0.18, usado con moderación en elementos de foco o estado activo puntual)
  y `--shadow-card` / `--shadow-modal` (sombras neutras de elevación, sin
  color).
- **Prohibido el uso de sombras pesadas o degradados de color (gradients)
  estridentes** que recarguen el renderizado. No hay tokens de `gradient` en
  `@theme` y no se agregan: la superficie de la app se construye con color
  plano + los tokens de sombra existentes, nunca con `background: linear-
  gradient(...)` decorativo.

---

## 3. Componentes y librerías de UI autorizadas

### Iconografía

Se usa **exclusivamente `lucide-react`**. Prohibido instalar o importar
íconos de `react-icons`, `@heroicons/react`, `@radix-ui/react-icons`, o
cualquier librería equivalente.

### Componentes base

Toda vista se construye a partir de los primitivos ya existentes en
`apps/client/src/components/ui/` (`Button`, `Input`, `Modal`, `Avatar`,
`FileUpload`, `SegmentedControl`). No se duplican estilos inline que ya
estén encapsulados en estos componentes; si falta un primitivo, se extiende
o se crea uno nuevo en `components/ui/`, siguiendo los mismos tokens de esta
guía — no se resuelve con estilos sueltos dentro de una vista.

### Formularios

Maquetados con **`react-hook-form`**, mostrando los mensajes de validación
**inline, debajo de cada campo afectado**. El error de un campo se ve en el
campo — no en un toast, no en un banner genérico arriba del formulario (ver
§4).

### Animaciones y motion

- Permitidas **únicamente micro-interacciones rápidas**, con una duración
  máxima de **100–150ms**. El token `--duration-fast: 120ms` (definido en
  `@theme`) es el valor de referencia para toda animación con `motion`
  (Framer Motion) — hover, tap, cambios de estado puntuales.
- **Prohibidas las animaciones pesadas de entrada/salida** que retrasen la
  interacción del usuario (transiciones de página largas, stagger de listas
  extensas, efectos de "reveal" decorativos). Los tokens `--duration-normal`
  (220ms) y `--duration-slow` (380ms) existen para transiciones de layout
  puntuales y deliberadas (ej. apertura de un modal), **no** para
  micro-interacciones — esas se limitan siempre a `--duration-fast`.
- **Las alertas de error no llevan animación de entrada**: aparecen de forma
  instantánea. Esto incluye tanto los mensajes inline de formularios como
  cualquier estado de error visible en una vista.

---

## 4. Notificaciones y toasts (Sonner)

- **`sonner`** es la única librería autorizada para toasts de confirmación o
  error de red.
- El contenedor `<Toaster />` vive **una única vez**, montado en la raíz del
  árbol de rutas (hoy, en `apps/client/src/router.tsx`, por encima de
  `AuthLayout`/`MainLayout`) — no se instancia un `<Toaster />` adicional
  dentro de una vista o layout individual.
- **Prohibido duplicar errores.** Si un formulario tiene errores de
  validación por campo, se muestran **inline en el input** (ver §3); no se
  dispara un toast de `sonner` por cada campo inválido. `sonner` se reserva
  para resultados de una operación completa (éxito/error de una mutación,
  error de red), no para validación de campo a campo.

---

## 5. Accesibilidad y buenas prácticas (A11y)

- Todo botón interactivo compuesto **solo por un ícono** (sin texto visible)
  debe llevar obligatoriamente un atributo `aria-label` descriptivo del
  resultado de la acción (ej. `aria-label="Cerrar modal"`, no
  `aria-label="Botón"`).
- Todo elemento `<input>` debe tener su `<label>` asociado explícitamente
  vía `htmlFor` / `id` — nunca un placeholder como único sustituto de label.
