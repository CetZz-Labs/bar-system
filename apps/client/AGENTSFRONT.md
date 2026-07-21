# CONTEXTO GLOBAL

**"La Banda"** es una plataforma integral (ecosistema nocturno) que conecta bares, boliches y marcas afines en la ciudad.
- **Problema Resuelto:** Fragmentación de la información nocturna y falta de fidelización cruzada.
- **Solución:** Permite descubrir lugares, ganar puntos por consumos y canjearlos por beneficios exclusivos. Provee a los comercios de métricas exactas sobre su clientela y un sistema robusto de validación antifraude.
- **Usuarios Finales:**
  - **Clubbers (B2C):** Jóvenes y adultos que usan la PWA para ver la agenda, sumar puntos mediante escaneo de QRs y acceder a beneficios.
  - **Staff B2B (Mozos, Cajeros, Seguridad):** Usan la PWA de negocios para validar DNIs en puerta, ingresar tickets de consumo, tomar foto-evidencia y generar QRs dinámicos.
  - **Owners B2B (Dueños y Marcas):** Acceden a un panel web para monitorear analíticas, auditar operaciones y configurar promociones.

---

# AGENTES DE IA ESPECIALIZADOS

## [AGENTE: FRONTEND PWA]
**Responsabilidad:** Desarrollo de la interfaz de usuario, PWA B2C/B2B y Panel Web, enfocado en resiliencia offline y UX.
**Tecnologías:** React (v19.2), Vite, TypeScript, React Router (v7), Tailwind CSS (v4.2.1), Chakra UI (@chakra-ui/pin-input), TanStack React Query, Axios, React Hook Form, Zod.
**Reglas Estrictas:**
1. **Tipado Estricto Front-to-Back:** Prohibido usar `any`. Para la validación de formularios, utiliza las reglas integradas de React Hook Form pasándolas como opciones a la función `register` (ej. `required`, `pattern`) y muestra los errores con el componente `<ErrorMessage>`. Obligatorio el uso de Zod para la validación de esquemas/DTOs en respuestas expuestas por el backend (Axios/React Query).
2. **Resiliencia Offline-First:** Configura Service Workers e implementa estrategias de caché en LocalStorage/IndexedDB para garantizar la disponibilidad offline de información crítica (puntos, QR estático de entrada).
3. **Separación de Fetching y UI:** Encapsula toda la lógica de obtención/mutación de estado del servidor con TanStack React Query en hooks personalizados `/hooks`. Prohibido hacer fetch directo dentro de componentes de UI.
4. **Nomenclatura y Estructura:** Utiliza `kebab-case` para archivos y carpetas (`/views/auth/`), `PascalCase` para componentes y clases React, y `camelCase` para variables y funciones.
5. **Estilos Controlados:** Emplea Tailwind CSS como estándar.

## FLUJO DE TRABAJO Y ARQUITECTURA DE REFERENCIA (CLIENT)
El agente debe replicar la arquitectura basándose en los componentes provistos (ej. `AuthAPI`, `LoginView`, `MainLayout`, `router.tsx`) siguiendo estos pasos modulares para el desarrollo de cada nueva pantalla/función:

1. **Definición de Tipos (`/src/types/`):** Define interfaces completas para entidades y genera Sub-Tipos específicos para payloads de Request/Response valiéndote de Utility Types (`Pick`, `Omit`). (Referencia: `types/auth.ts` -> `LoginFormDataType = Pick<Auth, 'email' | 'password'>`).
2. **Capa de Red Pura (`/src/API/`):** Crea funciones asíncronas aisladas y tipadas (ej. `api.post<string>`) mediante Axios (`@/libs/axios`). Engloba el bloque en `try-catch`, retornando solo el `data` de éxito y canalizando los errores mediante `throwStandardError(error)` (`@/utils/apiError`). Prohibido manejar UI o Estado aquí.
3. **Manejos de Mutaciones y UI (`/src/views/`):** Realiza consumos de endpoints que alteren el backend inicializando el hook `useMutation` (TanStack React Query) *dentro del componente visual*. Coordina el ciclo de vida del Request utilizando `onSuccess` para enrutamiento (`useNavigate`) o estado (`toast.success` con `sonner`) y maneja la captura de fallos pasándole al callback `onError` la función `toastApiError`.
4. **Estado Global y Lecturas Constantes (`/src/hooks/`):** Extrae las Request de tipo GET globales (ej. Session, Settings) a hooks de React independientes utilizando `useQuery` (ej. `useAuth()`) manejando explícitamente `retry`, `refetchOnWindowFocus`, `staleTime` y manipulando la caché directamente en la mutación si aplica (ej. `queryClient.setQueryData`) antes de exponer el `data` finalizado al front.
5. **Formularios Predecibles (`react-hook-form`):** Inicializa obligatoriamente `useForm` brindando una interfaz y objeto de `defaultValues` vacío/precargado para tipado automático del Form. Dispara tu función API en el Wrapper de `handleSubmit(onSubmit)` extrayendo los datos desde el spread attribute `{...register("field")}`.
6. **Protección de Rutas (`/src/layouts/` y `/src/router.tsx`):** Declara la existencia de Vistas y Layouts en React Router (v7). Usa arquitecturas de `Layouts` (ej. `MainLayout`) que funcionen como Guards: Inyectan lógica como hooks globales (ej. comprobación de Login `useAuth()`), resuelven UI de cargando/fail (`Navigate to="/login"`), y finalmente actúan de wrapper con el componente dinámico `<Outlet />`.

## [AGENTE: CORE BACKEND]
**Responsabilidad:** Orquestar la lógica de negocio, REST APIs, integración con base de datos y procesamiento de analíticas.
**Tecnologías:** Node.js, Express (v5.2), TypeScript, MongoDB, Mongoose (v9.2), Zod.
**Reglas Estrictas:**
1. **Tipado Estricto y Validación:** Prohibido el uso de `any`. Todos los endpoints de Express deben validar el `body`, `params` y `query` obligatoriamente utilizando middlewares contra esquemas de Zod antes de ejecutar lógica de controladores.
2. **Encapsulamiento Lógico:** Mantén los controladores en la carpeta `/controllers/` limpios y delgados. Delega la lógica de negocio compleja a servicios o utilidades en `/utils/` o modelos en `/models/`.
3. **Manejo Centralizado de Errores:** Implementa un middleware global de errores que estandarice respuestas y evite la fuga de stack-traces al cliente. Captura asincronía limpiamente.
4. **Nomenclatura Unificada:** Aplica `kebab-case` para archivos e importaciones, `PascalCase` para clases (ej. Modelos) y `camelCase` para instancias, variables locales y funciones.
5. **Autonomía Zero-Trust:** Asume que cualquier payload que viene del frontend es hostil. Valida integridad de datos, límites y estados exclusivamente del lado del servidor.

## [AGENTE: SEGURIDAD Y TRANSACCIONES]
**Responsabilidad:** Ejecutar el motor de puntos, validaciones antifraude offline/online, y proteger end-to-end la infraestructura.
**Tecnologías:** JWT (jsonwebtoken), Bcrypt, MongoDB/Mongoose (Session Transactions), Node.js, TypeScript.
**Reglas Estrictas:**
1. **Transacciones ACID Mandatorias:** Toda operación que modifique el balance de puntos o beneficios de un usuario debe envolverse en una transacción de Mongoose (`session.startTransaction()`). Ejecuta auto-rollback ante la mínima falla.
2. **Flujo Anti-Fraude B2B:** Imprime la validación obligatoria de 4 pasos para sumar consumos: Monto + Ticket (referencia) + Foto Evidencia + QR efímero.
3. **QR Dinámicos y Vida Útil:** Genera QRs transaccionales con una caducidad máxima estricta de 60 segundos. Invalida su uso tras el primer escaneo.
4. **Seguridad Zero-Trust:** Prohibido delegar la validación de geolocalización o de estado (vencimiento/duplicidad) al Frontend. El Backend siempre ejerce la validación final y absoluta.
5. **Gestión de Identidad Segura:** Almacena todos los passwords hasheados con Bcrypt. Maneja sesiones via JWT firmados asimétricamente, proveyendo endpoints de revocación y refresco seguro.

---

# ANTI-PATRONES PROHIBIDOS

1. **Confianza Ciega en el Client-Side:** Validar geolocalización o caducidad de códigos QR y promociones únicamente en la PWA frontend. El backend asume el control absoluto; el frontend es solo una vía de representación.
2. **Mutaciones Disjuntas en DB (No ACID):** Actualizar perfiles, agregar consumos o debitar puntos usando múltiples operaciones `Model.updateOne()` o `.save()` aisladas sin una sesión transaccional. Esto genera desincronización de saldos en caso de caída de un nodo o latencia.
3. **TypeScript Decorativo (`any` / Type-Casting Forzado):** Evadir el chequeo de tipos estático usando `any` o sobreescribiendo tipos (`as MyType`) sin una validación dinámica (Zod) subyacente. Los datos mutables o externos siempre deben parsearse, no castearse.

---

# 📚 BASES DE CONOCIMIENTO (OBLIGATORIAS)

Los agentes DEBEN consultar los siguientes archivos adjuntos antes de implementar cualquier código relacionado con sus dominios:

* **Para el `[AGENTE: FRONTEND PWA]`:** Antes de tocar cualquier componente de UI o vista, debes leer y aplicar estrictamente las reglas definidas en `.agents/DESIGN_SYSTEM.md`. Todas las clases, animaciones y colores deben salir de ahí.
* **Para el `[AGENTE: CORE BACKEND]` y `[AGENTE: SEGURIDAD Y TRANSACCIONES]`:** Antes de crear endpoints, servicios o interactuar con MongoDB, debes consultar `.agents/DB_SCHEMA.md`. Este documento contiene la arquitectura de datos exacta y el razonamiento de por qué ciertas colecciones están separadas o embebidas.