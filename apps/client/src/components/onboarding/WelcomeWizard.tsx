import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Users, UserPlus, Beer, ArrowRight } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { dismiss, FIRST_VISIT_KEYS, isWizardPending, clearWizardPending, wasDismissed } from "@/utils/firstVisit";

const STEPS = [
  {
    icon: Users,
    title: "Creá o unite a un grupo",
    body: "Tu banda es el centro: juntos acumulan puntos en cada salida al bar.",
  },
  {
    icon: UserPlus,
    title: "Invitá a tus amigos",
    body: "Compartí el código de 6 caracteres. Cuando se unan, todos suman al mismo saldo.",
  },
  {
    icon: Beer,
    title: "Salidas y puntos",
    body: "Armá una salida, confirmá consumos y canjeá recompensas en el bar.",
  },
] as const;

/**
 * LB-91: wizard 3 pasos post-perfil. Siempre se puede saltar.
 * Solo aparece si OnboardingView marcó `wizard-pending` (usuarios nuevos).
 */
export function WelcomeWizard() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (isWizardPending() && !wasDismissed(FIRST_VISIT_KEYS.wizard)) {
      setOpen(true);
    }
  }, []);

  const close = () => {
    clearWizardPending();
    dismiss(FIRST_VISIT_KEYS.wizard);
    setOpen(false);
  };

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <Modal
      isOpen={open}
      onClose={close}
      title={current.title}
      description={current.body}
      size="md"
      showCloseButton
      hideFooter
    >
      <div className="flex flex-col items-center gap-4 py-2">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-lime-dim">
          <Icon size={28} className="text-lime" />
        </div>
        <p className="text-xs text-text-muted m-0">
          Paso {step + 1} de {STEPS.length}
        </p>
        <div className="flex w-full flex-col gap-2 mt-2">
          {!isLast ? (
            <Button variant="primary" size="lg" fullWidth onClick={() => setStep((s) => s + 1)}>
              Siguiente
              <ArrowRight size={18} />
            </Button>
          ) : (
            <Link to="/groups/create" className="w-full no-underline" onClick={close}>
              <Button variant="primary" size="lg" fullWidth>
                Crear mi grupo
              </Button>
            </Link>
          )}
          <Button variant="ghost" size="md" fullWidth onClick={close}>
            Saltar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
