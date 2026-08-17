import { Router } from "express";
import { body, param } from "express-validator";
import { RedemptionController } from "../controllers/RedemptionController";
import { authenticate } from "../middleware/auth";
import { handleInputErrors } from "../middleware/validation";

// mergeParams para poder leer :groupId, ya que este router se monta anidado
// bajo /api/groups/:groupId/redemptions (mismo patrón que outingRoute.ts y
// groupRewardsRoute.ts, LB-72).
const router: Router = Router({ mergeParams: true });

router.post('/',
    authenticate(),
    param('groupId')
        .isMongoId()
        .withMessage('El ID del grupo es requerido'),
    body('rewardId')
        .isMongoId()
        .withMessage('Debés seleccionar una recompensa'),
    handleInputErrors,
    RedemptionController.create
);

router.patch('/:id/cancel',
    authenticate(),
    param('groupId')
        .isMongoId()
        .withMessage('El ID del grupo es requerido'),
    param('id')
        .isMongoId()
        .withMessage('El ID del canje es requerido'),
    handleInputErrors,
    RedemptionController.cancel
);

router.get('/',
    authenticate(),
    param('groupId')
        .isMongoId()
        .withMessage('El ID del grupo es requerido'),
    handleInputErrors,
    RedemptionController.list
);

export default router;
