import { Router } from "express";
import { OutingController } from "../controllers/OutingController";
import { authenticateCashier } from "../middleware/auth";
import { handleInputErrors } from "../middleware/validation";
import { param } from "express-validator";

// mergeParams para poder leer :outingId, ya que este router se monta anidado
// bajo /api/outings/:outingId/check-in. Mismo mount point "plano" que
// consumptionRoute.ts (ver ese archivo): el check-in de una salida es una
// acción de cajero sobre la salida puntual, no cuelga naturalmente de
// /groups (el cajero no es miembro del grupo) ni de /bars.
const router: Router = Router({ mergeParams: true });

router.patch('/',
    authenticateCashier,
    param('outingId')
        .isMongoId()
        .withMessage('El ID de la salida es requerido'),
    handleInputErrors,
    OutingController.confirmCheckIn
);

export default router;
