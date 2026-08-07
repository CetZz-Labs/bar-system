# AGENTS.md — Mapa de navegación para agentes de IA ("La Banda")

> Este archivo es el **punto de entrada** para cualquier agente que trabaje en
> este repositorio. NO es una biblia de reglas de código: es un **organigrama
> y mapa de navegación**. Lee solo lo que necesites según el rol que estás
> desempeñando (divulgación progresiva).

---

## 1. Jerarquía: patrón Líder-Trabajador-Revisor

Este arnés usa una **topología estricta de roles que no se mezclan**. Cada
agente tiene un mandato único y no invade el mandato de otro rol, aunque
técnicamente pudiera hacerlo.

### Leader (Orquestador)

- Es el **único** agente que interactúa con **Jira vía servidor MCP**: lee
  tickets, los mueve de estado, y decide qué se trabaja y en qué orden.
- Planifica y delega. **Nunca escribe ni edita código** de `apps/server` ni
  `apps/client`.
- Es el único con autoridad para mover un ticket a **"Done"**, y solo lo hace
  después de que el Reviewer aprobó el trabajo contra `CHECKPOINTS.md`.

### Implementer (Trabajador)

- Es el **único** agente autorizado para modificar archivos dentro de
  `apps/server` o `apps/client`.
- Trabaja sobre un ticket a la vez, delegado por el Leader.
- **Nunca se auto-aprueba.** Terminar de codificar no es sinónimo de que la
  tarea esté lista: eso lo decide el Reviewer.
- Debe seguir `.claude/rules/backend.md` y/o `.claude/rules/frontend.md`
  según la capa que esté tocando.

### Reviewer (Auditor)

- Es el **único** agente autorizado para validar el trabajo del Implementer
  contra `CHECKPOINTS.md`.
- **Nunca edita código.** Su output es un veredicto: aprueba o rechaza.
- Si encuentra incumplimientos, **rechaza la tarea** devolviéndola al
  Implementer con el detalle de qué checkpoint falló — no lo arregla él mismo.

### Explorer (Opcional / Analista)

- Agente de **solo lectura**, sin permisos de escritura.
- Se usa para investigar código legado, entender un flujo existente, o
  responder preguntas de arquitectura, sin riesgo de romper nada mientras
  investiga.
- Cualquier rol (Leader, Implementer, Reviewer) puede apoyarse en un Explorer
  antes de actuar, pero el Explorer nunca actúa por sí mismo sobre el código
  ni sobre Jira.

---

## 2. Regla anti-teléfono-descompuesto

> **Prohibido pasarse bloques de código crudo a través del chat o del
> prompt entre agentes.**

Toda comunicación y transferencia de trabajo entre Implementer, Reviewer y
Leader se hace **exclusivamente escribiendo y leyendo archivos en disco**,
nunca pegando código o diffs directamente en un mensaje o prompt de handoff.

Patrón obligatorio:

1. El Implementer termina su trabajo sobre un ticket (ej. `TECH-01`) y
   **escribe un archivo de reporte en disco**, por ejemplo:
   `progress/implementers/impl_TECH-01.md`, con un resumen de los cambios,
   archivos tocados, y cómo verificarlos.
2. El Implementer **avisa al Reviewer únicamente indicando la ruta del
   archivo** a leer (ej. "revisá `progress/implementers/impl_TECH-01.md`"),
   no describe el código en el mensaje ni lo pega.
3. El Reviewer lee ese archivo y el código real en disco (nunca confía solo
   en el resumen), y escribe su propio veredicto en disco, por ejemplo:
   `progress/reviewers/review_TECH-01.md`.
4. El Leader lee el veredicto del Reviewer desde disco antes de actuar sobre
   Jira. El Leader nunca recibe ni reenvía código en el chat.

Esta regla existe para que el estado del trabajo sea **auditable y
recuperable** en cualquier momento (por cualquier agente o humano), sin
depender de la memoria de una conversación.

---

## 3. Secuencia de vida de un ticket

```
1. Leader lee el ticket en Jira (vía MCP) y decide si está listo para trabajarse.
2. Leader delega al Implementer, indicando el ticket (ej. TECH-01) y la capa
   afectada (apps/server, apps/client, o ambas).
3. Implementer codifica siguiendo .claude/rules/backend.md y/o frontend.md,
   y al terminar escribe progress/implementers/impl_<TICKET>.md con el
   resumen del trabajo.
4. Implementer avisa que el reporte está listo (solo la ruta del archivo,
   nunca el código).
5. Reviewer lee progress/implementers/impl_<TICKET>.md y el código real, y
   lo audita checkbox por checkbox contra CHECKPOINTS.md.
6. Reviewer escribe su veredicto en progress/reviewers/review_<TICKET>.md:
   - Si APRUEBA → Leader transiciona el ticket a "Done" en Jira.
   - Si RECHAZA → el ticket vuelve al Implementer con el detalle de qué
     checkpoint(s) fallaron; se repite desde el paso 3.
```

Ningún ticket llega a **"Done"** en Jira sin pasar por este ciclo completo.
El Leader no cierra tickets por su propio juicio: cierra tickets porque el
Reviewer, en disco, dejó constancia de que `CHECKPOINTS.md` está satisfecho.

---

## 4. Mapa del repositorio

| Archivo / carpeta | Qué contiene | Cuándo leerlo |
|---|---|---|
| `AGENTS.md` | Este archivo: organigrama y mapa de navegación | Siempre, al empezar |
| `progress/history.md` | Bitácora histórica versionada (compartida por el equipo vía git) | Al empezar, para contexto de tickets ya cerrados |
| `progress/current.template.md` | Plantilla versionada de `progress/current.md` | Solo si `progress/current.md` no existe todavía en tu copia local (bootstrap de una sola vez) |
| `progress/current.md` | Memoria de sesión activa — **local por-desarrollador, ignorado por git** (`.gitignore`) | Al empezar y durante toda la sesión |
| `.claude/rules/backend.md` | Reglas arquitectónicas inmutables de `apps/server` | Antes de tocar código del backend |
| `.claude/rules/frontend.md` | Reglas arquitectónicas inmutables de `apps/client` | Antes de tocar código del frontend |
| `CHECKPOINTS.md` | Quality Gates que deben cumplirse antes de cerrar un ticket en Jira | Siempre, para el Reviewer; antes de declarar trabajo terminado |
| `progress/implementers/impl_<TICKET>.md` | Reporte del Implementer sobre un ticket específico | El Reviewer, al auditar ese ticket |
| `progress/reviewers/review_<TICKET>.md` | Veredicto del Reviewer sobre un ticket específico | El Leader, antes de cerrar el ticket en Jira |
| `progress/explorers/exp_<tema>.md` | Hallazgos del Explorer sobre una pregunta técnica acotada | Quien lo invocó, antes de delegar al Implementer |
| `.claude/agents/` | Definiciones de los subagentes (Leader, Implementer, Reviewer, Explorer) | Si estás orquestando o delegando trabajo |
| `apps/server/` | Código del backend (Express + Mongoose) | Solo el Implementer, para implementar |
| `apps/client/` | Código del frontend (React + Vite) | Solo el Implementer, para implementar |

---

## 5. Reglas duras (no negociables)

- **Los roles no se mezclan.** Un Leader no escribe código, un Implementer no
  se auto-aprueba, un Reviewer no edita código, un Explorer no escribe nada.
- **Nada de código crudo en el chat entre agentes.** Todo handoff es un
  archivo en disco (§2).
- **Un ticket, un ciclo completo.** No se cierra ningún ticket en Jira sin un
  veredicto de aprobación del Reviewer basado en `CHECKPOINTS.md`.
- **Las reglas de capa son inmutables.** `.claude/rules/backend.md` y
  `.claude/rules/frontend.md` tienen prioridad sobre cualquier preferencia
  puntual de un agente o de un ticket.
- **Si un rol se bloquea, no improvisa fuera de su mandato.** Documenta el
  bloqueo en su archivo de `progress/` correspondiente y se detiene, en vez
  de invadir el rol de otro agente para "resolverlo rápido".
