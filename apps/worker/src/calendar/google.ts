import { TIME_ZONE } from "@trener/shared";

export type GoogleCalendarConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  calendarId: string;
  /** Injected so tests can capture requests. */
  fetch?: typeof fetch;
};

export type NewEvent = { holdId: string; clientName: string; startsAt: string; durationMin: number };

/**
 * Google event IDs allow only base32hex (0-9, a-v). A UUID without dashes fits, so the
 * hold ID becomes the event ID: creating the same event twice is a 409, not a duplicate.
 */
export function eventIdForHold(holdId: string): string {
  const id = holdId.toLowerCase().replace(/[^0-9a-v]/g, "");
  if (id.length < 5) throw new Error(`calendar: hold id too short for an event id: ${holdId}`);
  return id;
}

/** Write-only mirror of confirmed sessions. Never read back as state; D1 wins. */
export function createGoogleCalendar(config: GoogleCalendarConfig) {
  const doFetch = config.fetch ?? fetch;

  async function accessToken(): Promise<string> {
    const res = await doFetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: config.refreshToken,
        grant_type: "refresh_token",
      }),
    });
    const body = (await res.json()) as { access_token?: string; error?: string };
    // `invalid_grant` usually means the 7-day testing-mode refresh token expired: rerun google:auth.
    if (!res.ok || !body.access_token) throw new Error(`calendar: token refresh failed (${body.error ?? res.status})`);
    return body.access_token;
  }

  /** Creates the event and returns its ID. Already existing (a retry) counts as success. */
  async function createEvent(event: NewEvent): Promise<string> {
    const id = eventIdForHold(event.holdId);
    const end = new Date(Date.parse(event.startsAt) + event.durationMin * 60_000).toISOString();
    const res = await doFetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          summary: `Trening: ${event.clientName}`,
          start: { dateTime: event.startsAt, timeZone: TIME_ZONE },
          end: { dateTime: end, timeZone: TIME_ZONE },
        }),
      },
    );
    if (res.status === 409) return id;
    if (!res.ok) throw new Error(`calendar: create failed (${res.status}) ${await res.text()}`);
    return ((await res.json()) as { id: string }).id;
  }

  return { createEvent };
}

export type Calendar = ReturnType<typeof createGoogleCalendar>;
