import { Router } from "express";
import { body, param, query } from "express-validator";
import { DashboardController } from "../controllers/DashboardController";
import { authenticate } from "../middleware/auth";
import { handleInputErrors } from "../middleware/validation";

// LB-74: dashboard del bar (OWNER). mergeParams para leer :barId, montado
// anidado bajo /api/bars/:barId (server.ts), mismo patrón que rewardRoute.ts
// (LB-67) bajo /api/bars/:barId/rewards.
const router: Router = Router({ mergeParams: true });

const PERIOD_VALUES = ['today', 'week', 'month', 'custom'];
const STATUS_VALUES = ['en_curso', 'finalizada', 'reservada', 'disputa'];

router.get('/dashboard',
    authenticate(),
    param('barId')
        .isMongoId().withMessage('El ID del bar es inválido'),
    query('period')
        .optional()
        .isIn(PERIOD_VALUES).withMessage(`period debe ser uno de: ${PERIOD_VALUES.join(', ')}`),
    query('from')
        .if((_value, { req }) => req.query?.period === 'custom')
        .exists().withMessage('from es requerido cuando period=custom')
        .bail()
        .isISO8601().withMessage('from debe ser una fecha ISO8601'),
    query('to')
        .if((_value, { req }) => req.query?.period === 'custom')
        .exists().withMessage('to es requerido cuando period=custom')
        .bail()
        .isISO8601().withMessage('to debe ser una fecha ISO8601'),
    query('cashierId')
        .optional()
        .isMongoId().withMessage('cashierId es inválido'),
    query('status')
        .optional()
        .isIn(STATUS_VALUES).withMessage(`status debe ser uno de: ${STATUS_VALUES.join(', ')}`),
    handleInputErrors,
    DashboardController.getDashboard
);

router.patch('/consumptions/:consumptionId/resolve',
    authenticate(),
    param('barId')
        .isMongoId().withMessage('El ID del bar es inválido'),
    param('consumptionId')
        .isMongoId().withMessage('El ID del consumo es inválido'),
    body('outcome')
        .isIn(['ACCEPTED', 'REJECTED']).withMessage('outcome debe ser ACCEPTED o REJECTED'),
    body('note')
        .trim()
        .notEmpty().withMessage('El motivo es requerido')
        .isLength({ max: 300 }).withMessage('El motivo no puede superar los 300 caracteres'),
    handleInputErrors,
    DashboardController.resolveConsumptionDispute
);

export default router;
