import { Hono } from "hono";
import type { Env } from "../env";
import { claimMessage } from "./dedupe";
import { parseWebhook, type IncomingMessage } from "./payload";
import { verifySignature } from "./signature";

/** Handles one new (deduped) message. Runs after the 200 has been returned. */
export type MessageHandler = (message: IncomingMessage, env: Env) => Promise<void>;

export function webhookRoutes(onMessage: MessageHandler) {
  const app = new Hono<{ Bindings: Env }>();

  // Meta's one-time subscription handshake.
  app.get("/", (c) => {
    const mode = c.req.query("hub.mode");
    const token = c.req.query("hub.verify_token");
    const challenge = c.req.query("hub.challenge");
    if (mode === "subscribe" && token === c.env.WHATSAPP_VERIFY_TOKEN && challenge) {
      return c.text(challenge);
    }
    return c.text("forbidden", 403);
  });

  app.post("/", async (c) => {
    // Must be the exact raw bytes: re-serialized JSON would not match the HMAC.
    const raw = await c.req.arrayBuffer();
    const valid = await verifySignature(
      c.env.WHATSAPP_APP_SECRET,
      raw,
      c.req.header("X-Hub-Signature-256"),
    );
    if (!valid) return c.text("invalid signature", 401);

    let messages: IncomingMessage[];
    try {
      messages = parseWebhook(JSON.parse(new TextDecoder().decode(raw)));
    } catch (error) {
      // Signed by Meta but not a shape we know. 200 so Meta doesn't retry it forever.
      console.error("webhook: unparseable payload", error);
      return c.text("ok");
    }

    c.executionCtx.waitUntil(processAll(messages, c.env, onMessage));
    return c.text("ok");
  });

  return app;
}

async function processAll(messages: IncomingMessage[], env: Env, onMessage: MessageHandler) {
  for (const message of messages) {
    try {
      const isNew = await claimMessage(env.DB, message.messageId, new Date().toISOString());
      if (!isNew) continue;
      await onMessage(message, env);
    } catch (error) {
      console.error(`webhook: failed to process ${message.messageId}`, error);
    }
  }
}
