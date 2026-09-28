import type { Slot } from "@trener/shared";
import { decide } from "./index";
import type { Context, Decision, Event, OutgoingMessage, State } from "./types";

export const COACH = "+385910000000";
export const MARKO = { id: "c-marko", phone: "+385910000001", name: "Marko" };
export const ANA = { id: "c-ana", phone: "+385910000002", name: "Ana" };

/** Monday 28.9.2026, 12:00 in Zagreb. */
export const NOW = "2026-09-28T10:00:00.000Z";
export const WED_16 = "2026-09-30T16:00:00+02:00";
export const TUE_13 = "2026-09-29T13:00:00+02:00";

export function makeCtx(now = NOW): Context {
  let n = 0;
  return { now, newId: () => `id-${++n}` };
}

export function makeState(partial: Partial<State> = {}): State {
  return { coachPhone: COACH, clients: [MARKO, ANA], slots: [], holds: [], ...partial };
}

export function offeredSlot(id: string, startsAt: string, status: Slot["status"] = "open"): Slot {
  return { id, startsAt, durationMin: 60, status, offeredAt: NOW, createdAt: NOW };
}

/** Folds write decisions into state, the way the worker writes them to D1. */
export function applyToState(state: State, decisions: Decision[]): State {
  let { slots, holds } = state;
  for (const d of decisions) {
    if (d.type === "writeSlot") slots = [...slots.filter((s) => s.id !== d.slot.id), d.slot];
    if (d.type === "deleteSlot") slots = slots.filter((s) => s.id !== d.slotId);
    if (d.type === "writeHold") holds = [...holds.filter((h) => h.id !== d.hold.id), d.hold];
  }
  return { ...state, slots, holds };
}

/** Runs events in order against evolving state, like the real system. */
export function run(state: State, events: Event[], ctx = makeCtx()) {
  const steps: Decision[][] = [];
  for (const event of events) {
    const decisions = decide(state, event, ctx);
    steps.push(decisions);
    state = applyToState(state, decisions);
  }
  return { state, steps };
}

export const messagesTo = (decisions: Decision[], phone: string): OutgoingMessage[] =>
  decisions.flatMap((d) => (d.type === "sendMessage" && d.to === phone ? [d.message] : []));

export const writes = (decisions: Decision[]) =>
  decisions.filter((d) => d.type !== "sendMessage");

export const choiceIds = (message: OutgoingMessage | undefined) =>
  message?.kind === "choices" ? message.choices.map((c) => c.id) : [];
