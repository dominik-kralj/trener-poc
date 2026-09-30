import Anthropic from "@anthropic-ai/sdk";
import { Hono } from "hono";
import { parseSlotMessage } from "./ai/parse-slots";
import { createGoogleCalendar } from "./calendar/google";
import type { Env } from "./env";
import { handleMessage, type FlowDeps } from "./flow/handle";
import { webhookRoutes } from "./webhook/routes";
import { createWhatsApp } from "./whatsapp/client";

export type { Env };

function flowDeps(env: Env): FlowDeps {
  const whatsapp = createWhatsApp({ token: env.WHATSAPP_TOKEN, phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID });
  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return {
    db: env.DB,
    coachPhone: env.COACH_PHONE,
    send: whatsapp.send,
    parseSlots: (text, now) => parseSlotMessage(anthropic, text, now),
    calendar: createGoogleCalendar({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      refreshToken: env.GOOGLE_REFRESH_TOKEN,
      calendarId: env.GOOGLE_CALENDAR_ID,
    }),
    now: () => new Date().toISOString(),
    newId: () => crypto.randomUUID(),
  };
}

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.text("ok"));
app.route("/webhook", webhookRoutes((message, env) => handleMessage(message, flowDeps(env))));

export default app;
