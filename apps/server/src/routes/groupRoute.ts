import { Router } from "express";
import { GroupController } from "../controllers/GroupController";
import { authenticate, optionalAuthenticate, requireCompleteProfile } from "../middleware/auth";
import { handleInputErrors } from "../middleware/validation";
import { body, param } from "express-validator";
import { upload } from "../middleware/upload";

const router: Router = Router();

router.post('/',
    authenticate(),
    requireCompleteProfile,
    upload.single('photo'),
    body('name')
        .matches(/^[a-zA-Z0-9\s-]{3,40}$/)
        .withMessage('El nombre debe tener entre 3 y 40 caracteres alfanuméricos, espacios y guiones'),
    body('type')
        .isIn(['OPEN', 'CLOSED'])
        .withMessage('El tipo debe ser OPEN o CLOSED'),
    body('description')
        .optional()
        .isLength({ max: 120 })
        .withMessage('La descripción no puede superar los 120 caracteres'),
    handleInputErrors,
    GroupController.createGroup
);

router.get('/invite/:inviteCode',
    optionalAuthenticate,
    param('inviteCode')
        .isString()
        .isLength({ min: 6, max: 6 })
        .withMessage('El código de invitación debe tener 6 caracteres'),
    handleInputErrors,
    GroupController.getGroupByInviteCode
);

router.post('/join',
    authenticate(),
    requireCompleteProfile,
    body('inviteCode')
        .isString()
        .isLength({ min: 6, max: 6 })
        .withMessage('El código de invitación debe tener 6 caracteres'),
    handleInputErrors,
    GroupController.joinGroup
);

router.get('/:slug/qr',
    authenticate(),
    param('slug')
        .isString()
        .notEmpty()
        .withMessage('El slug es requerido'),
    handleInputErrors,
    GroupController.getGroupQR
);

router.get('/:slug/requests',
    authenticate(),
    param('slug')
        .isString()
        .notEmpty()
        .withMessage('El slug es requerido'),
    handleInputErrors,
    GroupController.getPendingRequests
);

router.post('/:slug/requests/:requestId/approve',
    authenticate(),
    param('slug')
        .isString()
        .notEmpty()
        .withMessage('El slug es requerido'),
    param('requestId')
        .isString()
        .notEmpty()
        .withMessage('El ID de solicitud es requerido'),
    handleInputErrors,
    GroupController.approveRequest
);

router.post('/:slug/requests/:requestId/reject',
    authenticate(),
    param('slug')
        .isString()
        .notEmpty()
        .withMessage('El slug es requerido'),
    param('requestId')
        .isString()
        .notEmpty()
        .withMessage('El ID de solicitud es requerido'),
    handleInputErrors,
    GroupController.rejectRequest
);

router.get('/:slug',
    authenticate(),
    param('slug')
        .isString()
        .notEmpty()
        .withMessage('El slug es requerido'),
    handleInputErrors,
    GroupController.getGroupBySlug
);

export default router;
