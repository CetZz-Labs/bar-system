const PREFIX = "lb91:";

export function wasDismissed(key: string): boolean {
  try {
    return localStorage.getItem(PREFIX + key) === "1";
  } catch {
    return true;
  }
}

export function dismiss(key: string): void {
  try {
    localStorage.setItem(PREFIX + key, "1");
  } catch {
    // private mode / quota — skip silently
  }
}

export function clearDismiss(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}

/** Marca el wizard de producto para mostrarse una vez tras completar perfil. */
export function markWizardPending(): void {
  try {
    localStorage.setItem(PREFIX + "wizard-pending", "1");
    localStorage.removeItem(PREFIX + FIRST_VISIT_KEYS.wizard);
  } catch {
    // ignore
  }
}

export function isWizardPending(): boolean {
  try {
    return localStorage.getItem(PREFIX + "wizard-pending") === "1";
  } catch {
    return false;
  }
}

export function clearWizardPending(): void {
  try {
    localStorage.removeItem(PREFIX + "wizard-pending");
  } catch {
    // ignore
  }
}

export const FIRST_VISIT_KEYS = {
  wizard: "wizard",
  coachHome: "coach:home",
  coachRewards: "coach:rewards",
  coachHistory: "coach:history",
  a2hs: "a2hs",
} as const;
