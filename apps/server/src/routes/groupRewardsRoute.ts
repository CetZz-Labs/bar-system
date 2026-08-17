import { Router } from "express";
import { param, query } from "express-validator";
import { GroupRewardsController } from "../controllers/GroupRewardsController";
import { authenticate } from "../middleware/auth";
import { handleInputErrors } from "../middleware/validation";

// mergeParams para poder leer :groupId, ya que este router se monta anidado
// bajo /api/groups/:groupId/rewards (mismo patrón que outingRoute.ts, LB-72).
const router: Router = Router({ mergeParams: true });

router.get('/',
    authenticate(),
    param('groupId')
        .isMongoId()
        .withMessage('El ID del grupo es requerido'),
    // Aceptado pero ignorado del lado del servidor: el bar siempre se
    // resuelve internamente vía la Outing ACTIVE del grupo (ver
    // GroupRewardsController.getAvailable).
    query('barId')
        .optional()
        .isMongoId()
        .withMessage('El ID del bar es inválido'),
    handleInputErrors,
    GroupRewardsController.getAvailable
);

export default router;
