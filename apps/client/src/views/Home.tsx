import { Link } from "react-router"
import { Button } from "@/components/ui/Button"
import { Users, Plus } from "lucide-react"

export default function Home() {
    return (
        <div className="flex flex-col items-center justify-center min-h-[100dvh] px-4 pb-nav">
            <div className="flex flex-col items-center gap-6 max-w-sm w-full">
                <div className="flex items-center justify-center w-16 h-16 rounded-full bg-lime-dim">
                    <Users size={32} className="text-lime" />
                </div>
                <div className="text-center">
                    <h1 className="text-2xl font-display font-bold tracking-tight mb-2">
                        Bienvenido a La Banda
                    </h1>
                    <p className="text-text-secondary text-base">
                        Organizá tu grupo, acumulá puntos y competí junto a tus amigos.
                    </p>
                </div>
                <Link to="/groups/create" className="w-full">
                    <Button variant="primary" size="lg" fullWidth>
                        <Plus size={20} />
                        Crear grupo
                    </Button>
                </Link>
            </div>
        </div>
    )
}
