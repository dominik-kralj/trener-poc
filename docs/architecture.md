# Architecture

```
Clients / Coach (WhatsApp)
        ↕
Meta WhatsApp Cloud API (test number)
        ↓ webhook                ↑ send via Graph API
Cloudflare Worker (Hono)
  webhook → AI parsing (Claude + Zod) → coordination (packages/core) → D1
                                                     ↓ on confirm only
                                          Google Calendar (coach's calendar)
```

No web dashboard. The coach works in WhatsApp and sees confirmed sessions in their own Google Calendar.

## Path of one message
1. A client or the coach sends a WhatsApp message.
2. Meta calls the webhook. The worker verifies the signature, checks the message ID for duplicates, returns 200 and continues in `ctx.waitUntil`.
3. If the message is free text that needs understanding, the AI step returns Zod-validated structured data. Button taps skip AI.
4. `packages/core` receives the current state from D1 plus the event and returns decisions.
5. The worker writes to D1, sends WhatsApp messages via the Graph API, and, when a hold was confirmed, creates the Google Calendar event and stores its ID.

## Source of truth
D1 holds everything: offered slots, holds, pending confirmations. Google Calendar only mirrors confirmed sessions and is never read back. If the two disagree, D1 wins.

## Stack per part
| Part | Tech |
|---|---|
| Messaging | Meta WhatsApp Cloud API, own `fetch` wrapper |
| HTTP / webhook | Cloudflare Workers + Hono |
| AI parsing | Anthropic TS SDK, `claude-haiku-4-5`, tool use, Zod |
| Coordination | Pure TypeScript in `packages/core` |
| Storage | Cloudflare D1, plain SQL migrations |
| Coach's view | Google Calendar API (write-only, `calendar.events` scope) |
| Tests | Vitest |

## Later, not in the POC
Cron triggers (reminders, timeouts), Cloudflare Queues, voice messages, client-initiated requests and cancellations, groups, reading free slots from the calendar, a web UI (only if coaches ask for one, e.g. for managing clients and packages).
