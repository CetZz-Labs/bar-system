import { transporter } from "../config/nodemailer"

interface IExpulsionEmail {
    email: string
    name: string
    groupName: string
}

export class GroupEmail {

    static sendExpulsionNotification = async ({ email, name, groupName }: IExpulsionEmail) => {
        const info = await transporter.sendMail({
            from: '"La Banda" <cetzzlabs@gmail.com>',
            to: email,
            subject: `Has sido removido del grupo "${groupName}"`,
            text: `Hola ${name}, has sido removido del grupo "${groupName}". Si tenés preguntas, contactá al líder del grupo.`,
            html: `
                <div style="font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f5; padding: 40px 20px; color: #333;">
                    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                        
                        <div style="background-color: #0f172a; padding: 20px; text-align: center;">
                            <h1 style="color: #ffffff; margin: 0; font-size: 24px; letter-spacing: 1px;">La Banda</h1>
                        </div>

                        <div style="padding: 30px;">
                            <h2 style="color: #1e293b; margin-top: 0;">Hola, ${name}</h2>
                            <p style="font-size: 16px; line-height: 1.5; color: #475569;">
                                Has sido removido del grupo <strong>"${groupName}"</strong>.
                            </p>
                            <p style="font-size: 16px; line-height: 1.5; color: #475569;">
                                Si tenés preguntas sobre esta decisión, podés contactar al líder del grupo.
                            </p>
                        </div>

                        <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
                            <p style="font-size: 12px; color: #94a3b8; margin: 0;">
                                Este es un mensaje automático de La Banda.
                            </p>
                        </div>

                    </div>
                </div>
            `
        })
    }
}
