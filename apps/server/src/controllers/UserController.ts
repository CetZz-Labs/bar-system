import { Request, Response } from "express";
import { Types } from "mongoose";
import User, { IMembership } from "../models/User";
import { saveUserAvatar } from "../utils/storage";
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB

export class UserController {
    static getUserProfile = async (req: Request, res: Response) => {
        try {
            // El usuario ya fue inyectado por el middleware 'authenticate'
            const user = await User.findById(req.user!._id).select("-password -__v");

            if (!user) {
                res.status(404).json({ message: "Usuario no encontrado" });
                return;
            }

            const userObj = user.toObject();
            const fullName = `${user.name} ${user.lastName}`;

            res.json({ ...userObj, fullName });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Hubo un error al obtener el perfil" });
        }
    }

    static updateUserProfile = async (req: Request, res: Response) => {
        try {
            const { name, lastName, birthdate } = req.body;

            // Buscamos el documento original para mantener las referencias de Mongoose si hubieran hooks futuros
            const user = await User.findById(req.user!._id);
            if (!user) {
                res.status(404).json({ message: "Usuario no encontrado" });
                return;
            }

            if (name !== undefined) {
                user.name = name;
            }

            if (lastName !== undefined) {
                user.lastName = lastName;
            }

            if (birthdate !== undefined) {
                user.birthdate = new Date(birthdate);
            }

            // Mark profile as complete when all required fields are present
            if (user.name && user.lastName && user.birthdate) {
                user.profileComplete = true;
            }

            await user.save();

            res.send("Perfil actualizado correctamente");
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Hubo un error al actualizar el perfil" });
        }
    }

    static uploadAvatar = async (req: Request, res: Response) => {
        try {
            if (!req.file) {
                res.status(400).json({ message: "Se requiere un archivo" });
                return;
            }

            // Validate file size
            if (req.file.size > MAX_FILE_SIZE) {
                res.status(400).json({ message: "El archivo supera el límite de 2 MB" });
                return;
            }

            // Validate file type
            if (!ALLOWED_MIME_TYPES.includes(req.file.mimetype)) {
                res.status(400).json({ message: "Tipo de archivo no permitido. Use JPEG, PNG o WebP" });
                return;
            }

            const user = await User.findById(req.user!._id);
            if (!user) {
                res.status(404).json({ message: "Usuario no encontrado" });
                return;
            }

            // Upload to Cloudinary (deterministic public_id per user, overwrite in place)
            const avatarUrl = await saveUserAvatar(req.file.buffer, user._id.toString());
            user.avatarUrl = avatarUrl;
            await user.save();

            res.status(201).json({ avatarUrl });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Hubo un error al subir el avatar" });
        }
    }

    static getUserGroups = async (req: Request, res: Response) => {
        try {
            type PopulatedGroupSummary = { _id: Types.ObjectId; name: string; slug: string; avatarUrl?: string } | null;
            type PopulatedMembership = Omit<IMembership, 'group'> & { group: PopulatedGroupSummary };

            const user = await User.findById(req.user!._id)
                .populate<{ memberships: PopulatedMembership[] }>('memberships.group', 'name slug avatarUrl');

            if (!user) {
                res.status(404).json({ message: "Usuario no encontrado" });
                return;
            }

            const groups = user.memberships.map((membership) => ({
                groupId: membership.group?._id?.toString(),
                name: membership.group?.name,
                slug: membership.group?.slug,
                avatarUrl: membership.group?.avatarUrl,
                role: membership.role,
            }));

            res.json(groups);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Hubo un error al obtener los grupos" });
        }
    }
}
