import { Router } from "express";
import { param, query } from "express-validator";
import { CashierController } from "../controllers/CashierController";
import { ShiftSummaryController } from "../controllers/ShiftSummaryController";
import {
    authenticate,
    authenticateCashier,
    authenticateCashierForClose,
    authenticateCashierSummary,
    authenticateShiftSummary,
} from "../middleware/auth";
import { handleInputErrors } from "../middleware/validation";

const router: Router = Router();

// LB-66: el login separado de cajero (POST /login) fue eliminado. El flujo
// unificado vive en POST /api/context/select (ver ContextController.select).

router.get('/session',
    authenticateCashier,
    CashierController.session
);

router.post('/logout',
    authenticateCashier,
    CashierController.logout
);

router.post('/shift/close',
    authenticateCashierForClose,
    CashierController.closeShift
);

router.get('/shifts/history',
    authenticate(),
    query('barId').isMongoId().withMessage('barId inválido'),
    query('from').optional().isISO8601().withMessage('from debe ser una fecha ISO 8601'),
    query('to').optional().isISO8601().withMessage('to debe ser una fecha ISO 8601'),
    handleInputErrors,
    ShiftSummaryController.history
);

router.get('/shifts/pending-summary',
    authenticateCashierSummary,
    ShiftSummaryController.pendingSummary
);

router.get('/shifts/:shiftId/summary/pdf',
    authenticateShiftSummary,
    param('shiftId').isMongoId().withMessage('shiftId inválido'),
    handleInputErrors,
    ShiftSummaryController.downloadPdf
);

router.get('/shifts/:shiftId/summary/csv',
    authenticateShiftSummary,
    param('shiftId').isMongoId().withMessage('shiftId inválido'),
    handleInputErrors,
    ShiftSummaryController.downloadCsv
);

router.get('/shifts/:shiftId/summary',
    authenticateShiftSummary,
    param('shiftId').isMongoId().withMessage('shiftId inválido'),
    handleInputErrors,
    ShiftSummaryController.getSummary
);

router.get(
    '/groups/search',
    authenticateCashier,
    query('q').isString().withMessage('q es requerido'),
    handleInputErrors,
    CashierController.searchGroups
);

export default router;
