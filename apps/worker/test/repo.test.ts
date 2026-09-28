import { decide, type Context, type Event } from "@trener/core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyWrites, loadState, setCalendarEventId } from "../src/db/repo";
import { resetDb, startTestDb } from "./d1";

const COACH = "+385910000000";
const MARKO = "+385910000001";
const ANA = "+385910000002";
const WED_16 = "2026-09-30T16:00:00+02:00";

let db: D1Database;
let dispose: () => Promise<void>;
let n = 0;
const ctx: Context = { now: "2026-09-28T10:00:00.000Z", newId: () => `id-${++n}` };

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

/** What the worker will do per event: load → decide → write. */
async function handle(event: Event) {
  const state = await loadState(db, COACH);
  const decisions = decide(state, event, ctx);
  return { decisions, result: await applyWrites(db, decisions) };
}

describe("repo", () => {
  it("loads clients with the coach phone", async () => {
    const state = await loadState(db, COACH);
    expect(state.coachPhone).toBe(COACH);
    expect(state.clients.map((c) => c.name).sort()).toEqual(["Ana", "Marko"]);
  });

  it("round-trips the full flow through D1", async () => {
    await handle({ type: "coachOfferedSlots", from: COACH, slots: [{ startsAt: WED_16, durationMin: 60 }] });
    await handle({ type: "coachSentOffer", from: COACH });
    let state = await loadState(db, COACH);
    const slotId = state.slots[0]!.id;
    expect(state.slots[0]).toMatchObject({ startsAt: WED_16, status: "open" });
    expect(state.slots[0]!.offeredAt).not.toBeNull();

    await handle({ type: "clientPickedSlot", from: MARKO, slotId });
    state = await loadState(db, COACH);
    const holdId = state.holds[0]!.id;
    expect(state.slots[0]!.status).toBe("held");

    const { decisions } = await handle({ type: "coachConfirmedHold", from: COACH, holdId });
    expect(decisions.filter((d) => d.type === "createCalendarEvent")).toHaveLength(1);

    await setCalendarEventId(db, holdId, "gcal-123");
    state = await loadState(db, COACH);
    expect(state.slots[0]!.status).toBe("confirmed");
    expect(state.holds[0]).toMatchObject({ status: "confirmed", calendarEventId: "gcal-123" });
  });

  it("a corrected coach message deletes the unsent draft", async () => {
    await handle({ type: "coachOfferedSlots", from: COACH, slots: [{ startsAt: WED_16, durationMin: 60 }] });
    await handle({
      type: "coachOfferedSlots",
      from: COACH,
      slots: [{ startsAt: "2026-10-01T10:00:00+02:00", durationMin: 60 }],
    });
    const state = await loadState(db, COACH);
    expect(state.slots.map((s) => s.startsAt)).toEqual(["2026-10-01T10:00:00+02:00"]);
  });

  it("concurrent picks on stale state: the DB lets only one hold through", async () => {
    await handle({ type: "coachOfferedSlots", from: COACH, slots: [{ startsAt: WED_16, durationMin: 60 }] });
    await handle({ type: "coachSentOffer", from: COACH });

    // Both webhooks loaded state before either wrote: core says "hold" to both.
    const stale = await loadState(db, COACH);
    const slotId = stale.slots[0]!.id;
    const markoPick = decide(stale, { type: "clientPickedSlot", from: MARKO, slotId }, ctx);
    const anaPick = decide(stale, { type: "clientPickedSlot", from: ANA, slotId }, ctx);

    expect(await applyWrites(db, markoPick)).toEqual({ ok: true });
    expect(await applyWrites(db, anaPick)).toEqual({ ok: false, reason: "conflict" });

    const state = await loadState(db, COACH);
    expect(state.holds).toHaveLength(1);
    expect(state.holds[0]!.clientId).toBe("c-1");
  });
});
