import { requestConfirmationCode } from "@/API/AuthAPI"
import type { RequestToken } from "@/types/auth"
import { toastApiError } from "@/utils/apiError"
import { useMutation } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { toast } from "sonner"

export default function RequestNewCodeView() {
    const defaultValues: RequestToken = {
        email: '',
    }

    const { register, handleSubmit } = useForm<RequestToken>({ defaultValues })

    const { mutate } = useMutation({
        mutationFn: requestConfirmationCode,
        onError: toastApiError,
        onSuccess: (data) => {
            toast.success(data)
        }
    })

    const onSubmit = (formData: RequestToken) => mutate(formData)


    return (
        <div>
            <h1>Request new code</h1>
            <form onSubmit={handleSubmit(onSubmit)}>
                <input type="email" placeholder="Email" {...register("email")} />
                <button type="submit">Request code</button>
            </form>
        </div>
    )
}
