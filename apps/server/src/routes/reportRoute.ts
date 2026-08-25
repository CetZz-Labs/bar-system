import { Router } from "express";
import { param, query } from "express-validator";
import { ReportController } from "../controllers/ReportController";
import { authenticate } from "../middleware/auth";
import { handleInputErrors } from "../middleware/validation";
import { Role } from "../models/User";
import { REPORT_KINDS } from "../utils/barReports";

// LB-78: reportes exportables del bar (OWNER). mergeParams para leer :barId,
// montado anidado bajo /api/bars/:barId/reports (server.ts), mismo patrón que
// dashboardRoute.ts (LB-74) y auditLogRoute.ts (LB-77).
//
// `kind` y `format` viajan como QUERY params (no en el path con extensión
// `consumptions.csv` como sugería la spec): se detectó que Express 5.2.1 +
// path-to-regexp v8 matchea los params de ruta anidados bajo
// `app.use('/:barId/reports')` + `mergeParams` de forma NO determinista
// (el mismo request devuelve 200 en una corrida y 404 en otra; ver
// progress/implementers/impl_LB-78.md §Decisiones). El patrón raíz
// `router.get('/')` + query params es idéntico a `GET /audit-logs?format=csv`
// (LB-77) y es estable. Todos los inputs inválidos → 400 vía express-validator;
// el rango máximo de 3 meses se valida en el controller (exceedsMaxRange).
const FORMAT_VALUES = ['csv', 'pdf'];

const router: Router = Router({ mergeParams: true });

router.get('/',
    authenticate([Role.USER, Role.ADMIN]),
    param('barId')
        .isMongoId().withMessage('El ID del bar es inválido'),
    query('kind')
        .exists().withMessage('kind es requerido')
        .bail()
        .isIn(REPORT_KINDS).withMessage(`kind debe ser uno de: ${REPORT_KINDS.join(', ')}`),
    query('format')
        .exists().withMessage('format es requerido')
        .bail()
        .isIn(FORMAT_VALUES).withMessage(`format debe ser uno de: ${FORMAT_VALUES.join(', ')}`),
    query('from')
        .exists().withMessage('from es requerido')
        .bail()
        .isISO8601().withMessage('from debe ser una fecha ISO8601'),
    query('to')
        .exists().withMessage('to es requerido')
        .bail()
        .isISO8601().withMessage('to debe ser una fecha ISO8601'),
    handleInputErrors,
    ReportController.getReport
);

export default router;
