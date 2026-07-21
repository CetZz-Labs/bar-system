import nodemailer from 'nodemailer'


if (process.env.NODE_ENV !== 'production') {
    process.loadEnvFile()
}

const config = () => {
    return {
        service: 'gmail', // Usar el servicio de Gmail
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD,
        },
    }
}

export const transporter = nodemailer.createTransport(config());