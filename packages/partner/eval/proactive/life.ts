// D281 (research/91): scripted days of a life, through the whole proactive engine (fake clock, a
// quiet fake inbox, the real Log, settings, decisions and push), scoring what Ducter says by itself
// against what a thoughtful partner would have said: recall (it said what mattered, by when),
// precision (nothing else), timing (inside the window) and wording (the person's language, one or
// two short sentences, their own words in it). No model, no network.
//   bun packages/partner/eval/proactive/life.ts [--json]
// The account-side finds (mail, calendar, Slack) are scored by day.ts and run.ts beside this one.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies, ProactiveMode } from "../../../protocol/src/index.ts";
import { quietDay } from "../../../core/test/fixtures/inbox.ts";
import { rig, type Rig } from "../../../core/test/proactive-rig.ts";

const MIN = 60_000;
const HOUR = 60 * MIN;
const at = (s: string) => Date.parse(`${s}+08:00`); // Asia/Shanghai, the rig's zone

type Step =
  | { t: string; user: string; forwarded?: boolean }
  | { t: string; partner: string }
  | { t: string; wait: { at: string; reason: string } }
  | { t: string; decision: string }
  | { t: string; down: string }; // the home is off (or asleep) until then

interface Want {
  /** Words the line must hold. */
  has: string;
  /** Said no earlier than, and no later than. */
  from: string;
  by: string;
  /** Said in the morning note's opening line, not as a find. */
  opening?: boolean;
}

interface Day {
  name: string;
  why: string;
  mode?: ProactiveMode;
  language?: "zh" | "en";
  start: string;
  end: string;
  steps: Step[];
  want: Want[];
}

const DAYS: Day[] = [
  {
    name: "asked-no-wait",
    why: "提醒我 with a time; the partner said 好 and armed nothing",
    start: "2026-11-16T09:00:00",
    end: "2026-11-16T22:00:00",
    steps: [{ t: "2026-11-16T10:12:00", user: "下午 3 点提醒我给房东转账" }, { t: "2026-11-16T10:12:30", partner: "好。" }],
    want: [{ has: "给房东转账", from: "2026-11-16T14:59:00", by: "2026-11-16T15:06:00" }],
  },
  {
    name: "asked-with-wait",
    why: "the partner armed wait_until: its own reminder speaks, Ducter must not say it twice",
    start: "2026-11-16T09:00:00",
    end: "2026-11-16T22:00:00",
    steps: [
      { t: "2026-11-16T10:12:00", user: "下午 3 点提醒我给房东转账" },
      { t: "2026-11-16T10:12:20", wait: { at: "2026-11-16T15:00:00", reason: "提醒你给房东转账" } },
      { t: "2026-11-16T10:12:30", partner: "好，3 点提醒你。" },
    ],
    want: [],
  },
  {
    name: "partner-promise",
    why: "an undated ask; the partner promised a time and armed nothing",
    start: "2026-11-16T09:00:00",
    end: "2026-11-17T12:00:00",
    steps: [{ t: "2026-11-16T21:30:00", user: "提醒我续一下护照" }, { t: "2026-11-16T21:30:20", partner: "好，明天早上 9 点提醒你续护照。" }],
    want: [{ has: "护照", from: "2026-11-17T08:59:00", by: "2026-11-17T09:06:00" }],
  },
  {
    name: "said-for-tomorrow",
    why: "something they said they'd do tomorrow: the morning note",
    start: "2026-11-16T09:00:00",
    end: "2026-11-17T12:00:00",
    steps: [{ t: "2026-11-16T18:40:00", user: "我明天要给张三回那封合同的邮件，今天太累了" }],
    want: [{ has: "张三", from: "2026-11-17T07:59:00", by: "2026-11-17T08:31:00" }],
  },
  {
    name: "en-weekday",
    why: "English, a weekday two days on",
    language: "en",
    start: "2026-11-16T09:00:00",
    end: "2026-11-18T12:00:00",
    steps: [{ t: "2026-11-16T11:00:00", user: "I need to renew the passport on Wednesday" }, { t: "2026-11-16T11:00:20", partner: "Noted." }],
    want: [{ has: "renew the passport", from: "2026-11-18T07:59:00", by: "2026-11-18T08:31:00" }],
  },
  {
    name: "casual",
    why: "casual and recurring lines: nothing to keep (precision)",
    start: "2026-11-16T09:00:00",
    end: "2026-11-18T12:00:00",
    steps: [
      { t: "2026-11-16T10:00:00", user: "我回头看看" },
      { t: "2026-11-16T10:01:00", user: "明天看看合同吧" },
      { t: "2026-11-16T10:02:00", user: "每周一早上提醒我写周报" },
      { t: "2026-11-16T10:02:20", partner: "好，我做成一个例行，你点好就开始。" },
      { t: "2026-11-16T10:03:00", user: "提醒我一下上次那个是什么来着" },
      { t: "2026-11-16T10:04:00", user: "I'll take a look later" },
    ],
    want: [],
  },
  {
    name: "forwarded",
    why: "a forwarded message holds someone else's words",
    start: "2026-11-16T09:00:00",
    end: "2026-11-17T12:00:00",
    steps: [{ t: "2026-11-16T10:00:00", user: "明天提醒我开会", forwarded: true }],
    want: [],
  },
  {
    name: "asleep-at-eight",
    why: "the Mac slept through 08:00 and woke at 09:40: the morning still comes, once",
    start: "2026-11-16T07:00:00",
    end: "2026-11-17T12:00:00",
    steps: [{ t: "2026-11-16T19:00:00", user: "我明天要去银行办卡" }, { t: "2026-11-17T07:30:00", down: "2026-11-17T09:40:00" }],
    want: [{ has: "银行", from: "2026-11-17T09:39:00", by: "2026-11-17T09:51:00" }],
  },
  {
    name: "today-line",
    why: "no account news; a reminder set for today and a card waiting since yesterday",
    start: "2026-11-16T09:00:00",
    end: "2026-11-17T12:00:00",
    steps: [
      { t: "2026-11-16T16:00:00", decision: "合并 PR #88？" },
      { t: "2026-11-16T20:00:00", wait: { at: "2026-11-17T15:00:00", reason: "提醒你交水电费" } },
    ],
    want: [
      { has: "15:00", from: "2026-11-17T07:59:00", by: "2026-11-17T08:31:00", opening: true },
      { has: "等你定", from: "2026-11-17T07:59:00", by: "2026-11-17T08:31:00", opening: true },
    ],
  },
  {
    name: "off-still-asked",
    why: "不用主动找我: an ask is still theirs; what they'd do is not said",
    mode: "off",
    start: "2026-11-16T09:00:00",
    end: "2026-11-17T12:00:00",
    steps: [{ t: "2026-11-16T10:00:00", user: "我明天要交房租" }, { t: "2026-11-16T10:01:00", user: "明天提醒我取快递" }],
    want: [{ has: "取快递", from: "2026-11-17T07:59:00", by: "2026-11-17T08:31:00" }],
  },
  {
    name: "quiet-days",
    why: "nothing happens: nothing is said (D173)",
    start: "2026-11-16T09:00:00",
    end: "2026-11-18T12:00:00",
    steps: [{ t: "2026-11-16T10:00:00", user: "今天天气不错" }, { t: "2026-11-16T10:00:20", partner: "是啊，适合出去走走。" }],
    want: [],
  },
];

interface Said {
  at: number;
  text: string;
  opening: boolean;
}

async function runDay(d: Day): Promise<{ said: Said[]; hits: boolean[]; late: number; wordingOk: number; wordingN: number }> {
  const dir = mkdtempSync(join(tmpdir(), "ducter-life-"));
  let r: Rig | undefined;
  try {
    const open = (t: number) => rig({ mode: d.mode ?? "three", fx: quietDay(), start: t, dir, ...(d.language ? { language: d.language } : {}) });
    // A home that has had mornings before (yesterday's ran).
    r = open(at(d.start));
    const steps = [...d.steps].sort((a, b) => at(a.t) - at(b.t));
    const end = at(d.end);
    const said: Said[] = [];
    const seen = new Set<number>();
    const collect = (x: Rig) => {
      for (const e of x.notes()) {
        if (seen.has(e.seq)) continue;
        seen.add(e.seq);
        const b = e.body as Bodies["finds"];
        if (b.quiet || b.ask) continue;
        const fresh = b.revises ? (b.added ? b.finds.slice(-b.added) : []) : b.finds;
        const t = Date.parse(e.ts);
        const line = b.opening.replace(/^(早。|Morning\.)\s*/, "");
        if (line && !b.revises) said.push({ at: t, text: line, opening: true });
        for (const f of fresh) said.push({ at: t, text: f.text, opening: false });
      }
    };
    while (r.clock.now() < end) {
      const s = steps[0];
      if (s && at(s.t) <= r.clock.now()) {
        steps.shift();
        if ("user" in s) r.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: s.user, ...(s.forwarded ? { forwarded: { from: "Leo" } } : {}) } });
        else if ("partner" in s) r.log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: s.partner } });
        else if ("wait" in s) r.log.append({ stream: "channel", origin: "partner", kind: "waiter", body: { waiterId: `w_${at(s.t)}`, at: new Date(at(s.wait.at)).toISOString(), reason: s.wait.reason, state: "armed" } });
        else if ("decision" in s) r.log.append({ stream: "channel", origin: "system", kind: "decision", body: { decisionId: `d_${at(s.t)}`, question: s.decision, goLabel: "好", defaultOption: "hold", reversible: false } as Bodies["decision"] });
        else if ("down" in s) {
          collect(r);
          r.stop();
          r = open(at(s.down));
          for (const e of r.notes()) seen.add(e.seq);
        }
        continue;
      }
      const next = Math.min(s ? at(s.t) : end, end) - r.clock.now();
      await r.advance(Math.max(MIN, Math.min(next, 10 * MIN)), MIN);
    }
    collect(r);
    const z = (d.language ?? "zh") === "zh";
    const hits = d.want.map((w) => said.some((x) => x.text.includes(w.has) && x.at >= at(w.from) && x.at <= at(w.by) && (w.opening ?? false) === x.opening));
    const late = d.want.filter((w, i) => !hits[i] && said.some((x) => x.text.includes(w.has))).length;
    // Wording: the person's language, at most two sentences, zh ≤ 60 characters (en ≤ 160).
    const ok = (x: Said) => (z ? /[一-鿿]/.test(x.text) : !/[一-鿿]/.test(x.text.replace(/「.*?」|".*?"/g, ""))) && x.text.split(/[。.!?！？]\s*/).filter(Boolean).length <= 2 + (x.opening ? 1 : 0) && x.text.length <= (z ? 60 : 160);
    return { said, hits, late, wordingOk: said.filter(ok).length, wordingN: said.length };
  } finally {
    r?.stop();
    rmSync(dir, { recursive: true, force: true });
  }
}

const json = process.argv.includes("--json");
let want = 0;
let hit = 0;
let saidN = 0;
let good = 0;
let late = 0;
let wOk = 0;
let wN = 0;
const rows = [];
for (const d of DAYS) {
  const r = await runDay(d);
  want += d.want.length;
  hit += r.hits.filter(Boolean).length;
  saidN += r.said.length;
  late += r.late;
  // A said line is good when it is one of the wanted ones (in its window).
  const goodHere = r.said.filter((x) => d.want.some((w) => x.text.includes(w.has) && x.at >= at(w.from) && x.at <= at(w.by))).length;
  good += goodHere;
  wOk += r.wordingOk;
  wN += r.wordingN;
  rows.push({ name: d.name, want: d.want.length, hit: r.hits.filter(Boolean).length, said: r.said.length, good: goodHere });
  if (!json) {
    const okDay = r.hits.every(Boolean) && goodHere === r.said.length;
    console.log(`${okDay ? "ok  " : "FAIL"} ${d.name}: ${d.why}`);
    for (const x of r.said) console.log(`       ${new Date(x.at).toISOString().slice(5, 16)}Z ${x.opening ? "line" : "find"} ${x.text}`);
    d.want.forEach((w, i) => !r.hits[i] && console.log(`       missed "${w.has}" between ${w.from.slice(5, 16)} and ${w.by.slice(11, 16)}`));
  }
}
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 100);
const score = { recall: `${hit}/${want} (${pct(hit, want)}%)`, precision: `${good}/${saidN} (${pct(good, saidN)}%)`, late, wording: `${wOk}/${wN}`, rows };
if (json) console.log(JSON.stringify(score, null, 2));
else console.log(`\nrecall ${score.recall} · precision ${score.precision} · said late ${late} · wording ${score.wording}`);
process.exit(0);
