import type { Decision, State } from "@trener/core";
import { Client, Hold, Slot } from "@trener/shared";
import { z } from "zod";

// Rows come back snake_case; parse them into the shared domain types.
const SlotRow = z
  .object({
    id: z.string(),
    starts_at: z.string(),
    duration_min: z.number(),
    status: z.string(),
    offered_at: z.string().nullable(),
    created_at: z.string(),
  })
  .transform((r) =>
    Slot.parse({
      id: r.id,
      startsAt: r.starts_at,
      durationMin: r.duration_min,
      status: r.status,
      offeredAt: r.offered_at,
      createdAt: r.created_at,
    }),
  );

const HoldRow = z
  .object({
    id: z.string(),
    slot_id: z.string(),
    client_id: z.string(),
    status: z.string(),
    calendar_event_id: z.string().nullable(),
    created_at: z.string(),
  })
  .transform((r) =>
    Hold.parse({
      id: r.id,
      slotId: r.slot_id,
      clientId: r.client_id,
      status: r.status,
      calendarEventId: r.calendar_event_id,
      createdAt: r.created_at,
    }),
  );

export async function loadState(db: D1Database, coachPhone: string): Promise<State> {
  const [clients, slots, holds] = await db.batch([
    db.prepare("SELECT id, phone, name FROM client"),
    db.prepare(
      "SELECT id, starts_at, duration_min, status, offered_at, created_at FROM slot",
    ),
    db.prepare(
      "SELECT id, slot_id, client_id, status, calendar_event_id, created_at FROM hold",
    ),
  ]);
  return {
    coachPhone,
    clients: z.array(Client).parse(clients?.results ?? []),
    slots: z.array(SlotRow).parse(slots?.results ?? []),
    holds: z.array(HoldRow).parse(holds?.results ?? []),
  };
}

export type ApplyResult = { ok: true } | { ok: false; reason: "conflict" };

/**
 * Writes all DB decisions in one batch (a D1 batch is a transaction).
 * Returns `conflict` when a concurrent pick already holds the slot: the caller
 * reloads state and decides again, so the loser gets "slot taken".
 * Non-DB decisions (messages, calendar) are ignored here.
 */
export async function applyWrites(db: D1Database, decisions: Decision[]): Promise<ApplyResult> {
  const statements = decisions.flatMap((d) => {
    switch (d.type) {
      case "writeSlot":
        return [
          db
            .prepare(
              `INSERT INTO slot (id, starts_at, duration_min, status, offered_at, created_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6)
               ON CONFLICT (id) DO UPDATE SET
                 starts_at = excluded.starts_at,
                 duration_min = excluded.duration_min,
                 status = excluded.status,
                 offered_at = excluded.offered_at`,
            )
            .bind(
              d.slot.id,
              d.slot.startsAt,
              d.slot.durationMin,
              d.slot.status,
              d.slot.offeredAt,
              d.slot.createdAt,
            ),
        ];
      case "deleteSlot":
        // Only unsent drafts are ever deleted; the guard keeps it that way.
        return [
          db
            .prepare("DELETE FROM slot WHERE id = ?1 AND status = 'open' AND offered_at IS NULL")
            .bind(d.slotId),
        ];
      case "writeHold":
        return [
          db
            .prepare(
              `INSERT INTO hold (id, slot_id, client_id, status, calendar_event_id, created_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6)
               ON CONFLICT (id) DO UPDATE SET
                 status = excluded.status,
                 calendar_event_id = COALESCE(excluded.calendar_event_id, hold.calendar_event_id)`,
            )
            .bind(
              d.hold.id,
              d.hold.slotId,
              d.hold.clientId,
              d.hold.status,
              d.hold.calendarEventId,
              d.hold.createdAt,
            ),
        ];
      default:
        return [];
    }
  });

  if (statements.length === 0) return { ok: true };
  try {
    await db.batch(statements);
    return { ok: true };
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
      return { ok: false, reason: "conflict" };
    }
    throw error;
  }
}

export async function setCalendarEventId(
  db: D1Database,
  holdId: string,
  calendarEventId: string,
): Promise<void> {
  await db
    .prepare("UPDATE hold SET calendar_event_id = ?1 WHERE id = ?2")
    .bind(calendarEventId, holdId)
    .run();
}
