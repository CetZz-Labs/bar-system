import { Router } from "express";
import { param, query } from "express-validator";
import { GroupBalanceController } from "../controllers/GroupBalanceController";
import { authenticate } from "../middleware/auth";
import { handleInputErrors } from "../middleware/validation";

const router: Router = Router({ mergeParams: true });

router.get(
    "/balance",
    authenticate(),
    param("groupId").isMongoId().withMessage("El ID del grupo es requerido"),
    handleInputErrors,
    GroupBalanceController.getBalance
);

router.get(
    "/history",
    authenticate(),
    param("groupId").isMongoId().withMessage("El ID del grupo es requerido"),
    query("cursor").optional().isString(),
    query("limit").optional().isInt({ min: 1, max: 50 }),
    handleInputErrors,
    GroupBalanceController.getHistory
);

export default router;
