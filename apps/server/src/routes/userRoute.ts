import { Router } from "express";
import { UserController } from "../controllers/UserController";
import { authenticate, requireCompleteProfile } from "../middleware/auth";
import { handleInputErrors } from "../middleware/validation";
import { body } from "express-validator";
import multer from "multer";
import { isOfLegalAge } from "../utils/age";

const router: Router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Proteger todas las rutas de usuarios
router.use(authenticate());

// Obtener perfil (no requiere perfil completo)
router.get("/profile", UserController.getUserProfile);

// Actualizar perfil (no requiere perfil completo — el usuario necesita poder llenarlo)
router.put(
    "/profile",
    body("name").optional().isString().withMessage("El nombre debe ser un texto"),
    body("lastName").optional().isString().withMessage("El apellido debe ser un texto"),
    body("birthdate")
        .optional()
        .isISO8601().withMessage("Fecha de nacimiento no válida")
        .custom((value) => {
            if (!isOfLegalAge(new Date(value))) {
                throw new Error('Debés ser mayor de 18 años');
            }
            return true;
        }),
    handleInputErrors,
    UserController.updateUserProfile
);

// Subir avatar (no requiere perfil completo — es parte del onboarding)
router.post(
    "/avatar",
    upload.single("avatar"),
    UserController.uploadAvatar
);

// Obtener grupos del usuario
router.get("/groups", UserController.getUserGroups);

export default router;
