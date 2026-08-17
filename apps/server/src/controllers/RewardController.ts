import { Request, Response } from "express";
import Group from "../models/Group";
import Outing, { OutingStatus } from "../models/Outing";
import Reward, { IReward, RewardStatus } from "../models/Reward";
import { BarUserRole } from "../models/BarUser";
import { verifyBarAccess } from "../utils/barAccess";

// LB-67: ABM de recompensas del bar. No existe middleware OWNER-only
// reusable en el repo (ver progress/explorers/exp_LB-67.md §3) — el
// chequeo de rol se resuelve acá, mismo patrón manual que
// BarController.updateBarProfile (verifyBarAccess + chequeo explícito de
// `role`, en vez de un middleware compartido).

// Duplicado intencional del type guard de OutingController.ts (no se
// extrae a utils/ para no tocar ese archivo fuera del alcance de este
// ticket — ver progress/implementers/impl_LB-67.md).
function isMongoDuplicateKeyError(error: unknown): error is { code: number } {
    return typeof error === 'object' && error !== null && 'code' in error;
}

interface OwnerAccessGranted {
    ok: true;
}

interface OwnerAccessDenied {
    ok: false;
    status: number;
    message: string;
}

async function resolveOwnerAccess(userId: string, barId: string): Promise<OwnerAccessGranted | OwnerAccessDenied> {
    const { hasAccess, role } = await verifyBarAccess(userId, barId);
    if (!hasAccess) {
        return { ok: false, status: 403, message: 'No tenés acceso a este bar' };
    }
    if (role !== BarUserRole.OWNER) {
        return { ok: false, status: 403, message: 'Solo el dueño del bar puede gestionar las recompensas' };
    }
    return { ok: true };
}

interface RewardDTO {
    id: string;
    bar: string;
    name: string;
    description?: string;
    pointsRequired: number;
    unlimitedStock: boolean;
    stock?: number;
    status: RewardStatus;
    createdAt: Date;
    updatedAt: Date;
}

function toRewardDTO(reward: IReward): RewardDTO {
    return {
        id: reward._id.toString(),
        bar: reward.bar.toString(),
        name: reward.name,
        description: reward.description,
        pointsRequired: reward.pointsRequired,
        unlimitedStock: reward.unlimitedStock,
        stock: reward.stock,
        status: reward.status,
        createdAt: reward.createdAt,
        updatedAt: reward.updatedAt,
    };
}

export class RewardController {
    /**
     * GET /api/bars/:barId/rewards
     * Cualquier BarUser del bar (OWNER o CASHIER) puede listar. Devuelve
     * activas e inactivas (vista de gestión, no la pública), excluye
     * soft-deleted.
     */
    static listRewards = async (req: Request, res: Response) => {
        const userId = req.user!._id.toString();
        const barId = req.params.barId as string;

        const { hasAccess } = await verifyBarAccess(userId, barId);
        if (!hasAccess) {
            res.status(403).json({ message: 'No tenés acceso a este bar' });
            return;
        }

        const rewards = await Reward.find({ bar: barId, deletedAt: null }).sort({ createdAt: -1 });
        res.status(200).json(rewards.map(toRewardDTO));
    };

    /**
     * POST /api/bars/:barId/rewards — solo OWNER.
     */
    static createReward = async (req: Request, res: Response) => {
        const userId = req.user!._id.toString();
        const barId = req.params.barId as string;

        const access = await resolveOwnerAccess(userId, barId);
        if (!access.ok) {
            res.status(access.status).json({ message: access.message });
            return;
        }

        const { name, description, pointsRequired, stock, unlimitedStock } = req.body;
        const unlimited = !!unlimitedStock;

        try {
            const reward = await Reward.create({
                bar: barId,
                name,
                description: description || undefined,
                pointsRequired,
                unlimitedStock: unlimited,
                stock: unlimited ? undefined : stock,
            });
            res.status(201).json(toRewardDTO(reward));
        } catch (error) {
            if (isMongoDuplicateKeyError(error) && error.code === 11000) {
                res.status(409).json({ message: 'Ya existe una recompensa con ese nombre en este bar' });
                return;
            }
            throw error;
        }
    };

    /**
     * PUT /api/bars/:barId/rewards/:rewardId — solo OWNER. Permite editar
     * cualquier campo, incluido `status` (así se resuelve activar/desactivar,
     * sin endpoint separado).
     */
    static updateReward = async (req: Request, res: Response) => {
        const userId = req.user!._id.toString();
        const barId = req.params.barId as string;
        const rewardId = req.params.rewardId as string;

        const access = await resolveOwnerAccess(userId, barId);
        if (!access.ok) {
            res.status(access.status).json({ message: access.message });
            return;
        }

        const reward = await Reward.findOne({ _id: rewardId, bar: barId, deletedAt: null });
        if (!reward) {
            res.status(404).json({ message: 'Recompensa no encontrada' });
            return;
        }

        const { name, description, pointsRequired, stock, unlimitedStock, status } = req.body;

        if (name !== undefined) reward.name = name;
        if (description !== undefined) reward.description = description || undefined;
        if (pointsRequired !== undefined) reward.pointsRequired = pointsRequired;
        if (unlimitedStock !== undefined) reward.unlimitedStock = unlimitedStock;
        if (stock !== undefined) reward.stock = stock;
        if (status !== undefined) reward.status = status;

        // Regla cross-field sobre el estado FINAL combinado (body + doc
        // existente): no puede resolverse solo con express-validator sobre
        // el body de un PUT parcial, porque depende de lo que ya había en
        // la base. Ver decisión documentada en
        // progress/implementers/impl_LB-67.md.
        if (reward.unlimitedStock) {
            reward.stock = undefined;
        } else if (reward.stock === undefined) {
            res.status(400).json({ message: 'Debés indicar el stock o marcar la recompensa como ilimitada' });
            return;
        }

        try {
            await reward.save();
        } catch (error) {
            if (isMongoDuplicateKeyError(error) && error.code === 11000) {
                res.status(409).json({ message: 'Ya existe una recompensa con ese nombre en este bar' });
                return;
            }
            throw error;
        }

        res.status(200).json(toRewardDTO(reward));
    };

    /**
     * DELETE /api/bars/:barId/rewards/:rewardId — solo OWNER. Soft-delete
     * (setea deletedAt). Idempotente: si ya estaba eliminada, responde 200
     * sin error (no 404) — ver decisión documentada en
     * progress/implementers/impl_LB-67.md.
     */
    static deleteReward = async (req: Request, res: Response) => {
        const userId = req.user!._id.toString();
        const barId = req.params.barId as string;
        const rewardId = req.params.rewardId as string;

        const access = await resolveOwnerAccess(userId, barId);
        if (!access.ok) {
            res.status(access.status).json({ message: access.message });
            return;
        }

        const reward = await Reward.findOne({ _id: rewardId, bar: barId });
        if (!reward) {
            res.status(404).json({ message: 'Recompensa no encontrada' });
            return;
        }

        if (!reward.deletedAt) {
            reward.deletedAt = new Date();
            await reward.save();
        }

        res.status(200).json({ message: 'Recompensa eliminada correctamente' });
    };

    /**
     * GET /api/rewards/available?groupId=<id>
     * Cualquier miembro del grupo. Devuelve las recompensas activas y
     * disponibles (stock>0, o ilimitadas) del bar de la salida ACTIVE
     * (check-in confirmado) del grupo. Si no hay salida en curso, devuelve
     * una lista vacía con 200 (no 404): es un endpoint de listado, y "sin
     * salida activa" es un estado válido, no un error del cliente — ver
     * decisión documentada en progress/implementers/impl_LB-67.md.
     */
    static getAvailableRewards = async (req: Request, res: Response) => {
        const userId = req.user!._id.toString();
        const groupId = req.query.groupId as string;

        const group = await Group.findById(groupId).select('memberships').lean();
        if (!group) {
            res.status(404).json({ message: 'Grupo no encontrado' });
            return;
        }

        const isMember = group.memberships.some((m) => m.user.toString() === userId);
        if (!isMember) {
            res.status(403).json({ message: 'No tenés acceso a este grupo' });
            return;
        }

        const outing = await Outing.findOne({ group: groupId, status: OutingStatus.ACTIVE }).select('bar').lean();
        if (!outing) {
            res.status(200).json([]);
            return;
        }

        const rewards = await Reward.find({
            bar: outing.bar,
            status: RewardStatus.ACTIVE,
            deletedAt: null,
            $or: [{ unlimitedStock: true }, { stock: { $gt: 0 } }],
        }).sort({ pointsRequired: 1 });

        res.status(200).json(rewards.map(toRewardDTO));
    };
}
