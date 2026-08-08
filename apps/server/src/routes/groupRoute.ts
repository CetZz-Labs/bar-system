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

router.patch('/:slug/members/:memberId/role',
    authenticate(),
    param('slug')
        .isString()
        .notEmpty()
        .withMessage('El slug es requerido'),
    param('memberId')
        .isMongoId()
        .withMessage('El ID del miembro es requerido'),
    body('role')
        .isIn(['LEADER', 'CO_LEADER', 'MEMBER', 'ADMIN'])
        .withMessage('El rol debe ser LEADER, CO_LEADER, MEMBER o ADMIN'),
    handleInputErrors,
    GroupController.updateMemberRole
);

router.delete('/:slug/members/:memberId',
    authenticate(),
    param('slug')
        .isString()
        .notEmpty()
        .withMessage('El slug es requerido'),
    param('memberId')
        .isMongoId()
        .withMessage('El ID del miembro es requerido'),
    handleInputErrors,
    GroupController.removeMember
);

router.post('/:slug/leave',
    authenticate(),
    param('slug')
        .isString()
        .notEmpty()
        .withMessage('El slug es requerido'),
    handleInputErrors,
    GroupController.leaveGroup
);

router.get('/search',
    authenticate(),
    (req, res, next) => {
        const { q } = req.query;
        if (!q || typeof q !== 'string') {
            res.status(400).json({ message: 'El parámetro de búsqueda es requerido' });
            return;
        }
        if (q.trim().length < 2) {
            res.status(400).json({ message: 'La búsqueda debe tener al menos 2 caracteres' });
            return;
        }
        next();
    },
    GroupController.searchGroups
);

router.get('/:id/members',
    authenticate(),
    param('id')
        .isMongoId()
        .withMessage('El ID del grupo es requerido'),
    handleInputErrors,
    GroupController.getGroupMembers
);

router.get('/:id',
    authenticate(),
    param('id')
        .isMongoId()
        .withMessage('El ID del grupo es requerido'),
    handleInputErrors,
    GroupController.getGroupById
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
