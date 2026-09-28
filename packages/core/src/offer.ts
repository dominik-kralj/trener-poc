import type { Slot, SlotInput } from "@trener/shared";
import { bulletList, byStart, isCoach, isDraft, pickableSlots, slotChoices, text } from "./helpers";
import { replyId } from "./replies";
import type { Context, Decision, State } from "./types";

/**
 * The coach's parsed slot message becomes the current draft.
 * The latest message wins: drafts not in it are dropped, so the coach fixes
 * a wrong parse by simply sending a corrected message.
 */
export function coachOffersSlots(
  state: State,
  event: { from: string; slots: SlotInput[] },
  ctx: Context,
): Decision[] {
  if (!isCoach(state, event.from)) return [];

  const drafts = state.slots.filter(isDraft);
  const draftByTime = new Map(drafts.map((s) => [Date.parse(s.startsAt), s]));
  const offeredTimes = new Set(
    state.slots.filter((s) => !isDraft(s)).map((s) => Date.parse(s.startsAt)),
  );

  const kept: Slot[] = [];
  const created: Slot[] = [];
  let skippedPast = 0;
  let skippedOffered = 0;
  const seen = new Set<number>();

  for (const input of event.slots) {
    const time = Date.parse(input.startsAt);
    if (seen.has(time)) continue;
    seen.add(time);

    if (time <= Date.parse(ctx.now)) {
      skippedPast++;
      continue;
    }
    if (offeredTimes.has(time)) {
      skippedOffered++;
      continue;
    }
    const existing = draftByTime.get(time);
    if (existing) {
      kept.push(existing);
      continue;
    }
    created.push({
      id: ctx.newId(),
      startsAt: input.startsAt,
      durationMin: input.durationMin,
      status: "open",
      offeredAt: null,
      createdAt: ctx.now,
    });
  }

  const keptIds = new Set(kept.map((s) => s.id));
  const decisions: Decision[] = [
    ...drafts
      .filter((s) => !keptIds.has(s.id))
      .map((s): Decision => ({ type: "deleteSlot", slotId: s.id })),
    ...created.map((slot): Decision => ({ type: "writeSlot", slot })),
  ];

  const notes: string[] = [];
  if (skippedPast > 0) notes.push("Preskočio sam termine koji su već prošli.");
  if (skippedOffered > 0) notes.push("Neki od tih termina su već poslani klijentima.");

  const draft = [...kept, ...created].sort(byStart);
  if (draft.length === 0) {
    return [...decisions, text(state.coachPhone, ["Nema novih termina za poslati.", ...notes].join(" "))];
  }

  const body = [
    `Ovo sam razumio:\n${bulletList(draft)}`,
    ...notes,
    "Ako nešto ne štima, samo mi pošalji ispravljenu poruku.",
  ].join("\n\n");

  return [
    ...decisions,
    {
      type: "sendMessage",
      to: state.coachPhone,
      message: { kind: "choices", body, choices: [{ id: replyId.sendOffer(), title: "Pošalji ponudu" }] },
    },
  ];
}

/** Coach tapped "Pošalji ponudu": drafts become offered, every client gets a personal offer. */
export function coachSendsOffer(state: State, event: { from: string }, ctx: Context): Decision[] {
  if (!isCoach(state, event.from)) return [];

  const drafts = state.slots.filter(isDraft);
  if (drafts.length === 0) {
    // Second tap on the same button, or nothing drafted: never double-send.
    return [text(state.coachPhone, "Nema novih termina za poslati, ponuda je već poslana.")];
  }

  const offered = drafts.map((s): Slot => ({ ...s, offeredAt: ctx.now }));
  const after: State = {
    ...state,
    slots: state.slots.map((s) => offered.find((o) => o.id === s.id) ?? s),
  };
  const slots = pickableSlots(after, ctx.now);
  const writes = offered.map((slot): Decision => ({ type: "writeSlot", slot }));

  if (state.clients.length === 0) {
    return [...writes, text(state.coachPhone, "Termini su spremljeni, ali još nemaš nijednog klijenta.")];
  }

  const offers = state.clients.map(
    (client): Decision => ({
      type: "sendMessage",
      to: client.phone,
      message: slotChoices(
        `Bok ${client.name}! Ja sam automatski asistent tvog trenera za dogovor termina.\n\n` +
          `Slobodni termini:\n${bulletList(slots)}\n\nKoji ti odgovara?`,
        slots,
      ),
    }),
  );

  return [
    ...writes,
    ...offers,
    text(state.coachPhone, `Ponuda poslana klijentima (${state.clients.length}). Javim ti kad netko odabere termin.`),
  ];
}
