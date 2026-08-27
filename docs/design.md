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
>
> **`docs/design.md` es la ÚNICA fuente de verdad de diseño UX/UI del
> proyecto.** No debe volver a existir un archivo `DESIGN_SYSTEM.md` (ni
> ningún otro doc de diseño paralelo): cualquier regla, token, componente o
> copy de interfaz se documenta acá y sólo acá. El `DESIGN_SYSTEM.md`
> histórico fue eliminado del repo por esta razón.

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

---

## 6. Tabla de tokens completa (`@theme` de `index.css`)

> Reflejo 1:1 de `apps/client/src/index.css`. Cualquier token nuevo se agrega
> ahí **y** se documenta acá (ver §2). No se hardcodean valores inline.

### 6.1 Color — marca / superficies / texto / bordes

| Token | Valor | Uso |
|---|---|---|
| `--color-lime` | `#C8FF00` | Acento primario único (CTAs, datos, estado activo) |
| `--color-lime-dim` | `rgba(200,255,0,0.12)` | Fondo sutil del acento (badges success, empty-state icon) |
| `--color-lime-glow` | `rgba(200,255,0,0.25)` | `focus:ring` de inputs |
| `--color-lime-border` | `rgba(200,255,0,0.22)` | Borde del acento / outline de foco |
| `--color-lime-hover` | `rgba(200,255,0,0.15)` | Hover del acento |
| `--color-bg` | `#080808` | Fondo base de la app |
| `--color-surface` | `#111111` | Superficie 1 (modales, nav) |
| `--color-surface-2` | `#181818` | Superficie 2 (cards, inputs) |
| `--color-surface-3` | `#202020` | Superficie 3 (hover de superficie, badge neutral) |
| `--color-border` | `rgba(255,255,255,0.07)` | Borde de superficie |
| `--color-border-hover` | `rgba(255,255,255,0.14)` | Borde en hover |
| `--color-text-primary` | `#FFFFFF` | Texto principal |
| `--color-text-secondary` | `#888888` | Texto secundario |
| `--color-text-muted` | `#444444` | Texto terciario / labels (`.overline`) |
| `--color-overlay` | `rgba(0,0,0,0.6)` | **(LB-89)** Backdrop de modales (`bg-overlay`) — reemplaza `bg-black/60` y los `style` inline |

### 6.2 Color — estados

| Token | Valor | Uso |
|---|---|---|
| `--color-success` | `#C8FF00` | Alias semántico de éxito (= lima) |
| `--color-error` | `#FF4455` | Único color destructivo / error |
| `--color-error-dim` | `rgba(255,68,85,0.15)` | Fondo sutil de error (badge error, `Button` danger) |
| `--color-error-border` | `rgba(255,68,85,0.30)` | Borde de error |
| `--color-warning` | `#FBBF24` | **(LB-89)** Único color de "pendiente / warning". Reemplaza `amber-400/500` sueltos |
| `--color-warning-dim` | `rgba(251,191,36,0.12)` | **(LB-89)** Fondo sutil de warning (badge warning, banners de aviso) |
| `--color-warning-border` | `rgba(251,191,36,0.24)` | **(LB-89)** Borde de warning |

### 6.3 Color — grupo / niveles / bridge shadcn

| Token | Valor | Uso |
|---|---|---|
| `--color-group-accent` / `-dim` / `-border` | lima + `rgba()` | Acento del dominio "grupos" (espejo de lima) |
| `--color-level-bronze` | `#CD7F32` | Nivel de usuario |
| `--color-level-silver` | `#C0C0C0` | Nivel de usuario |
| `--color-level-gold` | `#F5C842` | Nivel de usuario |
| `--color-level-platinum` | `#C8FF00` | Nivel de usuario |
| `--color-level-diamond` | `#67E8F9` | Nivel de usuario |
| `--color-background` … `--color-sidebar-border` | ver `index.css:47-67` | Bridge de nombres shadcn/ui (no hay shadcn instalado; se mantienen por compat) |

### 6.4 Tipografía

| Token | Valor |
|---|---|
| `--font-display` | `'Space Grotesk', sans-serif` (h1–h4, `.display-number`, títulos) |
| `--font-ui` / `--font-sans` | `'Plus Jakarta Sans', sans-serif` (body, controles) |

| Escala de texto | Valor | | Peso | Valor |
|---|---|---|---|---|
| `--text-2xs` | `0.65rem` | | `--font-weight-light` | `300` |
| `--text-xs` | `0.75rem` | | `--font-weight-normal` | `400` |
| `--text-sm` | `0.875rem` | | `--font-weight-medium` | `500` |
| `--text-base` | `1rem` | | `--font-weight-semibold` | `600` |
| `--text-md` | `1.0625rem` **(LB-89)** | | `--font-weight-bold` | `700` |
| `--text-lg` | `1.2rem` | | `--font-weight-black` | `800` |
| `--text-xl` | `1.6rem` | | | |
| `--text-2xl` | `2.4rem` | | | |
| `--text-3xl` | `3.6rem` | | | |

> **`--text-md` (LB-89):** se agregó para dar efecto real a la clase `text-md`
> que `Button` (size `lg`) ya usaba y que no existía en `@theme` (era un
> no-op). Rellena el hueco entre `--text-base` (16px) y `--text-lg` (19.2px).

| Tracking | Valor | | Leading | Valor |
|---|---|---|---|---|
| `--tracking-tight` | `-0.04em` | | `--leading-none` | `1` |
| `--tracking-snug` | `-0.02em` | | `--leading-tight` | `1.1` |
| `--tracking-normal` | `0em` | | `--leading-snug` | `1.3` |
| `--tracking-wide` | `0.03em` | | `--leading-normal` | `1.5` |
| `--tracking-wider` | `0.12em` | | | |
| `--tracking-widest` | `0.2em` | | | |

### 6.5 Spacing (escala 4 / 8 / 16 / 24 / 32 …)

| Token | Valor | | Token | Valor |
|---|---|---|---|---|
| `--spacing-1` | `4px` | | `--spacing-6` | `24px` |
| `--spacing-2` | `8px` | | `--spacing-8` | `32px` |
| `--spacing-3` | `12px` | | `--spacing-10` | `40px` |
| `--spacing-4` | `16px` | | `--spacing-12` | `48px` |
| `--spacing-5` | `20px` | | | |

Layout: `--width-app` `430px` · `--height-nav` `64px` · `--spacing-page-x` `16px`.

### 6.6 Radius

| Token | Valor | Uso |
|---|---|---|
| `--radius-sm` | `8px` | outline de foco |
| `--radius-md` | `12px` | inputs, `Button`, `Select`, `Textarea`, toasts |
| `--radius-lg` | `16px` | (heredado — no usar en cards nuevas) |
| `--radius-xl` | `20px` | **Radius único de cards y modales** (ver §7 `Card` / `Modal`) |
| `--radius-2xl` | `24px` | reservado |
| `--radius-full` | `9999px` | avatares, `IconButton`, `Badge` |
| `--radius` | `0.75rem` | bridge shadcn |

> **Decisión LB-89 (radius de cards):** se unifica en **`rounded-xl` (20px)**
> para todos los dominios. Antes `bar/` usaba `rounded-lg` y `groups/`
> `rounded-xl`. El primitivo `Card` aplica `rounded-xl`; la clase CSS `.card`
> (misma medida) queda **deprecada** en favor de `<Card>`.

### 6.7 Sombras / duraciones / easing

| Token | Valor | Uso |
|---|---|---|
| `--shadow-lime` | `0 0 24px rgba(200,255,0,0.18)` | glow sutil de foco/estado activo puntual |
| `--shadow-lime-sm` | `0 0 12px rgba(200,255,0,0.12)` | glow sutil chico |
| `--shadow-card` | `0 2px 12px rgba(0,0,0,0.50)` | elevación neutra de card |
| `--shadow-modal` | `0 8px 40px rgba(0,0,0,0.80)` | elevación de modal |
| `--duration-fast` | `120ms` | micro-interacciones (hover, tap) — valor de referencia |
| `--duration-normal` | `220ms` | transición de layout puntual (apertura de modal) |
| `--duration-slow` | `380ms` | transición de layout deliberada |
| `--ease-default` | `cubic-bezier(0.4,0,0.2,1)` | easing general |
| `--ease-spring` | `cubic-bezier(0.34,1.56,0.64,1)` | rebote sutil |
| `--ease-out` | `cubic-bezier(0,0,0.2,1)` | salida |

---

## 7. Referencia de componentes (`apps/client/src/components/ui/`)

> Todo primitivo compone clases con el helper **`cn()`** (`@/utils/cn`,
> `clsx` + `tailwind-merge`) — no template literals. Las variantes se
> resuelven con **mapas/switch** (nunca `class-variance-authority`).

### `Button`

| Prop | Tipo | Default |
|---|---|---|
| `variant` | `primary \| surface \| ghost \| outline \| danger \| google \| apple` | `primary` |
| `size` | `sm \| md \| lg` | `md` |
| `fullWidth` | `boolean` | `false` |
| …resto | `ButtonHTMLAttributes` | — |

```tsx
<Button variant="primary" size="lg" fullWidth onClick={submit}>Guardar</Button>
```

### `IconButton` (LB-89)

Botón circular solo-icono. Unifica las 3 variantes del botón "volver".

| Prop | Tipo | Default |
|---|---|---|
| `variant` | `surface \| ghost \| outline` | `surface` |
| `size` | `sm` (36px) `\| md` (40px) | `md` |
| `aria-label` | `string` | **obligatorio** (tipos) |
| …resto | `ButtonHTMLAttributes` | `type="button"` |

```tsx
<IconButton aria-label="Volver" onClick={() => navigate(-1)}>
  <ArrowLeft size={20} />
</IconButton>
```

### `Input`

| Prop | Tipo |
|---|---|
| `label` | `string` |
| `error` | `string` (inline, `text-error`) |
| `icon` / `rightIcon` | `ReactNode` |
| …resto | `InputHTMLAttributes` |

```tsx
<Input label="Email" type="email" error={errors.email?.message} {...register("email")} />
```

### `Select` (LB-89)

`<select>` nativo tematizado + `<label htmlFor>` automático (`useId`).

| Prop | Tipo |
|---|---|
| `label` | `string` |
| `error` | `string` |
| `wrapperClassName` | `string` |
| …resto | `SelectHTMLAttributes` (las `<option>` van como `children`) |

```tsx
<Select label="Período" value={period} onChange={(e) => setPeriod(e.target.value)}>
  <option value="week">Semana</option>
  <option value="month">Mes</option>
</Select>
```

### `Textarea` (LB-89)

`<textarea>` tematizado (`resize-none`) + label automático. `rows` default `3`.

```tsx
<Textarea label="Motivo del rechazo" rows={4} {...register("reason")} />
```

### `SegmentedControl`

| Prop | Tipo |
|---|---|
| `options` | `{ label: string; value: string }[]` |
| `value` | `string` |
| `onChange` | `(value: string) => void` |
| `name` | `string` (aria) |
| `label` / `error` | `string` |
| `disabled` | `boolean` |

### `Card` (LB-89)

Contenedor base. Radius unificado `rounded-xl`, `bg-surface-2`, `border-border`.

| Prop | Tipo | Default |
|---|---|---|
| `padding` | `none \| md` (16px) `\| lg` (20px) | `md` |
| `interactive` | `boolean` (hover de borde) | `false` |
| …resto | `HTMLAttributes<HTMLDivElement>` | — |

```tsx
<Card interactive onClick={open}>
  <h3>…</h3>
</Card>
```

### `Badge` + `statusBadgeVariant` (LB-89)

Chip de estado. Reemplaza los 3 mapas de color duplicados
(`STATUS_BADGE_CLASSES`, `config`, badge inline de categorías).

| Prop | Tipo | Default |
|---|---|---|
| `variant` | `success \| warning \| error \| neutral` | `neutral` |
| `icon` | `ReactNode` | — |
| …resto | `HTMLAttributes<HTMLSpanElement>` | — |

`statusBadgeVariant(status: string)` (`@/components/ui/badgeStatus`) mapea un
string de estado del backend/UI a una variante:

| Variante | Claves reconocidas (case-insensitive) |
|---|---|
| `success` | `active`, `activo`, `activa`, `en_curso`, `approved`, `aprobado` |
| `warning` | `pending`, `pendiente`, `reservada`, `reserved` |
| `error` | `rejected`, `rechazado`, `disputa`, `dispute`, `disputed`, `cancelled`, `cancelada` |
| `neutral` | `finalizada`, `finalizado`, `finished`, `inactive`, `inactiva`, `inactivo`, `closed`, `cerrada`, + fallback |

```tsx
<Badge variant={statusBadgeVariant(row.status)}>{ACTIVITY_STATUS_LABELS[row.status]}</Badge>
```

### `Spinner` (LB-89)

Indicador de carga único. Reemplaza `Loader2` suelto, el spinner CSS
hand-rolled y el `<div>Loading...</div>`.

| Prop | Tipo | Default |
|---|---|---|
| `size` | `sm` (16) `\| md` (24) `\| lg` (32) | `md` |
| `center` | `boolean` (envuelve en flex centrado) | `false` |
| `label` | `string` → `aria-label` (`role="status"`) | `"Cargando"` |
| `className` | `string` (se mergea sobre el icono) | — |

```tsx
{isLoading && <Spinner center size="lg" label="Cargando bares" />}
```

### `EmptyState` (LB-89)

Icono lima en círculo + título + subtítulo + slot CTA.

| Prop | Tipo |
|---|---|
| `icon` | `LucideIcon` (el componente) |
| `title` | `string` |
| `description` | `string` (opcional) |
| `action` | `ReactNode` (opcional, típicamente `<Button>`) |

```tsx
<EmptyState
  icon={Store}
  title="Todavía no registraste ningún bar."
  description="Sumá tu local al programa de fidelización."
  action={<Button onClick={goRegister}>Registrar mi bar</Button>}
/>
```

### `ErrorState` (LB-89)

Mensaje de error + acción de reintento. **Sin animación de entrada** (§3):
render instantáneo, `role="alert"`.

| Prop | Tipo | Default |
|---|---|---|
| `title` | `string` | `"No pudimos cargar la información."` |
| `description` | `string` | — |
| `onRetry` | `() => void` | — (muestra "Reintentar" si se pasa) |
| `retryLabel` | `string` | `"Reintentar"` |
| `onBack` | `() => void` | — (muestra "Volver" si se pasa) |
| `backLabel` | `string` | `"Volver"` |

```tsx
<ErrorState title="No pudimos cargar los grupos." onRetry={() => refetch()} />
```

### `Modal`

Confirm-dialog **y** contenedor de contenido/formulario. Backdrop
`bg-overlay`, panel `rounded-xl` `shadow-modal`.

| Prop | Tipo | Default |
|---|---|---|
| `isOpen` / `onClose` | `boolean` / `() => void` | — |
| `title` | `string` | — |
| `description` | `string` | — |
| `children` | `ReactNode` (cuerpo: form, lista…) | — |
| `size` | `sm \| md \| lg` | `sm` |
| `isPending` | `boolean` | `false` |
| `onConfirm` | `() => void` | — (si se pasa → footer Cancelar / Confirmar) |
| `confirmText` / `cancelText` | `string` | `"Confirmar"` / `"Cancelar"` |
| `confirmVariant` | `ButtonProps["variant"]` | `danger` |
| `footer` | `ReactNode` (footer custom; anula el default) | — |
| `hideFooter` | `boolean` (el children provee sus acciones) | `false` |

```tsx
{/* confirm-dialog (retrocompatible) */}
<Modal isOpen={open} onClose={close} onConfirm={remove} title="¿Eliminar?" isPending={pending} />

{/* formulario */}
<Modal isOpen={open} onClose={close} title="Nueva categoría" size="md" hideFooter>
  <form onSubmit={…}>… <Button type="submit" fullWidth>Crear</Button></form>
</Modal>
```

### `Avatar`

`src?`, `alt` (req), `size` (`sm` 32 / `md` 48 / `lg` 96), `fallback?`,
`className?`. Iniciales automáticas, `resolveImageUrl`, fallback en `onError`.

### `FileUpload`

`onFileSelect`, `previewUrl`, `error?`, `label?`, `disabled?`. Drag & drop,
límite 2MB, aviso si la imagen no es cuadrada.

### `Toaster` (sonner) — tematizado (LB-89)

Montado **una sola vez** en `router.tsx`. Config:
`theme="dark"`, `position="top-center"`, y `toastOptions.style` con tokens
(`--color-surface-2`, `--color-border`, `--color-text-primary`, `--font-ui`,
`--radius-md`). No se usa `richColors` (introduce verdes/rojos ajenos a la
paleta). No se instancia otro `<Toaster>` en ninguna vista.

---

## 8. Catálogo de copy — estados vacíos y de error

> Copy unificado (LB-89). Reemplaza las variantes sueltas ("Aún no…",
> "Sin… todavía", "Error al cargar X"). Español rioplatense, sin signos de
> exclamación.

### 8.1 Estado vacío — fórmula `"Todavía no …"`

- Título: empieza siempre con **"Todavía no"** + verbo en presente.
  - `"Todavía no hay grupos."` / `"Todavía no pertenecés a ningún grupo."`
  - `"Todavía no registraste ningún bar."`
  - `"Todavía no hay bares activos para mostrar."`
  - `"Todavía no hay movimientos."` (unifica "Sin movimientos todavía." / "Sin movimientos aún")
  - `"Todavía no hay recompensas cargadas."`
  - `"Todavía no hay categorías."` (unifica "Sin categorías aún")
- Subtítulo (opcional): una acción concreta — `"Creá uno o pedí una invitación para unirte."`, `"Sumá tu local al programa de fidelización."`
- Para resultados de búsqueda/filtro sin match se usa **"No encontramos …"**:
  `"No encontramos bares para «{query}»."`, `"No hay registros para los filtros seleccionados."`

### 8.2 Estado de error de carga — fórmula `"No pudimos cargar …"`

- Título: **"No pudimos cargar "** + sustantivo. Reemplaza todos los
  `"Error al cargar X"`:
  - `"No pudimos cargar los grupos."`
  - `"No pudimos cargar el perfil."`
  - `"No pudimos cargar el dashboard del bar."`
  - `"No pudimos cargar la auditoría."`
  - `"No pudimos cargar las recompensas."`
  - `"No pudimos cargar la información del bar."`
- Subtítulo (opcional): `"Revisá tu conexión e intentá de nuevo."`
- Acción primaria: botón **"Reintentar"** (`onRetry`). Acción secundaria
  opcional: **"Volver"** (`onBack`).
- Fallback genérico (sin contexto): `"No pudimos completar la operación."`

### 8.3 Error de permiso de cámara — wording único

Reemplaza los 3 textos divergentes de `CashierRedemptionsView` /
`CashierSearchView` / `ConfirmConsumptionView`:

> **"No pudimos acceder a la cámara. Ingresá el código manualmente como
> alternativa."**
