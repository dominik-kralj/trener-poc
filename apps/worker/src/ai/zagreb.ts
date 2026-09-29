import { TIME_ZONE } from "@trener/shared";

const WEEKDAYS_HR: Record<string, string> = {
  Mon: "ponedjeljak",
  Tue: "utorak",
  Wed: "srijeda",
  Thu: "četvrtak",
  Fri: "petak",
  Sat: "subota",
  Sun: "nedjelja",
};

const partsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  timeZoneName: "longOffset",
});

function zagrebParts(date: Date) {
  const parts = partsFormatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  // "GMT+02:00" → "+02:00" ("GMT" alone means +00:00, never the case for Zagreb but handled).
  const offset = get("timeZoneName").replace("GMT", "") || "+00:00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, weekday: get("weekday"), offset };
}

function offsetMinutes(offset: string): number {
  const [, sign, h, m] = offset.match(/^([+-])(\d{2}):(\d{2})$/)!;
  return (sign === "-" ? -1 : 1) * (Number(h) * 60 + Number(m));
}

/**
 * Local Zagreb wall time → ISO 8601 with the right offset, e.g.
 * ("2026-09-30", "16:00") → "2026-09-30T16:00:00+02:00", ("2026-10-28", "16:00") → "…+01:00".
 * Done in code, not by the model: offsets and DST are exactly what LLMs get wrong.
 */
export function zagrebLocalToIso(date: string, time: string): string {
  const asUtc = new Date(`${date}T${time}:00Z`).getTime();
  if (Number.isNaN(asUtc)) throw new Error(`Invalid local date/time: ${date} ${time}`);
  // Two passes: the offset at the guessed instant, then at the corrected instant (DST edges).
  let offset = zagrebParts(new Date(asUtc)).offset;
  offset = zagrebParts(new Date(asUtc - offsetMinutes(offset) * 60_000)).offset;
  return `${date}T${time}:00${offset}`;
}

/** Zagreb calendar date ("YYYY-MM-DD") of an instant. */
export function zagrebDate(iso: string): string {
  return zagrebParts(new Date(iso)).date;
}

/**
 * The next 14 days as "2026-09-29 utorak (danas, ovaj tjedan)" lines, so the model
 * looks dates up instead of doing calendar arithmetic. Weeks run Monday–Sunday.
 */
export function calendarContext(nowIso: string): string {
  const lines: string[] = [];
  // Step from 12:00 UTC of today's Zagreb date: 24h steps from midday never skip or
  // repeat a calendar day across a DST change.
  const start = new Date(`${zagrebDate(nowIso)}T12:00:00Z`).getTime();
  let week = 0;
  for (let i = 0; i < 14; i++) {
    const { date, weekday } = zagrebParts(new Date(start + i * 86_400_000));
    if (i > 0 && weekday === "Mon") week++;
    const labels = [
      i === 0 ? "danas" : i === 1 ? "sutra" : null,
      week === 0 ? "ovaj tjedan" : week === 1 ? "sljedeći tjedan" : "za dva tjedna",
    ].filter(Boolean);
    lines.push(`${date} ${WEEKDAYS_HR[weekday]} (${labels.join(", ")})`);
  }
  return lines.join("\n");
}
