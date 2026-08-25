import { Router } from "express";
import { BarController } from "../controllers/BarController";
import { RewardController } from "../controllers/RewardController";
import { authenticate, requireCompleteProfile } from "../middleware/auth";
import { body, param } from "express-validator";
import { handleInputErrors } from "../middleware/validation";
import { uploadSingle } from "../middleware/upload";

const router: Router = Router();

router.post('/registro',
    authenticate(),
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
    authenticate(),
    BarController.getActiveBars
);

router.get('/mis-bares',
    authenticate(),
    BarController.getMyBars
);

router.get('/:id/perfil',
    authenticate(),
    BarController.getBarProfile
);

// LB-76: ficha pública del bar para cualquier cliente autenticado (sin
// BarUser), distinta de `/:id/perfil` (gestión, exige verifyBarAccess).
router.get('/:id/detail',
    authenticate(),
    param('id').isMongoId().withMessage('El ID del bar es inválido'),
    handleInputErrors,
    BarController.getPublicBarDetail
);

// LB-76: recompensas activas/disponibles del bar, resueltas directo del
// :id (sin groupId/Outing), mismo criterio de acceso que `/:id/detail`.
router.get('/:id/rewards/available',
    authenticate(),
    param('id').isMongoId().withMessage('El ID del bar es inválido'),
    handleInputErrors,
    RewardController.getAvailableRewardsForBar
);

router.patch('/:id/perfil',
    authenticate(),
    body('name')
        .optional()
        .isLength({ min: 3, max: 60 }).withMessage('El nombre debe tener entre 3 y 60 caracteres'),
    body('description')
        .optional()
        .isLength({ max: 120 }).withMessage('La descripción no puede superar los 120 caracteres'),
    body('phone')
        .optional()
        .notEmpty().withMessage('El teléfono no puede estar vacío'),
    body('closingTime')
        .optional()
        .matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('La hora de cierre debe tener formato HH:MM'),
    body('attendancePointsByDay')
        .optional()
        .isObject().withMessage('attendancePointsByDay debe ser un objeto con los 7 días de la semana'),
    body('attendancePointsByDay.monday')
        .optional()
        .isInt({ min: 0, max: 1000 }).withMessage('Los puntos de lunes deben ser un entero entre 0 y 1000'),
    body('attendancePointsByDay.tuesday')
        .optional()
        .isInt({ min: 0, max: 1000 }).withMessage('Los puntos de martes deben ser un entero entre 0 y 1000'),
    body('attendancePointsByDay.wednesday')
        .optional()
        .isInt({ min: 0, max: 1000 }).withMessage('Los puntos de miércoles deben ser un entero entre 0 y 1000'),
    body('attendancePointsByDay.thursday')
        .optional()
        .isInt({ min: 0, max: 1000 }).withMessage('Los puntos de jueves deben ser un entero entre 0 y 1000'),
    body('attendancePointsByDay.friday')
        .optional()
        .isInt({ min: 0, max: 1000 }).withMessage('Los puntos de viernes deben ser un entero entre 0 y 1000'),
    body('attendancePointsByDay.saturday')
        .optional()
        .isInt({ min: 0, max: 1000 }).withMessage('Los puntos de sábado deben ser un entero entre 0 y 1000'),
    body('attendancePointsByDay.sunday')
        .optional()
        .isInt({ min: 0, max: 1000 }).withMessage('Los puntos de domingo deben ser un entero entre 0 y 1000'),
    handleInputErrors,
    BarController.updateBarProfile
);

router.post('/:id/logo',
    authenticate(),
    uploadSingle(2 * 1024 * 1024),
    BarController.uploadBarLogo
);

router.post('/:id/cover',
    authenticate(),
    uploadSingle(3 * 1024 * 1024),
    BarController.uploadBarCover
);

export default router;
