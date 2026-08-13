import { Router } from "express";
import { param } from "express-validator";
import { OutingController } from "../controllers/OutingController";
import { authenticateCashier } from "../middleware/auth";
import { handleInputErrors } from "../middleware/validation";

const router: Router = Router({ mergeParams: true });

router.patch(
    '/',
    authenticateCashier,
    param('outingId').isMongoId().withMessage('El ID de la salida es requerido'),
    handleInputErrors,
    OutingController.closeOuting
);

export default router;
