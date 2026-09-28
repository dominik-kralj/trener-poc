import type { Event } from "./types";

/**
 * Button/list reply IDs. Deterministic so the worker can route taps without AI.
 */
export const replyId = {
  sendOffer: () => "send_offer",
  pick: (slotId: string) => `pick:${slotId}`,
  decline: () => "decline",
  confirm: (holdId: string) => `confirm:${holdId}`,
  reject: (holdId: string) => `reject:${holdId}`,
};

export type ReplyAction =
  | { type: "sendOffer" }
  | { type: "pick"; slotId: string }
  | { type: "decline" }
  | { type: "confirm"; holdId: string }
  | { type: "reject"; holdId: string };

export function parseReplyId(id: string): ReplyAction | null {
  if (id === "send_offer") return { type: "sendOffer" };
  if (id === "decline") return { type: "decline" };

  const sep = id.indexOf(":");
  if (sep === -1) return null;
  const prefix = id.slice(0, sep);
  const value = id.slice(sep + 1);
  if (!value) return null;

  switch (prefix) {
    case "pick":
      return { type: "pick", slotId: value };
    case "confirm":
      return { type: "confirm", holdId: value };
    case "reject":
      return { type: "reject", holdId: value };
    default:
      return null;
  }
}

/** Turns a tapped reply into a core event. Core still checks who is allowed to do what. */
export function replyToEvent(from: string, action: ReplyAction): Event {
  switch (action.type) {
    case "sendOffer":
      return { type: "coachSentOffer", from };
    case "pick":
      return { type: "clientPickedSlot", from, slotId: action.slotId };
    case "decline":
      return { type: "clientDeclined", from };
    case "confirm":
      return { type: "coachConfirmedHold", from, holdId: action.holdId };
    case "reject":
      return { type: "coachRejectedHold", from, holdId: action.holdId };
  }
}
