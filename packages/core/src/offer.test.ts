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
  run,
  writes,
} from "./test-utils";
import type { Event } from "./types";

const offer = (...startsAt: string[]): Event => ({
  type: "coachOfferedSlots",
  from: COACH,
  slots: startsAt.map((s) => ({ startsAt: s, durationMin: 60 })),
});
const send: Event = { type: "coachSentOffer", from: COACH };

describe("coachOffersSlots", () => {
  it("stores slots as drafts and echoes them sorted, with [Pošalji ponudu]", () => {
    const { state, steps } = run(makeState(), [offer(WED_16, TUE_13)]);

    expect(state.slots).toHaveLength(2);
    expect(state.slots.every((s) => s.status === "open" && s.offeredAt === null)).toBe(true);

    const [echo] = messagesTo(steps[0]!, COACH);
    expect(echo?.kind).toBe("choices");
    expect(echo?.kind === "choices" && echo.body).toContain(
      "• utorak 29.9. u 13:00\n• srijeda 30.9. u 16:00",
    );
    expect(choiceIds(echo)).toEqual(["send_offer"]);
  });

  it("nothing reaches clients before the coach taps send", () => {
    const { steps } = run(makeState(), [offer(WED_16)]);
    expect(messagesTo(steps[0]!, MARKO.phone)).toEqual([]);
  });

  it("the same message twice changes nothing", () => {
    const { state, steps } = run(makeState(), [offer(WED_16, TUE_13), offer(WED_16, TUE_13)]);
    expect(state.slots).toHaveLength(2);
    expect(writes(steps[1]!)).toEqual([]);
  });

  it("a corrected message replaces the unsent draft", () => {
    const { state } = run(makeState(), [offer(WED_16, TUE_13), offer(WED_16)]);
    expect(state.slots.map((s) => s.startsAt)).toEqual([WED_16]);
  });

  it("skips past slots and slots already sent to clients", () => {
    const { state, steps } = run(makeState(), [
      offer(WED_16),
      send,
      offer(WED_16, "2026-09-27T10:00:00+02:00"),
    ]);
    expect(state.slots).toHaveLength(1);
    const [reply] = messagesTo(steps[2]!, COACH);
    expect(reply?.kind).toBe("text");
    expect(reply?.body).toContain("Nema novih termina");
  });

  it("ignores anyone who is not the coach", () => {
    expect(decide(makeState(), { ...offer(WED_16), from: MARKO.phone }, makeCtx())).toEqual([]);
  });
});

describe("coachSendsOffer", () => {
  it("marks drafts as offered and sends each client a personal offer with a decline option", () => {
    const { state, steps } = run(makeState(), [offer(WED_16, TUE_13), send]);
    const sent = steps[1]!;

    expect(state.slots.every((s) => s.offeredAt !== null)).toBe(true);

    for (const client of [MARKO, ANA]) {
      const [msg] = messagesTo(sent, client.phone);
      expect(msg?.body).toContain(`Bok ${client.name}!`);
      expect(msg?.body).toContain("automatski asistent");
      const ids = choiceIds(msg);
      expect(ids).toHaveLength(3);
      expect(ids.at(-1)).toBe("decline");
    }
    expect(messagesTo(sent, COACH)[0]?.body).toContain("Ponuda poslana klijentima (2)");
  });

  it("sending twice does not double-send", () => {
    const { steps } = run(makeState(), [offer(WED_16), send, send]);
    const second = steps[2]!;
    expect(writes(second)).toEqual([]);
    expect(messagesTo(second, MARKO.phone)).toEqual([]);
    expect(messagesTo(second, ANA.phone)).toEqual([]);
  });

  it("with no drafts, nothing is sent to clients", () => {
    const decisions = decide(makeState(), send, makeCtx());
    expect(decisions.every((d) => d.type === "sendMessage" && d.to === COACH)).toBe(true);
  });

  it("button titles fit WhatsApp's 20-char limit", () => {
    const { steps } = run(makeState(), [offer(WED_16, TUE_13), send]);
    const [msg] = messagesTo(steps[1]!, MARKO.phone);
    expect(msg?.kind === "choices" && msg.choices.every((c) => c.title.length <= 20)).toBe(true);
  });

  it("ignores anyone who is not the coach", () => {
    const { state } = run(makeState(), [offer(WED_16)]);
    expect(decide(state, { type: "coachSentOffer", from: MARKO.phone }, makeCtx())).toEqual([]);
  });
});
