import { z } from "zod";

export const TIME_ZONE = "Europe/Zagreb";

/** ISO 8601 with an explicit offset, e.g. `2026-09-30T16:00:00+02:00`. */
export const IsoDateTime = z.iso.datetime({ offset: true });

/** E.164 phone number, e.g. `+385911234567`. */
export const Phone = z
  .string()
  .regex(/^\+[1-9]\d{6,14}$/, "Expected an E.164 phone number, e.g. +385911234567");

// A WhatsApp list message holds max 10 rows: up to 9 slots + "Ne ovaj tjedan".
export const MAX_SLOTS_PER_OFFER = 9;

// ---------- AI output ----------

export const SlotInput = z.object({
  startsAt: IsoDateTime,
  durationMin: z.number().int().min(15).max(240).default(60),
});
export type SlotInput = z.infer<typeof SlotInput>;

/**
 * What the AI must return for the coach's free-text slot message.
 * `unclear` carries a question for the coach: the bot never guesses.
 */
export const ParsedSlots = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("slots"),
    slots: z.array(SlotInput).min(1).max(MAX_SLOTS_PER_OFFER),
  }),
  z.object({
    kind: z.literal("unclear"),
    question: z.string().min(1),
  }),
]);
export type ParsedSlots = z.infer<typeof ParsedSlots>;

// ---------- Domain ----------

export const Client = z.object({
  id: z.string().min(1),
  phone: Phone,
  name: z.string().min(1),
});
export type Client = z.infer<typeof Client>;

export const SlotStatus = z.enum(["open", "held", "confirmed"]);
export type SlotStatus = z.infer<typeof SlotStatus>;

export const Slot = z.object({
  id: z.string().min(1),
  startsAt: IsoDateTime,
  durationMin: z.number().int().positive(),
  status: SlotStatus,
  /** null = draft: the coach hasn't tapped "Pošalji ponudu" yet, clients can't pick it. */
  offeredAt: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
});
export type Slot = z.infer<typeof Slot>;

export const HoldStatus = z.enum(["held", "confirmed", "rejected"]);
export type HoldStatus = z.infer<typeof HoldStatus>;

export const Hold = z.object({
  id: z.string().min(1),
  slotId: z.string().min(1),
  clientId: z.string().min(1),
  status: HoldStatus,
  /** Set by the worker after the Google Calendar event is created. */
  calendarEventId: z.string().nullable(),
  createdAt: IsoDateTime,
});
export type Hold = z.infer<typeof Hold>;
