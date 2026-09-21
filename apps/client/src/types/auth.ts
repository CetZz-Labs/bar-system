import { z } from "zod";

export interface Auth {
    name: string
    lastName: string
    password?: string;
    confirmPassword?: string
    email: string;
    phone?: string;
    fullName?: string;
    birthdate?: string;
}

export type RequestToken = Pick<Auth, 'email'>

export type ConfirmToken = {
    token: string
}

export type LoginFormDataType = Pick<Auth, 'email' | 'password'>
export type NewPasswordForm = Pick<Auth, 'password' | 'confirmPassword'>
export type ForgotPasswordForm = Pick<Auth, 'email'>

export interface User extends Auth {
    _id: string
    isActive: boolean
    role: string
    profileComplete?: boolean
}

/**
 * LB-115: activación de cuenta de cajero — el candidato recibe un código de
 * 6 dígitos por email (mismo mecanismo `Token` que confirm-account/
 * forgot-password) y en un único paso lo usa para fijar su contraseña y
 * activar la cuenta (`AuthController.activateCashierAccount`). Espejo
 * manual del validador de `authRoute.ts` (token + password min 8 +
 * confirmPassword igual a password).
 */
export const activateCashierAccountSchema = z
    .object({
        token: z
            .string()
            .trim()
            .length(6, "El código debe tener 6 dígitos")
            .regex(/^\d{6}$/, "El código debe ser numérico"),
        password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
        confirmPassword: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
    })
    .refine((data) => data.password === data.confirmPassword, {
        message: "Las contraseñas no coinciden",
        path: ["confirmPassword"],
    });

export type ActivateCashierAccountFormData = z.infer<typeof activateCashierAccountSchema>;