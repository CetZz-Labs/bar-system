import { Router } from "express";
import { param, query } from "express-validator";
import { AuditLogController } from "../controllers/AuditLogController";
import { authenticate } from "../middleware/auth";
import { handleInputErrors } from "../middleware/validation";
import { ACTOR_TYPES, AUDIT_EVENT_TYPES } from "../models/AuditLog";

// LB-77: lectura del log de auditoría (OWNER-only, inmutable). mergeParams
// para leer :barId, montado anidado bajo /api/bars/:barId/audit-logs
// (server.ts), mismo patrón que dashboardRoute.ts (LB-74).
const router: Router = Router({ mergeParams: true });

router.get('/',
    authenticate(),
    param('barId')
        .isMongoId().withMessage('El ID del bar es inválido'),
    query('from')
        .optional()
        .isISO8601().withMessage('from debe ser una fecha ISO8601'),
    query('to')
        .optional()
        .isISO8601().withMessage('to debe ser una fecha ISO8601'),
    query('eventType')
        .optional()
        .isIn([...AUDIT_EVENT_TYPES]).withMessage('eventType inválido'),
    query('actorType')
        .optional()
        .isIn([...ACTOR_TYPES]).withMessage('actorType inválido'),
    query('actorId')
        .optional()
        .isMongoId().withMessage('actorId inválido'),
    query('entityId')
        .optional()
        .isMongoId().withMessage('entityId inválido'),
    query('q')
        .optional()
        .isString()
        .isLength({ max: 200 }).withMessage('q demasiado largo')
        .trim(),
    query('cursor')
        .optional()
        .isString().withMessage('cursor inválido'),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 }).withMessage('limit debe ser un entero entre 1 y 100'),
    query('format')
        .optional()
        .isIn(['csv']).withMessage('format debe ser "csv"'),
    handleInputErrors,
    AuditLogController.getAuditLogs
);

export default router;
