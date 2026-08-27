import { useCallback, useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { subscribePush, unsubscribePush } from "@/API/pushApi";
import { toastApiError } from "@/utils/apiError";
import type { PushSubscriptionPayload } from "@/types/push";

// LB-80: orquesta el permiso del navegador + la suscripción `PushManager` +
// el POST/DELETE al backend. `enable()` DEBE dispararse desde un gesto del
// usuario. Si el permiso queda `denied`, silencio: sin reintentos, sin
// bloquear nada. Feedback con `sonner`.

function isPushSupported(): boolean {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    return (
        'serviceWorker' in navigator &&
        Boolean((window as Window & { PushManager?: unknown }).PushManager) &&
        'Notification' in window &&
        typeof Notification !== 'undefined'
    );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const buffer = new ArrayBuffer(rawData.length);
    const output = new Uint8Array(buffer);
    for (let i = 0; i < rawData.length; i += 1) {
        output[i] = rawData.charCodeAt(i);
    }
    return output;
}

function toPayload(sub: PushSubscription): PushSubscriptionPayload {
    const json = sub.toJSON();
    return {
        endpoint: sub.endpoint,
        expirationTime: sub.expirationTime ?? null,
        keys: {
            p256dh: json.keys?.p256dh ?? '',
            auth: json.keys?.auth ?? '',
        },
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    };
}

export function usePushNotifications() {
    const { data: user } = useAuth();
    const supported = isPushSupported();

    const [permission, setPermission] = useState<NotificationPermission>(
        supported ? Notification.permission : 'denied',
    );
    const [isSubscribed, setIsSubscribed] = useState(false);

    useEffect(() => {
        if (!supported) return;
        let cancelled = false;
        navigator.serviceWorker.ready
            .then((registration) => registration.pushManager.getSubscription())
            .then((sub) => {
                if (!cancelled) setIsSubscribed(Boolean(sub));
            })
            .catch(() => {
                if (!cancelled) setIsSubscribed(false);
            });
        return () => {
            cancelled = true;
        };
    }, [supported]);

    const subscribeMutation = useMutation({
        mutationFn: subscribePush,
        onError: toastApiError,
    });

    const unsubscribeMutation = useMutation({
        mutationFn: unsubscribePush,
        onError: toastApiError,
    });

    const enable = useCallback(async () => {
        if (!supported) {
            toast.error('Tu navegador no soporta notificaciones push');
            return;
        }
        // Sólo suscribimos si hay sesión (useAuth().data presente).
        if (!user) return;

        const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
        if (!vapidPublicKey) {
            toast.error('Falta configurar la clave pública de notificaciones (VAPID)');
            return;
        }

        const result = await Notification.requestPermission();
        setPermission(result);

        if (result !== 'granted') {
            if (result === 'denied') {
                toast.error('Bloqueaste las notificaciones. Habilitalas desde el navegador.');
            }
            return;
        }

        try {
            const registration = await navigator.serviceWorker.ready;
            const existing = await registration.pushManager.getSubscription();
            const subscription =
                existing ??
                (await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
                }));

            await subscribeMutation.mutateAsync(toPayload(subscription));
            setIsSubscribed(true);
            toast.success('Notificaciones push activadas');
        } catch {
            toast.error('No se pudieron activar las notificaciones push');
        }
    }, [supported, user, subscribeMutation]);

    const disable = useCallback(async () => {
        if (!supported) return;
        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();
            if (subscription) {
                await unsubscribeMutation.mutateAsync(subscription.endpoint);
                await subscription.unsubscribe().catch(() => undefined);
            }
            setIsSubscribed(false);
            toast.success('Notificaciones push desactivadas');
        } catch {
            toast.error('No se pudieron desactivar las notificaciones push');
        }
    }, [supported, unsubscribeMutation]);

    return {
        supported,
        permission,
        isSubscribed,
        enable,
        disable,
        isBusy: subscribeMutation.isPending || unsubscribeMutation.isPending,
    };
}
