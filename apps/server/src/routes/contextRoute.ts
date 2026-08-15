import { Router } from "express";
import { body } from "express-validator";
import { ContextController } from "../controllers/ContextController";
import { authenticate } from "../middleware/auth";
import { handleInputErrors } from "../middleware/validation";

const router: Router = Router();

router.get('/options',
    authenticate(),
    ContextController.getOptions
);

router.post('/select',
    authenticate(),
    body('mode')
        .notEmpty().withMessage('El modo es requerido')
        .isIn(['user', 'cashier', 'owner']).withMessage('Modo inválido'),
    body('barId')
        .if((_value, { req }) => req.body.mode !== 'user')
        .notEmpty().withMessage('barId es requerido')
        .isMongoId().withMessage('barId inválido'),
    handleInputErrors,
    ContextController.select
);

export default router;
