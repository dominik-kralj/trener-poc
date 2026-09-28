import { coachConfirmsHold, coachRejectsHold } from "./confirm";
import { coachOffersSlots, coachSendsOffer } from "./offer";
import { clientDeclines, clientPicksSlot } from "./pick";
import type { Context, Decision, Event, State } from "./types";

export * from "./types";
export * from "./replies";
export { formatSlotLong, formatSlotShort } from "./format";
export { coachOffersSlots, coachSendsOffer, clientPicksSlot, clientDeclines };
export { coachConfirmsHold, coachRejectsHold };

/** Single entry point for the worker: current state + event → decisions. */
export function decide(state: State, event: Event, ctx: Context): Decision[] {
  switch (event.type) {
    case "coachOfferedSlots":
      return coachOffersSlots(state, event, ctx);
    case "coachSentOffer":
      return coachSendsOffer(state, event, ctx);
    case "clientPickedSlot":
      return clientPicksSlot(state, event, ctx);
    case "clientDeclined":
      return clientDeclines(state, event);
    case "coachConfirmedHold":
      return coachConfirmsHold(state, event);
    case "coachRejectedHold":
      return coachRejectsHold(state, event, ctx);
  }
}
