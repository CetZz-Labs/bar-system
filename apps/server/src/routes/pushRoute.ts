import { Router } from "express";
import { body, oneOf, query } from "express-validator";
import { PushSubscriptionController } from "../controllers/PushSubscriptionController";
import { authenticate } from "../middleware/auth";
import { handleInputErrors } from "../middleware/validation";

// LB-80: suscripciones Web Push + preferencias de notificación del usuario.
// Montado en `/api/push` (server.ts). Todas las rutas requieren sesión.
const router: Router = Router();

router.use(authenticate());

router.post(
    '/subscriptions',
    body('endpoint')
        .isString().withMessage('endpoint es requerido')
        .bail()
        .isURL({ require_tld: false, protocols: ['https', 'http'] }).withMessage('endpoint inválido'),
    body('keys.p256dh')
        .isString().withMessage('keys.p256dh es requerido')
        .bail()
        .notEmpty().withMessage('keys.p256dh es requerido'),
    body('keys.auth')
        .isString().withMessage('keys.auth es requerido')
        .bail()
        .notEmpty().withMessage('keys.auth es requerido'),
    body('expirationTime')
        .optional({ nullable: true })
        .isNumeric().withMessage('expirationTime debe ser numérico'),
    body('userAgent')
        .optional()
        .isString().withMessage('userAgent inválido'),
    handleInputErrors,
    PushSubscriptionController.subscribe,
);

router.delete(
    '/subscriptions',
    oneOf(
        [
            body('endpoint').isString().notEmpty(),
            query('endpoint').isString().notEmpty(),
        ],
        { message: 'endpoint es requerido' },
    ),
    handleInputErrors,
    PushSubscriptionController.unsubscribe,
);

router.patch(
    '/preferences',
    body('salidas')
        .optional()
        .isBoolean().withMessage('salidas debe ser booleano'),
    body('consumos')
        .optional()
        .isBoolean().withMessage('consumos debe ser booleano'),
    // `canjes` se acepta por compatibilidad pero se ignora en el controller
    // (no-desactivable, LB-57). No se valida su tipo para no tirar 400.
    handleInputErrors,
    PushSubscriptionController.updatePreferences,
);

export default router;
