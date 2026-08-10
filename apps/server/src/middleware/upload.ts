import multer from 'multer';
import { Request, Response, NextFunction } from 'express';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function createUploadMiddleware(maxFileSize: number) {
    return multer({
        storage: multer.memoryStorage(),
        limits: {
            fileSize: maxFileSize,
        },
        fileFilter: (_req, file, cb) => {
            if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
                cb(null, true);
            } else {
                cb(new Error('Tipo de archivo no permitido. Use JPEG, PNG o WebP'));
            }
        },
    });
}

export const upload = createUploadMiddleware(2 * 1024 * 1024); // 2 MB
export const uploadLogo = createUploadMiddleware(2 * 1024 * 1024); // 2 MB
export const uploadCover = createUploadMiddleware(3 * 1024 * 1024); // 3 MB

/**
 * Middleware flexible que acepta un único archivo con cualquier nombre de campo.
 * Normaliza el archivo a req.file para compatibilidad con los controllers.
 */
export function uploadSingle(maxFileSize: number) {
    const instance = createUploadMiddleware(maxFileSize);

    return (req: Request, res: Response, next: NextFunction) => {
        instance.any()(req, res, (err: unknown) => {
            if (err) {
                return next(err);
            }

            const files = req.files as Express.Multer.File[] | undefined;

            if (!files || files.length === 0) {
                return next();
            }

            if (files.length > 1) {
                return next(new Error('Solo se permite un archivo por solicitud'));
            }

            req.file = files[0];
            next();
        });
    };
}
