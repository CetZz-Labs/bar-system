import { Router } from "express";
import { body, param } from "express-validator";
import { CashierRedemptionController } from "../controllers/CashierRedemptionController";
import { authenticateCashier } from "../middleware/auth";
import { handleInputErrors } from "../middleware/validation";

// LB-69: montado en /api/redemptions (server.ts), sin :groupId — quien
// resuelve un canje es el cajero, identificado por su propio contexto
// (authenticateCashier -> req.cashierContext), no por membresía de grupo.
// Prefijo libre hoy: no colisiona con /api/groups/:groupId/redemptions
// (groupRedemptionsRoute.ts), ver progress/explorers/exp_LB-69.md §2.
const router: Router = Router();

// Preview de solo lectura (no muta el canje) para que el cajero confirme
// los datos en el modal antes de decidir la acción.
router.post(
    '/:tokenOrCode/lookup',
    authenticateCashier,
    param('tokenOrCode').isString().trim().notEmpty().withMessage('tokenOrCode es requerido'),
    handleInputErrors,
    CashierRedemptionController.lookup
);

router.post(
    '/:tokenOrCode/validate',
    authenticateCashier,
    param('tokenOrCode').isString().trim().notEmpty().withMessage('tokenOrCode es requerido'),
    body('action')
        .isIn(['deliver', 'reject'])
        .withMessage('action debe ser "deliver" o "reject"'),
    body('reason')
        .if(body('action').equals('reject'))
        .isString()
        .trim()
        .notEmpty()
        .withMessage('El motivo de rechazo es requerido'),
    handleInputErrors,
    CashierRedemptionController.validate
);

export default router;
