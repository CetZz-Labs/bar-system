import api from "@/libs/axios";
import { throwStandardError } from "@/utils/apiError";
import type {
    PushPreferences,
    PushSubscriptionPayload,
    UpdatePushPreferencesInput,
} from "@/types/push";

// LB-80: funciones Axios puras (frontend.md §3). Sin JSX, sin toasts, sin
// React Query. Instancia central `@/libs/axios` (withCredentials: true).

export async function subscribePush(subscription: PushSubscriptionPayload) {
    try {
        const { data } = await api.post<{ message: string }>(
            '/push/subscriptions',
            subscription,
        );
        return data;
    } catch (error) {
        throwStandardError(error);
    }
}

export async function unsubscribePush(endpoint: string) {
    try {
        await api.delete('/push/subscriptions', { data: { endpoint } });
    } catch (error) {
        throwStandardError(error);
    }
}

export async function updatePushPreferences(prefs: UpdatePushPreferencesInput) {
    try {
        const { data } = await api.patch<{ notificationPreferences: PushPreferences }>(
            '/push/preferences',
            prefs,
        );
        return data.notificationPreferences;
    } catch (error) {
        throwStandardError(error);
    }
}
