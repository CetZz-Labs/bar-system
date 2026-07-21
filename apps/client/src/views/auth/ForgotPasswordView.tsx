import { useForm } from "react-hook-form";
import { Link } from "react-router";
import type { ForgotPasswordForm } from "@/types/auth";
import { useMutation } from "@tanstack/react-query";
import { forgotPassword } from "@/API/AuthAPI";
import { toast } from "sonner"

export default function ForgotPasswordView() {
    const initialValues: ForgotPasswordForm = {
        email: ''
    }
    const { register, handleSubmit, reset } = useForm<ForgotPasswordForm>({ defaultValues: initialValues });

    const { mutate } = useMutation({
        mutationFn: forgotPassword,
        onError: (error) => {
            toast.error(error.message)
        },
        onSuccess: (data) => {
            toast.success(data)
            reset()
        }
    })

    const handleForgotPassword = (formData: ForgotPasswordForm) => mutate(formData)

    return (
        <>
            <h1>Reestablecer Contrseña</h1>
            <p> Coloca tu email y {''} <span> reestablecer tu contraseña</span> </p>
            <form
                onSubmit={handleSubmit(handleForgotPassword)}
                noValidate
            >
                <div>
                    <label htmlFor="email">Email</label>
                    <input
                        id="email"
                        type="email"
                        placeholder="Email de Registro"
                        {...register("email", {
                            required: "El Email de registro es obligatorio",
                            pattern: {
                                value: /\S+@\S+\.\S+/,
                                message: "E-mail no válido",
                            },
                        })}
                    />
                </div>

                <input type="submit" className="cursor-pointer" value='Enviar Instrucciones' />
            </form>

            <nav>
                <Link to='/login'> ¿Ya tienes cuenta? Iniciar Sesión </Link>
                <Link to='/register'> ¿No tienes cuenta? Crea una </Link>
            </nav>
        </>
    )
}