import { describe, expect, it } from "vitest";
import { Client, Hold, ParsedSlots, Slot, SlotInput } from "./schemas";

describe("SlotInput", () => {
  it("accepts an ISO datetime with offset and defaults duration to 60", () => {
    expect(SlotInput.parse({ startsAt: "2026-09-30T16:00:00+02:00" })).toEqual({
      startsAt: "2026-09-30T16:00:00+02:00",
      durationMin: 60,
    });
  });

  it("rejects a datetime without offset (ambiguous time zone)", () => {
    expect(SlotInput.safeParse({ startsAt: "2026-09-30T16:00:00" }).success).toBe(false);
  });

  it("rejects free text and silly durations", () => {
    expect(SlotInput.safeParse({ startsAt: "srijeda 16h" }).success).toBe(false);
    expect(
      SlotInput.safeParse({ startsAt: "2026-09-30T16:00:00+02:00", durationMin: 0 }).success,
    ).toBe(false);
  });
});

describe("ParsedSlots", () => {
  it("accepts slots", () => {
    const result = ParsedSlots.parse({
      kind: "slots",
      slots: [
        { startsAt: "2026-09-30T16:00:00+02:00" },
        { startsAt: "2026-09-29T13:00:00+02:00", durationMin: 90 },
      ],
    });
    expect(result.kind).toBe("slots");
  });

  it("accepts a question for the coach", () => {
    expect(ParsedSlots.parse({ kind: "unclear", question: "Koji dan misliš?" }).kind).toBe(
      "unclear",
    );
  });

  it("rejects an empty slot list and more than fits in one WhatsApp list", () => {
    expect(ParsedSlots.safeParse({ kind: "slots", slots: [] }).success).toBe(false);
    const ten = Array.from({ length: 10 }, (_, i) => ({
      startsAt: `2026-09-30T${String(8 + i).padStart(2, "0")}:00:00+02:00`,
    }));
    expect(ParsedSlots.safeParse({ kind: "slots", slots: ten }).success).toBe(false);
  });

  it("rejects unknown shapes", () => {
    expect(ParsedSlots.safeParse({ slots: [] }).success).toBe(false);
  });
});

describe("domain", () => {
  it("validates client phone as E.164", () => {
    expect(Client.safeParse({ id: "c1", phone: "+385911234567", name: "Marko" }).success).toBe(
      true,
    );
    expect(Client.safeParse({ id: "c1", phone: "091 123 4567", name: "Marko" }).success).toBe(
      false,
    );
  });

  it("allows draft slots (offeredAt null) and unsynced holds", () => {
    expect(
      Slot.safeParse({
        id: "s1",
        startsAt: "2026-09-30T16:00:00+02:00",
        durationMin: 60,
        status: "open",
        offeredAt: null,
        createdAt: "2026-09-28T10:00:00Z",
      }).success,
    ).toBe(true);
    expect(
      Hold.safeParse({
        id: "h1",
        slotId: "s1",
        clientId: "c1",
        status: "held",
        calendarEventId: null,
        createdAt: "2026-09-28T10:00:00Z",
      }).success,
    ).toBe(true);
  });

  it("rejects unknown statuses", () => {
    expect(
      Hold.safeParse({
        id: "h1",
        slotId: "s1",
        clientId: "c1",
        status: "pending",
        calendarEventId: null,
        createdAt: "2026-09-28T10:00:00Z",
      }).success,
    ).toBe(false);
  });
});
