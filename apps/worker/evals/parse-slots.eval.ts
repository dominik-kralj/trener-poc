// Eval set for the coach's slot message → slots parsing. Calls the real API.
// Rerun after every prompt change: pnpm --filter @trener/worker eval
// Reads ANTHROPIC_API_KEY from .dev.vars, like `wrangler dev`.
import Anthropic from "@anthropic-ai/sdk";
import { getPlatformProxy } from "wrangler";
import type { Env } from "../src/env";
import { parseSlotMessage } from "../src/ai/parse-slots";

// Fixed "now": Tuesday 29.9.2026, 10:00 in Zagreb.
const NOW = "2026-09-29T08:00:00.000Z";

/** `questionIncludes` checks the reason for an "unclear", when it matters. */
type Case = { text: string; expect: string[] | "unclear"; questionIncludes?: string };

/** "YYYY-MM-DDTHH:MM" local → "…:00+02:00". Everything in this set is before the DST change except 26.10. */
const s = (local: string, durationMin = 60, offset = "+02:00") => `${local}:00${offset}/${durationMin}`;

const CASES: Case[] = [
  { text: "Ovaj tjedan slobodno srijeda 16, utorak 13", expect: [s("2026-09-30T16:00"), s("2026-09-29T13:00")] },
  { text: "ovaj tj slobodno sri 16 i uto 13h", expect: [s("2026-09-30T16:00"), s("2026-09-29T13:00")] },
  { text: "sutra u 5 popodne", expect: [s("2026-09-30T17:00")] },
  { text: "Cetvrtak 18h i petak 17 30", expect: [s("2026-10-01T18:00"), s("2026-10-02T17:30")] },
  { text: "slobodan sam u subotu ujutro u 9 i u nedjelju u 10", expect: [s("2026-10-03T09:00"), s("2026-10-04T10:00")] },
  { text: "sljedeći tjedan pon 16, sri 17", expect: [s("2026-10-05T16:00"), s("2026-10-07T17:00")] },
  { text: "Srijeda 16 i 18, četvrtak 19", expect: [s("2026-09-30T16:00"), s("2026-09-30T18:00"), s("2026-10-01T19:00")] },
  { text: "danas 18h", expect: [s("2026-09-29T18:00")] },
  { text: "petak 16, 90 min", expect: [s("2026-10-02T16:00", 90)] },
  { text: "pet u pola 5", expect: [s("2026-10-02T16:30")] },
  { text: "sri 16h, cet 17h, pet 18h, sub 10h", expect: [s("2026-09-30T16:00"), s("2026-10-01T17:00"), s("2026-10-02T18:00"), s("2026-10-03T10:00")] },
  { text: "3.10. u 10 i 11", expect: [s("2026-10-03T10:00"), s("2026-10-03T11:00")] },
  { text: "ovaj tjedan utorak 8 navečer", expect: [s("2026-09-29T20:00")] },
  { text: "26.10. u 16", expect: [s("2026-10-26T16:00", 60, "+01:00")] },
  { text: "Imam slobodno u srijedu", expect: "unclear" },
  { text: "Bok, kako si?", expect: "unclear" },
  { text: "srijeda od 16 do 19", expect: "unclear" },
  { text: "Slobodan 31.9. u 16", expect: "unclear" },
  { text: "danas u 9", expect: "unclear", questionIncludes: "već prošao" }, // past at 10:00: caught in code
];

const { env, dispose } = await getPlatformProxy<Env>({ persist: false, remoteBindings: false });
await dispose();
if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY missing in .dev.vars");
const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const results = await Promise.all(
  CASES.map(async (c) => {
    const parsed = await parseSlotMessage(client, c.text, NOW);
    const got = parsed.kind === "unclear" ? "unclear" : parsed.slots.map((x) => `${x.startsAt}/${x.durationMin}`).sort();
    const want = c.expect === "unclear" ? "unclear" : [...c.expect].sort();
    const reasonOk =
      !c.questionIncludes || (parsed.kind === "unclear" && parsed.question.includes(c.questionIncludes));
    const pass = JSON.stringify(got) === JSON.stringify(want) && reasonOk;
    return { c, parsed, got, want, pass };
  }),
);

for (const r of results) {
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.c.text}`);
  if (r.parsed.kind === "unclear") console.log(`      → pitanje: ${r.parsed.question}`);
  if (!r.pass) console.log(`      want ${JSON.stringify(r.want)}\n      got  ${JSON.stringify(r.got)}`);
}
const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
