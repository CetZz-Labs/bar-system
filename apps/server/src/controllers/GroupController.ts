import { Request, Response } from "express";
import Group, { GroupType } from "../models/Group";
import User, { MembershipRole } from "../models/User";
import JoinRequest, { JoinRequestStatus } from "../models/JoinRequest";
import GroupBan from "../models/GroupBan";
import { GroupEmail } from "../emails/GroupEmail";
import { saveGroupAvatar } from "../utils/storage";
import { generateSlug } from "../utils/slug";
import { generateInviteCode } from "../utils/code";
import sharp from "sharp";
import path from "path";
import QRCode from "qrcode";

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB
const NAME_REGEX = /^[a-zA-Z0-9\s-]{3,40}$/;

async function getUniqueSlug(name: string): Promise<string> {
    const maxRetries = 10;
    let retries = 0;
    let slug: string;
    let exists = true;

    while (exists && retries < maxRetries) {
        slug = generateSlug(name);
        const existing = await Group.findOne({ slug });
        exists = !!existing;
        retries++;
    }

    if (exists) {
        throw new Error('No se pudo generar un slug único después de múltiples intentos');
    }

    return slug!;
}

async function getUniqueInviteCode(): Promise<string> {
    const maxRetries = 10;
    let retries = 0;
    let code: string;
    let exists = true;

    while (exists && retries < maxRetries) {
        code = generateInviteCode();
        const existing = await Group.findOne({ inviteCode: code });
        exists = !!existing;
        retries++;
    }

    if (exists) {
        throw new Error('No se pudo generar un código de invitación único después de múltiples intentos');
    }

    return code!;
}

export class GroupController {
    static createGroup = async (req: Request, res: Response) => {
        try {
            const userId = req.user!._id;

            // Validate name
            if (!NAME_REGEX.test(req.body.name)) {
                res.status(400).json({ message: "El nombre debe tener entre 3 y 40 caracteres alfanuméricos, espacios y guiones" });
                return;
            }

            // Validate type
            if (!['OPEN', 'CLOSED'].includes(req.body.type)) {
                res.status(400).json({ message: "El tipo debe ser OPEN o CLOSED" });
                return;
            }

            // Validate description
            if (req.body.description && req.body.description.length > 120) {
                res.status(400).json({ message: "La descripción no puede superar los 120 caracteres" });
                return;
            }

            // Check leader limit
            const user = await User.findById(userId);
            if (!user) {
                res.status(404).json({ message: "Usuario no encontrado" });
                return;
            }

            const leaderCount = user.memberships.filter(
                (m) => m.role === MembershipRole.LEADER
            ).length;

            if (leaderCount >= 3) {
                res.status(403).json({ message: "No podés liderar más de 3 grupos" });
                return;
            }

            // Check total group membership limit
            if (user.memberships.length >= 4) {
                res.status(403).json({ message: "No podés estar en más de 4 grupos al mismo tiempo" });
                return;
            }

            // Check duplicate name (case-insensitive exact match)
            const escapedName = req.body.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const existingGroup = await Group.findOne({
                name: { $regex: new RegExp(`^${escapedName}$`, 'i') }
            });

            if (existingGroup) {
                res.status(409).json({ message: "Ya existe un grupo con ese nombre" });
                return;
            }

            // Process optional photo
            let avatarUrl: string | undefined;
            if (req.file) {
                if (req.file.size > MAX_FILE_SIZE) {
                    res.status(400).json({ message: "El archivo supera el límite de 2 MB" });
                    return;
                }

                const resizedBuffer = await sharp(req.file.buffer)
                    .resize(512, 512, { fit: 'cover' })
                    .toBuffer();

                const ext = path.extname(req.file.originalname) || '.jpg';
                const filename = `${Date.now()}-${Math.random().toString(36).substring(2)}${ext}`;
                avatarUrl = await saveGroupAvatar(resizedBuffer, filename);
            }

            // Generate unique slug and invite code
            const slug = await getUniqueSlug(req.body.name);
            const inviteCode = await getUniqueInviteCode();

            // Create group with leader membership
            const group = new Group({
                name: req.body.name,
                slug,
                type: req.body.type,
                description: req.body.description,
                inviteCode,
                leader: userId,
                avatarUrl,
                memberships: [{ user: userId, role: MembershipRole.LEADER, joinedAt: new Date() }]
            });

            await group.save();

            // Update user memberships
            user.memberships.push({ group: group._id, role: MembershipRole.LEADER, joinedAt: new Date() });

            try {
                await user.save();
            } catch (error) {
                await group.deleteOne();
                throw error;
            }

            res.status(201).json(group);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Hubo un error al crear el grupo" });
        }
    };

    static getGroupBySlug = async (req: Request, res: Response) => {
        try {
            const userId = req.user!._id.toString();
            const { slug } = req.params;

            const group = await Group.findOne({ slug })
                .populate<{ memberships: { user: { _id: string; name: string; lastName: string; avatarUrl?: string }; role: MembershipRole; joinedAt: Date }[] }>('memberships.user', 'name lastName avatarUrl')
                .lean();

            if (!group) {
                res.status(404).json({ message: 'Grupo no encontrado' });
                return;
            }

            const isMember = group.memberships.some((m) => m.user._id.toString() === userId);
            if (!isMember) {
                res.status(403).json({ message: 'No tenés acceso a este grupo' });
                return;
            }

            const rolePriority: Record<MembershipRole, number> = {
                [MembershipRole.LEADER]: 0,
                [MembershipRole.CO_LEADER]: 1,
                [MembershipRole.MEMBER]: 2,
                [MembershipRole.ADMIN]: 3,
            };

            const sortedMembers = [...group.memberships].sort((a, b) => {
                const prioA = rolePriority[a.role];
                const prioB = rolePriority[b.role];
                if (prioA !== prioB) return prioA - prioB;
                return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
            });

            const currentUserMembership = group.memberships.find((m) => m.user._id.toString() === userId);
            const currentUserRole = currentUserMembership?.role;
            const isLeader = currentUserRole === MembershipRole.LEADER;
            const isLeaderOrCoLeader = isLeader || currentUserRole === MembershipRole.CO_LEADER;

            const members = sortedMembers.map((m) => ({
                id: m.user._id,
                name: `${m.user.name} ${m.user.lastName}`,
                avatarUrl: m.user.avatarUrl,
                role: m.role,
            }));

            let pendingRequestsCount = 0;
            if (isLeader) {
                pendingRequestsCount = await JoinRequest.countDocuments({
                    group: group._id,
                    status: JoinRequestStatus.PENDING,
                    expiresAt: { $gt: new Date() },
                });
            }

            res.status(200).json({
                id: group._id,
                name: group.name,
                slug: group.slug,
                type: group.type,
                description: group.description,
                avatarUrl: group.avatarUrl,
                memberCount: group.memberships.length,
                members,
                inviteCode: isLeaderOrCoLeader ? group.inviteCode : undefined,
                inviteLink: isLeaderOrCoLeader ? `labanda.app/unirse/${group.inviteCode}` : undefined,
                canManage: isLeader,
                currentUserRole,
                pendingRequestsCount,
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al obtener el grupo' });
        }
    };

    static getGroupByInviteCode = async (req: Request, res: Response) => {
        try {
            const { inviteCode } = req.params;

            const group = await Group.findOne({ inviteCode })
                .select('name slug type description avatarUrl inviteCode memberships leader')
                .lean();

            if (!group) {
                res.status(404).json({ message: 'Grupo no encontrado' });
                return;
            }

            const response: any = {
                id: group._id,
                name: group.name,
                slug: group.slug,
                type: group.type,
                description: group.description,
                avatarUrl: group.avatarUrl,
                memberCount: group.memberships.length,
                inviteCode: group.inviteCode,
            };

            // If user is authenticated, include their status relative to this group
            if (req.user) {
                const userId = req.user._id.toString();

                const isMember = group.memberships.some(
                    (m) => m.user.toString() === userId
                );

                if (isMember) {
                    response.userStatus = 'member';
                    response.message = 'Ya sos parte de este grupo';
                } else {
                    const isBanned = await GroupBan.exists({ group: group._id, user: req.user._id });
                    if (isBanned) {
                        response.userStatus = 'banned';
                        response.message = 'No podés unirte a este grupo';
                    } else {
                        const pendingRequest = await JoinRequest.exists({
                            group: group._id,
                            user: req.user._id,
                            status: JoinRequestStatus.PENDING,
                        });
                        if (pendingRequest) {
                            response.userStatus = 'pending';
                            response.message = 'Solicitud enviada, esperando aprobación';
                        } else {
                            response.userStatus = 'available';
                        }
                    }
                }
            }

            res.status(200).json(response);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al obtener el grupo' });
        }
    };

    static joinGroup = async (req: Request, res: Response) => {
        try {
            const userId = req.user!._id;
            const { inviteCode } = req.body;

            const group = await Group.findOne({ inviteCode });

            if (!group) {
                res.status(404).json({ message: 'Grupo no encontrado' });
                return;
            }

            const isAlreadyMember = group.memberships.some(
                (m) => m.user.toString() === userId.toString()
            );

            if (isAlreadyMember) {
                res.status(409).json({ message: 'Ya sos parte de este grupo' });
                return;
            }

            const isBanned = await GroupBan.exists({ group: group._id, user: userId });
            if (isBanned) {
                res.status(403).json({ message: 'No podés unirte a este grupo' });
                return;
            }

            const existingPending = await JoinRequest.exists({
                group: group._id,
                user: userId,
                status: JoinRequestStatus.PENDING,
            });

            if (existingPending) {
                res.status(409).json({ message: 'Solicitud enviada, esperando aprobación' });
                return;
            }

            // Closed groups require approval
            if (group.type === GroupType.CLOSED) {
                const joinRequest = new JoinRequest({
                    group: group._id,
                    user: userId,
                    status: JoinRequestStatus.PENDING,
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                });
                await joinRequest.save();

                res.status(200).json({
                    message: 'Solicitud enviada, esperando aprobación',
                    status: 'pending',
                });
                return;
            }

            // Open groups: instant join
            const user = await User.findById(userId);
            if (!user) {
                res.status(404).json({ message: 'Usuario no encontrado' });
                return;
            }

            group.memberships.push({
                user: userId,
                role: MembershipRole.MEMBER,
                joinedAt: new Date(),
            });

            user.memberships.push({
                group: group._id,
                role: MembershipRole.MEMBER,
                joinedAt: new Date(),
            });

            const [groupResult, userResult] = await Promise.allSettled([
                group.save(),
                user.save(),
            ]);

            if (groupResult.status === 'rejected' || userResult.status === 'rejected') {
                res.status(500).json({ message: 'Hubo un error al unirte al grupo' });
                return;
            }

            res.status(200).json({
                message: 'Te uniste al grupo exitosamente',
                group: {
                    id: group._id,
                    name: group.name,
                    slug: group.slug,
                },
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al unirte al grupo' });
        }
    };

    static getGroupQR = async (req: Request, res: Response) => {
        try {
            const userId = req.user!._id.toString();
            const { slug } = req.params;

            const group = await Group.findOne({ slug })
                .select('inviteCode memberships')
                .lean();

            if (!group) {
                res.status(404).json({ message: 'Grupo no encontrado' });
                return;
            }

            const isMember = group.memberships.some(
                (m) => m.user.toString() === userId
            );

            if (!isMember) {
                res.status(403).json({ message: 'No tenés acceso a este grupo' });
                return;
            }

            const frontendUrl = process.env.FRONTEND_URL || 'https://labanda.app';
            const inviteUrl = `${frontendUrl}/unirse/${group.inviteCode}`;

            const qrBuffer = await QRCode.toBuffer(inviteUrl, {
                type: 'png',
                width: 512,
                margin: 2,
            });

            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Content-Length', qrBuffer.length);
            res.status(200).send(qrBuffer);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al generar el QR' });
        }
    };

    static getPendingRequests = async (req: Request, res: Response) => {
        try {
            const userId = req.user!._id.toString();
            const { slug } = req.params;

            const group = await Group.findOne({ slug }).select('leader memberships').lean();

            if (!group) {
                res.status(404).json({ message: 'Grupo no encontrado' });
                return;
            }

            const isLeader = group.leader.toString() === userId;
            if (!isLeader) {
                res.status(403).json({ message: 'Solo el líder puede gestionar solicitudes' });
                return;
            }

            const requests = await JoinRequest.find({
                group: group._id,
                status: JoinRequestStatus.PENDING,
            })
                .populate('user', 'name lastName avatarUrl')
                .sort({ createdAt: -1 })
                .lean();

            // Mark expired requests as rejected
            const now = new Date();
            const expiredIds = requests
                .filter((r: any) => new Date(r.expiresAt) < now)
                .map((r: any) => r._id);

            if (expiredIds.length > 0) {
                await JoinRequest.updateMany(
                    { _id: { $in: expiredIds } },
                    { $set: { status: JoinRequestStatus.REJECTED } }
                );
            }

            // Filter out expired requests from response
            const activeRequests = requests.filter((r: any) => new Date(r.expiresAt) >= now);

            const formatted = activeRequests.map((r: any) => ({
                id: r._id,
                user: {
                    id: r.user._id,
                    name: `${r.user.name} ${r.user.lastName}`,
                    avatarUrl: r.user.avatarUrl,
                },
                createdAt: r.createdAt,
                expiresAt: r.expiresAt,
            }));

            res.status(200).json(formatted);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al obtener las solicitudes' });
        }
    };

    static approveRequest = async (req: Request, res: Response) => {
        try {
            const userId = req.user!._id.toString();
            const { slug, requestId } = req.params;

            const group = await Group.findOne({ slug }).select('leader memberships').lean();

            if (!group) {
                res.status(404).json({ message: 'Grupo no encontrado' });
                return;
            }

            const isLeader = group.leader.toString() === userId;
            if (!isLeader) {
                res.status(403).json({ message: 'Solo el líder puede gestionar solicitudes' });
                return;
            }

            const joinRequest = await JoinRequest.findOne({
                _id: requestId,
                group: group._id,
                status: JoinRequestStatus.PENDING,
            });

            if (!joinRequest) {
                res.status(404).json({ message: 'Solicitud no encontrada' });
                return;
            }

            // Check if request has expired
            if (new Date(joinRequest.expiresAt) < new Date()) {
                joinRequest.status = JoinRequestStatus.REJECTED;
                await joinRequest.save();
                res.status(410).json({ message: 'La solicitud expiró', code: 'REQUEST_EXPIRED' });
                return;
            }

            const requestUserId = joinRequest.user;

            // Check if user is already a member (edge case)
            const isAlreadyMember = group.memberships.some(
                (m) => m.user.toString() === requestUserId.toString()
            );

            if (isAlreadyMember) {
                joinRequest.status = JoinRequestStatus.REJECTED;
                await joinRequest.save();
                res.status(409).json({ message: 'El usuario ya es miembro del grupo' });
                return;
            }

            const isBanned = await GroupBan.exists({ group: group._id, user: requestUserId });
            if (isBanned) {
                joinRequest.status = JoinRequestStatus.REJECTED;
                await joinRequest.save();
                res.status(403).json({ message: 'El usuario está bloqueado en este grupo' });
                return;
            }

            // Add member to group
            const user = await User.findById(requestUserId);
            if (!user) {
                res.status(404).json({ message: 'Usuario no encontrado' });
                return;
            }

            await Group.findByIdAndUpdate(group._id, {
                $push: {
                    memberships: {
                        user: requestUserId,
                        role: MembershipRole.MEMBER,
                        joinedAt: new Date(),
                    },
                },
            });

            user.memberships.push({
                group: group._id,
                role: MembershipRole.MEMBER,
                joinedAt: new Date(),
            });
            await user.save();

            joinRequest.status = JoinRequestStatus.APPROVED;
            await joinRequest.save();

            res.status(200).json({ message: 'Solicitud aprobada' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al aprobar la solicitud' });
        }
    };

    static rejectRequest = async (req: Request, res: Response) => {
        try {
            const userId = req.user!._id.toString();
            const { slug, requestId } = req.params;

            const group = await Group.findOne({ slug }).select('leader').lean();

            if (!group) {
                res.status(404).json({ message: 'Grupo no encontrado' });
                return;
            }

            const isLeader = group.leader.toString() === userId;
            if (!isLeader) {
                res.status(403).json({ message: 'Solo el líder puede gestionar solicitudes' });
                return;
            }

            const joinRequest = await JoinRequest.findOne({
                _id: requestId,
                group: group._id,
                status: JoinRequestStatus.PENDING,
            });

            if (!joinRequest) {
                res.status(404).json({ message: 'Solicitud no encontrada' });
                return;
            }

            joinRequest.status = JoinRequestStatus.REJECTED;
            await joinRequest.save();

            res.status(200).json({ message: 'Solicitud rechazada' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al rechazar la solicitud' });
        }
    };

    static updateMemberRole = async (req: Request, res: Response) => {
        try {
            const userId = req.user!._id.toString();
            const { slug, memberId } = req.params;
            const { role } = req.body;

            const group = await Group.findOne({ slug }).lean();

            if (!group) {
                res.status(404).json({ message: 'Grupo no encontrado' });
                return;
            }

            if (group.leader.toString() !== userId) {
                res.status(403).json({ message: 'Solo el líder puede gestionar miembros' });
                return;
            }

            if (memberId === userId) {
                res.status(400).json({ message: 'No podés cambiar tu propio rol' });
                return;
            }

            if (!Object.values(MembershipRole).includes(role)) {
                res.status(400).json({ message: 'Rol inválido' });
                return;
            }

            const memberIndex = group.memberships.findIndex(
                (m) => m.user.toString() === memberId
            );

            if (memberIndex === -1) {
                res.status(404).json({ message: 'Miembro no encontrado en el grupo' });
                return;
            }

            group.memberships[memberIndex].role = role;
            await Group.findByIdAndUpdate(group._id, {
                memberships: group.memberships
            });

            await User.findByIdAndUpdate(memberId, {
                $set: {
                    'memberships.$[elem].role': role
                }
            }, {
                arrayFilters: [{ 'elem.group': group._id }]
            });

            res.status(200).json({ message: 'Rol actualizado exitosamente' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al actualizar el rol' });
        }
    };

    static removeMember = async (req: Request, res: Response) => {
        try {
            const userId = req.user!._id.toString();
            const { slug, memberId } = req.params;

            const group = await Group.findOne({ slug }).lean();

            if (!group) {
                res.status(404).json({ message: 'Grupo no encontrado' });
                return;
            }

            if (group.leader.toString() !== userId) {
                res.status(403).json({ message: 'Solo el líder puede expulsar miembros' });
                return;
            }

            if (memberId === userId) {
                res.status(400).json({ message: 'No podés expulsarte a vos mismo' });
                return;
            }

            const memberIndex = group.memberships.findIndex(
                (m) => m.user.toString() === memberId
            );

            if (memberIndex === -1) {
                res.status(404).json({ message: 'Miembro no encontrado en el grupo' });
                return;
            }

            const memberRole = group.memberships[memberIndex].role;
            if (memberRole === MembershipRole.LEADER || memberRole === MembershipRole.CO_LEADER) {
                res.status(400).json({ message: 'No podés expulsar a un líder o co-líder' });
                return;
            }

            group.memberships.splice(memberIndex, 1);
            await Group.findByIdAndUpdate(group._id, {
                memberships: group.memberships
            });

            await User.findByIdAndUpdate(memberId, {
                $pull: {
                    memberships: { group: group._id }
                }
            });

            const expelledUser = await User.findById(memberId).select('email name').lean();
            if (expelledUser) {
                GroupEmail.sendExpulsionNotification({
                    email: expelledUser.email,
                    name: expelledUser.name,
                    groupName: group.name
                }).catch(console.error);
            }

            res.status(200).json({ message: 'Miembro expulsado exitosamente' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al expulsar al miembro' });
        }
    };

    static leaveGroup = async (req: Request, res: Response) => {
        try {
            const userId = req.user!._id.toString();
            const { slug } = req.params;

            const group = await Group.findOne({ slug }).lean();

            if (!group) {
                res.status(404).json({ message: 'Grupo no encontrado' });
                return;
            }

            const membershipIndex = group.memberships.findIndex(
                (m) => m.user.toString() === userId
            );

            if (membershipIndex === -1) {
                res.status(403).json({ message: 'No sos miembro de este grupo' });
                return;
            }

            const userRole = group.memberships[membershipIndex].role;
            const isLeader = userRole === MembershipRole.LEADER;
            const isCoLeader = userRole === MembershipRole.CO_LEADER;

            // Check if user is the only member
            if (group.memberships.length === 1) {
                // Dissolve group - remove from users and delete
                await User.findByIdAndUpdate(userId, {
                    $pull: { memberships: { group: group._id } }
                });
                await Group.findByIdAndDelete(group._id);

                res.status(200).json({
                    message: 'Abandonaste el grupo. El grupo fue disuelto.',
                    dissolved: true,
                });
                return;
            }

            // If leader or co-leader, find successor before removing
            let successor = null;
            if (isLeader || isCoLeader) {
                // Find the next leader: first CO_LEADER, then oldest MEMBER
                const sortedMembers = [...group.memberships]
                    .filter((m) => m.user.toString() !== userId)
                    .sort((a, b) => {
                        const rolePriority: Record<MembershipRole, number> = {
                            [MembershipRole.LEADER]: 0,
                            [MembershipRole.CO_LEADER]: 1,
                            [MembershipRole.MEMBER]: 2,
                            [MembershipRole.ADMIN]: 3,
                        };
                        const prioA = rolePriority[a.role];
                        const prioB = rolePriority[b.role];
                        if (prioA !== prioB) return prioA - prioB;
                        return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
                    });

                successor = sortedMembers[0];

                // Update group leader if current leader is leaving
                if (isLeader && successor) {
                    await Group.findByIdAndUpdate(group._id, {
                        leader: successor.user,
                        $set: {
                            'memberships.$[elem].role': MembershipRole.LEADER
                        }
                    }, {
                        arrayFilters: [{ 'elem.user': successor.user }]
                    });

                    // Update successor's role in User model
                    await User.findByIdAndUpdate(successor.user, {
                        $set: {
                            'memberships.$[elem].role': MembershipRole.LEADER
                        }
                    }, {
                        arrayFilters: [{ 'elem.group': group._id }]
                    });
                }
            }

            // Remove user from group memberships
            await Group.findByIdAndUpdate(group._id, {
                $pull: { memberships: { user: userId } }
            });

            // Remove group from user memberships
            await User.findByIdAndUpdate(userId, {
                $pull: { memberships: { group: group._id } }
            });

            // Get successor name for response
            let successorName = null;
            if (successor) {
                const successorUser = await User.findById(successor.user).select('name lastName').lean();
                if (successorUser) {
                    successorName = `${successorUser.name} ${successorUser.lastName}`;
                }
            }

            res.status(200).json({
                message: 'Abandonaste el grupo exitosamente',
                dissolved: false,
                needsSuccession: isLeader || isCoLeader,
                successorName,
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al abandonar el grupo' });
        }
    };

    static searchGroups = async (req: Request, res: Response) => {
        try {
            const { q } = req.query;

            if (!q || typeof q !== 'string') {
                res.status(400).json({ message: 'El parámetro de búsqueda es requerido' });
                return;
            }

            const query = q.trim();

            if (query.length < 2) {
                res.status(400).json({ message: 'La búsqueda debe tener al menos 2 caracteres' });
                return;
            }

            let groups;

            // Si es exactamente 6 caracteres numéricos, buscar por código
            if (/^\d{6}$/.test(query)) {
                groups = await Group.findOne({ inviteCode: query })
                    .select('name slug inviteCode type avatarUrl memberships')
                    .lean();

                groups = groups ? [groups] : [];
            } else {
                // Buscar por nombre (parcial, case-insensitive)
                groups = await Group.find({
                    name: { $regex: query, $options: 'i' }
                })
                    .select('name slug inviteCode type avatarUrl memberships')
                    .limit(20)
                    .lean();
            }

            const results = groups.map((group) => ({
                id: group._id,
                name: group.name,
                slug: group.slug,
                inviteCode: group.inviteCode,
                type: group.type,
                avatarUrl: group.avatarUrl,
                memberCount: group.memberships.length,
            }));

            res.status(200).json(results);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al buscar grupos' });
        }
    };

    static getGroupById = async (req: Request, res: Response) => {
        try {
            const { id } = req.params;

            const group = await Group.findById(id)
                .select('name slug inviteCode type avatarUrl memberships leader')
                .lean();

            if (!group) {
                res.status(404).json({ message: 'Grupo no encontrado' });
                return;
            }

            res.status(200).json({
                id: group._id,
                name: group.name,
                slug: group.slug,
                inviteCode: group.inviteCode,
                type: group.type,
                avatarUrl: group.avatarUrl,
                memberCount: group.memberships.length,
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al obtener el grupo' });
        }
    };

    static getGroupMembers = async (req: Request, res: Response) => {
        try {
            const { id } = req.params;

            const group = await Group.findById(id)
                .populate<{ memberships: { user: { _id: string; name: string; lastName: string; avatarUrl?: string }; role: MembershipRole; joinedAt: Date }[] }>('memberships.user', 'name lastName avatarUrl')
                .lean();

            if (!group) {
                res.status(404).json({ message: 'Grupo no encontrado' });
                return;
            }

            const rolePriority: Record<MembershipRole, number> = {
                [MembershipRole.LEADER]: 0,
                [MembershipRole.CO_LEADER]: 1,
                [MembershipRole.MEMBER]: 2,
                [MembershipRole.ADMIN]: 3,
            };

            const sortedMembers = [...group.memberships].sort((a, b) => {
                const prioA = rolePriority[a.role];
                const prioB = rolePriority[b.role];
                if (prioA !== prioB) return prioA - prioB;
                return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
            });

            const members = sortedMembers.map((m) => ({
                userId: m.user._id,
                name: `${m.user.name} ${m.user.lastName}`,
                role: m.role,
                avatarUrl: m.user.avatarUrl,
                joinedAt: m.joinedAt,
            }));

            res.status(200).json(members);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al obtener los miembros' });
        }
    };
}
