# apps/worker

Cloudflare Worker (Hono). The edges of the system: everything with I/O lives here. Decisions come from `packages/core`.

```
src/
  webhook/     # receive, verify, dedupe WhatsApp webhooks
  whatsapp/    # thin fetch wrapper for sending messages (Graph API)
  ai/          # Claude call + Zod-validated parsing
  calendar/    # Google Calendar sync for confirmed sessions
  index.ts
migrations/    # plain SQL for D1
wrangler.toml
```

## WhatsApp Cloud API rules
- **Return 200 fast.** Process after the response with `ctx.waitUntil`. Meta retries slow webhooks.
- **Dedupe by message ID** (`processed_message` table). Retries deliver the same message again; never act twice.
- **Verify `X-Hub-Signature-256`** with the app secret on POST. The GET handshake uses the verify token.
- **Reply buttons:** max 3 per message, titles max 20 characters. More choices → interactive list message.
- **24-hour window:** free-form messages only within 24h of the recipient's last message; otherwise approved templates only.
- **Test number** only reaches a few manually added recipients (coach + test clients).
- Coach vs client is decided by the sender's phone number (`COACH_PHONE`).

## AI rules
- AI only turns free text into structured data (e.g. the coach's slot message → slots). Everything else is deterministic.
- Always validate output with the Zod schema from `packages/shared`. Invalid or unsure → ask the coach, never guess.
- The bot never confirms anything on its own.
- Keep an eval set of realistic Croatian messages (slang, typos) with expected outputs; rerun it after every prompt change.

## Google Calendar rules
- **Write-only mirror.** Create an event only when a hold becomes `confirmed`. Never read the calendar back as state; D1 is the source of truth.
- Store the returned event ID on the confirmed hold so a later change can update or delete that exact event.
- A failed calendar call must not undo the confirmation. Log it, tell the coach in WhatsApp, retry later.
- Event: title `Trening: <client name>`, the slot's start and duration, `Europe/Zagreb` time zone.
- OAuth with the `calendar.events` scope. For the POC the Google Cloud app stays in testing mode with the coach as a test user; publishing for real coaches requires Google's app verification.
- Keep the refresh token in D1 or a secret, never in the repo.

## Language
- Code and comments: English
- User-facing WhatsApp text: Croatian, short, informal ("ti" form)
- On first contact the bot says it's an automated scheduling assistant for the coach.

## Secrets
Never in the repo. Local: `.dev.vars` (gitignored). Production: `wrangler secret put`.
`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `ANTHROPIC_API_KEY`, `COACH_PHONE`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_CALENDAR_ID`
