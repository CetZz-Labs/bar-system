import { useAuth } from "@/hooks/useAuth";
import { Outlet, Navigate, useLocation } from "react-router";

function getPostLoginRedirect(location: ReturnType<typeof useLocation>): string | null {
    const fromState = (location.state as { from?: string } | null)?.from
    const redirectParam = new URLSearchParams(location.search).get("redirect")
    return fromState || redirectParam || null
}

export default function AuthLayout() {
    const { data, isLoading, isProfileComplete } = useAuth()
    const location = useLocation()

    if (isLoading) return <div>Loading...</div>

    if (data) {
        const redirectTo = getPostLoginRedirect(location)
        if (redirectTo) {
            return <Navigate to={redirectTo} replace />
        }
        return <Navigate to={isProfileComplete ? '/' : '/onboarding'} replace />
    }

    return (
        <main className="flex min-h-screen items-center justify-center">
            <Outlet />
        </main>
    )
}
