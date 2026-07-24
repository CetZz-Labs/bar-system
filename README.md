# bar-system

Monorepo pnpm de CetZz Labs — fidelización gamificada para bares.

## Estructura

```
bar-system/
├── apps/
│   ├── client/   # @bar/client — React + Vite
│   └── server/   # @bar/server — Express + MongoDB
├── package.json
├── pnpm-workspace.yaml
└── pnpm-lock.yaml
```

## Requisitos

- Node.js ≥ 18
- [pnpm](https://pnpm.io) 10.28+

## Setup

```bash
pnpm install
```

## Scripts (desde la raíz)

| Comando | Descripción |
|---------|-------------|
| `pnpm dev` | Client + server en paralelo |
| `pnpm dev:web` | Solo frontend |
| `pnpm dev:api` | Solo backend |
| `pnpm build` | Build de todos los packages |
| `pnpm lint` | Lint de todos los packages |
| `pnpm test` | Tests de todos los packages |

## Apps

| Package | Path | Stack |
|---------|------|-------|
| `@bar/client` | `apps/client` | React 19, Vite, TanStack Query, Tailwind |
| `@bar/server` | `apps/server` | Express 5, TypeScript, Mongoose, JWT |

Documentación de agentes por app: `apps/client/AGENTSFRONT.md`, `apps/server/AGENTSBACK.md`.
