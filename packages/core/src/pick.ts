import type { Hold, Slot } from "@trener/shared";
import { capitalize, formatSlotLong } from "./format";
import { findClient, isPickable, remainingSlotsMessage, text } from "./helpers";
import { replyId } from "./replies";
import type { Context, Decision, State } from "./types";

/**
 * First client to pick an open slot gets it held. Anyone later gets the
 * remaining slots, never an error.
 */
export function clientPicksSlot(
  state: State,
  event: { from: string; slotId: string },
  ctx: Context,
): Decision[] {
  const client = findClient(state, event.from);
  if (!client) return [];

  const slot = state.slots.find((s) => s.id === event.slotId);

  // Same client tapping the same slot again: repeat the status, change nothing.
  const own = state.holds.find(
    (h) => h.slotId === event.slotId && h.clientId === client.id && h.status !== "rejected",
  );
  if (slot && own) {
    const when = formatSlotLong(slot.startsAt);
    return [
      text(
        client.phone,
        own.status === "confirmed"
          ? `Termin ${when} ti je već potvrđen.`
          : `Već sam ti rezervirao ${when}, čeka još potvrdu trenera.`,
      ),
    ];
  }

  if (!slot || !isPickable(slot, ctx.now)) {
    return [remainingSlotsMessage(state, client, ctx.now, "Taj termin je upravo netko zauzeo.")];
  }

  const hold: Hold = {
    id: ctx.newId(),
    slotId: slot.id,
    clientId: client.id,
    status: "held",
    calendarEventId: null,
    createdAt: ctx.now,
  };
  const when = formatSlotLong(slot.startsAt);

  return [
    { type: "writeSlot", slot: { ...slot, status: "held" } satisfies Slot },
    { type: "writeHold", hold },
    text(client.phone, `Super, ${when} je rezerviran za tebe. Javim ti čim trener potvrdi.`),
    {
      type: "sendMessage",
      to: state.coachPhone,
      message: {
        kind: "choices",
        body: `${capitalize(when)}: ${client.name}. Potvrdi?`,
        choices: [
          { id: replyId.confirm(hold.id), title: "Potvrdi" },
          { id: replyId.reject(hold.id), title: "Odbij" },
        ],
      },
    },
  ];
}

export function clientDeclines(state: State, event: { from: string }): Decision[] {
  const client = findClient(state, event.from);
  if (!client) return [];
  return [text(client.phone, "Nema problema, hvala! Javim se kad budu novi termini.")];
}
