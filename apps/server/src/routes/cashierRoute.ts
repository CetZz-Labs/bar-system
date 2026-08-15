import { Router } from "express";
import { query } from "express-validator";
import { CashierController } from "../controllers/CashierController";
import { authenticateCashier } from "../middleware/auth";
import { handleInputErrors } from "../middleware/validation";

const router: Router = Router();

// LB-66: el login separado de cajero (POST /login) fue eliminado. El flujo
// unificado vive en POST /api/context/select (ver ContextController.select).

router.get('/session',
    authenticateCashier,
    CashierController.session
);

router.post('/logout',
    authenticateCashier,
    CashierController.logout
);

router.get(
    '/groups/search',
    authenticateCashier,
    query('q').isString().withMessage('q es requerido'),
    handleInputErrors,
    CashierController.searchGroups
);

export default router;
