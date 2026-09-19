export interface Auth {
    name: string
    lastName: string
    password?: string;
    confirmPassword?: string
    email: string;
    phone?: string;
    fullName?: string;
    birthdate?: string;
    /** LB-110: aceptación de T&C + Política + declaración +18. */
    acceptedTerms?: boolean;
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