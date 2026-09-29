/**
 * Claims a WhatsApp message ID. Returns `false` if it was already claimed,
 * i.e. Meta is retrying a message we've seen.
 *
 * Claimed *before* processing: if processing then fails the message is dropped
 * rather than risking acting on it twice (at-most-once).
 */
export async function claimMessage(db: D1Database, messageId: string, now: string): Promise<boolean> {
  const result = await db
    .prepare("INSERT INTO processed_message (id, received_at) VALUES (?1, ?2) ON CONFLICT (id) DO NOTHING")
    .bind(messageId, now)
    .run();
  return result.meta.changes === 1;
}
