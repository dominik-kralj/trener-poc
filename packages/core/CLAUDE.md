# packages/core

Coordination logic. The heart of the system and the part that must be tested.

## Rule
Pure TypeScript. No imports from Cloudflare, Hono, WhatsApp, D1, Google or the Anthropic SDK.
A function takes the current state + an event and returns **decisions**: which messages to send to whom, which records to write, which calendar events to create. The worker executes them.

## Domain model (POC)
- `coach` — one coach, identified by phone number (from config)
- `client` — phone (E.164), name
- `slot` — `starts_at`, `duration_min`, `status`, `offered_at` (null = draft the coach hasn't sent yet; capacity is always 1 in the POC, so no column)
- `hold` — `slot_id`, `client_id`, `status`, `calendar_event_id` (set by the worker after sync, nullable)
- `processed_message` — WhatsApp message ID (unique), used by the worker for dedupe

## State
- **slot:** `open → held → confirmed`; `held → open` when the coach rejects. A new coach slot message replaces unsent drafts (the only case a slot is deleted).
- **hold:** `held → confirmed | rejected`

## Invariants (test these first)
- A slot is never held by two clients at once.
- Only the coach can move a hold to `confirmed`.
- A client picking a slot that is no longer open gets the remaining open slots, not an error.
- Confirming a hold produces exactly one "create calendar event" decision. Nothing else ever does.

## Events for the POC
- coach offers slots (already parsed)
- coach sends the offer
- client picks a slot / declines
- coach confirms / rejects a hold

## Testing
Vitest. Each event handler gets tests for the happy path, the taken-slot race, and repeated events (the same event twice must not change the result).
