import { Router } from "express";
import { body, param } from "express-validator";
import { LeaderConsumptionController } from "../controllers/LeaderConsumptionController";
import { authenticate } from "../middleware/auth";
import { handleInputErrors } from "../middleware/validation";

const router: Router = Router();

router.post(
    '/lookup',
    authenticate(),
    body('tokenOrCode').isString().notEmpty().withMessage('tokenOrCode es requerido'),
    handleInputErrors,
    LeaderConsumptionController.lookup
);

router.post(
    '/:consumptionId/accept',
    authenticate(),
    param('consumptionId').isMongoId().withMessage('consumptionId inválido'),
    handleInputErrors,
    LeaderConsumptionController.accept
);

router.post(
    '/:consumptionId/reject',
    authenticate(),
    param('consumptionId').isMongoId().withMessage('consumptionId inválido'),
    handleInputErrors,
    LeaderConsumptionController.reject
);

export default router;
