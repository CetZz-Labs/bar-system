import { Router } from "express";
import { query } from "express-validator";
import { RewardController } from "../controllers/RewardController";
import { authenticate } from "../middleware/auth";
import { handleInputErrors } from "../middleware/validation";

// Montado en /api/rewards (LB-67). Separado de rewardRoute.ts (ABM
// bar-scoped, mergeParams :barId) siguiendo el precedente de
// consumptionRoute.ts / leaderConsumptionRoute.ts: cada archivo de rutas
// corresponde a un único punto de montaje en server.ts.
const router: Router = Router();

router.get('/available',
    authenticate(),
    query('groupId')
        .isMongoId().withMessage('groupId es requerido y debe ser un ID válido'),
    handleInputErrors,
    RewardController.getAvailableRewards
);

export default router;
