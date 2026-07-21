---

# 🎨 IDENTIDAD VISUAL: La Banda (CYBER-GAMING)

Este estándar define la apariencia de la plataforma "La Banda". El objetivo es una estética High-End Esports/Nightlife. **Toda nueva pantalla debe respetar estrictamente estas reglas.**

## 1. Paleta de Colores

| Token | Valor Hex | Uso |
|---|---|---|
| `--color-bg-base` | `#081726` | Fondo principal (Deep Night) |
| `--color-surface` | `#0f2a44` | Superficies/Cards (Navy) — opacity 0.7 + backdrop-blur: 12px |
| `--color-accent` | `#1fa4a9` | Acento Primario Cian — Interacciones, bordes activos, iconos |
| `--color-amber` | `#e08e2e` | Acento Secundario Amber — Puntos, monedas, status, badges |
| `--color-text-main` | `#f4f7fa` | Texto principal (Off-white) |
| `--color-text-muted` | `#64748b` | Texto secundario/labels (Grey-blue) |

## 2. Reglas de Componentes (Geometría Agresiva)

### Botones Rhombus (Obligatorio)
- Todo botón de acción primaria **debe** usar: `clip-path: polygon(8% 0, 100% 0, 92% 100%, 0% 100%);`
- Efecto: `box-shadow` pulsante en el color de acento (ver variable `--glow-cyan` / `--glow-amber`).
- Componente base: `<CyberButton>` en `/src/components/ui/CyberButton.tsx`.

### Cards Squad (Cortes Diagonales)
- **No usar** `border-radius` estándar. Aplicar `clip-path` con cortes diagonales de **20px** en esquina superior-derecha e inferior-izquierda.
- `clip-path: polygon(0 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 20px 100%, 0 calc(100% - 20px));`
- Borde: `1px solid rgba(31, 164, 169, 0.25)`. Glow: `box-shadow: 0 0 15px rgba(31, 164, 169, 0.08)`.
- Componente base: `<CyberCard>` en `/src/components/ui/CyberCard.tsx`.

### Inputs
- Fondo transparente/muy oscuro. Borde: `1px solid rgba(100, 116, 139, 0.4)`.
- Focus: borde cambia a `--color-accent` con glow `box-shadow: 0 0 0 1px rgba(31,164,169,0.3)`.
- Componente base: `<CyberInput>` en `/src/components/ui/CyberInput.tsx`.

## 3. Tipografía

| Uso | Fuente | Estilo |
|---|---|---|
| Headers / Títulos | `Inter` (font-sans) | `uppercase`, `tracking-wider`, `text-shadow` con color de acento |
| Data / Números / IDs | `JetBrains Mono` (font-mono) | Peso 700, color amber con glow |

## 4. Efectos y Animaciones

- **Glow Buttons:** `animation: pulse-glow 2s ease-in-out infinite` sobre `box-shadow`.
- **Iconos Activos:** `drop-shadow` o `filter` con el color cian.
- **Glassmorphism:** `backdrop-filter: blur(12-20px)` + `background: rgba(15,42,68,0.6-0.75)`.

## 5. Layout

- **Mobile-First:** Diseño optimizado para 375px. Usar `max-w-lg mx-auto` en contenedores.
- **Bottom Nav:** Barra persistente con efecto glassmorphism. Componente: `<BottomNav>` en `/src/components/layout/BottomNav.tsx`.
- **Header Sticky:** Glass header con logo `<AppLogo>` + icono de notificación. Incluido en `<MainLayout>`.
- **Safe Area:** `pb-24` en `<main>` para no quedar tapado por el Bottom Nav.

## 6. Tailwind CSS v4.2.1 — Implementación

Tailwind v4 no usa `tailwind.config.js`. Todos los tokens se definen en `src/index.css` dentro del bloque `@theme {}`. Las utilidades custom (`.clip-rhombus`, `.card-cyber`, `.glass`, `.glow-cyan`, etc.) se declaran como clases CSS estándar en el mismo archivo.

## [AGENTE: FRONTEND PWA] — Reglas de Estilo Adicionales

Las siguientes reglas se suman a las ya definidas en la sección del agente:

6. **Identidad Visual Obligatoria:** Toda nueva vista implementada bajo `MainLayout` o `AuthLayout` debe seguir el sistema de diseño CETZZ NIGHTS sin excepciones. Prohibido usar estilos de componentes genéricos (bordes redondeados, colores planos, fuentes del sistema).
7. **Componentes UI Reutilizables:** Usar siempre `<CyberButton>`, `<CyberCard>`, `<CyberInput>`, `<NeonBadge>`, `<AppLogo>` de `/src/components/ui/` y `/src/components/layout/`. No duplicar estilos inline que ya estén encapsulados en estos componentes.
8. **Glow Effects:** Botones primarios deben tener `box-shadow` pulsante. Iconos activos en `<BottomNav>` deben tener `drop-shadow` cian. Números/puntos deben tener `text-shadow` amber.
9. **Fuente Monospace para Datos:** Cualquier número de puntos, ID, código o dato numérico debe renderizarse con la clase `font-mono` (JetBrains Mono) y color amber con glow.
