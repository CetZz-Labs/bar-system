import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { updatePushPreferences } from "@/API/pushApi";
import { toastApiError } from "@/utils/apiError";
import type { PushPreferences, UpdatePushPreferencesInput } from "@/types/push";

// LB-80: sección "Notificaciones push" del perfil. Un botón para activar /
// desactivar push (permiso + suscripción) y 3 toggles de categoría.
// `canjes` se muestra pero queda deshabilitado (no-desactivable, LB-57).

const DEFAULT_PREFERENCES: PushPreferences = {
    salidas: true,
    consumos: true,
    canjes: true,
};

type EditableCategory = keyof UpdatePushPreferencesInput;

interface CategoryRow {
    key: keyof PushPreferences;
    label: string;
    description: string;
    editable: boolean;
}

const CATEGORY_ROWS: CategoryRow[] = [
    { key: 'salidas', label: 'Salidas', description: 'Check-in de una salida confirmado por el bar', editable: true },
    { key: 'consumos', label: 'Consumos', description: 'Un consumo pasó a disputa', editable: true },
    { key: 'canjes', label: 'Canjes', description: 'Un canje fue entregado en el bar', editable: false },
];

interface ToggleProps {
    checked: boolean;
    disabled?: boolean;
    onChange: () => void;
    label: string;
}

function Toggle({ checked, disabled = false, onChange, label }: ToggleProps) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            onClick={onChange}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                checked ? 'bg-lime' : 'bg-surface-3'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
            <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    checked ? 'translate-x-6' : 'translate-x-1'
                }`}
            />
        </button>
    );
}

interface PushNotificationsSectionProps {
    preferences?: PushPreferences;
}

export default function PushNotificationsSection({ preferences }: PushNotificationsSectionProps) {
    const queryClient = useQueryClient();
    const { supported, permission, isSubscribed, enable, disable, isBusy } = usePushNotifications();

    const prefs = preferences ?? DEFAULT_PREFERENCES;

    const { mutate: savePreferences, isPending: isSavingPreferences } = useMutation({
        mutationFn: updatePushPreferences,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['userProfile'] });
            toast.success('Preferencias de notificación actualizadas');
        },
        onError: toastApiError,
    });

    const handleToggleCategory = useCallback(
        (key: EditableCategory) => {
            savePreferences({ [key]: !prefs[key] });
        },
        [prefs, savePreferences],
    );

    if (!supported) {
        return (
            <div className="mb-8">
                <h2 className="text-lg font-display font-bold tracking-tight mb-2 flex items-center gap-2">
                    <BellOff size={20} className="text-text-muted" />
                    Notificaciones push
                </h2>
                <p className="text-text-secondary text-sm">
                    Tu navegador no soporta notificaciones push.
                </p>
            </div>
        );
    }

    return (
        <div className="mb-8">
            <h2 className="text-lg font-display font-bold tracking-tight mb-4 flex items-center gap-2">
                <Bell size={20} className="text-lime" />
                Notificaciones push
            </h2>

            <div className="flex items-center justify-between gap-4 p-4 bg-surface-2 rounded-xl border border-border mb-3">
                <div className="min-w-0">
                    <p className="font-ui font-semibold text-text-primary">
                        {isSubscribed ? 'Activadas en este dispositivo' : 'Desactivadas en este dispositivo'}
                    </p>
                    <p className="text-text-secondary text-sm">
                        Recibí avisos aunque no tengas la app abierta.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => (isSubscribed ? disable() : enable())}
                    disabled={isBusy}
                    className="shrink-0 px-4 py-2 text-sm rounded-md font-ui font-semibold bg-lime text-bg disabled:opacity-50 cursor-pointer"
                >
                    {isBusy ? (
                        <Loader2 size={16} className="animate-spin" />
                    ) : isSubscribed ? (
                        'Desactivar'
                    ) : (
                        'Activar'
                    )}
                </button>
            </div>

            {permission === 'denied' && (
                <p className="text-error text-sm mb-3">
                    Bloqueaste las notificaciones para este sitio. Habilitalas desde la
                    configuración del navegador para poder activarlas.
                </p>
            )}

            <div className="flex flex-col gap-2">
                {CATEGORY_ROWS.map((row) => (
                    <div
                        key={row.key}
                        className="flex items-center justify-between gap-4 p-4 bg-surface-2 rounded-xl border border-border"
                    >
                        <div className="min-w-0">
                            <p className="font-ui font-medium text-text-primary">{row.label}</p>
                            <p className="text-text-secondary text-sm">
                                {row.editable ? row.description : `${row.description} · no se puede desactivar`}
                            </p>
                        </div>
                        <Toggle
                            label={row.label}
                            checked={row.editable ? prefs[row.key] : true}
                            disabled={!row.editable || isSavingPreferences}
                            onChange={() => handleToggleCategory(row.key as EditableCategory)}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}
