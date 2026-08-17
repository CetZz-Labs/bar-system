import { Request, Response } from "express";
import Group from "../models/Group";
import Outing, { OutingStatus } from "../models/Outing";
import Reward, { IReward, RewardStatus } from "../models/Reward";
import { getAvailablePointsForBar } from "../utils/redemptionAvailability";

// LB-72: recompensas disponibles + saldo por bar, en un solo round-trip,
// para el líder/miembro del grupo. Resuelve el bar internamente vía la
// `Outing` ACTIVE del grupo (mismo patrón que
// RewardController.getAvailableRewards, no se confía en un `barId` del
// cliente aunque el query param exista en la URL — decisión explícita del
// leader, ver progress/explorers/exp_LB-72.md §2/§7).
//
// Reusa `getAvailablePointsForBar` de utils/redemptionAvailability.ts
// (código de LB-68, pausado, importado tal cual sin modificarlo) para el
// cálculo de saldo por bar — no se duplica esa lógica acá.

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

// Duplicado intencional de RewardController.toRewardDTO (no exportada por
// ese archivo, y RewardController.ts es de otro ticket/alcance — no se
// toca). Mismo patrón de duplicación ya documentado en el repo para
// isMongoDuplicateKeyError (ver comentario de cabecera de RewardController.ts).
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

export class GroupRewardsController {
    /**
     * GET /api/groups/:groupId/rewards?barId=X
     * Cualquier miembro del grupo (mismo criterio de acceso que
     * RewardController.getAvailableRewards). El `barId` de query, si viene,
     * se ignora del lado del servidor: el bar se resuelve siempre vía la
     * `Outing` ACTIVE del grupo. Si no hay salida activa, responde
     * `{ rewards: [], balance: 0 }` con 200 (mismo criterio "sin salida
     * activa" que ya usa getAvailableRewards, no es un error).
     */
    static getAvailable = async (req: Request, res: Response) => {
        const userId = req.user!._id.toString();
        const groupId = req.params.groupId as string;

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
            res.status(200).json({ rewards: [], balance: 0 });
            return;
        }

        const barId = outing.bar.toString();

        const [rewards, balance] = await Promise.all([
            Reward.find({
                bar: outing.bar,
                status: RewardStatus.ACTIVE,
                deletedAt: null,
                $or: [{ unlimitedStock: true }, { stock: { $gt: 0 } }],
            }).sort({ pointsRequired: 1 }),
            getAvailablePointsForBar(groupId, barId),
        ]);

        res.status(200).json({ rewards: rewards.map(toRewardDTO), balance });
    };
}
