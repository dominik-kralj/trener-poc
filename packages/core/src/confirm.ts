import type { Client, Hold, Slot } from "@trener/shared";
import { capitalize, formatSlotLong } from "./format";
import { isCoach, remainingSlotsMessage, text } from "./helpers";
import type { Context, Decision, State } from "./types";

type Found = { hold: Hold; slot: Slot; client: Client };

function findHold(state: State, holdId: string): Found | null {
  const hold = state.holds.find((h) => h.id === holdId);
  const slot = hold && state.slots.find((s) => s.id === hold.slotId);
  const client = hold && state.clients.find((c) => c.id === hold.clientId);
  return hold && slot && client ? { hold, slot, client } : null;
}

/** The only place that ever produces `createCalendarEvent`. */
export function coachConfirmsHold(
  state: State,
  event: { from: string; holdId: string },
): Decision[] {
  if (!isCoach(state, event.from)) return [];

  const found = findHold(state, event.holdId);
  if (!found) return [text(state.coachPhone, "Ne mogu naći tu rezervaciju.")];
  const { hold, slot, client } = found;
  const when = formatSlotLong(slot.startsAt);

  if (hold.status === "confirmed") {
    return [text(state.coachPhone, `Već potvrđeno: ${client.name}, ${when}.`)];
  }
  if (hold.status === "rejected") {
    return [text(state.coachPhone, `Taj termin (${client.name}, ${when}) si već odbio.`)];
  }

  return [
    { type: "writeHold", hold: { ...hold, status: "confirmed" } },
    { type: "writeSlot", slot: { ...slot, status: "confirmed" } },
    {
      type: "createCalendarEvent",
      holdId: hold.id,
      clientName: client.name,
      startsAt: slot.startsAt,
      durationMin: slot.durationMin,
    },
    text(client.phone, `Trener je potvrdio! Vidimo se ${when}.`),
    text(state.coachPhone, `Potvrđeno: ${client.name}, ${when}.`),
  ];
}

/** Hold rejected, slot goes back to open; the client gets the other open slots. */
export function coachRejectsHold(
  state: State,
  event: { from: string; holdId: string },
  ctx: Context,
): Decision[] {
  if (!isCoach(state, event.from)) return [];

  const found = findHold(state, event.holdId);
  if (!found) return [text(state.coachPhone, "Ne mogu naći tu rezervaciju.")];
  const { hold, slot, client } = found;
  const when = formatSlotLong(slot.startsAt);

  if (hold.status === "confirmed") {
    // Cancelling a confirmed session is out of scope for the POC.
    return [text(state.coachPhone, `Taj termin (${client.name}, ${when}) je već potvrđen.`)];
  }
  if (hold.status === "rejected") {
    return [text(state.coachPhone, `Već odbijeno: ${client.name}, ${when}.`)];
  }

  return [
    { type: "writeHold", hold: { ...hold, status: "rejected" } },
    { type: "writeSlot", slot: { ...slot, status: "open" } },
    // Don't offer the rejected slot back to the same client.
    remainingSlotsMessage(state, client, ctx.now, `Nažalost, trener ne može ${when}.`, slot.id),
    text(state.coachPhone, `Odbijeno. ${capitalize(when)} je opet slobodan.`),
  ];
}
