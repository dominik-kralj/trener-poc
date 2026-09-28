import { TIME_ZONE } from "@trener/shared";

// Own table instead of the "hr" locale so output doesn't depend on the runtime's ICU data.
const WEEKDAYS: Record<string, { long: string; short: string }> = {
  Mon: { long: "ponedjeljak", short: "Pon" },
  Tue: { long: "utorak", short: "Uto" },
  Wed: { long: "srijeda", short: "Sri" },
  Thu: { long: "četvrtak", short: "Čet" },
  Fri: { long: "petak", short: "Pet" },
  Sat: { long: "subota", short: "Sub" },
  Sun: { long: "nedjelja", short: "Ned" },
};

const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function zagrebParts(iso: string) {
  const parts = formatter.formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const weekday = WEEKDAYS[get("weekday")];
  if (!weekday) throw new Error(`Cannot format date: ${iso}`);
  return {
    weekday,
    date: `${Number(get("day"))}.${Number(get("month"))}.`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

/** "srijeda 30.9. u 16:00" */
export function formatSlotLong(startsAt: string): string {
  const { weekday, date, time } = zagrebParts(startsAt);
  return `${weekday.long} ${date} u ${time}`;
}

/** "Sri 30.9. 16:00" (fits a 20-char button title) */
export function formatSlotShort(startsAt: string): string {
  const { weekday, date, time } = zagrebParts(startsAt);
  return `${weekday.short} ${date} ${time}`;
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
