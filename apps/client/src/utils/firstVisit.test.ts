import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { dismiss, wasDismissed, clearDismiss, FIRST_VISIT_KEYS, markWizardPending, isWizardPending, clearWizardPending } from "./firstVisit";

describe("firstVisit (LB-91)", () => {
  beforeEach(() => {
    clearDismiss(FIRST_VISIT_KEYS.wizard);
    clearWizardPending();
  });

  afterEach(() => {
    clearDismiss(FIRST_VISIT_KEYS.wizard);
    clearWizardPending();
  });

  it("starts undismissed and persists dismiss", () => {
    expect(wasDismissed(FIRST_VISIT_KEYS.wizard)).toBe(false);
    dismiss(FIRST_VISIT_KEYS.wizard);
    expect(wasDismissed(FIRST_VISIT_KEYS.wizard)).toBe(true);
  });

  it("wizard pending is set after profile onboarding", () => {
    expect(isWizardPending()).toBe(false);
    markWizardPending();
    expect(isWizardPending()).toBe(true);
    clearWizardPending();
    expect(isWizardPending()).toBe(false);
  });
});
