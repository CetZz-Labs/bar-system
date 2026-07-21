import { Request, Response, NextFunction } from "express";
import jwt from 'jsonwebtoken';
import User, { IUser, Role } from "../models/User";

interface IDecodedToken {
    id: string;
    iat?: number;
    exp?: number;
}

declare global {
    namespace Express {
        interface Request {
            user?: IUser;
        }
    }
}

/**
 * Middleware opcional de autenticación.
 * Si hay token válido, inyecta req.user. Si no, continúa sin error.
 */
export const optionalAuthenticate = async (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies.access_token;

    if (!token) {
        next();
        return;
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as IDecodedToken;

        if (decoded && decoded.id) {
            const user = await User.findById(decoded.id).select('_id name lastName email role isActive');

            if (user && user.isActive) {
                req.user = user;
            }
        }
    } catch {
        // Token inválido: continuar sin usuario
    }

    next();
};

/**
 * Middleware para verificar que el usuario tenga el perfil completado.
 */
export const requireCompleteProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.user?._id) {
            res.status(403).json({ message: 'Debes completar tu perfil antes de continuar' });
            return;
        }

        const user = await User.findById(req.user._id).select('profileComplete');

        if (!user || !user.profileComplete) {
            res.status(403).json({ message: 'Debes completar tu perfil antes de continuar' });
            return;
        }

        next();
    } catch (error) {
        console.error(error);
        res.status(403).json({ message: 'Debes completar tu perfil antes de continuar' });
    }
};

/**
 * Middleware para autenticar y verificar roles.
 * @param allowedRoles Array de roles permitidos. Por defecto es [Role.USER]
 */
export const authenticate = (allowedRoles: Role[] = [Role.USER]) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        const token = req.cookies.access_token;

        // 1. Verificamos si hay token
        if (!token) {
            res.status(401).json({ message: 'No Autorizado' });
            return;
        }

        try {
            // 2. Decodificamos el token
            const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as IDecodedToken;

            if (decoded && decoded.id) {
                // 3. Buscamos al usuario en la base de datos (Adaptado a tu Mongoose)
                const user = await User.findById(decoded.id).select('_id name lastName email role isActive');

                if (!user) {
                    res.status(401).json({ message: 'Token No Válido o usuario inexistente' });
                    return;
                }

                // 4. Verificamos si la cuenta está activa
                // (Nota: Corregí el mensaje de tu código original que decía "no ha sido desactivada")
                if (!user.isActive) {
                    res.status(401).json({ message: 'La cuenta está desactivada' });
                    return;
                }

                // 5. VALIDACIÓN DE ROLES
                // Verificamos si el rol del usuario está dentro de los permitidos
                if (!allowedRoles.includes(user.role as Role)) {
                    res.status(403).json({ message: 'Acceso Denegado: No tienes los permisos necesarios' });
                    return;
                }

                // 6. Asignamos el usuario al request y continuamos
                req.user = user;
                next();
            }

        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Token No Válido o expirado' });
            return;
        }
    };
};