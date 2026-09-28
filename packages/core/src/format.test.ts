import { describe, expect, it } from "vitest";
import { formatSlotLong, formatSlotShort } from "./format";

describe("format", () => {
  it("formats in Zagreb time regardless of input offset", () => {
    expect(formatSlotLong("2026-09-30T16:00:00+02:00")).toBe("srijeda 30.9. u 16:00");
    expect(formatSlotLong("2026-09-30T14:00:00Z")).toBe("srijeda 30.9. u 16:00");
  });

  it("handles winter time (CET, +01:00)", () => {
    expect(formatSlotLong("2026-12-01T13:00:00+01:00")).toBe("utorak 1.12. u 13:00");
  });

  it("short form fits a 20-char WhatsApp button", () => {
    const short = formatSlotShort("2026-09-24T09:05:00+02:00");
    expect(short).toBe("Čet 24.9. 09:05");
    expect(formatSlotShort("2026-12-31T23:30:00+01:00").length).toBeLessThanOrEqual(20);
  });
});
