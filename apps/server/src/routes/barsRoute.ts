import { Router } from "express";
import { query } from "express-validator";
import { BarController } from "../controllers/BarController";
import { authenticate } from "../middleware/auth";
import { handleInputErrors } from "../middleware/validation";
import { Role } from "../models/User";

const router: Router = Router();

// LB-79: listado de bares ACTIVE para explorar (puntos de HOY + búsqueda por
// nombre). Prefijo PLURAL `/api/bars` (a diferencia del resto de `barRoute.ts`,
// que cuelga de `/api/bar` singular). Este router solo declara `GET /`, así
// que no colisiona con `/api/bars/:barId/rewards` (LB-67/LB-72) ya montado en
// server.ts — igual se registra DESPUÉS de ese mount para no depender del
// orden interno de matching de Express (ver progress/explorers/exp_LB-79.md
// §4/§8.5).
router.get('/',
    authenticate([Role.USER, Role.ADMIN]),
    query('search').optional().isString().withMessage('search debe ser texto'),
    handleInputErrors,
    BarController.listBars
);

export default router;
