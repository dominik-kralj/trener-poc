import { z } from "zod";

/**
 * One incoming WhatsApp message, reduced to what the bot needs.
 * `from` is E.164 (Meta sends it without the leading `+`).
 */
export type IncomingMessage = { from: string; messageId: string } & (
  | { kind: "text"; text: string }
  /** Tap on a reply button or list row; `replyId` is the Choice id core sent. */
  | { kind: "reply"; replyId: string }
  /** Voice, image, sticker… Out of scope, but the flow can still answer politely. */
  | { kind: "unsupported"; type: string }
);

// Only the fields we read. Zod objects strip unknown keys, so Meta adding
// fields never breaks parsing.
const Reply = z.object({ id: z.string() });

const Message = z.object({
  from: z.string().regex(/^\d{7,15}$/),
  id: z.string().min(1),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
  interactive: z
    .object({
      type: z.string(),
      button_reply: Reply.optional(),
      list_reply: Reply.optional(),
    })
    .optional(),
});

const WebhookPayload = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(
    z.object({
      changes: z.array(
        z.object({
          field: z.string(),
          // Status updates (sent/delivered/read) arrive here as `statuses` with no `messages`.
          value: z.object({ messages: z.array(Message).optional() }),
        }),
      ),
    }),
  ),
});

/** Throws on a payload that isn't a WhatsApp webhook. Status-only payloads give `[]`. */
export function parseWebhook(json: unknown): IncomingMessage[] {
  const payload = WebhookPayload.parse(json);
  return payload.entry
    .flatMap((e) => e.changes)
    .filter((c) => c.field === "messages")
    .flatMap((c) => c.value.messages ?? [])
    .map(normalize);
}

function normalize(m: z.infer<typeof Message>): IncomingMessage {
  const base = { from: `+${m.from}`, messageId: m.id };
  if (m.type === "text" && m.text) return { ...base, kind: "text", text: m.text.body };

  const reply = m.interactive?.button_reply ?? m.interactive?.list_reply;
  if (m.type === "interactive" && reply) return { ...base, kind: "reply", replyId: reply.id };

  return { ...base, kind: "unsupported", type: m.type };
}
