import { Router } from "express";
import { body, param } from "express-validator";
import { RewardController } from "../controllers/RewardController";
import { authenticate } from "../middleware/auth";
import { handleInputErrors } from "../middleware/validation";

// mergeParams para poder leer :barId, ya que este router se monta anidado
// bajo /api/bars/:barId/rewards (LB-67, colección nueva, ver models/Reward.ts).
const router: Router = Router({ mergeParams: true });

router.get('/',
    authenticate(),
    param('barId')
        .isMongoId().withMessage('El ID del bar es inválido'),
    handleInputErrors,
    RewardController.listRewards
);

router.post('/',
    authenticate(),
    param('barId')
        .isMongoId().withMessage('El ID del bar es inválido'),
    body('name')
        .notEmpty().withMessage('El nombre es requerido')
        .isLength({ max: 60 }).withMessage('El nombre no puede superar los 60 caracteres')
        .trim(),
    body('description')
        .optional()
        .isLength({ max: 200 }).withMessage('La descripción no puede superar los 200 caracteres')
        .trim(),
    body('pointsRequired')
        .isInt({ min: 1 }).withMessage('pointsRequired debe ser un entero mayor a 0'),
    body('unlimitedStock')
        .optional()
        .isBoolean().withMessage('unlimitedStock debe ser un valor booleano'),
    // Cross-field: si unlimitedStock es falsy (o no viene), stock es
    // requerido. Resuelto acá con `.if()` de express-validator (no en el
    // controller) para cumplir backend.md §1 ("única y exclusivamente con
    // express-validator").
    body('stock')
        .if((_value, { req }) => !req.body.unlimitedStock)
        .isInt({ min: 0 }).withMessage('Debés indicar el stock (entero ≥ 0) o marcar la recompensa como ilimitada'),
    body('stock')
        .if((_value, { req }) => !!req.body.unlimitedStock)
        .optional()
        .isInt({ min: 0 }).withMessage('stock debe ser un entero mayor o igual a 0'),
    handleInputErrors,
    RewardController.createReward
);

router.put('/:rewardId',
    authenticate(),
    param('barId')
        .isMongoId().withMessage('El ID del bar es inválido'),
    param('rewardId')
        .isMongoId().withMessage('El ID de la recompensa es inválido'),
    body('name')
        .optional()
        .notEmpty().withMessage('El nombre no puede estar vacío')
        .isLength({ max: 60 }).withMessage('El nombre no puede superar los 60 caracteres')
        .trim(),
    body('description')
        .optional()
        .isLength({ max: 200 }).withMessage('La descripción no puede superar los 200 caracteres')
        .trim(),
    body('pointsRequired')
        .optional()
        .isInt({ min: 1 }).withMessage('pointsRequired debe ser un entero mayor a 0'),
    body('stock')
        .optional()
        .isInt({ min: 0 }).withMessage('stock debe ser un entero mayor o igual a 0'),
    body('unlimitedStock')
        .optional()
        .isBoolean().withMessage('unlimitedStock debe ser un valor booleano'),
    body('status')
        .optional()
        .isIn(['active', 'inactive']).withMessage('status debe ser "active" o "inactive"'),
    handleInputErrors,
    RewardController.updateReward
);

router.delete('/:rewardId',
    authenticate(),
    param('barId')
        .isMongoId().withMessage('El ID del bar es inválido'),
    param('rewardId')
        .isMongoId().withMessage('El ID de la recompensa es inválido'),
    handleInputErrors,
    RewardController.deleteReward
);

export default router;
