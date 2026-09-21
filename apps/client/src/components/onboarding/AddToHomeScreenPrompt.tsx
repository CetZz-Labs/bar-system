import { useEffect, useState, useCallback, useRef } from "react";
import { Download } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { dismiss, FIRST_VISIT_KEYS, wasDismissed } from "@/utils/firstVisit";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * LB-91: prompt "Agregar a pantalla de inicio" tras 30s de uso.
 * Usa `beforeinstallprompt` cuando el browser lo soporta; si no, muestra
 * instrucciones genéricas (iOS Safari).
 */
export function AddToHomeScreenPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [open, setOpen] = useState(false);
  const [iosHint, setIosHint] = useState(false);
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (wasDismissed(FIRST_VISIT_KEYS.a2hs)) return;

    const onBip = (e: Event) => {
      e.preventDefault();
      const ev = e as BeforeInstallPromptEvent;
      deferredRef.current = ev;
      setDeferred(ev);
    };
    window.addEventListener("beforeinstallprompt", onBip);

    const timer = window.setTimeout(() => {
      if (wasDismissed(FIRST_VISIT_KEYS.a2hs)) return;
      const isIos =
        /iphone|ipad|ipod/i.test(navigator.userAgent) &&
        !(
          "standalone" in navigator &&
          (navigator as Navigator & { standalone?: boolean }).standalone
        );
      setIosHint(isIos);
      setOpen(true);
    }, 30_000);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.clearTimeout(timer);
    };
  }, []);

  const close = useCallback(() => {
    dismiss(FIRST_VISIT_KEYS.a2hs);
    setOpen(false);
  }, []);

  const install = async () => {
    const ev = deferredRef.current ?? deferred;
    if (!ev) {
      close();
      return;
    }
    await ev.prompt();
    await ev.userChoice;
    close();
  };

  return (
    <Modal
      isOpen={open}
      onClose={close}
      title="Agregar a inicio"
      description={
        iosHint
          ? "En Safari: Compartir → Agregar a pantalla de inicio. Así abrís La Banda como app."
          : "Instalá La Banda en tu pantalla de inicio para acceso rápido sin buscar el navegador."
      }
      size="sm"
      showCloseButton
      hideFooter
    >
      <div className="flex flex-col gap-2 mt-2">
        {!iosHint && deferred && (
          <Button variant="primary" size="lg" fullWidth onClick={() => void install()}>
            <Download size={18} />
            Agregar
          </Button>
        )}
        <Button variant="ghost" size="md" fullWidth onClick={close}>
          Ahora no
        </Button>
      </div>
    </Modal>
  );
}
