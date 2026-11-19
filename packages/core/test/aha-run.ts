// D388: the aha days run through the whole engine on fakes (shared by proactive-aha.test.ts and
// packages/partner/eval/proactive/aha.ts). No model, no network: the web look is a fake.
import type { ProactiveMode } from "@ducter/protocol";
import type { WebLookPort } from "@ducter/protocol/src/internal.ts";
import { AGIBAR_PAGE, AHA_END, AHA_SAY, AHA_START, ahaDays } from "./fixtures/aha-days.ts";
import { rig } from "./proactive-rig.ts";
import { WAITING_START, waitingMail } from "./fixtures/waiting-days.ts";

export interface AhaSaid {
  at: number;
  rung: string;
  kind: string;
  text: string;
  noteId: string;
  how: { src?: string; url?: string; says?: string; what: string }[];
  unknown?: string;
  /** D403: the reply draft it came with (a waiting-on-you find). */
  draft?: { text: string; lang?: string };
}

/** A fake quick web look: the event page, or nothing settled; every question it was asked is kept. */
export function fakeLook(o: { found?: boolean } = {}): WebLookPort & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    can: () => true,
    async look(q) {
      asked.push(q.question);
      if (o.found === false) return { state: "unsettled", why: "not_found" };
      return { state: "found", answer: "2026-11-21 19:00 开门（doors open at 19:00）；议程没写分享人几点上场。", sources: [AGIBAR_PAGE], confidence: "high" };
    },
  };
}

/** Runs Wed 07:00 to Fri 12:00, mail and the person's words arriving as they did; what was said, when. The caller stops the rig. */
export async function runAha(mode: ProactiveMode, o: { web?: "found" | "none" | "off"; waiting?: boolean; quietStep?: number; rig?:Partial<Parameters<typeof rig>[0]> } = {}) {
  const { fx, later, said } = ahaDays();
  // D403: hel's eleven waiting-for-your-reply mails, rebuilt (fixtures/waiting-days.ts).
  // hel watched all along, so these run from Monday 11-09 with every mail arriving at its own time
  // (a look back at the start reads only the last three days in full).
  let start = AHA_START;
  if (o.waiting) {
    const w = waitingMail();
    fx.mail.push(...w.mail);
    Object.assign(fx.triage, w.triage);
    start = WAITING_START;
    const early = fx.mail.filter((m) => Date.parse(m.date) < start);
    for (const m of fx.mail.filter((x) => Date.parse(x.date) >= start)) later.push({ at: m.date, mail: m, triage: fx.triage[m.id]! });
    fx.mail.splice(0, fx.mail.length, ...early);
  }
  const look = o.web === "off" ? undefined : fakeLook({ found: o.web !== "none" });
  const r = rig({ mode, fx, start, present: true, ...(look ? { webLook: () => look } : {}), ...(o.rig ?? {}) });
  await r.settle();
  const STEP = 10 * 60_000;
  const mail = [...later].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const words = [...said].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  // Before the aha days (only hel's mail arriving) a caller may stride further, but never past
  // a mail's or the person's words' own minute, the evening read, or the aha days' start.
  const nextNoonUtc = (t: number) => {
    const d = new Date(t);
    d.setUTCHours(12, 0, 0, 0);
    return d.getTime() > t ? d.getTime() : d.getTime() + 86_400_000;
  };
  while (r.clock.now() < AHA_END) {
    const now = r.clock.now();
    const step =
      now < AHA_START && o.quietStep
        ? Math.min(o.quietStep, AHA_START - now, nextNoonUtc(now) - now, ...[mail[0]?.at, words[0]?.at].filter((a): a is string => !!a).map((a) => Math.max(STEP, Date.parse(a) - now)))
        : STEP;
    await r.advance(step, step);
    // The person reads their conversation each evening (over eleven days, three unread mornings would pause the note).
    if (o.waiting && new Date(r.clock.now()).getUTCHours() === 12 && new Date(r.clock.now()).getUTCMinutes() < 10) r.log.append({ stream: "channel", origin: "user", kind: "read_receipt", body: { upToSeq: r.log.head() } });
    while (words.length && Date.parse(words[0]!.at) <= r.clock.now()) r.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: words.shift()!.text } });
    while (mail.length && Date.parse(mail[0]!.at) <= r.clock.now()) {
      const l = mail.shift()!;
      fx.mail.push({ ...l.mail, date: new Date(r.clock.now() + 1000).toISOString() });
      fx.triage[l.mail.id] = l.triage;
    }
  }
  const out: AhaSaid[] = [];
  for (const e of r.notes()) {
    const b = e.body;
    const fresh = b.revises ? (b.added ? b.finds.slice(-b.added) : []) : b.finds;
    for (const f of fresh) out.push({ at: Date.parse(e.ts), rung: b.revises ? "fold" : b.rung, kind: f.kind, text: f.text, noteId: b.noteId, how: f.how, ...(f.unknown ? { unknown: f.unknown } : {}), ...((f as { draft?: AhaSaid["draft"] }).draft ? { draft: (f as { draft?: AhaSaid["draft"] }).draft } : {}) });
  }
  return { r, said: out, look };
}

/** The first thing said that matches one expected moment. */
export const hit = (said: AhaSaid[], w: (typeof AHA_SAY)[number]) => said.find((s) => s.kind === w.kind && w.contains.every((c) => s.text.includes(c)));
