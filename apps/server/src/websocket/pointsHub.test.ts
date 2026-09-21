import { describe, it, expect, beforeEach } from "vitest";
import { makeEnvelope, nextGroupSeq, resetGroupSeqForTests } from "./pointsHub";

describe("pointsHub envelope (LB-88)", () => {
  beforeEach(() => {
    resetGroupSeqForTests();
  });

  it("issues monotonic seq per group", () => {
    expect(nextGroupSeq("g1")).toBe(1);
    expect(nextGroupSeq("g1")).toBe(2);
    expect(nextGroupSeq("g2")).toBe(1);
    expect(nextGroupSeq("g1")).toBe(3);
  });

  it("makeEnvelope returns eventId + seq", () => {
    const a = makeEnvelope("g1");
    const b = makeEnvelope("g1");
    expect(a.eventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(a.eventId).not.toBe(b.eventId);
    expect(a.seq).toBe(1);
    expect(b.seq).toBe(2);
  });
});
