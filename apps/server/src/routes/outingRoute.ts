import { Router } from 'express';
import { body } from 'express-validator';
import { OutingController } from '../controllers/OutingController';
import { authenticate, requireCompleteProfile } from '../middleware/auth';
import { handleInputErrors } from '../middleware/validation';

const router: Router = Router();

router.post(
    '/',
    authenticate(),
    requireCompleteProfile,
    body('groupId').isMongoId().withMessage('groupId inválido'),
    body('barId').isMongoId().withMessage('barId inválido'),
    body('scheduledFor').isISO8601().withMessage('scheduledFor debe ser ISO8601'),
    body('note').optional().isString().isLength({ max: 280 }),
    body('invitedMemberIds').optional().isArray(),
    body('invitedMemberIds.*').optional().isMongoId(),
    handleInputErrors,
    OutingController.create
);

export default router;
