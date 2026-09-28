# CLAUDE.md — Coach Bot (POC)

WhatsApp bot that takes over **session coordination** for individual sports coaches (padel/tennis first).

**Core problem:** one person (the coach) is the bottleneck in coordinating limited slots between many people over chat. Every change triggers a chain of messages, all through the coach.

**Principles**
- The coach always confirms. Human in the loop, no exceptions.
- The bot handles scheduling only. All other client conversation stays personal.
- Nobody installs anything or opens a new app. Clients and the coach use WhatsApp; confirmed sessions appear in the coach's Google Calendar.
- D1 is the source of truth. Google Calendar is a mirror of confirmed sessions only, never read back as state.

## Current scope: POC, one flow — the coach offers free slots

1. Coach messages the bot: `"Ovaj tjedan slobodno srijeda 16, utorak 13"`
2. AI parses it into slots; bot echoes them back with `[Pošalji ponudu]`
3. Bot sends each test client a personal offer (slots + "Ne ovaj tjedan")
4. First client to pick a slot gets it **held**; later pickers of a taken slot get what's left
5. Coach gets `"Srijeda 16: Marko. Potvrdi?"` `[Potvrdi] [Odbij]`
6. Confirm → client is notified and a Google Calendar event is created. Reject → slot back to open

**Out of scope for the POC:** web dashboard, reading free slots from the calendar, Excel/Sheets sync, client-initiated requests, cancellations, voice messages, reminders/cron, packages, groups (capacity > 1), multiple coaches, other channels, Queues, Drizzle, Turborepo. If a suggestion doesn't serve the flow above, it doesn't belong yet.

## Where things are
- `apps/worker` — Cloudflare Worker (Hono): webhook, WhatsApp sending, AI parsing, Google Calendar sync. See `apps/worker/CLAUDE.md`
- `packages/core` — coordination logic, pure TS. See `packages/core/CLAUDE.md`
- `packages/shared` — Zod schemas and types
- `docs/architecture.md` — system diagram and data flow; read when a task spans several parts

## Stack
Cloudflare Workers + Hono, D1 (plain SQL migrations), Anthropic TS SDK (`claude-haiku-4-5`), Zod, Google Calendar API, Vitest, pnpm workspaces. TypeScript `strict`, no `any`.

## How to work with me
- I'm a frontend developer (React, TypeScript, Zod). This is a POC to show a potential client. Speed matters more than me learning by hand.
- Implement issues fully (code, tests, verify they run). Briefly explain non-obvious backend/AI decisions as you go.
- Keep answers short and end with one concrete next step, not a menu of options.
- If something adds scope beyond the POC flow (including suggesting a web UI), say so.
