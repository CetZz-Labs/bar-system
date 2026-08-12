import { Request, Response } from "express";
import mongoose, { Types } from "mongoose";
import Outing, { OutingStatus } from "../models/Outing";
import Notification, { NotificationType } from "../models/Notification";
import Group, { IGroupMembership } from "../models/Group";
import Bar, { BarStatus, IAttendancePointsByDay, IBar } from "../models/Bar";
import { MembershipRole } from "../models/User";

// Bares registrados antes de LB-59 no tienen `attendancePointsByDay`
// persistido en Mongo (ver comentario en models/Bar.ts). Al congelar el
// snapshot (createOuting/updateOuting) se usa este mapa de ceros como
// fallback, mismo criterio que ya existía para la lectura por-día previa a
// LB-65.
const ZERO_ATTENDANCE_POINTS_BY_DAY: IAttendancePointsByDay = {
    monday: 0,
    tuesday: 0,
    wednesday: 0,
    thursday: 0,
    friday: 0,
    saturday: 0,
    sunday: 0,
};

const NOTE_MAX_LENGTH = 200;
const MAX_DAYS_AHEAD = 30;
const ACTIVE_STATUSES = [OutingStatus.PENDING, OutingStatus.ACTIVE];

function isMongoDuplicateKeyError(error: unknown): error is { code: number } {
    return typeof error === 'object' && error !== null && 'code' in error;
}

function getLeaderOrCoLeaderRole(memberships: IGroupMembership[], userId: string) {
    const membership = memberships.find((m) => m.user.toString() === userId);
    if (!membership) return { isMember: false, isLeaderOrCoLeader: false };
    const isLeaderOrCoLeader = membership.role === MembershipRole.LEADER || membership.role === MembershipRole.CO_LEADER;
    return { isMember: true, isLeaderOrCoLeader };
}

function validateScheduledFor(scheduledFor: unknown): { error?: string; date?: Date } {
    if (!scheduledFor) {
        return { error: 'La fecha de la salida es requerida' };
    }

    const date = new Date(scheduledFor as string);
    if (isNaN(date.getTime())) {
        return { error: 'La fecha de la salida es inválida' };
    }

    const now = new Date();
    const maxDate = new Date(now.getTime() + MAX_DAYS_AHEAD * 24 * 60 * 60 * 1000);

    if (date < now) {
        return { error: 'La fecha de la salida no puede ser en el pasado' };
    }

    if (date > maxDate) {
        return { error: `La fecha de la salida no puede ser más de ${MAX_DAYS_AHEAD} días en el futuro` };
    }

    return { date };
}

function validateNote(note: unknown): { error?: string; note?: string } {
    if (note === undefined || note === null || note === '') {
        return { note: undefined };
    }
    if (typeof note !== 'string' || note.length > NOTE_MAX_LENGTH) {
        return { error: `La nota no puede superar los ${NOTE_MAX_LENGTH} caracteres` };
    }
    return { note: note.trim() || undefined };
}

function resolveInvitees(
    memberships: IGroupMembership[],
    leaderId: string,
    creatorId: string,
    inviteeIds: unknown
): { error?: string; invalidIds?: string[]; invitees?: string[] } {
    const memberIds = memberships.map((m) => m.user.toString());

    let invitees: string[];
    if (inviteeIds === undefined) {
        invitees = [...memberIds];
    } else {
        if (!Array.isArray(inviteeIds)) {
            return { error: 'inviteeIds debe ser un arreglo de IDs de miembros del grupo' };
        }
        const invalidIds = inviteeIds.filter((id: unknown) => typeof id !== 'string' || !memberIds.includes(id));
        if (invalidIds.length > 0) {
            return { error: 'Hay invitados que no son miembros del grupo', invalidIds };
        }
        invitees = [...new Set(inviteeIds as string[])];
    }

    // El líder del grupo y quien crea/edita la salida siempre quedan invitados,
    // sin importar lo que mande el cliente.
    if (!invitees.includes(leaderId)) invitees.push(leaderId);
    if (!invitees.includes(creatorId)) invitees.push(creatorId);

    return { invitees };
}

export class OutingController {
    static createOuting = async (req: Request, res: Response) => {
        const session = await mongoose.startSession();
        try {
            const userId = req.user!._id.toString();
            const groupId = req.params.groupId as string;
            const { barId, scheduledFor, note, inviteeIds } = req.body;

            const group = await Group.findById(groupId).lean();
            if (!group) {
                res.status(404).json({ message: 'Grupo no encontrado' });
                return;
            }

            const { isLeaderOrCoLeader } = getLeaderOrCoLeaderRole(group.memberships, userId);
            if (!isLeaderOrCoLeader) {
                res.status(403).json({ message: 'Solo el líder o co-líder del grupo puede crear una salida' });
                return;
            }

            if (!barId) {
                res.status(400).json({ message: 'Debés seleccionar un bar' });
                return;
            }

            const bar = await Bar.findById(barId).lean();
            if (!bar || bar.status !== BarStatus.ACTIVE) {
                res.status(400).json({ message: 'El bar seleccionado no está disponible' });
                return;
            }

            const { error: dateError, date: scheduledForDate } = validateScheduledFor(scheduledFor);
            if (dateError) {
                res.status(400).json({ message: dateError });
                return;
            }

            // Snapshot no-retroactivo de puntos por asistencia (LB-59, rework LB-65).
            // Acá solo se congela el mapa COMPLETO `bar.attendancePointsByDay`
            // vigente al crear la salida — no se resuelve todavía qué día de ese
            // mapa corresponde usar. Esa decisión se toma recién en el momento
            // real de la acreditación (LB-61, vía awardAttendancePointsIfFirst en
            // utils/attendancePoints.ts), porque `scheduledFor` puede caer cerca
            // del `closingTime` del bar y el día de bar real de la acreditación
            // puede diferir del que se calcularía acá en la creación. Ver
            // progress/explorers/exp_snapshot-vs-checkin.md. Se copian los valores
            // (spread) en vez de reasignar la referencia del objeto leído del bar,
            // para que el snapshot quede realmente congelado por valor.
            const attendancePointsSnapshot: IAttendancePointsByDay = bar.attendancePointsByDay
                ? { ...bar.attendancePointsByDay }
                : { ...ZERO_ATTENDANCE_POINTS_BY_DAY };

            const { error: noteError, note: cleanNote } = validateNote(note);
            if (noteError) {
                res.status(400).json({ message: noteError });
                return;
            }

            const leaderId = group.leader.toString();
            const { error: inviteesError, invalidIds, invitees } = resolveInvitees(
                group.memberships,
                leaderId,
                userId,
                inviteeIds
            );
            if (inviteesError) {
                res.status(400).json({ message: inviteesError, invalidIds });
                return;
            }

            session.startTransaction();

            const existing = await Outing.findOne(
                { group: groupId, status: { $in: ACTIVE_STATUSES } },
                null,
                { session }
            );

            if (existing) {
                await session.abortTransaction();
                res.status(409).json({
                    message: 'El grupo ya tiene una salida activa en este momento',
                    existingOutingId: existing._id,
                });
                return;
            }

            const created = await Outing.create([{
                group: groupId,
                bar: barId,
                createdBy: userId,
                scheduledFor: scheduledForDate,
                note: cleanNote,
                status: OutingStatus.PENDING,
                invitees,
                attendancePointsSnapshot,
            }], { session });

            const outing = created[0];

            const notifications = (invitees as string[]).map((inviteeId) => ({
                user: inviteeId,
                type: NotificationType.OUTING_CREATED,
                message: `Se creó una nueva salida del grupo a ${bar.name}`,
                relatedOuting: outing._id,
            }));

            if (notifications.length > 0) {
                await Notification.insertMany(notifications, { session });
            }

            await session.commitTransaction();

            const populated = await Outing.findById(outing._id)
                .populate('bar', 'name slug logoUrl address')
                .populate('createdBy', 'name lastName avatarUrl')
                .lean();

            res.status(201).json(populated);
        } catch (error) {
            if (session.inTransaction()) {
                await session.abortTransaction().catch(() => { });
            }

            // Defensa adicional: si dos requests concurrentes pasaron el chequeo de la
            // transacción, el índice único parcial en Mongo rechaza el duplicado acá.
            if (isMongoDuplicateKeyError(error) && error.code === 11000) {
                const groupId = req.params.groupId as string;
                const existing = await Outing.findOne({
                    group: groupId,
                    status: { $in: ACTIVE_STATUSES },
                }).lean();
                res.status(409).json({
                    message: 'El grupo ya tiene una salida activa en este momento',
                    existingOutingId: existing?._id,
                });
                return;
            }

            console.error(error);
            res.status(500).json({ message: 'Hubo un error al crear la salida' });
        } finally {
            session.endSession();
        }
    };

    static updateOuting = async (req: Request, res: Response) => {
        const session = await mongoose.startSession();
        try {
            const userId = req.user!._id.toString();
            const groupId = req.params.groupId as string;
            const outingId = req.params.outingId as string;
            const { barId, scheduledFor, note, inviteeIds } = req.body;

            const group = await Group.findById(groupId).lean();
            if (!group) {
                res.status(404).json({ message: 'Grupo no encontrado' });
                return;
            }

            const { isLeaderOrCoLeader } = getLeaderOrCoLeaderRole(group.memberships, userId);
            if (!isLeaderOrCoLeader) {
                res.status(403).json({ message: 'Solo el líder o co-líder del grupo puede editar la salida' });
                return;
            }

            const outing = await Outing.findOne({ _id: outingId, group: groupId });
            if (!outing) {
                res.status(404).json({ message: 'Salida no encontrada' });
                return;
            }

            if (outing.status !== OutingStatus.PENDING) {
                res.status(409).json({ message: 'La salida ya no puede editarse porque ya hubo check-in u otro cambio de estado' });
                return;
            }

            let bar: Pick<IBar, 'name' | 'status' | 'closingTime' | 'attendancePointsByDay'> | null = null;
            if (barId !== undefined) {
                bar = await Bar.findById(barId).lean();
                if (!bar || bar.status !== BarStatus.ACTIVE) {
                    res.status(400).json({ message: 'El bar seleccionado no está disponible' });
                    return;
                }
            }

            let scheduledForDate: Date | undefined;
            if (scheduledFor !== undefined) {
                const { error: dateError, date } = validateScheduledFor(scheduledFor);
                if (dateError) {
                    res.status(400).json({ message: dateError });
                    return;
                }
                scheduledForDate = date;
            }

            // Recálculo no-retroactivo del snapshot de puntos por asistencia (LB-63,
            // fix de seguimiento de LB-59; shape actualizado por LB-65). Al llegar
            // acá la salida ya está garantizada PENDING por el guard de arriba
            // (línea ~257), así que si el PATCH cambia el `barId` a uno distinto del
            // actual, el snapshot debe recalcularse contra el bar nuevo — si no,
            // queda "pegado" a la config del bar original. Igual que en createOuting
            // (LB-65), acá solo se copia el mapa completo `bar.attendancePointsByDay`
            // del bar nuevo; qué día de ese mapa corresponde usar se resuelve recién
            // en el momento real de la acreditación (LB-61).
            let attendancePointsSnapshot: IAttendancePointsByDay | undefined;
            if (barId !== undefined && bar && barId !== outing.bar.toString()) {
                attendancePointsSnapshot = bar.attendancePointsByDay
                    ? { ...bar.attendancePointsByDay }
                    : { ...ZERO_ATTENDANCE_POINTS_BY_DAY };
            }

            let cleanNote: string | undefined;
            let noteProvided = false;
            if (note !== undefined) {
                noteProvided = true;
                const { error: noteError, note: parsedNote } = validateNote(note);
                if (noteError) {
                    res.status(400).json({ message: noteError });
                    return;
                }
                cleanNote = parsedNote;
            }

            let invitees: string[] | undefined;
            if (inviteeIds !== undefined) {
                const leaderId = group.leader.toString();
                const { error: inviteesError, invalidIds, invitees: resolvedInvitees } = resolveInvitees(
                    group.memberships,
                    leaderId,
                    userId,
                    inviteeIds
                );
                if (inviteesError) {
                    res.status(400).json({ message: inviteesError, invalidIds });
                    return;
                }
                invitees = resolvedInvitees;
            }

            session.startTransaction();

            if (barId !== undefined) outing.bar = barId;
            if (attendancePointsSnapshot !== undefined) outing.attendancePointsSnapshot = attendancePointsSnapshot;
            if (scheduledForDate) outing.scheduledFor = scheduledForDate;
            if (noteProvided) outing.note = cleanNote;
            if (invitees) outing.invitees = invitees.map((id) => new Types.ObjectId(id));

            await outing.save({ session });

            const finalInvitees = invitees ?? outing.invitees.map((i) => i.toString());
            const notifications = finalInvitees.map((inviteeId) => ({
                user: inviteeId,
                type: NotificationType.OUTING_UPDATED,
                message: 'La salida del grupo fue actualizada',
                relatedOuting: outing._id,
            }));

            if (notifications.length > 0) {
                await Notification.insertMany(notifications, { session });
            }

            await session.commitTransaction();

            const populated = await Outing.findById(outing._id)
                .populate('bar', 'name slug logoUrl address')
                .populate('createdBy', 'name lastName avatarUrl')
                .lean();

            res.status(200).json(populated);
        } catch (error) {
            if (session.inTransaction()) {
                await session.abortTransaction().catch(() => { });
            }
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al actualizar la salida' });
        } finally {
            session.endSession();
        }
    };

    static cancelOuting = async (req: Request, res: Response) => {
        const session = await mongoose.startSession();
        try {
            const userId = req.user!._id.toString();
            const groupId = req.params.groupId as string;
            const outingId = req.params.outingId as string;

            const group = await Group.findById(groupId).lean();
            if (!group) {
                res.status(404).json({ message: 'Grupo no encontrado' });
                return;
            }

            const { isLeaderOrCoLeader } = getLeaderOrCoLeaderRole(group.memberships, userId);
            if (!isLeaderOrCoLeader) {
                res.status(403).json({ message: 'Solo el líder o co-líder del grupo puede cancelar la salida' });
                return;
            }

            const outing = await Outing.findOne({ _id: outingId, group: groupId });
            if (!outing) {
                res.status(404).json({ message: 'Salida no encontrada' });
                return;
            }

            // Idempotencia: un doble tap sobre "cancelar" no debe re-notificar ni fallar.
            if (outing.status === OutingStatus.CANCELLED) {
                const populated = await Outing.findById(outing._id)
                    .populate('bar', 'name slug logoUrl address')
                    .populate('createdBy', 'name lastName avatarUrl')
                    .lean();
                res.status(200).json(populated);
                return;
            }

            if (outing.status !== OutingStatus.PENDING) {
                res.status(409).json({ message: 'La salida ya no puede cancelarse porque ya hubo check-in u otro cambio de estado' });
                return;
            }

            const bar = await Bar.findById(outing.bar).select('name').lean();

            session.startTransaction();

            outing.status = OutingStatus.CANCELLED;
            outing.canceledBy = new Types.ObjectId(userId);
            outing.canceledAt = new Date();

            await outing.save({ session });

            const formattedDate = outing.scheduledFor.toLocaleString('es-AR', {
                dateStyle: 'medium',
                timeStyle: 'short',
            });

            const invitees = outing.invitees.map((inviteeId) => inviteeId.toString());
            const notifications = invitees.map((inviteeId) => ({
                user: inviteeId,
                type: NotificationType.OUTING_CANCELLED,
                message: `La salida a ${bar?.name ?? 'el bar'} del ${formattedDate} fue cancelada`,
                relatedOuting: outing._id,
            }));

            if (notifications.length > 0) {
                await Notification.insertMany(notifications, { session });
            }

            await session.commitTransaction();

            const populated = await Outing.findById(outing._id)
                .populate('bar', 'name slug logoUrl address')
                .populate('createdBy', 'name lastName avatarUrl')
                .lean();

            res.status(200).json(populated);
        } catch (error) {
            if (session.inTransaction()) {
                await session.abortTransaction().catch(() => { });
            }
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al cancelar la salida' });
        } finally {
            session.endSession();
        }
    };

    // Confirmación de check-in por parte del cajero (LB-55). A diferencia del resto
    // de los métodos de este controller, no usa req.user/req.params.groupId: quien
    // llama es un cajero autenticado vía authenticateCashier (req.cashierContext),
    // no un miembro del grupo.
    static confirmCheckIn = async (req: Request, res: Response) => {
        const session = await mongoose.startSession();
        try {
            const cashierContext = req.cashierContext!;
            const outingId = req.params.outingId as string;

            const outing = await Outing.findOne({ _id: outingId });
            if (!outing) {
                res.status(404).json({ message: 'Salida no encontrada' });
                return;
            }

            // Mismo patrón que ConsumptionController.createConsumption: el cajero
            // solo puede operar sobre salidas de su propio bar.
            if (outing.bar.toString() !== cashierContext.bar.toString()) {
                res.status(403).json({ message: 'Esta salida no pertenece a tu bar' });
                return;
            }

            // Idempotencia: un doble tap sobre "confirmar check-in" no debe re-notificar
            // ni pisar checkedInAt/checkedInBy. Mismo criterio que cancelOuting.
            if (outing.status === OutingStatus.ACTIVE) {
                const populated = await Outing.findById(outing._id)
                    .populate('bar', 'name slug logoUrl address')
                    .populate('createdBy', 'name lastName avatarUrl')
                    .lean();
                res.status(200).json(populated);
                return;
            }

            if (outing.status !== OutingStatus.PENDING) {
                res.status(409).json({ message: 'La salida ya no admite check-in' });
                return;
            }

            const bar = await Bar.findById(outing.bar).select('checkInWindowHours').lean();
            const checkInWindowHours = bar?.checkInWindowHours ?? 4;

            const now = new Date();
            const windowEnd = new Date(outing.scheduledFor.getTime() + checkInWindowHours * 60 * 60 * 1000);

            if (now < outing.scheduledFor) {
                res.status(409).json({ message: 'Todavía no es la hora pactada de la salida' });
                return;
            }

            if (now > windowEnd) {
                res.status(409).json({ message: 'La ventana de check-in ya expiró' });
                return;
            }

            const group = await Group.findById(outing.group).select('memberships').lean();

            session.startTransaction();

            outing.status = OutingStatus.ACTIVE;
            outing.checkedInAt = now;
            outing.checkedInBy = cashierContext.user._id;

            await outing.save({ session });

            const leadersAndCoLeaders = (group?.memberships ?? []).filter(
                (m) => m.role === MembershipRole.LEADER || m.role === MembershipRole.CO_LEADER
            );

            const notifications = leadersAndCoLeaders.map((membership) => ({
                user: membership.user,
                type: NotificationType.OUTING_CHECKED_IN,
                message: 'Se confirmó el check-in de la salida del grupo',
                relatedOuting: outing._id,
            }));

            if (notifications.length > 0) {
                await Notification.insertMany(notifications, { session });
            }

            await session.commitTransaction();

            const populated = await Outing.findById(outing._id)
                .populate('bar', 'name slug logoUrl address')
                .populate('createdBy', 'name lastName avatarUrl')
                .lean();

            res.status(200).json(populated);
        } catch (error) {
            if (session.inTransaction()) {
                await session.abortTransaction().catch(() => { });
            }
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al confirmar el check-in' });
        } finally {
            session.endSession();
        }
    };

    static getActiveOuting = async (req: Request, res: Response) => {
        try {
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

            const outing = await Outing.findOne({ group: groupId, status: { $in: ACTIVE_STATUSES } })
                .populate('bar', 'name slug logoUrl address')
                .populate('createdBy', 'name lastName avatarUrl')
                .lean();

            if (!outing) {
                res.status(404).json({ message: 'No hay una salida activa para este grupo' });
                return;
            }

            res.status(200).json(outing);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al obtener la salida activa' });
        }
    };
}
