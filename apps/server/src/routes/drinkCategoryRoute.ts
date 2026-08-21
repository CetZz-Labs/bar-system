import { Router } from "express";
import { DrinkCategoryController } from "../controllers/DrinkCategoryController";
import { authenticate } from "../middleware/auth";
import { handleInputErrors } from "../middleware/validation";
import { body, param } from "express-validator";
import { Role } from "../models/User";

const router: Router = Router({ mergeParams: true });

// POST /api/bar/:barId/categories — Create category (OWNER)
router.post('/',
    authenticate([Role.USER, Role.ADMIN]),
    param('barId').isMongoId().withMessage('ID de bar inválido'),
    body('name')
        .notEmpty().withMessage('El nombre es requerido')
        .isLength({ min: 1, max: 100 }).withMessage('El nombre debe tener entre 1 y 100 caracteres'),
    body('price')
        .optional({ values: 'null' })
        .isFloat({ min: 0 }).withMessage('El precio debe ser un número no negativo'),
    handleInputErrors,
    DrinkCategoryController.createCategory
);

// GET /api/bar/:barId/categories — List categories (JWT required)
router.get('/',
    authenticate([Role.USER, Role.ADMIN]),
    param('barId').isMongoId().withMessage('ID de bar inválido'),
    handleInputErrors,
    DrinkCategoryController.listCategories
);

// PUT /api/bar/:barId/categories/:categoryId — Update category (OWNER)
router.put('/:categoryId',
    authenticate([Role.USER, Role.ADMIN]),
    param('barId').isMongoId().withMessage('ID de bar inválido'),
    param('categoryId').isMongoId().withMessage('ID de categoría inválido'),
    body('name')
        .optional()
        .isLength({ min: 1, max: 100 }).withMessage('El nombre debe tener entre 1 y 100 caracteres'),
    body('price')
        .optional({ values: 'null' })
        .isFloat({ min: 0 }).withMessage('El precio debe ser un número no negativo'),
    handleInputErrors,
    DrinkCategoryController.updateCategory
);

// PATCH /api/bar/:barId/categories/:categoryId/status — Toggle status (OWNER)
router.patch('/:categoryId/status',
    authenticate([Role.USER, Role.ADMIN]),
    param('barId').isMongoId().withMessage('ID de bar inválido'),
    param('categoryId').isMongoId().withMessage('ID de categoría inválido'),
    body('status')
        .notEmpty().withMessage('El estado es requerido')
        .isIn(['active', 'inactive']).withMessage('El estado debe ser "active" o "inactive"'),
    handleInputErrors,
    DrinkCategoryController.toggleStatus
);

// DELETE /api/bar/:barId/categories/:categoryId — Soft-delete (OWNER)
router.delete('/:categoryId',
    authenticate([Role.USER, Role.ADMIN]),
    param('barId').isMongoId().withMessage('ID de bar inválido'),
    param('categoryId').isMongoId().withMessage('ID de categoría inválido'),
    handleInputErrors,
    DrinkCategoryController.deleteCategory
);

export default router;
