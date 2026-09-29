import {
  decide,
  parseReplyId,
  replyToEvent,
  type Decision,
  type Event,
  type OutgoingMessage,
} from "@trener/core";
import type { ParsedSlots } from "@trener/shared";
import { applyWrites, loadState } from "../db/repo";
import type { IncomingMessage } from "../webhook/payload";
import type { SendResult } from "../whatsapp/client";

/** Everything with I/O, injected so the flow runs against fakes in tests. */
export type FlowDeps = {
  db: D1Database;
  coachPhone: string;
  send: (to: string, message: OutgoingMessage) => Promise<SendResult>;
  parseSlots: (text: string, now: string) => Promise<ParsedSlots>;
  /** Executes a `createCalendarEvent` decision (#11). */
  createCalendarEvent: (decision: Extract<Decision, { type: "createCalendarEvent" }>) => Promise<void>;
  now: () => string;
  newId: () => string;
};

export const TEXT = {
  clientFreeText:
    "Ja sam automatski asistent tvog trenera i znam samo dogovarati termine preko gumba. Za sve ostalo javi se treneru direktno.",
  unknownSender: "Ovo je automatski asistent za dogovor termina. Za sve ostalo javi se treneru direktno.",
  coachUnsupported: "Mogu čitati samo tekst. Pošalji mi slobodne termine porukom, npr. \"srijeda 16, utorak 13\".",
  aiFailed: "Nešto je zapelo pri čitanju poruke. Pokušaj ponovno za minutu.",
};

// A conflict means another pick won the slot between our read and write. Re-deciding on
// fresh state gives the loser "slot taken" + remaining slots. A few tries is plenty.
const MAX_ATTEMPTS = 3;

export async function handleMessage(message: IncomingMessage, deps: FlowDeps): Promise<void> {
  const event = await toEvent(message, deps);
  if (event) await runEvent(event, deps);
}

/** Turns a message into a core event, or answers directly when there's nothing for core to decide. */
async function toEvent(message: IncomingMessage, deps: FlowDeps): Promise<Event | null> {
  const { from } = message;
  const isCoach = from === deps.coachPhone;

  // Button and list taps skip AI; core checks who may do what.
  if (message.kind === "reply") {
    const action = parseReplyId(message.replyId);
    if (!action) {
      console.warn("flow: unknown reply id", message.replyId);
      return null;
    }
    return replyToEvent(from, action);
  }

  if (isCoach) {
    if (message.kind === "unsupported") {
      await deps.send(from, { kind: "text", body: TEXT.coachUnsupported });
      return null;
    }
    let parsed: ParsedSlots;
    try {
      parsed = await deps.parseSlots(message.text, deps.now());
    } catch (error) {
      console.error("flow: AI parse failed", error);
      await deps.send(from, { kind: "text", body: TEXT.aiFailed });
      return null;
    }
    if (parsed.kind === "unclear") {
      await deps.send(from, { kind: "text", body: parsed.question });
      return null;
    }
    return { type: "coachOfferedSlots", from, slots: parsed.slots };
  }

  // Client or stranger writing free text (or a voice note, photo…): scheduling only, never a chat.
  const state = await loadState(deps.db, deps.coachPhone);
  const known = state.clients.some((c) => c.phone === from);
  await deps.send(from, { kind: "text", body: known ? TEXT.clientFreeText : TEXT.unknownSender });
  return null;
}

/** load → decide → write, retried on a write conflict; then messages and calendar. */
async function runEvent(event: Event, deps: FlowDeps): Promise<void> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const state = await loadState(deps.db, deps.coachPhone);
    const decisions = decide(state, event, { now: deps.now(), newId: deps.newId });
    const result = await applyWrites(deps.db, decisions);
    if (result.ok) {
      await executeSideEffects(decisions, deps);
      return;
    }
    console.warn(`flow: write conflict on ${event.type}, attempt ${attempt}`);
  }
  throw new Error(`flow: gave up on ${event.type} after ${MAX_ATTEMPTS} conflicts`);
}

/** Only runs after the DB writes committed, so nobody is told something that isn't stored. */
async function executeSideEffects(decisions: Decision[], deps: FlowDeps): Promise<void> {
  for (const d of decisions) {
    if (d.type === "sendMessage") await deps.send(d.to, d.message);
    if (d.type === "createCalendarEvent") await deps.createCalendarEvent(d);
  }
}
