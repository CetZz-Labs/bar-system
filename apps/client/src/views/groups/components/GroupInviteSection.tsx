import { useState } from "react";
import { Copy, Check, Share2, QrCode, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { toast } from "sonner";
import { getGroupQRUrl } from "@/API/GroupAPI";
import { motion, AnimatePresence } from "motion/react";

interface GroupInviteSectionProps {
  inviteCode: string;
  inviteLink: string;
  groupName: string;
  slug: string;
}

export default function GroupInviteSection({
  inviteCode,
  inviteLink,
  groupName,
  slug,
}: GroupInviteSectionProps) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [qrFullscreen, setQrFullscreen] = useState(false);

  const getFullLink = (): string => {
    if (inviteLink.startsWith("http")) return inviteLink;
    if (inviteLink.startsWith("/")) return `${window.location.origin}${inviteLink}`;
    // Formato tipo labanda.app/unirse/BAN4K2
    return `https://${inviteLink}`;
  };

  const shareText = `¡Unite a ${groupName} en La Banda! Usá el código ${inviteCode} o entrá por acá: ${getFullLink()}`;

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopiedCode(true);
      toast.success("Código copiado");
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      toast.error("No se pudo copiar el código");
    }
  };

  const handleShareOrCopyLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Únete a ${groupName} en La Banda`,
          text: shareText,
        });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(shareText);
      setCopiedLink(true);
      toast.success("¡Link copiado!");
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      toast.error("No se pudo copiar el link");
    }
  };

  const qrUrl = getGroupQRUrl(slug);

  return (
    <>
      <div className="w-full bg-surface-2 border border-border rounded-xl p-4">
        <p className="text-text-muted text-xs overline mb-3">
          CÓDIGO DE INVITACIÓN
        </p>

        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={handleCopyCode}
            className="flex-1 font-mono text-lg text-text-primary bg-surface border border-border rounded-md px-3 py-2 text-center tracking-widest cursor-pointer transition-colors hover:border-lime-border active:bg-surface-3"
            aria-label="Copiar código de invitación"
          >
            {inviteCode}
          </button>
          <Button
            variant="surface"
            size="sm"
            onClick={handleCopyCode}
            aria-label="Copiar código de invitación"
          >
            {copiedCode ? (
              <Check size={16} className="text-lime" />
            ) : (
              <Copy size={16} />
            )}
          </Button>
        </div>

        {/* QR Preview */}
        <button
          onClick={() => setQrFullscreen(true)}
          className="w-full flex flex-col items-center gap-2 mb-4 p-3 bg-surface border border-border rounded-lg cursor-pointer transition-colors hover:border-lime-border"
          aria-label="Ver QR en pantalla completa"
        >
          <img
            src={qrUrl}
            alt={`QR de invitación de ${groupName}`}
            className="w-24 h-24 object-contain"
            loading="lazy"
          />
          <span className="text-text-secondary text-xs font-ui flex items-center gap-1">
            <QrCode size={12} />
            Tocá para ampliar
          </span>
        </button>

        <Button
          variant="outline"
          size="md"
          className="w-full"
          onClick={handleShareOrCopyLink}
          aria-label="Compartir link de invitación"
        >
          {copiedLink ? (
            <Check size={18} className="text-lime mr-2" />
          ) : (
            <Share2 size={18} className="mr-2" />
          )}
          {copiedLink ? "Link copiado" : "Compartir link"}
        </Button>
      </div>

      {/* QR Fullscreen Overlay */}
      <AnimatePresence>
        {qrFullscreen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6 bg-black/90"
            onClick={() => setQrFullscreen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="QR de invitación en pantalla completa"
          >
            <button
              onClick={() => setQrFullscreen(false)}
              className="absolute top-6 right-6 text-white/80 hover:text-white transition-colors"
              aria-label="Cerrar"
            >
              <X size={32} />
            </button>
            <div className="flex flex-col items-center gap-4">
              <img
                src={qrUrl}
                alt={`QR de invitación de ${groupName}`}
                className="w-64 h-64 object-contain bg-white p-4 rounded-xl"
              />
              <p className="text-white text-lg font-display font-bold text-center">
                {groupName}
              </p>
              <p className="text-white/70 text-sm text-center">
                Mostrale este QR al cajero para identificar al grupo
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
