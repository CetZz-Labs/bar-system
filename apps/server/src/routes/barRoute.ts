import { Router } from "express";
import { BarController } from "../controllers/BarController";
import { authenticate, requireCompleteProfile } from "../middleware/auth";
import { body } from "express-validator";
import { handleInputErrors } from "../middleware/validation";
import { Role } from "../models/User";
import { uploadSingle } from "../middleware/upload";

const router: Router = Router();

router.post('/registro',
    authenticate([Role.USER, Role.ADMIN]),
    requireCompleteProfile,
    body('name')
        .notEmpty().withMessage('El nombre del bar es requerido')
        .isLength({ min: 3, max: 60 }).withMessage('El nombre debe tener entre 3 y 60 caracteres'),
    body('address')
        .notEmpty().withMessage('La dirección es requerida')
        .isObject().withMessage('La dirección debe ser un objeto'),
    body('address.street')
        .notEmpty().withMessage('La calle es requerida'),
    body('address.number')
        .notEmpty().withMessage('El número es requerido'),
    body('address.city')
        .notEmpty().withMessage('La ciudad es requerida'),
    body('phone')
        .notEmpty().withMessage('El teléfono de contacto es requerido'),
    body('schedule')
        .isArray({ min: 1 }).withMessage('El horario debe ser un array con al menos un día'),
    body('schedule.*.day')
        .isInt({ min: 0, max: 6 }).withMessage('Día inválido (0=Domingo, 6=Sábado)'),
    body('schedule.*.open')
        .matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Hora de apertura inválida (HH:MM)'),
    body('schedule.*.close')
        .matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Hora de cierre inválida (HH:MM)'),
    body('description')
        .optional()
        .isLength({ max: 120 }).withMessage('La descripción no puede superar los 120 caracteres'),
    handleInputErrors,
    BarController.registerBar
);

router.get('/activos',
    authenticate([Role.USER, Role.ADMIN]),
    BarController.getActiveBars
);

router.get('/mis-bares',
    authenticate([Role.USER, Role.ADMIN]),
    BarController.getMyBars
);

router.patch('/:id/activar',
    authenticate([Role.ADMIN]),
    BarController.activateBar
);

router.get('/:id/perfil',
    authenticate([Role.USER, Role.ADMIN]),
    BarController.getBarProfile
);

router.patch('/:id/perfil',
    authenticate([Role.USER, Role.ADMIN]),
    body('name')
        .optional()
        .isLength({ min: 3, max: 60 }).withMessage('El nombre debe tener entre 3 y 60 caracteres'),
    body('description')
        .optional()
        .isLength({ max: 120 }).withMessage('La descripción no puede superar los 120 caracteres'),
    body('phone')
        .optional()
        .notEmpty().withMessage('El teléfono no puede estar vacío'),
    handleInputErrors,
    BarController.updateBarProfile
);

router.post('/:id/logo',
    authenticate([Role.USER, Role.ADMIN]),
    uploadSingle(2 * 1024 * 1024),
    BarController.uploadBarLogo
);

router.post('/:id/cover',
    authenticate([Role.USER, Role.ADMIN]),
    uploadSingle(3 * 1024 * 1024),
    BarController.uploadBarCover
);

export default router;
