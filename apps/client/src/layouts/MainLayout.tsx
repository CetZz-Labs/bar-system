import { useAuth } from "@/hooks/useAuth";
import { Outlet, Navigate, useLocation, Link } from "react-router";
import { Home, Users, User, Store } from "lucide-react";

export default function MainLayout() {
    const { data, isLoading, isProfileComplete } = useAuth()
    const location = useLocation()

    if (isLoading) return <div>Loading...</div>

    if (!data) return <Navigate to="/login" />

    if (!isProfileComplete && location.pathname !== "/onboarding") {
        return <Navigate to="/onboarding" />
    }

    const showNav = location.pathname !== "/onboarding"

    return (
        <div className="relative min-h-[100dvh]">
            <Outlet />

            {showNav && (
                <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around h-[var(--height-nav)] bg-surface/90 backdrop-blur-md border-t border-border max-w-[var(--width-app)] mx-auto">
                    <Link
                        to="/"
                        className={`flex flex-col items-center justify-center gap-1 w-16 h-full transition-colors ${location.pathname === '/' ? 'text-lime' : 'text-text-secondary hover:text-text-primary'}`}
                        aria-label="Inicio"
                    >
                        <Home size={24} />
                        <span className="text-[10px] font-ui font-medium">Inicio</span>
                    </Link>
                    <Link
                        to="/groups"
                        className={`flex flex-col items-center justify-center gap-1 w-16 h-full transition-colors ${location.pathname.startsWith('/groups') ? 'text-lime' : 'text-text-secondary hover:text-text-primary'}`}
                        aria-label="Grupos"
                    >
                        <Users size={24} />
                        <span className="text-[10px] font-ui font-medium">Grupos</span>
                    </Link>
                    <Link
                        to="/bar/mis-bares"
                        className={`flex flex-col items-center justify-center gap-1 w-16 h-full transition-colors ${location.pathname.startsWith('/bar') ? 'text-lime' : 'text-text-secondary hover:text-text-primary'}`}
                        aria-label="Mis bares"
                    >
                        <Store size={24} />
                        <span className="text-[10px] font-ui font-medium">Mis bares</span>
                    </Link>
                    <Link
                        to="/profile"
                        className={`flex flex-col items-center justify-center gap-1 w-16 h-full transition-colors ${location.pathname === '/profile' ? 'text-lime' : 'text-text-secondary hover:text-text-primary'}`}
                        aria-label="Perfil"
                    >
                        <User size={24} />
                        <span className="text-[10px] font-ui font-medium">Perfil</span>
                    </Link>
                </nav>
            )}
        </div>
    )
}
