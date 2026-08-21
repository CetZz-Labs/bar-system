import { Request, Response } from "express";
import DrinkCategory, { DrinkCategoryStatus, IDrinkCategory } from "../models/DrinkCategory";
import BarUser, { BarUserRole } from "../models/BarUser";

const NAME_MIN_LENGTH = 1;
const NAME_MAX_LENGTH = 100;
const MIN_ACTIVE_CATEGORIES = 3;
const MAX_ACTIVE_CATEGORIES = 20;

export class DrinkCategoryController {
    /**
     * POST /api/bar/:barId/categories
     * Create a new drink category. Only OWNER.
     */
    static createCategory = async (req: Request, res: Response) => {
        const userId = req.user!._id.toString();
        const barId = req.params.barId as string;
        const { name, price } = req.body;

        // Verify OWNER access
        const barUser = await BarUser.findOne({ bar: barId, user: userId });
        if (!barUser || barUser.role !== BarUserRole.OWNER) {
            res.status(403).json({ message: 'Solo el dueño del bar puede administrar categorías' });
            return;
        }

        // Validate name
        const trimmedName = (name as string).trim();
        if (trimmedName.length < NAME_MIN_LENGTH || trimmedName.length > NAME_MAX_LENGTH) {
            res.status(400).json({
                message: `El nombre debe tener entre ${NAME_MIN_LENGTH} y ${NAME_MAX_LENGTH} caracteres`,
            });
            return;
        }

        // Check duplicate name (excluding deleted)
        const existing = await DrinkCategory.findOne({
            bar: barId,
            name: { $regex: new RegExp(`^${trimmedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
            status: { $ne: DrinkCategoryStatus.DELETED },
        });
        if (existing) {
            res.status(409).json({ message: 'Ya existe una categoría con ese nombre' });
            return;
        }

        // Check max active limit (only if creating an active category — default is active)
        const activeCount = await DrinkCategory.countDocuments({
            bar: barId,
            status: DrinkCategoryStatus.ACTIVE,
        });
        if (activeCount >= MAX_ACTIVE_CATEGORIES) {
            res.status(400).json({
                message: `No se pueden crear más de ${MAX_ACTIVE_CATEGORIES} categorías activas`,
            });
            return;
        }

        // Validate price
        if (price !== undefined && price !== null) {
            if (typeof price !== 'number' || price < 0) {
                res.status(400).json({ message: 'El precio debe ser un número no negativo' });
                return;
            }
        }

        const category = await DrinkCategory.create({
            bar: barId,
            name: trimmedName,
            price: price ?? undefined,
            status: DrinkCategoryStatus.ACTIVE,
        });

        res.status(201).json({
            id: category._id,
            barId: category.bar,
            name: category.name,
            price: category.price,
            status: category.status,
            createdAt: category.createdAt,
        });
    };

    /**
     * GET /api/bar/:barId/categories
     * List categories. CASHIER sees only active (alphabetical).
     * OWNER sees all non-deleted (alphabetical).
     */
    static listCategories = async (req: Request, res: Response) => {
        const userId = req.user!._id.toString();
        const barId = req.params.barId as string;

        const barUser = await BarUser.findOne({ bar: barId, user: userId });
        if (!barUser) {
            res.status(403).json({ message: 'No tenés acceso a este bar' });
            return;
        }

        const isOwner = barUser.role === BarUserRole.OWNER;

        const filter: Record<string, unknown> = { bar: barId };
        if (!isOwner) {
            // CASHIER: only active
            filter.status = DrinkCategoryStatus.ACTIVE;
        } else {
            // OWNER: all except deleted
            filter.status = { $ne: DrinkCategoryStatus.DELETED };
        }

        const categories = await DrinkCategory.find(filter)
            .select('name price status createdAt')
            .sort({ name: 1 })
            .lean();

        // Soft warning for OWNER if less than 3 active
        let warning: string | undefined;
        if (isOwner) {
            const activeCount = categories.filter(
                (c) => c.status === DrinkCategoryStatus.ACTIVE
            ).length;
            if (activeCount < MIN_ACTIVE_CATEGORIES) {
                warning = `Tenés ${activeCount} categorías activas. Considerá agregar al menos ${MIN_ACTIVE_CATEGORIES} para una mejor experiencia del cajero.`;
            }
        }

        const result = categories.map((c) => ({
            id: c._id,
            barId: c.bar,
            name: c.name,
            price: c.price,
            status: c.status,
            createdAt: c.createdAt,
        }));

        res.status(200).json({ categories: result, warning });
    };

    /**
     * PUT /api/bar/:barId/categories/:categoryId
     * Edit a category. Only OWNER.
     */
    static updateCategory = async (req: Request, res: Response) => {
        const userId = req.user!._id.toString();
        const barId = req.params.barId as string;
        const categoryId = req.params.categoryId as string;
        const { name, price } = req.body;

        // Verify OWNER access
        const barUser = await BarUser.findOne({ bar: barId, user: userId });
        if (!barUser || barUser.role !== BarUserRole.OWNER) {
            res.status(403).json({ message: 'Solo el dueño del bar puede administrar categorías' });
            return;
        }

        const category = await DrinkCategory.findOne({
            _id: categoryId,
            bar: barId,
            status: { $ne: DrinkCategoryStatus.DELETED },
        });
        if (!category) {
            res.status(404).json({ message: 'Categoría no encontrada' });
            return;
        }

        // Update name if provided
        if (name !== undefined) {
            const trimmedName = (name as string).trim();
            if (trimmedName.length < NAME_MIN_LENGTH || trimmedName.length > NAME_MAX_LENGTH) {
                res.status(400).json({
                    message: `El nombre debe tener entre ${NAME_MIN_LENGTH} y ${NAME_MAX_LENGTH} caracteres`,
                });
                return;
            }

            // Check duplicate name (excluding self and deleted)
            const existing = await DrinkCategory.findOne({
                bar: barId,
                name: { $regex: new RegExp(`^${trimmedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
                status: { $ne: DrinkCategoryStatus.DELETED },
                _id: { $ne: categoryId },
            });
            if (existing) {
                res.status(409).json({ message: 'Ya existe una categoría con ese nombre' });
                return;
            }

            category.name = trimmedName;
        }

        // Update price if provided
        if (price !== undefined) {
            if (typeof price !== 'number' || price < 0) {
                res.status(400).json({ message: 'El precio debe ser un número no negativo' });
                return;
            }
            category.price = price;
        }

        await category.save();

        res.status(200).json({
            id: category._id,
            barId: category.bar,
            name: category.name,
            price: category.price,
            status: category.status,
        });
    };

    /**
     * PATCH /api/bar/:barId/categories/:categoryId/status
     * Toggle status between active/inactive. Only OWNER.
     */
    static toggleStatus = async (req: Request, res: Response) => {
        const userId = req.user!._id.toString();
        const barId = req.params.barId as string;
        const categoryId = req.params.categoryId as string;
        const { status } = req.body;

        // Verify OWNER access
        const barUser = await BarUser.findOne({ bar: barId, user: userId });
        if (!barUser || barUser.role !== BarUserRole.OWNER) {
            res.status(403).json({ message: 'Solo el dueño del bar puede administrar categorías' });
            return;
        }

        // Validate target status
        if (status !== DrinkCategoryStatus.ACTIVE && status !== DrinkCategoryStatus.INACTIVE) {
            res.status(400).json({ message: 'El estado debe ser "active" o "inactive"' });
            return;
        }

        const category = await DrinkCategory.findOne({
            _id: categoryId,
            bar: barId,
            status: { $ne: DrinkCategoryStatus.DELETED },
        });
        if (!category) {
            res.status(404).json({ message: 'Categoría no encontrada' });
            return;
        }

        // If activating, check max limit
        if (status === DrinkCategoryStatus.ACTIVE && category.status !== DrinkCategoryStatus.ACTIVE) {
            const activeCount = await DrinkCategory.countDocuments({
                bar: barId,
                status: DrinkCategoryStatus.ACTIVE,
            });
            if (activeCount >= MAX_ACTIVE_CATEGORIES) {
                res.status(400).json({
                    message: `No se pueden tener más de ${MAX_ACTIVE_CATEGORIES} categorías activas`,
                });
                return;
            }
        }

        category.status = status;
        await category.save();

        res.status(200).json({
            id: category._id,
            barId: category.bar,
            name: category.name,
            price: category.price,
            status: category.status,
        });
    };

    /**
     * DELETE /api/bar/:barId/categories/:categoryId
     * Soft-delete (mark as deleted). Only OWNER.
     */
    static deleteCategory = async (req: Request, res: Response) => {
        const userId = req.user!._id.toString();
        const barId = req.params.barId as string;
        const categoryId = req.params.categoryId as string;

        // Verify OWNER access
        const barUser = await BarUser.findOne({ bar: barId, user: userId });
        if (!barUser || barUser.role !== BarUserRole.OWNER) {
            res.status(403).json({ message: 'Solo el dueño del bar puede administrar categorías' });
            return;
        }

        const category = await DrinkCategory.findOne({
            _id: categoryId,
            bar: barId,
            status: { $ne: DrinkCategoryStatus.DELETED },
        });
        if (!category) {
            res.status(404).json({ message: 'Categoría no encontrada' });
            return;
        }

        category.status = DrinkCategoryStatus.DELETED;
        await category.save();

        res.status(200).json({ message: 'Categoría eliminada' });
    };
}
