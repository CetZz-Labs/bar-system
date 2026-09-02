import { Request, Response } from "express";
import { Types } from "mongoose";
import Bar, { ATTENDANCE_POINTS_DAY_KEYS, BarStatus, IAddress, IAttendancePointsByDay, IBar } from "../models/Bar";
import BarUser, { BarUserRole } from "../models/BarUser";
import User from "../models/User";
import Outing, { OutingStatus } from "../models/Outing";
import { generateSlug } from "../utils/slug";
import { saveBarLogo, saveBarCover, deleteImage } from "../utils/storage";
import { verifyBarAccess } from "../utils/barAccess";
import { getBarDayOfWeek } from "../utils/barDay";
import sharp from "sharp";

const NAME_MIN_LENGTH = 3;
const NAME_MAX_LENGTH = 60;
const DESCRIPTION_MAX_LENGTH = 120;
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const LOGO_MIN_DIMENSION = 200;
const LOGO_MAX_SIZE = 2 * 1024 * 1024; // 2 MB
const COVER_MAX_SIZE = 3 * 1024 * 1024; // 3 MB
const ATTENDANCE_POINTS_MIN = 0;
const ATTENDANCE_POINTS_MAX = 1000;
const ATTENDANCE_POINTS_DAYS: (keyof IAttendancePointsByDay)[] = [
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
];

function isValidAttendancePointsByDay(value: unknown): value is IAttendancePointsByDay {
    if (typeof value !== 'object' || value === null) return false;
    const record = value as Record<string, unknown>;
    return ATTENDANCE_POINTS_DAYS.every((day) => {
        const points = record[day];
        return typeof points === 'number'
            && Number.isInteger(points)
            && points >= ATTENDANCE_POINTS_MIN
            && points <= ATTENDANCE_POINTS_MAX;
    });
}

async function getUniqueBarSlug(name: string): Promise<string> {
    const maxRetries = 10;
    let retries = 0;
    let slug: string;
    let exists = true;

    while (exists && retries < maxRetries) {
        slug = generateSlug(name);
        const existing = await Bar.findOne({ slug });
        exists = !!existing;
        retries++;
    }

    if (exists) {
        throw new Error('No se pudo generar un slug único después de múltiples intentos');
    }

    return slug!;
}

export class BarController {
    static registerBar = async (req: Request, res: Response) => {
        try {
            const userId = req.user!._id;
            const {
                name,
                address,
                phone,
                schedule,
                description,
            } = req.body;

            // Validate name
            if (!name || typeof name !== 'string') {
                res.status(400).json({ message: 'El nombre del bar es requerido' });
                return;
            }

            const trimmedName = name.trim();
            if (trimmedName.length < NAME_MIN_LENGTH || trimmedName.length > NAME_MAX_LENGTH) {
                res.status(400).json({
                    message: `El nombre del bar debe tener entre ${NAME_MIN_LENGTH} y ${NAME_MAX_LENGTH} caracteres`,
                });
                return;
            }

            // Validate address
            if (!address || typeof address !== 'object') {
                res.status(400).json({ message: 'La dirección es requerida' });
                return;
            }

            const requiredAddressFields: { field: string; label: string }[] = [
                { field: 'street', label: 'calle' },
                { field: 'number', label: 'número' },
                { field: 'city', label: 'ciudad' },
            ];
            for (const { field, label } of requiredAddressFields) {
                if (!address[field] || typeof address[field] !== 'string' || !address[field].trim()) {
                    res.status(400).json({ message: `La dirección debe incluir ${label}` });
                    return;
                }
            }

            // Validate phone
            if (!phone || typeof phone !== 'string' || !phone.trim()) {
                res.status(400).json({ message: 'El teléfono de contacto es requerido' });
                return;
            }

            // Validate schedule
            if (!Array.isArray(schedule) || schedule.length === 0) {
                res.status(400).json({ message: 'El horario de atención es requerido y debe tener al menos un día' });
                return;
            }

            for (const slot of schedule) {
                if (typeof slot !== 'object' || slot === null) {
                    res.status(400).json({ message: 'Cada entrada del horario debe ser un objeto' });
                    return;
                }

                if (typeof slot.day !== 'number' || slot.day < 0 || slot.day > 6) {
                    res.status(400).json({ message: `Día inválido: ${slot.day}. Debe ser entre 0 (Domingo) y 6 (Sábado)` });
                    return;
                }

                if (!slot.open || typeof slot.open !== 'string' || !TIME_REGEX.test(slot.open)) {
                    res.status(400).json({ message: `Hora de apertura inválida: ${slot.open}. Formato HH:MM` });
                    return;
                }

                if (!slot.close || typeof slot.close !== 'string' || !TIME_REGEX.test(slot.close)) {
                    res.status(400).json({ message: `Hora de cierre inválida: ${slot.close}. Formato HH:MM` });
                    return;
                }
            }

            // Validate description
            if (description !== undefined && description !== null) {
                if (typeof description !== 'string' || description.length > DESCRIPTION_MAX_LENGTH) {
                    res.status(400).json({
                        message: `La descripción no puede superar los ${DESCRIPTION_MAX_LENGTH} caracteres`,
                    });
                    return;
                }
            }

            // Check duplicate: same name and same city (case-insensitive)
            const existingBar = await Bar.findOne({
                name: { $regex: new RegExp(`^${trimmedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
                'address.city': { $regex: new RegExp(`^${address.city.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
            });

            if (existingBar) {
                res.status(409).json({
                    message: 'Ya existe un bar registrado con ese nombre en esta ciudad',
                });
                return;
            }

            // Generate unique slug
            const slug = await getUniqueBarSlug(trimmedName);

            // Build address object. `neighborhood` no es required a nivel de schema
            // (ver models/Bar.ts) aunque la interfaz IAddress lo declare sin `?`.
            const addressData: Pick<IAddress, 'street' | 'number' | 'city'> & Partial<Pick<IAddress, 'neighborhood'>> = {
                street: address.street.trim(),
                number: address.number.trim(),
                city: address.city.trim(),
            };
            if (address.neighborhood) {
                addressData.neighborhood = address.neighborhood.trim();
            }

            // Create bar with pending status
            const bar = await Bar.create({
                name: trimmedName,
                slug,
                address: addressData,
                phone: phone.trim(),
                schedule,
                description: description?.trim() || undefined,
                status: BarStatus.PENDING,
            });

            // Associate user as owner
            await BarUser.create({
                bar: bar._id,
                user: userId,
                role: BarUserRole.OWNER,
            });

            res.status(201).json({
                message: 'Tu bar fue registrado. El equipo de La Banda lo revisará y te contactará para activarlo.',
                bar: {
                    id: bar._id,
                    name: bar.name,
                    slug: bar.slug,
                    status: bar.status,
                },
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al registrar el bar' });
        }
    };

    static getActiveBars = async (req: Request, res: Response) => {
        try {
            const bars = await Bar.find({ status: BarStatus.ACTIVE })
                .select('name slug address logoUrl coverUrl schedule description')
                .sort({ name: 1 })
                .lean();

            const result = bars.map((bar) => ({
                id: bar._id,
                name: bar.name,
                slug: bar.slug,
                address: bar.address,
                logoUrl: bar.logoUrl,
                coverUrl: bar.coverUrl,
                schedule: bar.schedule,
                description: bar.description,
            }));

            res.status(200).json(result);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al obtener los bares activos' });
        }
    };

    /**
     * GET /api/bars — LB-79. Listado de bares ACTIVE para explorar, con los
     * puntos de asistencia de HOY ya resueltos (`getBarDayOfWeek` +
     * `ATTENDANCE_POINTS_DAY_KEYS`, en memoria, sin queries extra por bar) y
     * `hasActiveCheckIn` por bar sin N+1: 1 query a `User` (memberships) + 1
     * query a `Outing` para TODOS los grupos del usuario, sin filtrar por
     * bar, resuelta en un `Set` en memoria (mismo criterio de "check-in
     * activo" que `getPublicBarDetail`, LB-76). Búsqueda `?search=` por
     * nombre: regex case-insensitive parcial (mismo patrón que
     * `utils/cashierSearch.ts`, no el patrón exacto/anclado de `registerBar`).
     */
    static listBars = async (req: Request, res: Response) => {
        try {
            const userId = req.user!._id.toString();
            const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

            const filter: { status: BarStatus; name?: { $regex: string; $options: string } } = {
                status: BarStatus.ACTIVE,
            };
            if (search) {
                const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                filter.name = { $regex: escaped, $options: 'i' };
            }

            const bars = await Bar.find(filter)
                .select('name address closingTime attendancePointsByDay')
                .sort({ name: 1 })
                .lean();

            const user = await User.findById(userId).select('memberships').lean();
            const groupIds = (user?.memberships ?? []).map((membership) => membership.group);

            const activeOutings = await Outing.find({
                group: { $in: groupIds },
                status: OutingStatus.ACTIVE,
            }).select('bar').lean();
            const activeBarIds = new Set(activeOutings.map((outing) => outing.bar.toString()));

            const now = new Date();
            const result = bars.map((bar) => {
                const dayIndex = getBarDayOfWeek(now, bar.closingTime);
                const dayKey = ATTENDANCE_POINTS_DAY_KEYS[dayIndex];
                const todayAttendancePoints = bar.attendancePointsByDay?.[dayKey] ?? 0;

                return {
                    id: bar._id,
                    name: bar.name,
                    address: bar.address,
                    closingTime: bar.closingTime,
                    todayAttendancePoints,
                    hasActiveCheckIn: activeBarIds.has(bar._id.toString()),
                };
            });

            res.status(200).json(result);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al obtener los bares' });
        }
    };

    static getMyBars = async (req: Request, res: Response) => {
        try {
            const userId = req.user!._id;

            type PopulatedBarSummary = Pick<IBar, 'name' | 'slug' | 'address' | 'phone' | 'schedule' | 'description' | 'status'> & {
                _id: Types.ObjectId;
                createdAt: Date;
            };

            const barUsers = await BarUser.find({ user: userId })
                .populate<{ bar: PopulatedBarSummary }>('bar', 'name slug address phone schedule description status createdAt')
                .sort({ createdAt: -1 })
                .lean();

            const bars = barUsers.map((bu) => ({
                id: bu.bar._id,
                name: bu.bar.name,
                slug: bu.bar.slug,
                address: bu.bar.address,
                phone: bu.bar.phone,
                schedule: bu.bar.schedule,
                description: bu.bar.description,
                status: bu.bar.status,
                role: bu.role,
                registeredAt: bu.createdAt,
            }));

            res.status(200).json(bars);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al obtener tus bares' });
        }
    };

    static getBarProfile = async (req: Request, res: Response) => {
        try {
            const userId = req.user!._id.toString();
            const { id } = req.params;

            const { hasAccess } = await verifyBarAccess(userId, id as string);
            if (!hasAccess) {
                res.status(403).json({ message: 'No tienes permiso para ver este bar' });
                return;
            }

            const bar = await Bar.findById(id);
            if (!bar) {
                res.status(404).json({ message: 'Bar no encontrado' });
                return;
            }

            res.status(200).json({
                id: bar._id,
                name: bar.name,
                slug: bar.slug,
                address: bar.address,
                phone: bar.phone,
                schedule: bar.schedule,
                description: bar.description,
                status: bar.status,
                logoUrl: bar.logoUrl,
                coverUrl: bar.coverUrl,
                closingTime: bar.closingTime,
                attendancePointsByDay: bar.attendancePointsByDay,
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al obtener el perfil del bar' });
        }
    };

    /**
     * GET /api/bar/:id/detail — LB-76. Ficha pública de un bar, accesible por
     * cualquier cliente autenticado (rol USER/ADMIN), sin exigir `BarUser`
     * (a diferencia de `getBarProfile`, que exige `verifyBarAccess` y es la
     * vista de gestión del dueño/cajero). Mismo criterio "bar activo" que
     * `getActiveBars`: 404 si no existe o no está `ACTIVE`.
     */
    static getPublicBarDetail = async (req: Request, res: Response) => {
        try {
            const userId = req.user!._id.toString();
            const { id } = req.params;

            const bar = await Bar.findById(id);
            if (!bar || bar.status !== BarStatus.ACTIVE) {
                res.status(404).json({ message: 'Bar no encontrado' });
                return;
            }

            // "¿Tiene el usuario un check-in ACTIVE en este bar?": se resuelve
            // sin exponer en qué grupo, encadenando sus grupos (mismo patrón
            // de UserController.getUserGroups) con la Outing ACTIVE de ese bar
            // en cualquiera de esos grupos (mismo enum que getActiveOuting).
            const user = await User.findById(userId).select('memberships').lean();
            const groupIds = (user?.memberships ?? []).map((membership) => membership.group);

            const activeOuting = await Outing.findOne({
                group: { $in: groupIds },
                bar: bar._id,
                status: OutingStatus.ACTIVE,
            }).select('_id').lean();

            res.status(200).json({
                id: bar._id,
                name: bar.name,
                address: bar.address,
                closingTime: bar.closingTime,
                attendancePointsByDay: bar.attendancePointsByDay,
                hasActiveCheckIn: !!activeOuting,
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al obtener el detalle del bar' });
        }
    };

    static updateBarProfile = async (req: Request, res: Response) => {
        try {
            const userId = req.user!._id.toString();
            const { id } = req.params;
            const { name, description, phone, closingTime, attendancePointsByDay, logoUrl, coverUrl } = req.body;

            // LB-84: solo el OWNER puede editar el perfil del bar — antes
            // cualquier BarUser (incluido CASHIER) pasaba este chequeo
            // porque solo se verificaba `hasAccess` (ver
            // progress/explorers/exp_LB-84.md §3).
            const { hasAccess, role } = await verifyBarAccess(userId, id as string);
            if (!hasAccess) {
                res.status(403).json({ message: 'No tienes permiso para editar este bar' });
                return;
            }
            if (role !== BarUserRole.OWNER) {
                res.status(403).json({ message: 'Solo el dueño del bar puede editar este bar' });
                return;
            }

            const bar = await Bar.findById(id);
            if (!bar) {
                res.status(404).json({ message: 'Bar no encontrado' });
                return;
            }

            if (name !== undefined) {
                if (typeof name !== 'string' || name.trim().length < NAME_MIN_LENGTH || name.trim().length > NAME_MAX_LENGTH) {
                    res.status(400).json({
                        message: `El nombre del bar debe tener entre ${NAME_MIN_LENGTH} y ${NAME_MAX_LENGTH} caracteres`,
                    });
                    return;
                }
                bar.name = name.trim();
            }

            if (description !== undefined) {
                if (typeof description !== 'string' || description.length > DESCRIPTION_MAX_LENGTH) {
                    res.status(400).json({
                        message: `La descripción no puede superar los ${DESCRIPTION_MAX_LENGTH} caracteres`,
                    });
                    return;
                }
                bar.description = description.trim() || undefined;
            }

            if (phone !== undefined) {
                if (typeof phone !== 'string' || !phone.trim()) {
                    res.status(400).json({ message: 'El teléfono de contacto es requerido' });
                    return;
                }
                bar.phone = phone.trim();
            }

            if (closingTime !== undefined) {
                if (typeof closingTime !== 'string' || !TIME_REGEX.test(closingTime)) {
                    res.status(400).json({ message: 'La hora de cierre debe tener formato HH:MM' });
                    return;
                }
                bar.closingTime = closingTime;
            }

            if (attendancePointsByDay !== undefined) {
                if (!isValidAttendancePointsByDay(attendancePointsByDay)) {
                    res.status(400).json({
                        message: 'attendancePointsByDay debe incluir los 7 días de la semana con enteros entre 0 y 1000',
                    });
                    return;
                }
                bar.attendancePointsByDay = attendancePointsByDay;
            }

            // logoUrl/coverUrl solo aceptan `null` en este endpoint: es la
            // operación "quitar". Setear una URL directa NO está soportado acá
            // (el logo/portada se suben por POST /bar/:id/logo y /:id/cover).
            // El borrado en Cloudinary ocurre ANTES de bar.save(); si rechaza,
            // se propaga al catch (500) y bar.save() no llega a ejecutarse.
            if (logoUrl !== undefined) {
                if (logoUrl !== null) {
                    res.status(400).json({ message: 'logoUrl solo puede establecerse en null (operación "quitar")' });
                    return;
                }
                if (bar.logoUrl) {
                    await deleteImage('bar-logos', bar._id.toString());
                    bar.logoUrl = undefined;
                }
            }

            if (coverUrl !== undefined) {
                if (coverUrl !== null) {
                    res.status(400).json({ message: 'coverUrl solo puede establecerse en null (operación "quitar")' });
                    return;
                }
                if (bar.coverUrl) {
                    await deleteImage('bar-covers', bar._id.toString());
                    bar.coverUrl = undefined;
                }
            }

            await bar.save();

            res.status(200).json({
                message: 'Perfil del bar actualizado correctamente',
                bar: {
                    id: bar._id,
                    name: bar.name,
                    slug: bar.slug,
                    phone: bar.phone,
                    description: bar.description,
                    logoUrl: bar.logoUrl,
                    coverUrl: bar.coverUrl,
                    closingTime: bar.closingTime,
                    attendancePointsByDay: bar.attendancePointsByDay,
                },
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al actualizar el perfil del bar' });
        }
    };

    static uploadBarLogo = async (req: Request, res: Response) => {
        try {
            const userId = req.user!._id.toString();
            const { id } = req.params;

            // LB-84: solo el OWNER puede subir el logo (mismo gap que
            // updateBarProfile, ver progress/explorers/exp_LB-84.md §3).
            const { hasAccess, role } = await verifyBarAccess(userId, id as string);
            if (!hasAccess) {
                res.status(403).json({ message: 'No tienes permiso para editar este bar' });
                return;
            }
            if (role !== BarUserRole.OWNER) {
                res.status(403).json({ message: 'Solo el dueño del bar puede editar este bar' });
                return;
            }

            if (!req.file) {
                res.status(400).json({ message: 'Se requiere un archivo' });
                return;
            }

            if (req.file.size > LOGO_MAX_SIZE) {
                res.status(400).json({ message: 'El archivo supera el límite de 2 MB' });
                return;
            }

            if (!ALLOWED_MIME_TYPES.includes(req.file.mimetype)) {
                res.status(400).json({ message: 'Tipo de archivo no permitido. Use JPEG, PNG o WebP' });
                return;
            }

            const bar = await Bar.findById(id);
            if (!bar) {
                res.status(404).json({ message: 'Bar no encontrado' });
                return;
            }

            // Validate dimensions using sharp
            const metadata = await sharp(req.file.buffer).metadata();
            const width = metadata.width || 0;
            const height = metadata.height || 0;

            if (width < LOGO_MIN_DIMENSION || height < LOGO_MIN_DIMENSION) {
                res.status(400).json({
                    message: `La imagen debe tener al menos ${LOGO_MIN_DIMENSION}×${LOGO_MIN_DIMENSION} píxeles`,
                });
                return;
            }

            const logoUrl = await saveBarLogo(req.file.buffer, bar._id.toString());

            bar.logoUrl = logoUrl;
            await bar.save();

            res.status(201).json({ logoUrl });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al subir el logo' });
        }
    };

    static uploadBarCover = async (req: Request, res: Response) => {
        try {
            const userId = req.user!._id.toString();
            const { id } = req.params;

            // LB-84: solo el OWNER puede subir la portada (mismo gap que
            // updateBarProfile, ver progress/explorers/exp_LB-84.md §3).
            const { hasAccess, role } = await verifyBarAccess(userId, id as string);
            if (!hasAccess) {
                res.status(403).json({ message: 'No tienes permiso para editar este bar' });
                return;
            }
            if (role !== BarUserRole.OWNER) {
                res.status(403).json({ message: 'Solo el dueño del bar puede editar este bar' });
                return;
            }

            if (!req.file) {
                res.status(400).json({ message: 'Se requiere un archivo' });
                return;
            }

            if (req.file.size > COVER_MAX_SIZE) {
                res.status(400).json({ message: 'El archivo supera el límite de 3 MB' });
                return;
            }

            if (!ALLOWED_MIME_TYPES.includes(req.file.mimetype)) {
                res.status(400).json({ message: 'Tipo de archivo no permitido. Use JPEG, PNG o WebP' });
                return;
            }

            const bar = await Bar.findById(id);
            if (!bar) {
                res.status(404).json({ message: 'Bar no encontrado' });
                return;
            }

            const coverUrl = await saveBarCover(req.file.buffer, bar._id.toString());

            bar.coverUrl = coverUrl;
            await bar.save();

            res.status(201).json({ coverUrl });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Hubo un error al subir la foto de portada' });
        }
    };
}
