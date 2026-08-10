import { Router } from "express";
import { body, query } from "express-validator";
import { CashierController } from "../controllers/CashierController";
import { authenticateCashier } from "../middleware/auth";
import { handleInputErrors } from "../middleware/validation";

const router: Router = Router();

router.post('/login',
    body('email').isEmail().withMessage('E-mail no válido'),
    body('password').notEmpty().withMessage('La contraseña es requerida'),
    body('barId').isMongoId().withMessage('barId inválido'),
    body('deviceInfo').notEmpty().withMessage('deviceInfo es requerido').isString(),
    handleInputErrors,
    CashierController.login
);

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
