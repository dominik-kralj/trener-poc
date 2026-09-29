import { describe, expect, it } from "vitest";
import { buildRequest, FALLBACK_QUESTION, interpretToolInput } from "../src/ai/parse-slots";
import { calendarContext, zagrebLocalToIso } from "../src/ai/zagreb";

// Tuesday 29.9.2026, 10:00 in Zagreb.
const NOW = "2026-09-29T08:00:00.000Z";

describe("zagrebLocalToIso", () => {
  it("uses +02:00 in summer time and +01:00 after the DST change", () => {
    expect(zagrebLocalToIso("2026-09-30", "16:00")).toBe("2026-09-30T16:00:00+02:00");
    expect(zagrebLocalToIso("2026-10-26", "16:00")).toBe("2026-10-26T16:00:00+01:00");
    expect(zagrebLocalToIso("2027-03-29", "09:30")).toBe("2027-03-29T09:30:00+02:00");
  });

  it("gets the day of the change itself right", () => {
    // 25.10.2026: clocks go back at 03:00 CEST.
    expect(zagrebLocalToIso("2026-10-25", "01:00")).toBe("2026-10-25T01:00:00+02:00");
    expect(zagrebLocalToIso("2026-10-25", "16:00")).toBe("2026-10-25T16:00:00+01:00");
  });
});

describe("calendarContext", () => {
  it("lists 14 days with Croatian weekdays and week labels", () => {
    const lines = calendarContext(NOW).split("\n");
    expect(lines).toHaveLength(14);
    expect(lines[0]).toBe("2026-09-29 utorak (danas, ovaj tjedan)");
    expect(lines[1]).toBe("2026-09-30 srijeda (sutra, ovaj tjedan)");
    expect(lines[5]).toBe("2026-10-04 nedjelja (ovaj tjedan)");
    expect(lines[6]).toBe("2026-10-05 ponedjeljak (sljedeći tjedan)");
    expect(lines[13]).toBe("2026-10-12 ponedjeljak (za dva tjedna)");
  });

  it("uses the Zagreb date, not the UTC date, late at night", () => {
    // 23:30 UTC on Tuesday is already Wednesday 01:30 in Zagreb.
    expect(calendarContext("2026-09-29T23:30:00Z").split("\n")[0]).toBe("2026-09-30 srijeda (danas, ovaj tjedan)");
  });
});

describe("buildRequest", () => {
  it("forces the tool on claude-haiku-4-5 and puts the calendar in the user turn", () => {
    const req = buildRequest("sri 16", NOW);
    expect(req.model).toBe("claude-haiku-4-5");
    expect(req.tool_choice).toEqual({ type: "tool", name: "report_slots" });
    expect(req.messages[0]!.content).toContain("2026-09-30 srijeda (sutra, ovaj tjedan)");
    expect(req.messages[0]!.content).toContain("sri 16");
    // The system prompt has no dates, so it's identical on every request.
    expect(buildRequest("x", "2027-01-01T00:00:00Z").system).toBe(req.system);
  });
});

describe("interpretToolInput", () => {
  const slot = (date: string, time: string, durationMin = 60) => ({ date, time, durationMin });

  it("converts local slots to ISO with offsets", () => {
    expect(
      interpretToolInput({ kind: "slots", slots: [slot("2026-09-30", "16:00"), slot("2026-10-26", "17:30", 90)], question: "" }, NOW),
    ).toEqual({
      kind: "slots",
      slots: [
        { startsAt: "2026-09-30T16:00:00+02:00", durationMin: 60 },
        { startsAt: "2026-10-26T17:30:00+01:00", durationMin: 90 },
      ],
    });
  });

  it("drops exact duplicates", () => {
    const result = interpretToolInput({ kind: "slots", slots: [slot("2026-09-30", "16:00"), slot("2026-09-30", "16:00")], question: "" }, NOW);
    expect(result).toMatchObject({ kind: "slots", slots: [{ startsAt: "2026-09-30T16:00:00+02:00" }] });
  });

  it("passes the model's question through", () => {
    expect(interpretToolInput({ kind: "unclear", slots: [], question: "U koliko sati?" }, NOW)).toEqual({
      kind: "unclear",
      question: "U koliko sati?",
    });
  });

  it("asks instead of guessing: past slot, nonexistent date, bad shape, too many, empty", () => {
    expect(interpretToolInput({ kind: "slots", slots: [slot("2026-09-29", "09:00")], question: "" }, NOW)).toEqual({
      kind: "unclear",
      question: "Termin utorak 29.9. u 09:00 je već prošao. Koji termin misliš?",
    });
    expect(interpretToolInput({ kind: "slots", slots: [slot("2026-09-31", "16:00")], question: "" }, NOW)).toMatchObject({
      kind: "unclear",
      question: expect.stringContaining("ne postoji"),
    });
    const fallback = { kind: "unclear", question: FALLBACK_QUESTION };
    expect(interpretToolInput({ kind: "slots", slots: [slot("sutra", "16h")], question: "" }, NOW)).toEqual(fallback);
    expect(interpretToolInput("nonsense", NOW)).toEqual(fallback);
    const ten = Array.from({ length: 10 }, (_, i) => slot("2026-10-01", `${10 + i}:00`));
    expect(interpretToolInput({ kind: "slots", slots: ten, question: "" }, NOW)).toEqual(fallback);
    expect(interpretToolInput({ kind: "slots", slots: [], question: "" }, NOW)).toEqual(fallback);
    expect(interpretToolInput({ kind: "unclear", slots: [], question: " " }, NOW)).toEqual(fallback);
  });

  it("rejects a duration outside 15-240 minutes", () => {
    expect(interpretToolInput({ kind: "slots", slots: [slot("2026-09-30", "16:00", 5)], question: "" }, NOW)).toMatchObject({
      kind: "unclear",
    });
  });
});
