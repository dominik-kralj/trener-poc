import type { Client, Hold, Slot, SlotInput } from "@trener/shared";

/** Everything core needs to decide. Loaded from D1 by the worker. */
export type State = {
  coachPhone: string;
  clients: Client[];
  slots: Slot[];
  holds: Hold[];
};

/** Impure inputs, injected so handlers stay deterministic in tests. */
export type Context = {
  /** Current time, ISO 8601. */
  now: string;
  newId: () => string;
};

/**
 * A tappable choice. `title` is at most 20 chars (WhatsApp button limit).
 * The worker sends ≤3 choices as reply buttons, more as a list message.
 */
export type Choice = { id: string; title: string };

export type OutgoingMessage =
  | { kind: "text"; body: string }
  | { kind: "choices"; body: string; choices: Choice[] };

export type Decision =
  | { type: "sendMessage"; to: string; message: OutgoingMessage }
  | { type: "writeSlot"; slot: Slot }
  | { type: "deleteSlot"; slotId: string }
  | { type: "writeHold"; hold: Hold }
  | {
      type: "createCalendarEvent";
      holdId: string;
      clientName: string;
      startsAt: string;
      durationMin: number;
    };

/** `from` is always the sender's phone (E.164). */
export type Event =
  | { type: "coachOfferedSlots"; from: string; slots: SlotInput[] }
  | { type: "coachSentOffer"; from: string }
  | { type: "clientPickedSlot"; from: string; slotId: string }
  | { type: "clientDeclined"; from: string }
  | { type: "coachConfirmedHold"; from: string; holdId: string }
  | { type: "coachRejectedHold"; from: string; holdId: string };
