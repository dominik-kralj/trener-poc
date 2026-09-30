# Demo script

Two phones: **Trener** (coach, `COACH_PHONE`) and **Klijent A** (in `seed.sql`, added as a recipient of the WhatsApp test number). A third phone (**Klijent B**) is optional: with it, step 4 shows two clients racing for one slot live. Without it, that case is covered by the concurrent test in `apps/worker/test/flow.test.ts`. The worker runs at `https://trener-poc.kraljdominik97.workers.dev`.

## Before the demo (same day)

1. **Google login is less than 7 days old.** Testing-mode refresh tokens expire after 7 days. If in doubt:
   `pnpm --filter @trener/worker google:auth`, then `npx wrangler secret put GOOGLE_REFRESH_TOKEN` (in `apps/worker`).
2. **Reset:** `pnpm --filter @trener/worker demo:reset` wipes slots and holds (clients stay). Delete leftover "Trening: …" events from the calendar by hand.
3. **24h window:** each client phone sends "bok" to the bot. Each gets the "automatski asistent" reply; if not, check the WhatsApp token.
4. **Pick two future times** for the script below, e.g. tomorrow 16 and the day after 18.

## Run

| # | Who | Does | Sees |
|---|---|---|---|
| 1 | Trener | Writes `Ovaj tjedan slobodno sutra 16, petak 18` (use the chosen times) | "Ovo sam razumio: …" + **[Pošalji ponudu]** |
| 2 | Trener | Taps **Pošalji ponudu** | "Ponuda poslana klijentima (1)" (2 with Klijent B) |
| 3 | Klijent A (and B) | Gets a personal offer: the slots + "Ne ovaj tjedan" | |
| 4 | Klijent A | Taps a slot | "… je rezerviran za tebe" |
| 4b | Klijent B, if present | Taps **the same slot** right after A | "Taj termin je upravo netko zauzeo. Još je slobodno: …" |
| 5 | Trener | Gets "<Dan> … u 16:00: <ime>. Potvrdi?" and taps **Potvrdi** | "Potvrđeno: …" |
| 6 | Klijent A | | "Trener je potvrdio! Vidimo se …" |
| 7 | Everyone | Open the coach's Google Calendar | "Trening: <ime>" at that time |

Optional extras:
- **Wrong parse is easy to fix:** before step 2 the coach sends a corrected message; the new draft replaces the old one.
- **Unclear message:** the coach writes `Imam slobodno u srijedu`; the bot asks what time instead of guessing.
- **Reject:** the coach taps **Odbij**; the client gets the remaining slots and the slot is free again.
- **Chat stays personal:** a client writes free text; the bot says it only handles scheduling.

## What to say

- The coach keeps their own phone and WhatsApp. The assistant is just another chat.
- The coach always confirms; the bot never books anything on its own.
- Confirmed sessions show up in the calendar the coach already uses.

## If something goes wrong

- **No replies at all:** `npx wrangler tail` in `apps/worker` while sending a message. A `190` / `401` in the logs means the WhatsApp token is invalid.
- **Calendar event missing:** the coach got "nisam uspio upisati u Google Kalendar" → Google login expired (step 1). The sync retries on the coach's next message.
