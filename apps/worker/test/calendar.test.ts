import { describe, expect, it, vi } from "vitest";
import { createGoogleCalendar, eventIdForHold } from "../src/calendar/google";

function setup(eventResponse: { status: number; body: unknown }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init! });
    if (String(url).includes("oauth2")) return Response.json({ access_token: "ACCESS" });
    return new Response(JSON.stringify(eventResponse.body), { status: eventResponse.status });
  }) as unknown as typeof globalThis.fetch;
  const calendar = createGoogleCalendar({ clientId: "ID", clientSecret: "SECRET", refreshToken: "REFRESH", calendarId: "primary", fetch });
  return { calendar, calls };
}

const HOLD = "3f2a9c1e-7b4d-4e2a-9c1e-7b4d4e2a9c1e";
const event = { holdId: HOLD, clientName: "Marko", startsAt: "2026-09-30T16:00:00+02:00", durationMin: 90 };

describe("google calendar", () => {
  it("derives a valid, stable event id from the hold id", () => {
    expect(eventIdForHold(HOLD)).toBe("3f2a9c1e7b4d4e2a9c1e7b4d4e2a9c1e");
    expect(eventIdForHold(HOLD)).toMatch(/^[0-9a-v]{5,1024}$/);
  });

  it("refreshes the token and creates 'Trening: <name>' in Europe/Zagreb", async () => {
    const { calendar, calls } = setup({ status: 200, body: { id: "evt-1" } });
    expect(await calendar.createEvent(event)).toBe("evt-1");

    expect(String(calls[0]!.init.body)).toContain("grant_type=refresh_token");
    expect(calls[1]!.url).toBe("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    expect(new Headers(calls[1]!.init.headers).get("Authorization")).toBe("Bearer ACCESS");
    expect(JSON.parse(String(calls[1]!.init.body))).toEqual({
      id: eventIdForHold(HOLD),
      summary: "Trening: Marko",
      start: { dateTime: "2026-09-30T16:00:00+02:00", timeZone: "Europe/Zagreb" },
      end: { dateTime: "2026-09-30T15:30:00.000Z", timeZone: "Europe/Zagreb" },
    });
  });

  it("treats 'already exists' as success, so a retry never duplicates the event", async () => {
    const { calendar } = setup({ status: 409, body: { error: { message: "duplicate" } } });
    expect(await calendar.createEvent(event)).toBe(eventIdForHold(HOLD));
  });

  it("throws on other errors", async () => {
    const { calendar } = setup({ status: 403, body: { error: { message: "forbidden" } } });
    await expect(calendar.createEvent(event)).rejects.toThrow(/403/);
  });
});
