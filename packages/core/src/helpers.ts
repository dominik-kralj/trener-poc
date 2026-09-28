import { MAX_SLOTS_PER_OFFER, type Client, type Slot } from "@trener/shared";
import { formatSlotLong, formatSlotShort } from "./format";
import { replyId } from "./replies";
import type { Decision, OutgoingMessage, State } from "./types";

export const byStart = (a: Slot, b: Slot) => Date.parse(a.startsAt) - Date.parse(b.startsAt);

export const isCoach = (state: State, from: string) => from === state.coachPhone;

export const findClient = (state: State, phone: string): Client | undefined =>
  state.clients.find((c) => c.phone === phone);

export const isDraft = (slot: Slot) => slot.status === "open" && slot.offeredAt === null;

/** A slot a client can pick right now: open, already offered, in the future. */
export const isPickable = (slot: Slot, now: string) =>
  slot.status === "open" && slot.offeredAt !== null && Date.parse(slot.startsAt) > Date.parse(now);

export function pickableSlots(state: State, now: string, excludeSlotId?: string): Slot[] {
  return state.slots
    .filter((s) => isPickable(s, now) && s.id !== excludeSlotId)
    .sort(byStart)
    .slice(0, MAX_SLOTS_PER_OFFER);
}

export const text = (to: string, body: string): Decision => ({
  type: "sendMessage",
  to,
  message: { kind: "text", body },
});

export const bulletList = (slots: Slot[]) =>
  slots.map((s) => `• ${formatSlotLong(s.startsAt)}`).join("\n");

/** Slots as choices + "Ne ovaj tjedan". */
export function slotChoices(body: string, slots: Slot[]): OutgoingMessage {
  return {
    kind: "choices",
    body,
    choices: [
      ...slots.map((s) => ({ id: replyId.pick(s.id), title: formatSlotShort(s.startsAt) })),
      { id: replyId.decline(), title: "Ne ovaj tjedan" },
    ],
  };
}

/** What a client sees when their slot is gone: the remaining slots, or a polite "nothing left". */
export function remainingSlotsMessage(
  state: State,
  client: Client,
  now: string,
  intro: string,
  excludeSlotId?: string,
): Decision {
  const remaining = pickableSlots(state, now, excludeSlotId);
  if (remaining.length === 0) {
    return text(client.phone, `${intro} Nažalost, drugih slobodnih termina trenutno nema.`);
  }
  return {
    type: "sendMessage",
    to: client.phone,
    message: slotChoices(`${intro} Još je slobodno:\n${bulletList(remaining)}`, remaining),
  };
}
