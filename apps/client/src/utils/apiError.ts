import { isAxiosError } from "axios";
import { toast } from "sonner";

// Define cómo viene exactamente cada error desde express-validator
export interface ValidationErrorDetail {
    type?: string;
    value?: string;
    msg: string;      // El mensaje de error (ej. "El email es requerido")
    path: string;     // El campo que falló (ej. "email")
    location?: string;
}

// Define la estructura global de tu error estandarizado
export type ApiError =
    | { type: 'validation'; details: ValidationErrorDetail[] }
    | { type: 'server'; message: string; status?: number }
    | { type: 'unknown'; message: string };

export const throwStandardError = (error: unknown): never => {
    if (isAxiosError(error) && error.response) {
        const data = error.response.data;

        // 1. Si es un error de express-validator (arreglo 'errors')
        if (data.errors) {
            throw {
                type: 'validation',
                details: data.errors // Aquí viaja el [{ path: 'email', msg: '...' }]
            };
        }

        // 2. Si es un error del controlador (string 'message')
        if (data.message) {
            throw {
                type: 'server',
                message: data.message,
                status: error.response.status
            };
        }
    }

    // 3. Error genérico si el servidor se cae o no hay internet
    throw {
        type: 'unknown',
        message: "Ocurrió un error inesperado al conectar con el servidor."
    };
};

export const toastApiError = (error: unknown) => {
    // TypeScript nos obliga a verificar si es un objeto válido antes de acceder a sus propiedades
    const apiError = error as ApiError;

    // 1. Si es un error de validación (express-validator)
    if (apiError.type === 'validation') {
        // Aquí TypeScript ya sabe que `apiError` tiene la propiedad `details`
        apiError.details.forEach((err) => {
            toast.error(err.msg);
        });
        return;
    }

    // 2. Si es un error del servidor o desconocido
    if (apiError.type === 'server' || apiError.type === 'unknown') {
        // Aquí TypeScript ya sabe que `apiError` tiene la propiedad `message`
        toast.error(apiError.message);
        return;
    }

    // Fallback absoluto
    toast.error("Ocurrió un error inesperado.");
};