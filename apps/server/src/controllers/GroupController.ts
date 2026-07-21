import { Request, Response } from "express";
import Group, { GroupType } from "../models/Group";
import User, { MembershipRole } from "../models/User";
import JoinRequest, { JoinRequestStatus } from "../models/JoinRequest";
import GroupBan from "../models/GroupBan";
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

            const formatted = requests.map((r: any) => ({
                id: r._id,
                user: {
                    id: r.user._id,
                    name: `${r.user.name} ${r.user.lastName}`,
                    avatarUrl: r.user.avatarUrl,
                },
                createdAt: r.createdAt,
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
}
