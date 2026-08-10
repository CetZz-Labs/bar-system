import { Router } from "express";
import { OutingController } from "../controllers/OutingController";
import { authenticate } from "../middleware/auth";
import { handleInputErrors } from "../middleware/validation";
import { body, param } from "express-validator";

// mergeParams para poder leer :groupId, ya que este router se monta anidado
// bajo /api/groups/:groupId/outings
const router: Router = Router({ mergeParams: true });

router.post('/',
    authenticate(),
    param('groupId')
        .isMongoId()
        .withMessage('El ID del grupo es requerido'),
    body('barId')
        .isMongoId()
        .withMessage('Debés seleccionar un bar'),
    body('scheduledFor')
        .isISO8601()
        .withMessage('La fecha de la salida es inválida'),
    body('note')
        .optional()
        .isLength({ max: 200 })
        .withMessage('La nota no puede superar los 200 caracteres'),
    body('inviteeIds')
        .optional()
        .isArray()
        .withMessage('inviteeIds debe ser un arreglo'),
    body('inviteeIds.*')
        .optional()
        .isMongoId()
        .withMessage('Cada invitado debe ser un ID válido'),
    handleInputErrors,
    OutingController.createOuting
);

router.patch('/:outingId',
    authenticate(),
    param('groupId')
        .isMongoId()
        .withMessage('El ID del grupo es requerido'),
    param('outingId')
        .isMongoId()
        .withMessage('El ID de la salida es requerido'),
    body('barId')
        .optional()
        .isMongoId()
        .withMessage('El bar seleccionado es inválido'),
    body('scheduledFor')
        .optional()
        .isISO8601()
        .withMessage('La fecha de la salida es inválida'),
    body('note')
        .optional()
        .isLength({ max: 200 })
        .withMessage('La nota no puede superar los 200 caracteres'),
    body('inviteeIds')
        .optional()
        .isArray()
        .withMessage('inviteeIds debe ser un arreglo'),
    body('inviteeIds.*')
        .optional()
        .isMongoId()
        .withMessage('Cada invitado debe ser un ID válido'),
    handleInputErrors,
    OutingController.updateOuting
);

router.patch('/:outingId/cancel',
    authenticate(),
    param('groupId')
        .isMongoId()
        .withMessage('El ID del grupo es requerido'),
    param('outingId')
        .isMongoId()
        .withMessage('El ID de la salida es requerido'),
    handleInputErrors,
    OutingController.cancelOuting
);

router.get('/active',
    authenticate(),
    param('groupId')
        .isMongoId()
        .withMessage('El ID del grupo es requerido'),
    handleInputErrors,
    OutingController.getActiveOuting
);

export default router;
