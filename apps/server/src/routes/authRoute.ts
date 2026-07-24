import { Router } from "express";
import { AuthController } from "../controllers/AuthController";
import { body, param } from "express-validator";
import { handleInputErrors } from "../middleware/validation";
import { authenticate } from "../middleware/auth";
import { isOfLegalAge } from "../utils/age";

const router: Router = Router()

router.post('/register',
    body('name').notEmpty().withMessage('El nombre es requerido').isLength({ min: 3 }).withMessage('El nombre debe tener al menos 3 caracteres'),
    body('lastName').notEmpty().withMessage('El apellido es requerido').isLength({ min: 3 }).withMessage('El apellido debe tener al menos 3 caracteres'),
    body('email').notEmpty().withMessage('El email es requerido').isEmail().withMessage('El email es invalido'),
    body('password').notEmpty().withMessage('La contraseña es requerida').isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres'),
    body('confirmPassword').notEmpty().withMessage('La confirmacion de contraseña es requerida').isLength({ min: 8 }).withMessage('La confirmacion de contraseña debe tener al menos 8 caracteres'),
    body('birthdate')
        .notEmpty().withMessage('La fecha de nacimiento es requerida')
        .isDate().withMessage('La fecha de nacimiento es invalida')
        .custom((value) => {
            if (!isOfLegalAge(new Date(value))) {
                throw new Error('Debés ser mayor de 18 años para registrarte');
            }
            return true;
        }),
    handleInputErrors,
    AuthController.createAccount
)

router.post('/confirm-account',
    body('token').notEmpty().withMessage('El token es requerido'),
    handleInputErrors,
    AuthController.confirmAccount
)

router.post('/request-code',
    body('email').isEmail().withMessage('E-mail no valido'),
    handleInputErrors,
    AuthController.requestConfirmationCode
)

router.post('/validate-token',
    body('token').notEmpty().withMessage('El Token es obligatorio'),
    handleInputErrors,
    AuthController.validateToken
)

router.post('/forgot-password',
    body('email').isEmail().withMessage('E-mail no valido'),
    handleInputErrors,
    AuthController.forgotPassword
)

router.post('/update-password/:token',
    param('token').isNumeric().withMessage('Token no valido'),
    body('password')
        .isLength({ min: 8 }).withMessage('La contraseña es muy corta, minimo 8 caracteres'),
    body('confirmPassword').custom((value, { req }) => {
        if (req.body.password !== value) {
            throw new Error('Las contraseñas no son iguales')
        }
        return true
    }),
    handleInputErrors,
    AuthController.updatePasswordWithToken
)

router.post('/login',
    body('email').isEmail().withMessage('E-mail no valido'),
    body('password').notEmpty().withMessage('La contraseña es requerida'),
    handleInputErrors,
    AuthController.login
)

router.get('/logout',
    authenticate(),
    AuthController.logout
)

router.get('/session',
    authenticate(),
    AuthController.session
)

router.post('/onboarding',
    authenticate(),
    body('fullName').notEmpty().withMessage('El nombre completo es requerido').isLength({ min: 2, max: 50 }).withMessage('El nombre completo es requerido y debe tener entre 2 y 50 caracteres'),
    body('birthdate')
        .notEmpty().withMessage('La fecha de nacimiento es requerida')
        .isDate().withMessage('La fecha de nacimiento es invalida')
        .custom((value) => {
            if (!isOfLegalAge(new Date(value))) {
                throw new Error('Debés ser mayor de 18 años');
            }
            return true;
        }),
    handleInputErrors,
    AuthController.onboarding
)

router.get('/onboarding/profile',
    authenticate(),
    AuthController.getProfile
)

router.put('/profile',
    authenticate(),
    body('name').notEmpty().withMessage('El nombre es requerido').isLength({ min: 3 }).withMessage('El nombre debe tener al menos 3 caracteres'),
    body('lastName').notEmpty().withMessage('El apellido es requerido').isLength({ min: 3 }).withMessage('El apellido debe tener al menos 3 caracteres'),
    body('birthdate')
        .optional()
        .isDate().withMessage('La fecha de nacimiento es invalida')
        .custom((value) => {
            if (!isOfLegalAge(new Date(value))) {
                throw new Error('Debés ser mayor de 18 años');
            }
            return true;
        }),
    body('avatarUrl').optional().isURL().withMessage('El avatar URL es invalido'),
    handleInputErrors,
    AuthController.updateProfile
)

router.post('/update-password',
    authenticate(),
    body('currentPassword').notEmpty().withMessage('El password actual es requerido'),
    body('password').notEmpty().withMessage('La contraseña es requerida').isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres'),
    body('confirmPassword').custom((value, { req }) => {
        if (req.body.password !== value) {
            throw new Error('Las contraseñas no son iguales')
        }
        return true
    }),
    handleInputErrors,
    AuthController.updateCurrentUserPassword
)

export default router