import { Router } from 'express';
import { body, query } from 'express-validator';
import { CashierController } from '../controllers/CashierController';
import { requireCashierSession } from '../middleware/cashierAuth';
import { handleInputErrors } from '../middleware/validation';

const router: Router = Router();

router.post(
    '/login',
    body('email').isEmail().withMessage('Email inválido'),
    body('password').isString().notEmpty().withMessage('La contraseña es requerida'),
    body('barId').isMongoId().withMessage('barId inválido'),
    handleInputErrors,
    CashierController.login
);

router.post('/logout', requireCashierSession, CashierController.logout);

router.get('/session', requireCashierSession, CashierController.session);

router.get(
    '/groups/search',
    requireCashierSession,
    query('q').isString().withMessage('q es requerido'),
    handleInputErrors,
    CashierController.searchGroups
);

export default router;
