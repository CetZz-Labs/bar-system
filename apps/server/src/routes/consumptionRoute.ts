import { Router } from "express";
import { ConsumptionController } from "../controllers/ConsumptionController";
import { authenticate } from "../middleware/auth";
import { handleInputErrors } from "../middleware/validation";
import { body, param } from "express-validator";

// mergeParams para poder leer :outingId, ya que este router se monta anidado
// bajo /api/outings/:outingId/consumptions. Ver progress/implementers/impl_LB-60.md
// para la justificación de este mount point (Consumption no cuelga naturalmente
// de /groups ni de /bars).
const router: Router = Router({ mergeParams: true });

router.post('/',
    authenticate(),
    param('outingId')
        .isMongoId()
        .withMessage('El ID de la salida es requerido'),
    body('amount')
        .isInt({ min: 1 })
        .withMessage('El monto debe ser un número entero mayor a 0'),
    body('breakdown')
        .optional()
        .isArray()
        .withMessage('El desglose debe ser un arreglo'),
    body('breakdown.*.category')
        .isString()
        .notEmpty()
        .withMessage('Cada ítem del desglose debe tener una categoría'),
    body('breakdown.*.quantity')
        .isInt({ min: 1 })
        .withMessage('La cantidad de cada ítem debe ser un entero mayor a 0'),
    body('breakdown.*.subtotal')
        .isFloat({ min: 0 })
        .withMessage('El subtotal de cada ítem debe ser un número mayor o igual a 0'),
    handleInputErrors,
    ConsumptionController.createConsumption
);

router.patch('/:consumptionId/regenerate',
    authenticate(),
    param('outingId')
        .isMongoId()
        .withMessage('El ID de la salida es requerido'),
    param('consumptionId')
        .isMongoId()
        .withMessage('El ID del consumo es requerido'),
    handleInputErrors,
    ConsumptionController.regenerateConsumption
);

router.get('/pending',
    authenticate(),
    param('outingId')
        .isMongoId()
        .withMessage('El ID de la salida es requerido'),
    handleInputErrors,
    ConsumptionController.getPendingConsumptions
);

export default router;
