import type { OutgoingMessage } from "@trener/core";
import type { ParsedSlots } from "@trener/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { handleMessage, TEXT, type FlowDeps } from "../src/flow/handle";
import type { IncomingMessage } from "../src/webhook/payload";
import { resetDb, startTestDb } from "./d1";

const COACH = "+385910000000";
const MARKO = "+385910000001";
const ANA = "+385910000002";
const STRANGER = "+385919999999";
const WED_16 = "2026-09-30T16:00:00+02:00";
const TUE_13 = "2026-09-29T13:00:00+02:00";

let db: D1Database;
let dispose: () => Promise<void>;

beforeAll(async () => {
  ({ db, dispose } = await startTestDb());
}, 30_000);
afterAll(() => dispose());

beforeEach(async () => {
  await resetDb(db);
  await db
    .prepare("INSERT INTO client (id, phone, name) VALUES ('c-1', ?1, 'Marko'), ('c-2', ?2, 'Ana')")
    .bind(MARKO, ANA)
    .run();
});

function setup(parsed: ParsedSlots | Error = { kind: "slots", slots: [{ startsAt: WED_16, durationMin: 60 }, { startsAt: TUE_13, durationMin: 60 }] }) {
  const sent: { to: string; message: OutgoingMessage }[] = [];
  const calendar: unknown[] = [];
  let n = 0;
  const deps: FlowDeps = {
    db,
    coachPhone: COACH,
    send: async (to, message) => {
      sent.push({ to, message });
      return { ok: true, messageId: `out-${sent.length}` };
    },
    parseSlots: async () => {
      if (parsed instanceof Error) throw parsed;
      return parsed;
    },
    createCalendarEvent: async (d) => {
      calendar.push(d);
    },
    now: () => "2026-09-29T08:00:00.000Z",
    newId: () => `id-${++n}`,
  };

  let m = 0;
  const text = (from: string, body: string) =>
    handleMessage({ from, messageId: `in-${++m}`, kind: "text", text: body }, deps);
  const tap = (from: string, replyId: string) =>
    handleMessage({ from, messageId: `in-${++m}`, kind: "reply", replyId }, deps);

  /** Messages sent since the last call, then forgets them. */
  const drain = () => sent.splice(0, sent.length);
  const choiceIds = (msg: OutgoingMessage) => (msg.kind === "choices" ? msg.choices.map((c) => c.id) : []);
  const bodyOf = (msg: OutgoingMessage) => msg.body;

  return { deps, sent, calendar, text, tap, drain, choiceIds, bodyOf };
}

async function slotIdAt(startsAt: string) {
  const row = await db.prepare("SELECT id FROM slot WHERE starts_at = ?1").bind(startsAt).first<{ id: string }>();
  return row!.id;
}

describe("flow: the whole POC scenario", () => {
  it("offer → two clients race for one slot → coach confirms", async () => {
    const { text, tap, drain, choiceIds, bodyOf, calendar } = setup();

    // 1-2. Coach writes free text; the bot echoes the draft with [Pošalji ponudu].
    await text(COACH, "Ovaj tjedan slobodno srijeda 16, utorak 13");
    let out = drain();
    expect(out).toHaveLength(1);
    expect(out[0]!.to).toBe(COACH);
    expect(choiceIds(out[0]!.message)).toEqual(["send_offer"]);

    // 3. Each client gets a personal offer: 2 slots + "Ne ovaj tjedan".
    await tap(COACH, "send_offer");
    out = drain();
    const offers = out.filter((o) => o.to !== COACH);
    expect(offers.map((o) => o.to).sort()).toEqual([MARKO, ANA]);
    const wed = await slotIdAt(WED_16);
    for (const o of offers) {
      expect(choiceIds(o.message)).toEqual([`pick:${await slotIdAt(TUE_13)}`, `pick:${wed}`, "decline"]);
      expect(bodyOf(o.message)).toContain("automatski asistent");
    }

    // 4. Both tap Wednesday at the same time: exactly one hold.
    await Promise.all([tap(MARKO, `pick:${wed}`), tap(ANA, `pick:${wed}`)]);
    out = drain();
    const holds = await db.prepare("SELECT client_id, status FROM hold").all<{ client_id: string; status: string }>();
    expect(holds.results).toHaveLength(1);
    const winner = holds.results[0]!.client_id === "c-1" ? MARKO : ANA;
    const loser = winner === MARKO ? ANA : MARKO;

    expect(out.find((o) => o.to === winner)!.message.body).toContain("rezerviran za tebe");
    const loserMsg = out.find((o) => o.to === loser)!.message;
    expect(loserMsg.body).toContain("upravo netko zauzeo");
    expect(choiceIds(loserMsg)).toEqual([`pick:${await slotIdAt(TUE_13)}`, "decline"]);

    // 5. Coach gets "Srijeda 30.9. u 16:00: <name>. Potvrdi?" [Potvrdi] [Odbij].
    const ask = out.find((o) => o.to === COACH)!.message;
    expect(ask.body).toMatch(/^Srijeda 30\.9\. u 16:00: (Marko|Ana)\. Potvrdi\?$/);
    const [confirmId] = choiceIds(ask);

    // 6. Confirm: client notified, one calendar decision.
    await tap(COACH, confirmId!);
    out = drain();
    expect(out.find((o) => o.to === winner)!.message.body).toContain("Trener je potvrdio");
    expect(calendar).toHaveLength(1);
    expect(calendar[0]).toMatchObject({ type: "createCalendarEvent", startsAt: WED_16, durationMin: 60 });
    const slot = await db.prepare("SELECT status FROM slot WHERE id = ?1").bind(wed).first<{ status: string }>();
    expect(slot!.status).toBe("confirmed");
  });

  it("reject puts the slot back and the client gets the other slots", async () => {
    const { text, tap, drain, choiceIds } = setup();
    await text(COACH, "x");
    await tap(COACH, "send_offer");
    drain();
    const wed = await slotIdAt(WED_16);
    await tap(MARKO, `pick:${wed}`);
    const [reject] = choiceIds(drain().find((o) => o.to === COACH)!.message).filter((id) => id.startsWith("reject:"));

    await tap(COACH, reject!);
    const out = drain();
    expect(out.find((o) => o.to === MARKO)!.message.body).toContain("trener ne može");
    const slot = await db.prepare("SELECT status FROM slot WHERE id = ?1").bind(wed).first<{ status: string }>();
    expect(slot!.status).toBe("open");
  });
});

describe("flow: routing", () => {
  it("sends the AI's question to the coach and writes nothing", async () => {
    const { text, drain } = setup({ kind: "unclear", question: "U koliko sati?" });
    await text(COACH, "Imam slobodno u srijedu");
    expect(drain()).toEqual([{ to: COACH, message: { kind: "text", body: "U koliko sati?" } }]);
    expect((await db.prepare("SELECT COUNT(*) AS n FROM slot").first<{ n: number }>())!.n).toBe(0);
  });

  it("tells the coach to retry when the AI call fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { text, drain } = setup(new Error("overloaded"));
    await text(COACH, "sri 16");
    expect(drain()).toEqual([{ to: COACH, message: { kind: "text", body: TEXT.aiFailed } }]);
    error.mockRestore();
  });

  it("does not call the AI for client free text", async () => {
    const { deps, text, drain } = setup();
    const parse = vi.spyOn(deps, "parseSlots");
    await text(MARKO, "Može li subota?");
    expect(parse).not.toHaveBeenCalled();
    expect(drain()).toEqual([{ to: MARKO, message: { kind: "text", body: TEXT.clientFreeText } }]);
  });

  it("answers strangers politely", async () => {
    const { text, drain } = setup();
    await text(STRANGER, "Bok");
    expect(drain()).toEqual([{ to: STRANGER, message: { kind: "text", body: TEXT.unknownSender } }]);
  });

  it("ignores a client pressing the coach's buttons", async () => {
    const { text, tap, drain } = setup();
    await text(COACH, "x");
    drain();
    await tap(MARKO, "send_offer");
    expect(drain()).toEqual([]);
    const offered = await db.prepare("SELECT COUNT(*) AS n FROM slot WHERE offered_at IS NOT NULL").first<{ n: number }>();
    expect(offered!.n).toBe(0);
  });

  it("answers a voice message from the coach without calling the AI", async () => {
    const { deps, drain } = setup();
    const msg: IncomingMessage = { from: COACH, messageId: "v-1", kind: "unsupported", type: "audio" };
    await handleMessage(msg, deps);
    expect(drain()).toEqual([{ to: COACH, message: { kind: "text", body: TEXT.coachUnsupported } }]);
  });
});
