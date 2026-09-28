import { describe, expect, it } from "vitest";
import { decide } from "./index";
import {
  ANA,
  COACH,
  MARKO,
  TUE_13,
  WED_16,
  choiceIds,
  makeCtx,
  makeState,
  messagesTo,
  offeredSlot,
  run,
  writes,
} from "./test-utils";
import type { Decision, Event } from "./types";

/** Wed + Tue offered, Marko holds Wed. */
function withHold() {
  const initial = makeState({ slots: [offeredSlot("wed", WED_16), offeredSlot("tue", TUE_13)] });
  const { state } = run(initial, [{ type: "clientPickedSlot", from: MARKO.phone, slotId: "wed" }]);
  return { state, holdId: state.holds[0]!.id };
}

const confirm = (holdId: string, from = COACH): Event => ({ type: "coachConfirmedHold", from, holdId });
const reject = (holdId: string, from = COACH): Event => ({ type: "coachRejectedHold", from, holdId });

const calendarEvents = (decisions: Decision[]) =>
  decisions.filter((d) => d.type === "createCalendarEvent");

describe("coachConfirmsHold", () => {
  it("confirms hold + slot, notifies the client, creates exactly one calendar event", () => {
    const { state, holdId } = withHold();
    const { state: after, steps } = run(state, [confirm(holdId)]);

    expect(after.holds[0]?.status).toBe("confirmed");
    expect(after.slots.find((s) => s.id === "wed")?.status).toBe("confirmed");
    expect(calendarEvents(steps[0]!)).toEqual([
      { type: "createCalendarEvent", holdId, clientName: "Marko", startsAt: WED_16, durationMin: 60 },
    ]);
    expect(messagesTo(steps[0]!, MARKO.phone)[0]?.body).toContain("Trener je potvrdio");
  });

  it("confirming twice produces one calendar event in total", () => {
    const { state, holdId } = withHold();
    const { steps } = run(state, [confirm(holdId), confirm(holdId)]);
    expect(steps.flatMap(calendarEvents)).toHaveLength(1);
    expect(writes(steps[1]!)).toEqual([]);
  });

  it("only the coach can confirm", () => {
    const { state, holdId } = withHold();
    expect(decide(state, confirm(holdId, MARKO.phone), makeCtx())).toEqual([]);
    expect(decide(state, confirm(holdId, ANA.phone), makeCtx())).toEqual([]);
  });

  it("a rejected hold cannot be confirmed", () => {
    const { state, holdId } = withHold();
    const { steps } = run(state, [reject(holdId), confirm(holdId)]);
    expect(writes(steps[1]!)).toEqual([]);
  });

  it("unknown hold: tells the coach, changes nothing", () => {
    const decisions = decide(makeState(), confirm("nope"), makeCtx());
    expect(writes(decisions)).toEqual([]);
    expect(messagesTo(decisions, COACH)).toHaveLength(1);
  });
});

describe("coachRejectsHold", () => {
  it("rejects the hold, reopens the slot, offers the client the other slots", () => {
    const { state, holdId } = withHold();
    const { state: after, steps } = run(state, [reject(holdId)]);

    expect(after.holds[0]?.status).toBe("rejected");
    expect(after.slots.find((s) => s.id === "wed")?.status).toBe("open");
    expect(calendarEvents(steps[0]!)).toEqual([]);

    const [reply] = messagesTo(steps[0]!, MARKO.phone);
    expect(reply?.body).toContain("trener ne može");
    expect(choiceIds(reply)).toEqual(["pick:tue", "decline"]);
  });

  it("a rejected slot can be picked again by someone else", () => {
    const { state, holdId } = withHold();
    const { state: after } = run(state, [
      reject(holdId),
      { type: "clientPickedSlot", from: ANA.phone, slotId: "wed" },
    ]);
    const active = after.holds.filter((h) => h.slotId === "wed" && h.status === "held");
    expect(active.map((h) => h.clientId)).toEqual([ANA.id]);
  });

  it("rejecting twice changes nothing the second time", () => {
    const { state, holdId } = withHold();
    const { steps } = run(state, [reject(holdId), reject(holdId)]);
    expect(writes(steps[1]!)).toEqual([]);
    expect(messagesTo(steps[1]!, MARKO.phone)).toEqual([]);
  });

  it("a confirmed hold cannot be rejected (cancellations are out of scope)", () => {
    const { state, holdId } = withHold();
    const { steps } = run(state, [confirm(holdId), reject(holdId)]);
    expect(writes(steps[1]!)).toEqual([]);
  });

  it("only the coach can reject", () => {
    const { state, holdId } = withHold();
    expect(decide(state, reject(holdId, MARKO.phone), makeCtx())).toEqual([]);
  });
});

describe("invariant: only confirming creates calendar events", () => {
  it("a full flow produces exactly one calendar event, on the confirm step", () => {
    const events: Event[] = [
      { type: "coachOfferedSlots", from: COACH, slots: [{ startsAt: WED_16, durationMin: 60 }] },
      { type: "coachSentOffer", from: COACH },
      { type: "clientPickedSlot", from: MARKO.phone, slotId: "id-1" },
      { type: "clientPickedSlot", from: ANA.phone, slotId: "id-1" },
      { type: "clientDeclined", from: ANA.phone },
      { type: "coachConfirmedHold", from: COACH, holdId: "id-2" },
    ];
    const { steps } = run(makeState(), events);
    const perStep = steps.map((s) => calendarEvents(s).length);
    expect(perStep).toEqual([0, 0, 0, 0, 0, 1]);
  });
});
