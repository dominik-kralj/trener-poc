import Anthropic from "@anthropic-ai/sdk";
import { formatSlotLong } from "@trener/core";
import { ParsedSlots } from "@trener/shared";
import { z } from "zod";
import { calendarContext, zagrebLocalToIso } from "./zagreb";

export const MODEL = "claude-haiku-4-5";
const TOOL_NAME = "report_slots";

/** Asked when the model's answer can't be used as-is. The bot never guesses. */
export const FALLBACK_QUESTION =
  "Ne razumijem točno koje termine misliš. Napiši dan i sat, npr. \"srijeda 16, utorak 13\".";

// Kept fixed (no dates) so it stays byte-identical across requests; the calendar goes in the user turn.
const SYSTEM_PROMPT = `You read messages from a padel/tennis coach in Croatia who lists their free training slots, and report them with the ${TOOL_NAME} tool.

Messages are Croatian, informal, often with abbreviations and typos: pon, uto, sri, cet/čet, pet, sub, ned are weekdays; "tj" is tjedan; "h" after a number means o'clock. Missing diacritics are normal (cetvrtak, sljedeci).

Dates
- Use the calendar in the message to turn weekdays and words like "danas", "sutra", "ovaj tjedan", "sljedeći tjedan" into dates. Weeks run Monday to Sunday.
- A weekday alone means its next occurrence from today, today included, unless the coach names the week.
- An explicit date like "3.10." or "26.10" may be outside the calendar: use the current year.

Times
- "16", "16h", "u 16" → 16:00. "17 30", "17:30", "17.30" → 17:30. "pola 5" means half past four → 16:30.
- An hour from 1 to 7 means afternoon (5 → 17:00) unless the coach says "ujutro". Hours 8 to 11 mean morning unless the coach says "navečer"/"uvečer"/"popodne" (8 navečer → 20:00).
- Several times for one day ("srijeda 16 i 18") are separate slots. Report each slot once.
- durationMin is 60 unless the coach states a length ("90 min", "sat i pol" → 90, "2 sata" → 120). Never ask about duration.
- Report slots that look like they are in the past as written; the system checks that.

A day and a start time are all a slot needs. A message can be as short as "26.10. u 16" or "danas u 9".

Use kind "unclear" instead of guessing only when:
- the message is not a list of free slots (greetings, questions, anything else),
- any slot lacks a day or a time, or the date does not exist,
- a time range could be one long session or several slots ("od 16 do 19").
Then write one short question in Croatian, informal "ti" form, telling the coach exactly what to clarify, and leave slots empty.

For kind "slots", leave question empty.`;

const TOOL: Anthropic.Tool = {
  name: TOOL_NAME,
  description: "Report the free training slots in the coach's message, or a question if anything is unclear.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["slots", "unclear"] },
      slots: {
        type: "array",
        items: {
          type: "object",
          properties: {
            date: { type: "string", description: "Local date, YYYY-MM-DD" },
            time: { type: "string", description: "Local start time, HH:MM (24h)" },
            durationMin: { type: "integer", description: "Minutes; 60 unless the coach states a length" },
          },
          required: ["date", "time", "durationMin"],
          additionalProperties: false,
        },
      },
      question: { type: "string" },
    },
    required: ["kind", "slots", "question"],
    additionalProperties: false,
  },
};

/** What the model sends: local wall time only. Offsets are added in code. */
const ToolInput = z.object({
  kind: z.enum(["slots", "unclear"]),
  slots: z.array(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      durationMin: z.number().int(),
    }),
  ),
  question: z.string(),
});

export function buildRequest(text: string, now: string): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: MODEL,
    max_tokens: 1024,
    temperature: 0,
    system: SYSTEM_PROMPT,
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [
      {
        role: "user",
        content: `Calendar (Europe/Zagreb):\n${calendarContext(now)}\n\nCoach's message:\n${text}`,
      },
    ],
  };
}

/**
 * Turns the model's tool input into validated `ParsedSlots`. Anything off (bad shape,
 * nonexistent date, slot in the past, too many slots) becomes a question for the coach.
 */
export function interpretToolInput(input: unknown, now: string): ParsedSlots {
  const parsed = ToolInput.safeParse(input);
  if (!parsed.success) return unclear(FALLBACK_QUESTION);
  const { kind, slots, question } = parsed.data;

  if (kind === "unclear") return unclear(question.trim() || FALLBACK_QUESTION);

  const seen = new Set<string>();
  const inputs = [];
  for (const slot of slots) {
    // "2026-09-31" would roll over to October: reject dates that don't round-trip.
    const day = new Date(`${slot.date}T00:00:00Z`);
    if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== slot.date) {
      return unclear(`Datum ${slot.date} ne postoji. Koji dan misliš?`);
    }
    const startsAt = zagrebLocalToIso(slot.date, slot.time);
    if (new Date(startsAt).getTime() <= new Date(now).getTime()) {
      return unclear(`Termin ${formatSlotLong(startsAt)} je već prošao. Koji termin misliš?`);
    }
    const key = `${startsAt}/${slot.durationMin}`;
    if (seen.has(key)) continue;
    seen.add(key);
    inputs.push({ startsAt, durationMin: slot.durationMin });
  }

  const result = ParsedSlots.safeParse({ kind: "slots", slots: inputs });
  return result.success ? result.data : unclear(FALLBACK_QUESTION);
}

/**
 * Coach's free text → slots or a question. API errors (network, rate limit) throw:
 * the caller tells the coach to try again, since there's nothing to ask about.
 */
export async function parseSlotMessage(client: Anthropic, text: string, now: string): Promise<ParsedSlots> {
  const response = await client.messages.create(buildRequest(text, now));
  const toolUse = response.content.find((b) => b.type === "tool_use" && b.name === TOOL_NAME);
  if (!toolUse || toolUse.type !== "tool_use") {
    console.error("ai: no tool call", response.stop_reason);
    return unclear(FALLBACK_QUESTION);
  }
  return interpretToolInput(toolUse.input, now);
}

function unclear(question: string): ParsedSlots {
  return { kind: "unclear", question };
}
