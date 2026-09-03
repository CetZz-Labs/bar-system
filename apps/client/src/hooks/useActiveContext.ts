import { useCashierAuth } from "@/hooks/useCashierAuth";

export type AppMode = "user" | "bar";

/**
 * LB-85: modo activo según JWT.
 * - `bar`: hay sesión de cajero/dueño (cookie con barId) → panel `/bar/:id/cajero`
 * - `user`: sesión de cliente normal
 */
export function useActiveContext() {
  const { data, isLoading, isError } = useCashierAuth();

  const mode: AppMode | null = isLoading ? null : data ? "bar" : "user";
  const barId = data?.bar.id;
  const barRole = data?.role;

  return {
    mode,
    barId,
    barRole,
    isLoading,
    isBarContext: mode === "bar",
    isUserContext: mode === "user",
    /** Home del rol activo (redirect LB-85). */
    roleHome: data?.bar.id ? `/bar/${data.bar.id}/cajero` : "/",
    // isError sin data = no hay turno bar (esperado en modo user)
    cashierProbeFailed: isError && !data,
  };
}
