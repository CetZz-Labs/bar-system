import { Request, Response } from 'express';
import Group from '../models/Group';
import Bar, { BarStatus } from '../models/Bar';
import Outing, { OutingStatus } from '../models/Outing';
import { MembershipRole } from '../models/User';

/**
 * Crear salida — contrato mínimo LB-49 para poder probar LB-54.
 * POST /api/outings { barId, scheduledFor, note?, invitedMemberIds? }
 */
export class OutingController {
    static create = async (req: Request, res: Response) => {
        try {
            const userId = req.user!._id;
            const { groupId, barId, scheduledFor, note, invitedMemberIds } = req.body as {
                groupId: string;
                barId: string;
                scheduledFor: string;
                note?: string;
                invitedMemberIds?: string[];
            };

            const group = await Group.findById(groupId);
            if (!group) {
                res.status(404).json({ message: 'Grupo no encontrado' });
                return;
            }

            const membership = group.memberships.find(
                (m) => m.user.toString() === userId.toString()
            );
            if (
                !membership ||
                (membership.role !== MembershipRole.LEADER &&
                    membership.role !== MembershipRole.CO_LEADER)
            ) {
                res.status(403).json({ message: 'Solo el líder o co-líder pueden crear una salida' });
                return;
            }

            const bar = await Bar.findById(barId);
            if (!bar || bar.status !== BarStatus.ACTIVE) {
                res.status(404).json({ message: 'Bar no encontrado o inactivo' });
                return;
            }

            const when = new Date(scheduledFor);
            if (Number.isNaN(when.getTime())) {
                res.status(400).json({ message: 'Fecha de salida inválida' });
                return;
            }

            const now = new Date();
            const max = new Date(now);
            max.setDate(max.getDate() + 30);
            if (when.getTime() < now.getTime() - 60_000 || when.getTime() > max.getTime()) {
                res.status(400).json({
                    message: 'La salida debe ser entre ahora y los próximos 30 días',
                });
                return;
            }

            const existingActive = await Outing.findOne({
                group: groupId,
                status: { $in: [OutingStatus.ACTIVE, OutingStatus.IN_PROGRESS] },
            });
            if (existingActive) {
                res.status(409).json({
                    message: 'El grupo ya tiene una salida activa. Cancelala antes de crear otra.',
                });
                return;
            }

            const memberIdSet = new Set(group.memberships.map((m) => m.user.toString()));
            let invitees: string[];
            if (Array.isArray(invitedMemberIds) && invitedMemberIds.length > 0) {
                invitees = invitedMemberIds.filter((id) => memberIdSet.has(id));
            } else {
                invitees = [...memberIdSet];
            }

            // Líder siempre invitado
            const leaderId = group.leader.toString();
            if (!invitees.includes(leaderId)) {
                invitees.push(leaderId);
            }

            const outing = await Outing.create({
                group: groupId,
                bar: barId,
                leader: group.leader,
                status: OutingStatus.ACTIVE,
                scheduledFor: when,
                note: note?.trim() || undefined,
                invitedMembers: invitees.map((id) => ({ user: id })),
            });

            res.status(201).json({
                id: outing._id,
                groupId,
                barId,
                status: outing.status,
                scheduledFor: outing.scheduledFor,
                invitedMemberIds: invitees,
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al crear la salida' });
        }
    };
}
