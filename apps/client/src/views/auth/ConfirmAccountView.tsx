import { confirmAccount } from "@/API/AuthAPI"
import type { ConfirmToken } from "@/types/auth"
import { toastApiError } from "@/utils/apiError"
import { PinInput, PinInputField } from "@chakra-ui/pin-input"
import { useMutation } from "@tanstack/react-query"
import { useState } from "react"
import { Link, useNavigate } from "react-router"
import { toast } from "sonner"

export default function ConfirmAccountView() {
    const [token, setToken] = useState<ConfirmToken['token']>('')
    const navigate = useNavigate()

    const handleChange = (token: ConfirmToken['token']) => {
        setToken(token)
    }

    const { mutate } = useMutation({
        mutationFn: confirmAccount,
        onError: toastApiError,
        onSuccess: (data) => {
            toast.success(data)
            navigate('/login')
        }
    })

    const handleComplete = (token: ConfirmToken['token']) => mutate({ token })

    return (
        <div>
            <h1>Confirm Account</h1>
            <form>
                <div className="flex justify-center gap-5">
                    <PinInput otp value={token} onChange={handleChange} onComplete={handleComplete}>
                        <PinInputField className="size-10 p-3 rounded-lg border border-gray-300 placeholder-white" />
                        <PinInputField className="size-10 p-3 rounded-lg border border-gray-300 placeholder-white" />
                        <PinInputField className="size-10 p-3 rounded-lg border border-gray-300 placeholder-white" />
                        <PinInputField className="size-10 p-3 rounded-lg border border-gray-300 placeholder-white" />
                        <PinInputField className="size-10 p-3 rounded-lg border border-gray-300 placeholder-white" />
                        <PinInputField className="size-10 p-3 rounded-lg border border-gray-300 placeholder-white" />
                    </PinInput>
                </div>
            </form>

            <Link to="/request-code">Solicitar nuevo código</Link>
        </div>
    )
}
