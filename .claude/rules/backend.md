# Backend Rules — `apps/server` ("La Banda")

> **Alcance:** este documento es la fuente de verdad inmutable para cualquier trabajo de IA sobre `apps/server`. Refleja la arquitectura **real** del código, no la aspiracional. Ante cualquier duda o conflicto con otra documentación (READMEs, comentarios, specs antiguas), **estas reglas tienen prioridad**.

---

## 1. Stack tecnológico y restricciones

- **Runtime:** Node.js + TypeScript.
- **Framework HTTP:** Express **5.2.1**. Express 5 soporta promesas nativas en handlers async — úsalas directamente.
- **Base de datos:** MongoDB, accedida **exclusivamente** vía Mongoose. No se introducen otros ODM/ORM ni acceso directo al driver de Mongo salvo que ya exista un precedente en el código.

### Prohibiciones estrictas

| Prohibido | Alternativa obligatoria |
|---|---|
| `zod` (instalar, importar o sugerir) | `express-validator` a nivel de rutas |
| Carpeta `services/` | Flujo de 3 pasos: `routes/` → `controllers/` → `models/` |

- La validación de peticiones (`body`, `params`, `query`) se hace **única y exclusivamente** con `express-validator`, encadenado en el archivo de rutas correspondiente. No se valida con Zod, Joi, Yup ni schemas manuales alternativos.
- No existe (ni debe crearse) una capa de "servicios" intermedia. Los controladores llaman directamente a los modelos Mongoose. Si una lógica se repite entre controladores, se extrae a `utils/`, **no** a un nuevo `services/`.

### Arquitectura de 3 capas

```
routes/        → declara el endpoint + cadena de validación (express-validator) + referencia al controller
controllers/    → clases con métodos estáticos (ej. AuthController.login); lógica de negocio + llamadas a Mongoose
models/          → esquemas Mongoose + interfaces TS; reglas de negocio embebidas en hooks (pre('save'), etc.)
```

No se agregan capas adicionales (repositorios, DAOs, service layer) a esta cadena.

---

## 2. Librerías autorizadas

Solo se usan las siguientes librerías para las responsabilidades indicadas. No se introducen alternativas sin autorización explícita.

| Responsabilidad | Librería(s) |
|---|---|
| Autenticación (JWT) | `jsonwebtoken` — token enviado vía cookie `httpOnly`, nunca en el body ni en header `Authorization` |
| Hashing de contraseñas | `bcrypt` |
| Subida de archivos | `multer` |
| Procesamiento de imágenes | `sharp` |
| Envío de emails | `nodemailer` |
| Generación de códigos QR | `qrcode` |
| Logging HTTP | `morgan` |
| Parseo de cookies | `cookie-parser` |

---

## 3. Modelo de datos actual

El modelo de datos vigente se limita a las siguientes colecciones Mongoose. No se asume, referencia ni se construye sobre ninguna colección fuera de esta lista:

- `User`
- `Bar`
- `BarUser`
- `Group`
- `GroupBan`
- `JoinRequest`
- `Notification`
- `Outing`
- `Token`

**No existe** ningún sistema de gamificación o puntos (`pointsTransactions`, `promotions`, `redemptions`, `barMissions`, `attendanceSessions`, `consumptions`, etc.) en la base de código actual. Cualquier mención a ese dominio en documentación histórica es aspiracional y **no debe usarse como referencia de la implementación real**.

---

## 4. Deuda técnica y convenciones

### Idioma: inglés estricto en código nuevo

El código existente mezcla inglés y español en rutas (ej. `/registro`, `/activos`, `/mis-bares`). Esto es **deuda técnica heredada, no un patrón a replicar**.

> **Regla inmutable:** toda ruta, controlador, variable, función o identificador **nuevo** debe escribirse estrictamente en **inglés**. No se agregan más rutas ni símbolos en español, aunque convivan con los existentes.

### Manejo de errores en controladores

- Express 5 soporta promesas nativas en handlers async: los `rejects` propagan solos.
- No envolver controladores en `try/catch` innecesarios ni en wrappers/helpers obsoletos "por costumbre".
- Solo usar `try/catch` cuando sea estrictamente necesario para manejar un caso específico del request (por ejemplo, distinguir tipos de error para devolver un status code distinto).

### Variables de entorno

- Las variables de entorno se cargan con `process.loadEnvFile()` (API nativa de Node), no con `dotenv` ni librerías equivalentes.
- No exponer credenciales: nunca hardcodear secretos, imprimirlos en logs, ni incluirlos en respuestas de la API o mensajes de commit.
