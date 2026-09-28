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
import type { Event, State } from "./types";

const pick = (from: string, slotId: string): Event => ({ type: "clientPickedSlot", from, slotId });

const offered = (): State =>
  makeState({ slots: [offeredSlot("wed", WED_16), offeredSlot("tue", TUE_13)] });

const activeHolds = (state: State, slotId: string) =>
  state.holds.filter((h) => h.slotId === slotId && h.status !== "rejected");

describe("clientPicksSlot", () => {
  it("holds an open slot, tells the client, asks the coach to confirm", () => {
    const { state, steps } = run(offered(), [pick(MARKO.phone, "wed")]);

    expect(state.slots.find((s) => s.id === "wed")?.status).toBe("held");
    expect(state.holds).toEqual([
      expect.objectContaining({ slotId: "wed", clientId: MARKO.id, status: "held" }),
    ]);

    expect(messagesTo(steps[0]!, MARKO.phone)[0]?.body).toContain("rezerviran za tebe");
    const [ask] = messagesTo(steps[0]!, COACH);
    expect(ask?.body).toBe("Srijeda 30.9. u 16:00: Marko. Potvrdi?");
    const holdId = state.holds[0]!.id;
    expect(choiceIds(ask)).toEqual([`confirm:${holdId}`, `reject:${holdId}`]);
  });

  it("taken-slot race: the second picker gets the remaining slots, not an error", () => {
    const { state, steps } = run(offered(), [pick(MARKO.phone, "wed"), pick(ANA.phone, "wed")]);

    expect(activeHolds(state, "wed")).toHaveLength(1);
    expect(activeHolds(state, "wed")[0]?.clientId).toBe(MARKO.id);

    const second = steps[1]!;
    expect(writes(second)).toEqual([]);
    expect(messagesTo(second, COACH)).toEqual([]);
    const [reply] = messagesTo(second, ANA.phone);
    expect(reply?.body).toContain("upravo netko zauzeo");
    expect(choiceIds(reply)).toEqual(["pick:tue", "decline"]);
  });

  it("when nothing is left, says so politely", () => {
    const state = makeState({ slots: [offeredSlot("wed", WED_16)] });
    const { steps } = run(state, [pick(MARKO.phone, "wed"), pick(ANA.phone, "wed")]);
    const [reply] = messagesTo(steps[1]!, ANA.phone);
    expect(reply?.kind).toBe("text");
    expect(reply?.body).toContain("drugih slobodnih termina trenutno nema");
  });

  it("the same pick twice creates no second hold and no second coach message", () => {
    const { state, steps } = run(offered(), [pick(MARKO.phone, "wed"), pick(MARKO.phone, "wed")]);
    expect(state.holds).toHaveLength(1);
    expect(writes(steps[1]!)).toEqual([]);
    expect(messagesTo(steps[1]!, COACH)).toEqual([]);
    expect(messagesTo(steps[1]!, MARKO.phone)[0]?.body).toContain("Već sam ti rezervirao");
  });

  it("invariant: a slot is never held by two clients, whatever the order of picks", () => {
    const events = [
      pick(MARKO.phone, "wed"),
      pick(ANA.phone, "wed"),
      pick(ANA.phone, "tue"),
      pick(MARKO.phone, "tue"),
      pick(ANA.phone, "wed"),
    ];
    const { state } = run(offered(), events);
    expect(activeHolds(state, "wed")).toHaveLength(1);
    expect(activeHolds(state, "tue")).toHaveLength(1);
  });

  it("draft (unsent) and unknown slots cannot be picked", () => {
    const state = makeState({
      slots: [{ ...offeredSlot("draft", WED_16), offeredAt: null }],
    });
    expect(writes(decide(state, pick(MARKO.phone, "draft"), makeCtx()))).toEqual([]);
    expect(writes(decide(state, pick(MARKO.phone, "nope"), makeCtx()))).toEqual([]);
  });

  it("past slots cannot be picked", () => {
    const decisions = decide(offered(), pick(MARKO.phone, "tue"), makeCtx("2026-10-05T10:00:00Z"));
    expect(writes(decisions)).toEqual([]);
  });

  it("ignores unknown senders", () => {
    expect(decide(offered(), pick("+385999999999", "wed"), makeCtx())).toEqual([]);
  });
});

describe("clientDeclines", () => {
  it("acks the client and does nothing else", () => {
    const decisions = decide(offered(), { type: "clientDeclined", from: MARKO.phone }, makeCtx());
    expect(writes(decisions)).toEqual([]);
    expect(messagesTo(decisions, COACH)).toEqual([]);
    expect(messagesTo(decisions, MARKO.phone)).toHaveLength(1);
  });
});
