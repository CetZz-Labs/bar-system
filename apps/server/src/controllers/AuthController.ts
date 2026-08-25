import { Request, Response } from "express";
import User from "../models/User";
import { generateToken } from "../utils/token";
import Token from "../models/Token";
import { AuthEmail } from "../emails/AuthEmail";
import { checkPassword, hashPassword } from "../utils/auth";
import { generateJWT } from "../utils/jwt";

export class AuthController {

    static createAccount = async (req: Request, res: Response) => {
        try {
            const { name, lastName, email, password, confirmPassword, birthdate } = req.body

            const userExists = await User.findOne({ email })

            if (userExists) {
                return res.status(400).json({ message: "El usuario ya existe" })
            }

            if (password !== confirmPassword) {
                return res.status(400).json({ message: "Las contraseñas no coinciden" })
            }

            // LB-84: whitelist explícita de campos de registro — nunca pasar
            // req.body completo a User.create. `role`/`isActive`/
            // `profileComplete`/`memberships` no son campos de registro y no
            // deben poder setearse desde el body (mass assignment /
            // escalación de privilegios, ver progress/explorers/exp_LB-84.md §2).
            const user = await User.create({ name, lastName, email, password, birthdate })

            const token = new Token()
            token.token = generateToken()
            token.user = user._id

            AuthEmail.sendConfirmationEmail({
                email: user.email,
                name: user.name,
                token: token.token
            })

            await Promise.allSettled([user.save(), token.save()])
            res.send('Cuenta creada, revisa tu email para confirmarla')
        } catch (error) {
            console.log(error)
            res.status(500).json({ message: "Hubo un error al crear el usuario" })
        }
    }

    static confirmAccount = async (req: Request, res: Response) => {
        try {
            const { token } = req.body

            const tokenExists = await Token.findOne({ token })

            if (!tokenExists) {
                const error = new Error('Token no valido')
                res.status(404).json({ message: error.message })
                return
            }

            const user = await User.findById(tokenExists.user)

            if (!user) {
                const error = new Error('Usuario no encontrado')
                res.status(404).json({ message: error.message })
                return
            }

            user.isActive = true

            await Promise.allSettled([user.save(), tokenExists.deleteOne()])
            res.send('Cuanta confirmada correctamente')

        } catch (error) {
            res.status(500).json({ message: 'Hubo un error' })

        }
    }

    static requestConfirmationCode = async (req: Request, res: Response) => {
        try {
            const { email } = req.body

            // Usuario exist
            const user = await User.findOne({ email })

            if (!user) {
                const error = new Error('El Usuario no esta registrado')
                res.status(404).json({ message: error.message })
                return
            }

            if (user.isActive) {
                const error = new Error('El Usuario ya esta confirmado')
                res.status(403).json({ message: error.message })
                return
            }

            // Generar token
            const token = new Token()
            token.token = generateToken()
            token.user = user._id

            // Enviar email
            AuthEmail.sendConfirmationEmail({
                email: user.email,
                name: user.name,
                token: token.token
            })

            await Promise.allSettled([user.save(), token.save()])
            res.send('Se envio un nuevo token a tu email')
        } catch (error) {
            res.status(500).json({ message: 'Hubo un error' })
        }
    }

    static forgotPassword = async (req: Request, res: Response) => {
        try {
            const { email } = req.body

            const user = await User.findOne({ email })
            if (!user) {
                const error = new Error('El usuario no esta registrado')
                res.status(404).json({ error: error.message })
                return
            }

            const token = new Token()
            token.token = generateToken()
            token.user = user._id
            await token.save()

            AuthEmail.sendPasswordResetToken({
                email: user.email,
                name: user.name,
                token: token.token
            })
            res.send('Revisa tu email para instrucciones')
        } catch (error) {
            res.status(500).json({ error: 'Hubo un error al crear la cuenta' })
        }
    }

    static validateToken = async (req: Request, res: Response) => {
        try {
            const { token } = req.body

            const tokenExists = await Token.findOne({ token })

            if (!tokenExists) {
                const error = new Error('Token no valido')
                res.status(404).json({ message: error.message })
                return
            }

            res.send('Token valido, define tu nueva contraseña')

        } catch {
            res.status(500).json({ message: 'Hubo un error' })

        }
    }

    static updatePasswordWithToken = async (req: Request, res: Response) => {
        try {
            const { token } = req.params

            const tokenExist = await Token.findOne({ token })
            if (!tokenExist) {
                const error = new Error('Token no valido')
                res.status(404).json({ error: error.message })
                return
            }

            const user = await User.findById(tokenExist.user)

            if (!user) {
                const error = new Error('Usuario no encontrado')
                res.status(404).json({ message: error.message })
                return
            }

            user.password = req.body.password

            await Promise.allSettled([user.save(), tokenExist.deleteOne()])

            res.send('La contrseña se reestableció correctamente')
        } catch (error) {
            res.status(500).json({ error: 'Hubo un error al crear la cuenta' })
        }
    }

    static login = async (req: Request, res: Response) => {
        try {
            const { email, password } = req.body

            const user = await User.findOne({ email })

            if (!user) {
                const error = new Error('El Usuario no esta registrado')
                res.status(404).json({ message: error.message })
                return
            }

            if (!user.isActive) {
                const error = new Error('El Usuario no esta confirmado')
                res.status(403).json({ message: error.message })
                return
            }

            const isPasswordCorrect = await checkPassword(password, user.password)

            if (!isPasswordCorrect) {
                const error = new Error('La contraseña es incorrecta')
                res.status(403).json({ message: error.message })
                return
            }

            const token = generateJWT({ id: user._id })

            res.cookie('access_token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
                maxAge: 15 * 60 * 60 * 1000,
            }).send('Sesion iniciada correctamente');

        } catch (error) {
            res.status(500).json({ message: 'Hubo un error' })
        }
    }

    static logout = async (req: Request, res: Response) => {
        res.clearCookie('access_token', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
            path: '/'
        });

        return res.status(200).send('Sesión cerrada correctamente');
    }

    static session = async (req: Request, res: Response) => {
        const user = await User.findById(req.user!._id).select('_id name lastName email isActive profileComplete birthdate avatarUrl')
        res.json(user)
    }

    static onboarding = async (req: Request, res: Response) => {
        try {
            const { fullName, birthdate } = req.body

            // Validate fullName
            if (!fullName || fullName.trim().length < 2 || fullName.trim().length > 50) {
                res.status(400).json({
                    message: 'El nombre completo es requerido y debe tener entre 2 y 50 caracteres',
                })
                return
            }

            // Validate birthdate
            if (!birthdate || isNaN(Date.parse(birthdate))) {
                res.status(400).json({
                    message: 'La fecha de nacimiento es requerida',
                })
                return
            }

            const user = await User.findById(req.user!._id)
            if (!user) {
                res.status(404).json({ message: 'Usuario no encontrado' })
                return
            }

            if (user.profileComplete) {
                res.status(409).json({ message: 'El perfil ya fue completado' })
                return
            }

            // Split fullName into name and lastName (first word = name, rest = lastName)
            const nameParts = fullName.trim().split(/\s+/)
            if (nameParts.length < 2) {
                res.status(400).json({ message: 'El nombre completo debe tener al menos 2 palabras' })
                return
            }
            user.name = nameParts[0]
            user.lastName = nameParts.slice(1).join(' ')
            user.birthdate = new Date(birthdate)
            user.profileComplete = true

            await user.save()

            res.status(201).json({ message: 'Perfil completado correctamente' })
        } catch (error) {
            console.error(error)
            res.status(500).json({ message: 'Hubo un error al completar el perfil' })
        }
    }

    /** @deprecated Use UserController.getUserProfile via GET /api/users/profile instead */
    static getProfile = async (req: Request, res: Response) => {
        try {
            const user = await User.findById(req.user!._id).select('-password -__v')

            if (!user) {
                res.status(404).json({ message: 'Usuario no encontrado' })
                return
            }

            if (!user.profileComplete) {
                res.status(200).json({ user, profile: null })
                return
            }

            res.status(200).json({
                user,
                profile: {
                    fullName: `${user.name} ${user.lastName}`,
                    birthdate: user.birthdate,
                    avatarUrl: user.avatarUrl,
                },
            })
        } catch (error) {
            console.error(error)
            res.status(500).json({ message: 'Hubo un error al obtener el perfil' })
        }
    }

    /** @deprecated Use UserController.updateUserProfile via PUT /api/users/profile instead */
    static updateProfile = async (req: Request, res: Response) => {
        const { name, lastName, birthdate, avatarUrl } = req.body

        const userExists = await User.findById(req.user!._id)
        if (!userExists) {
            const error = new Error('Usuario no encontrado')
            res.status(404).json({ message: error.message })
            return
        }

        userExists.name = name
        userExists.lastName = lastName
        if (birthdate) userExists.birthdate = birthdate
        if (avatarUrl !== undefined) userExists.avatarUrl = avatarUrl

        try {
            await userExists.save()
            res.send('Perfil actualizado correctamente')
        } catch (error) {
            res.status(500).json({ message: 'Hubo un error al actualizar el perfil' })
        }
    }

    static updateCurrentUserPassword = async (req: Request, res: Response) => {
        const { currentPassword, password } = req.body

        const user = await User.findById(req.user!._id)
        if (!user) {
            const error = new Error('Usuario no encontrado')
            res.status(404).json({ message: error.message })
            return
        }

        const isPasswordCorrect = await checkPassword(currentPassword, user.password)
        if (!isPasswordCorrect) {
            const error = new Error('El Password actual es incorrecto')
            res.status(401).json({ message: error.message })
            return
        }

        try {
            user.password = password
            await user.save()
            res.send('El Password se modificó correctamente')
        } catch (error) {
            res.status(500).json({ message: 'Hubo un error al modificar el password' })
        }
    }

}