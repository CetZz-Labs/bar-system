import { transporter } from "../config/nodemailer"

interface IEmail {
    email: string
    name: string
    token: string
}

export class AuthEmail {

    static sendConfirmationEmail = async ({ email, name, token }: IEmail) => {
        const info = await transporter.sendMail({
            from: '"La Banda" <cetzzlabs@gmail.com>', // Las comillas en el nombre ayudan a que se muestre mejor en la bandeja
            to: email,
            subject: '¡Bienvenido a La Banda! Confirma tu cuenta',
            text: `Hola ${name}, gracias por registrarte en La Banda. Tu código de confirmación es: ${token}. Ingrésalo en: ${process.env.FRONTEND_URL}/confirm-account. Este token expira en 10 minutos.`,
            html: `
                <div style="font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f5; padding: 40px 20px; color: #333;">
                    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                        
                        <div style="background-color: #0f172a; padding: 20px; text-align: center;">
                            <h1 style="color: #ffffff; margin: 0; font-size: 24px; letter-spacing: 1px;">La Banda</h1>
                        </div>

                        <div style="padding: 30px;">
                            <h2 style="color: #1e293b; margin-top: 0;">¡Hola, ${name}! 👋</h2>
                            <p style="font-size: 16px; line-height: 1.5; color: #475569;">
                                Gracias por unirte a <strong>La Banda</strong>. Ya casi está todo listo, solo necesitamos que confirmes tu cuenta para empezar.
                            </p>
                            
                            <div style="text-align: center; margin: 35px 0;">
                                <p style="font-size: 14px; color: #64748b; margin-bottom: 10px; text-transform: uppercase; font-weight: bold;">Tu código de confirmación es:</p>
                                <div style="background-color: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 8px; padding: 15px; display: inline-block;">
                                    <strong style="font-size: 28px; letter-spacing: 6px; color: #0f172a;">${token}</strong>
                                </div>
                            </div>

                            <div style="text-align: center; margin-bottom: 30px;">
                                <a href="${process.env.FRONTEND_URL}/confirm-account" style="background-color: #3b82f6; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block; transition: background-color 0.3s;">
                                    Ir a Confirmar Cuenta
                                </a>
                            </div>

                            <p style="font-size: 14px; color: #ef4444; text-align: center; margin-bottom: 0; background-color: #fef2f2; padding: 10px; border-radius: 6px;">
                                ⏳ Recuerda que este código expira en <strong>10 minutos</strong>.
                            </p>
                        </div>

                        <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
                            <p style="font-size: 12px; color: #94a3b8; margin: 0;">
                                Si tú no creaste esta cuenta, puedes ignorar este correo de forma segura.
                            </p>
                        </div>

                    </div>
                </div>
            `
        })
    }

    static sendPasswordResetToken = async (user: IEmail) => {
        const info = await transporter.sendMail({
            from: '"La Banda" <cetzzlabs@gmail.com>',
            to: user.email,
            subject: 'La Banda - Reestablece tu contraseña',
            text: `Hola ${user.name}, has solicitado reestablecer tu contraseña. Tu código es: ${user.token}. Ingrésalo en: ${process.env.FRONTEND_URL}/new-password. Este token expira en 10 minutos.`,
            html: `
            <div style="font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f5; padding: 40px 20px; color: #333;">
                <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                    
                    <div style="background-color: #0f172a; padding: 20px; text-align: center;">
                        <h1 style="color: #ffffff; margin: 0; font-size: 24px; letter-spacing: 1px;">La Banda</h1>
                    </div>

                    <div style="padding: 30px;">
                        <h2 style="color: #1e293b; margin-top: 0;">Hola, ${user.name} 👋</h2>
                        <p style="font-size: 16px; line-height: 1.5; color: #475569;">
                            Recibimos una solicitud para reestablecer tu contraseña en <strong>La Banda</strong>.
                            Si fuiste tú, utiliza el siguiente código para continuar con el proceso.
                        </p>
                        
                        <div style="text-align: center; margin: 35px 0;">
                            <p style="font-size: 14px; color: #64748b; margin-bottom: 10px; text-transform: uppercase; font-weight: bold;">
                                Tu código de recuperación es:
                            </p>
                            <div style="background-color: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 8px; padding: 15px; display: inline-block;">
                                <strong style="font-size: 28px; letter-spacing: 6px; color: #0f172a;">
                                    ${user.token}
                                </strong>
                            </div>
                        </div>

                        <div style="text-align: center; margin-bottom: 30px;">
                            <a href="${process.env.FRONTEND_URL}/new-password" 
                               style="background-color: #3b82f6; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;">
                                Reestablecer Contraseña
                            </a>
                        </div>

                        <p style="font-size: 14px; color: #ef4444; text-align: center; margin-bottom: 0; background-color: #fef2f2; padding: 10px; border-radius: 6px;">
                            ⏳ Este código expira en <strong>10 minutos</strong>.
                        </p>
                    </div>

                    <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
                        <p style="font-size: 12px; color: #94a3b8; margin: 0;">
                            Si no solicitaste este cambio de contraseña, puedes ignorar este correo de forma segura.
                        </p>
                    </div>

                </div>
            </div>
        `
        })
    }
}