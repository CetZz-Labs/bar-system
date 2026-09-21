import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";
import { CURRENT_TERMS_VERSION } from "@/constants/legal";

type Props = {
  title: string;
  children: React.ReactNode;
};

function LegalShell({ title, children }: Props) {
  return (
    <div className="flex flex-col flex-1 pb-nav px-4 pt-5 min-h-[100dvh] max-w-xl mx-auto w-full">
      <header className="flex items-center gap-4 mb-8">
        <Link
          to="/register"
          className="flex justify-center items-center w-10 h-10 rounded-full bg-surface-2 border border-border transition-colors hover:bg-surface-3"
          aria-label="Volver"
        >
          <ArrowLeft size={20} className="text-text-secondary" />
        </Link>
        <div>
          <h1 className="text-xl font-display font-bold m-0">{title}</h1>
          <p className="text-text-muted text-xs mt-1">Versión {CURRENT_TERMS_VERSION}</p>
        </div>
      </header>
      <article className="flex flex-col gap-4 text-text-secondary text-sm leading-relaxed pb-8">
        {children}
      </article>
    </div>
  );
}

export function TermsView() {
  return (
    <LegalShell title="Términos y condiciones">
      <p>
        Estos Términos y Condiciones regulan el uso de la aplicación La Banda
        (servicios de salidas, grupos, puntos y canjes en bares adheridos).
      </p>
      <p>
        Al crear una cuenta declarás haber leído y aceptado estos términos, la
        Política de Privacidad y que sos mayor de 18 años.
      </p>
      <p>
        El contenido definitivo de este documento puede actualizarse; la versión
        aceptada queda registrada en tu cuenta al momento del alta.
      </p>
    </LegalShell>
  );
}

export function PrivacyView() {
  return (
    <LegalShell title="Política de privacidad">
      <p>
        Tratamos tus datos personales (nombre, email, teléfono, fecha de
        nacimiento y actividad en la app) para operar la cuenta, puntos, salidas
        y canjes, y para comunicarte novedades operativas.
      </p>
      <p>
        No vendemos tus datos. Podés solicitar acceso o eliminación de tu cuenta
        contactando al soporte de La Banda.
      </p>
      <p>
        La versión aceptada al registrarte queda registrada junto con la fecha
        de aceptación.
      </p>
    </LegalShell>
  );
}
