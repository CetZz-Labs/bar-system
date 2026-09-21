import { describe, it, expect, beforeEach } from "vitest";
import { createEventGate } from "./useGroupPointsSocket";

describe("createEventGate (LB-88)", () => {
  let gate: ReturnType<typeof createEventGate>;

  beforeEach(() => {
    gate = createEventGate();
  });

  it("accepts the first event and rejects duplicate eventId", () => {
    expect(gate.accept({ eventId: "a", seq: 1 })).toBe(true);
    expect(gate.accept({ eventId: "a", seq: 1 })).toBe(false);
  });

  it("rejects out-of-order seq", () => {
    expect(gate.accept({ eventId: "1", seq: 2 })).toBe(true);
    expect(gate.accept({ eventId: "2", seq: 1 })).toBe(false);
    expect(gate.accept({ eventId: "3", seq: 3 })).toBe(true);
  });

  it("accepts events without envelope (backward compatible)", () => {
    expect(gate.accept({})).toBe(true);
    expect(gate.accept({})).toBe(true);
  });

  it("bumpSeqFloor raises the floor after HTTP snapshot", () => {
    gate.bumpSeqFloor(10);
    expect(gate.accept({ eventId: "x", seq: 9 })).toBe(false);
    expect(gate.accept({ eventId: "y", seq: 11 })).toBe(true);
  });
});
