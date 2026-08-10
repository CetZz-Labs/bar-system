# CHECKPOINTS — Quality Gates para "La Banda"

> En este proyecto no se evalúa el camino, se evalúa el destino. Estos son los
> checkpoints objetivos que un agente (o un humano revisor) debe superar antes
> de transicionar un ticket de **Jira** (vía servidor MCP) al estado **"Done"**.
>
> Ningún ticket pasa a "Done" con un checkbox sin marcar en este documento.

---

## C1 — Aislamiento del Monorepo (Sin Shared Code)

- [ ] No hay fugas de dependencias: ningún archivo en `apps/client` importa
      código, tipos o utilidades de `apps/server`, ni viceversa. Los contratos
      y DTOs necesarios se han duplicado o adaptado manualmente en la capa
      correspondiente.

---

## C2 — Gobernanza del Backend (Express & Mongoose)

- [ ] **Validación de Transporte:** las nuevas rutas utilizan
      `express-validator` para sanear y validar la entrada. No se ha instalado
      ni importado `zod` en el backend.
- [ ] **Arquitectura de 3 Capas:** el controlador (`Controller`) se comunica
      directamente con los modelos de Mongoose. No se han inventado ni
      inyectado capas de `Services` intermedias.
- [ ] **Manejo de Secretos:** ninguna credencial, token o secret key ha sido
      expuesta o "hardcodeada". Todo se lee desde las variables de entorno
      cargadas nativamente.

---

## C3 — Gobernanza del Frontend (React & Red)

- [ ] **Red y Cookies Seguras:** cualquier nueva petición asíncrona usa la
      instancia central de `axios` configurada con `withCredentials: true`
      (requerido para el JWT de sesión).
- [ ] **Manejo de Estado:** se ha utilizado `@tanstack/react-query` para
      peticiones de servidor. No se ha implementado Redux ni Context API
      innecesario.
- [ ] **Resiliencia de UI:** en caso de mutaciones o peticiones que puedan
      fallar, la interfaz captura el estado de error y emite un feedback claro
      al usuario utilizando toasts de la librería `sonner`.

---

## C4 — Verificación de Ejecución (Comandos)

Antes de mover el ticket de Jira a "Done", el agente o humano revisor **debe**
ejecutar y confirmar que los siguientes comandos terminan sin errores. Un
ticket no se cierra sobre la base de una revisión visual del código: se cierra
sobre la base de una ejecución real y verde.

- [ ] `pnpm --filter @bar/server lint` (equivalente a `tsc --noEmit`) pasa sin
      errores de tipado estricto en el backend.
- [ ] `pnpm --filter @bar/client lint` (`eslint .`) pasa sin errores en el
      frontend.
- [ ] `pnpm --filter @bar/client build` (`tsc -b && vite build`) compila sin
      errores de tipado estricto en el frontend.
- [ ] `pnpm --filter @bar/server test` (`vitest run`) pasa en verde. Si el
      ticket tocó `apps/server/src/utils/` o `apps/server/src/middleware/`,
      además `pnpm --filter @bar/server test:coverage` respeta el umbral del
      80% (ver `docs/verification.md` §1 — ese umbral no cubre `controllers/`,
      `models/` ni `routes/`, así que para cambios ahí se verifica la
      existencia real de tests, no un número de cobertura).
- [ ] `pnpm --filter @bar/client test` (`vitest run`) pasa en verde. El
      frontend no tiene umbral de cobertura configurado (ver
      `docs/verification.md` §2): para código de UI nuevo, se verifica
      manualmente que existe al menos un test junto al archivo tocado.

Si cualquiera de estos comandos falla, el ticket permanece en su estado actual
en Jira y no se reporta como completado.

---

**Cómo usar este archivo:** antes de invocar la transición de estado en Jira
(vía MCP), el agente recorre cada checkbox de C1 a C4, verifica su cumplimiento
contra el código real (no contra la intención declarada en el ticket), y
rechaza la transición a "Done" si queda algún checkbox sin marcar.
