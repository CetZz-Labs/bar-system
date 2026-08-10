# AGENTS.md — bar-system (CetZz Labs)

Punto de entrada para agentes que trabajan este monorepo.

## Tickets

Los tickets vienen del **org Knowledge OS** (Mariano → Jira → Obsidian):

- Vault: `../obsidian/projects/12-Jira/Jira/`
- Prefijo típico: `LB-*`
- Skill Dev: `../obsidian/projects/01-Equipo/skills/tomar-ticket-jira/SKILL.md`
- **Estado implementado (actualizar al cerrar features):** `../obsidian/projects/02-Proyectos/bar-system/estado-implementacion.md`
- Graphify: `graphify-out/` (regenerar desde `../graphify/build.ps1 -Repo bar-system`)

## Monorepo

| Package | Path | Stack |
|---------|------|-------|
| `@bar/client` | `apps/client` | React + Vite |
| `@bar/server` | `apps/server` | Express + MongoDB |

```bash
pnpm install
pnpm dev          # ambos
pnpm dev:web      # client
pnpm dev:api      # server
pnpm build
pnpm test
```

## Sandbox

- Tarea UI → trabajar en `apps/client` (no mezclar server sin necesidad)
- Tarea API → `apps/server`
- Docs agentes locales: `apps/client/AGENTSFRONT.md`, `apps/server/AGENTSBACK.md`

## SSOT

Para trabajo de la agencia: **ticket Jira en vault + este AGENTS + Graphify**.  
No inventar paths: orientar con Graphify primero.
