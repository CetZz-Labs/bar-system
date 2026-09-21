import { Router } from "express";
import { body, param } from "express-validator";
import { CashierManagementController } from "../controllers/CashierManagementController";
import { authenticate } from "../middleware/auth";
import { handleInputErrors } from "../middleware/validation";

// LB-115: ABM de cajeros (BarUser{role:CASHIER}) por el OWNER del bar.
// mergeParams para leer :barId — montado anidado bajo
// /api/bars/:barId/cashiers (server.ts), mismo patrón que rewardRoute.ts.
const router: Router = Router({ mergeParams: true });

router.get('/',
    authenticate(),
    param('barId')
        .isMongoId().withMessage('El ID del bar es inválido'),
    handleInputErrors,
    CashierManagementController.listCashiers
);

router.post('/',
    authenticate(),
    param('barId')
        .isMongoId().withMessage('El ID del bar es inválido'),
    body('name')
        .notEmpty().withMessage('El nombre es requerido')
        .isLength({ min: 3 }).withMessage('El nombre debe tener al menos 3 caracteres')
        .trim(),
    body('lastName')
        .notEmpty().withMessage('El apellido es requerido')
        .isLength({ min: 3 }).withMessage('El apellido debe tener al menos 3 caracteres')
        .trim(),
    body('email')
        .notEmpty().withMessage('El email es requerido')
        .isEmail().withMessage('El email es inválido')
        .normalizeEmail(),
    handleInputErrors,
    CashierManagementController.createCashier
);

router.put('/:cashierId',
    authenticate(),
    param('barId')
        .isMongoId().withMessage('El ID del bar es inválido'),
    param('cashierId')
        .isMongoId().withMessage('El ID del cajero es inválido'),
    body('isActive')
        .isBoolean().withMessage('isActive debe ser un valor booleano'),
    handleInputErrors,
    CashierManagementController.updateCashier
);

export default router;
