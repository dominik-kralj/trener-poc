// Sends a text and a button message to COACH_PHONE using the real Graph API.
// Reads secrets from .dev.vars, like `wrangler dev`. Run: pnpm --filter @trener/worker send:test
import { getPlatformProxy } from "wrangler";
import type { Env } from "../src/env";
import { createWhatsApp } from "../src/whatsapp/client";

const { env, dispose } = await getPlatformProxy<Env>({ persist: false, remoteBindings: false });
const wa = createWhatsApp({ token: env.WHATSAPP_TOKEN, phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID });

const text = await wa.sendText(env.COACH_PHONE, "Test: bot za termine radi 👋");
console.log("text:", text);
const buttons = await wa.send(env.COACH_PHONE, {
  kind: "choices",
  body: "Srijeda 16:00: Marko. Potvrdi?",
  choices: [
    { id: "confirm:test", title: "Potvrdi" },
    { id: "reject:test", title: "Odbij" },
  ],
});
console.log("buttons:", buttons);

await dispose();
process.exit(text.ok && buttons.ok ? 0 : 1);
