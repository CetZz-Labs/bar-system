import { useNavigate } from "react-router";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
    const navigate = useNavigate();

    const handleGoBack = () => {
        // react-router v7 stores the entry index of the current history
        // entry in `history.state.idx` when navigation happened through its
        // own BrowserRouter. If it's missing or 0, there's no previous
        // in-app entry to go back to (e.g. the user landed directly on a
        // broken URL), so we fall back to the home route instead of
        // navigating outside the app.
        const historyIndex = (window.history.state as { idx?: number } | null)?.idx;

        if (historyIndex) {
            navigate(-1);
        } else {
            navigate("/");
        }
    };

    return (
        <div className="flex flex-col min-h-[100dvh]">
            <div className="flex flex-col items-center justify-center flex-1 gap-4 px-4 text-center">
                <AlertCircle size={48} className="text-text-muted" />
                <div>
                    <p className="text-text-primary text-lg font-semibold">
                        Página no encontrada
                    </p>
                    <p className="text-text-secondary text-sm mt-1">
                        La página que buscás no existe o fue movida.
                    </p>
                </div>
                <Button variant="outline" size="md" onClick={handleGoBack}>
                    Volver
                </Button>
            </div>
        </div>
    );
}
