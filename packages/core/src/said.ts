// D379: who does which kind of work, said by the person and never saved as a rule ("订酒店这类别用
// Claude Code", answered 「好」 and nothing kept). Ducter reads it by code from their own words in
// the conversation (the whole Log, not only the window) and from the memories the partner's recall
// returned, and when it changes who does a task, the task goes by it and the partner asks once to
// keep it as a rule (记成规则 / Keep as a rule; 只这次 / Just this once, the default hold).
//
// D401: what the person says in the conversation is their rule at once. The moment their message
// lands (before the partner's turn, so the task it opens in the same turn already goes by it), an
// explicit saying is kept as a rule in their words, and the Partner page lists it; no card asks to
// keep it. A saying in the Log from before this (never kept) is kept the same way when Ducter
// starts. Only what memory recalled (said to another tool, or a note in someone's words) still goes
// by D379: it applies, and a card asks once whether to keep it.
//
// Only an explicit statement counts: an agent named, a directive ("别用", "不要用", "以后都用",
// "never use", "always use"), and a kind of work in the same sentence. A taste ("我挺喜欢 Codex",
// "I like Codex"), a one-off ("这次用 Codex"), a question, or a sentence with no kind of work is
// never read as one: Ducter never invents a rule from a vague memory.
import { existsSync, readFileSync, renameSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import type { Bodies, HarnessId, LogEvent, RuleView, WorkKind } from "@ducter/protocol";
import { isHarnessId, isWorkKind } from "@ducter/protocol";
import type { LogStore } from "@ducter/protocol/src/internal.ts";
import type { RulesStore } from "./rules.ts";

/** One said preference: never (or, said with "always", only) this agent for these kinds of work. */
export interface SaidPref {
  /** "said:<seq>" (a user message in the Log) or "mem:<id>" (a memory the recall returned). */
  key: string;
  harness: HarnessId;
  never: boolean;
  kinds: WorkKind[];
  /** The person's own words, the clause that says it (shown in the ask, kept as the rule's text). */
  quote: string;
  /** ISO time it was said (a memory: the day it was recorded). */
  at: string;
}

const AGENTS: [HarnessId, string][] = [
  ["claude-code", "claude[\\s_-]*code"],
  ["codex", "codex"],
  ["deepseek-harness", "deep\\s*seek"],
  ["pi", "(?<![a-z0-9])pi(?![a-z0-9])"],
];

/** Words that mark a kind of work (a Latin word matches whole words only). */
const KIND_WORDS: [WorkKind, RegExp][] = [
  ["errand", /订(?!阅)|预[订定约]|酒店|民宿|机票|航班|火车票|高铁|车票|门票|餐厅|外卖|快递|购物|买东西|下单|比价|生活|跑腿|出行|旅行|旅游|签证|\b(hotels?|flights?|bookings?|book|travel|trips?|shopping|errands?|tickets?|restaurants?|reservations?)\b/i],
  ["code", /代码|编程|开发|修\s*bug|仓库|重构|前端|后端|\b(code|coding|programming|repos?|refactor\w*|frontend|backend|debug\w*|pull requests?|PRs?)\b/i],
  ["writing", /写作|写东西|写文章|文章|文案|写邮件|稿子|翻译|\b(writing|essays?|articles?|blog posts?|copywriting|drafts?)\b/i],
  ["research", /调研|查资料|研究|搜集资料|\b(research|investigat\w+)\b/i],
];

const AGENT_RE = (a: string) => new RegExp(a, "i");
/** "别用 X", "不要让 X", "never use X", "prefers not to use X", "X 别碰". */
const NEVER_BEFORE = /(别|不要|不用|不许|不准|勿|甭|不能|不再|别再)\s*(再\s*)?(用|让|交给|找|叫|使用|派)\s*$|(不用|不使用)\s*$|\b(don'?t|do not|never|stop|no longer|avoid)\s+(use|using|give|send|hand|let|ask|run|put)\b[^.!?\n]{0,24}$|\b(not to use|not use|avoid using|avoid|doesn'?t want|does not want|didn'?t want)\b[^.!?\n]{0,16}$/i;
const NEVER_AFTER = /^\s*(别|不要|不用|不许)\s*(做|碰|来|干|管|接)/;
/** "以后…都用 X", "always use X", "from now on give X". */
const ALWAYS_BEFORE = /(以后|今后|往后|从今往后|从现在起|每次|一律|一直|总是|默认)[^。！？!?\n]{0,16}(用|交给|让|找|派)\s*$|\b(always|from now on|going forward|in (the )?future|by default|from here on)\b[^.!?\n]{0,40}\b(use|give|send|hand|let|run|put)\b[^.!?\n]{0,16}$/i;
const ALWAYS_AFTER = /^[^.!?\n]{0,40}\b(always|from now on|going forward|by default)\b/i;
/** A one-off, a question, or someone else's words: never a standing preference. */
const ONE_OFF = /这次|这一次|这回|这个任务|这件事|this time|this one|for this task|just once/i;
const QUESTION = /[?？]\s*$|吗[。！!]?\s*$|要不要|是不是|该不该|\b(should (i|we)|shall (i|we)|do you think|would you)\b/i;
const PARTICLES = /[\s哈啊呀吧哦喔啦了嘛呢~～!！。.,，;；:：]+$/;

/** Sentences of a message, each on its own (a kind of work counts only in the same sentence). */
const sentences = (text: string) => text.split(/(?<=[。！？!?;；\n])|(?<=\.)\s+/).map((s) => s.trim()).filter(Boolean);

/** The clause that says it: from the clause with the kind's word to the one naming the agent. */
function quoteOf(sentence: string, at: number, kindAt: number): string {
  const parts = sentence.split(/(?<=[，,、：:])/);
  let pos = 0;
  const spans = parts.map((p) => ((pos += p.length), [pos - p.length, pos] as const));
  const from = spans.findIndex(([a, b]) => Math.min(at, kindAt) >= a && Math.min(at, kindAt) < b);
  const to = spans.findIndex(([a, b]) => Math.max(at, kindAt) >= a && Math.max(at, kindAt) < b);
  const q = sentence.slice(spans[Math.max(0, from)]![0], spans[Math.max(0, to)]![1]).replace(/^[，,、：:\s]+/, "").replace(PARTICLES, "").trim();
  const chars = [...q];
  if (chars.length <= QUOTE_MAX) return q;
  // Clipped at a word, never inside one ("everyday…", not "every…").
  const cut = chars.slice(0, QUOTE_MAX - 1).join("");
  const word = /[a-z0-9]$/i.test(cut) && /[a-z0-9]/i.test(chars[QUOTE_MAX - 1]!) ? cut.replace(/[a-z0-9'’-]+$/i, "") : cut;
  return word.replace(/[\s,，、]+$/, "") + "…";
}
/** The longest quote the card and the task's line carry. */
const QUOTE_MAX = 90;

/** What a piece of the person's words says about who does which work, if anything (explicitly). */
export function readSaid(text: string): Omit<SaidPref, "key" | "at">[] {
  const out: Omit<SaidPref, "key" | "at">[] = [];
  for (const s of sentences(text)) {
    if (QUESTION.test(s) || ONE_OFF.test(s)) continue;
    // The agents' own names said nothing about the work ("Claude Code" is not code).
    const bare = AGENTS.reduce((t, [, pat]) => t.replace(new RegExp(pat, "gi"), (m) => " ".repeat(m.length)), s);
    const kinds = KIND_WORDS.filter(([, re]) => re.test(bare)).map(([k]) => k);
    if (!kinds.length) continue;
    const kindAt = Math.min(...KIND_WORDS.map(([, re]) => bare.search(re)).filter((i) => i >= 0));
    for (const [harness, pat] of AGENTS) {
      const m = AGENT_RE(pat).exec(s);
      if (!m) continue;
      const before = s.slice(0, m.index);
      const after = s.slice(m.index + m[0].length);
      const never = NEVER_BEFORE.test(before) || NEVER_AFTER.test(after);
      const always = !never && (ALWAYS_BEFORE.test(before) || ALWAYS_AFTER.test(after));
      if (!never && !always) continue;
      out.push({ harness, never, kinds, quote: quoteOf(s, m.index, kindAt) });
    }
  }
  return out;
}

/** How many of the person's latest messages are read for what they said (the whole Log, practically). */
const SCAN = 5000;
const MAX_MEMORY = 30;
export const SAID_MEMORY_FILE = "said-memory.json";

const overlap = (a: WorkKind[], b: WorkKind[]) => a.some((k) => b.includes(k));
const sameSaying = (a: { harness: string; never?: boolean; kinds: WorkKind[] }, b: { harness: string; never?: boolean; kinds: WorkKind[] }) =>
  a.harness === b.harness && !!a.never === !!b.never && overlap(a.kinds, b.kinds);

export interface SaidStore {
  /** Everything said (the Log and the memories noted), oldest first. */
  all(): SaidPref[];
  /**
   * The said preferences that decide this work now, as provisional rules (id "said:…"): only for
   * its kind, only when no saved rule as new covers it, never one the person already answered
   * (kept: it is a rule now; 只这次: not again), the newest per agent.
   */
  rulesFor(kind: WorkKind | undefined): RuleView[];
  /** Memories the partner's recall returned: any that says who does which work is kept. */
  fromMemory(hits: { id?: string; title: string; content: string; date?: string }[]): void;
  /** Whether the ask for this saying was made already (answered or not). */
  asked(p: { harness: string; never?: boolean; kinds: WorkKind[] }): boolean;
  /**
   * D401: keep what the person said as their rule (their words, its kinds, never), once per saying:
   * a rule removed on the Partner page never comes back from the same words. The rule, or
   * undefined when it was kept before or couldn't be saved.
   */
  keep(p: SaidPref): RuleView | undefined;
  /** D401: the rules kept from this user message (seq), still on the Partner page. */
  keptFrom(seq: number): RuleView[];
  /**
   * D401: the Log's sayings never kept (said before Ducter kept them at once), oldest first, kept
   * now unless the person answered for them on a card, or a rule they saved since covers them.
   */
  backfill(): RuleView[];
}

export function openSaid(o: { log: LogStore; rules: RulesStore; dataDir: string; now?: () => Date }): SaidStore {
  const rules = o.rules;
  const now = o.now ?? (() => new Date());
  const path = join(o.dataDir, SAID_MEMORY_FILE);
  let memory: SaidPref[] = [];
  /** D401: sayings kept as rules (key → the rule's id), so each is kept once. */
  let kept: Record<string, string> = {};
  if (existsSync(path)) {
    try {
      const raw = JSON.parse(readFileSync(path, "utf8"));
      if (Array.isArray(raw?.said)) memory = raw.said.filter((p: SaidPref) => p && typeof p.key === "string" && isHarnessId(p.harness) && Array.isArray(p.kinds) && p.kinds.every(isWorkKind));
      if (raw?.kept && typeof raw.kept === "object") kept = Object.fromEntries(Object.entries(raw.kept).filter(([k, v]) => typeof k === "string" && typeof v === "string")) as Record<string, string>;
    } catch (err) {
      console.warn(`[said] ${path} is unreadable; starting with none:`, (err as Error).message);
    }
  }
  const saveMemory = () => {
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify({ said: memory, kept }, null, 2) + "\n", { mode: 0o600 });
    chmodSync(tmp, 0o600);
    renameSync(tmp, path);
  };

  const fromLog = (): SaidPref[] =>
    o.log
      .read({ kinds: ["user_msg"], limit: SCAN })
      .filter((e) => e.stream === "channel" || e.stream.startsWith("channel:"))
      .filter((e) => !(e.body as Bodies["user_msg"]).forwarded) // someone else's words, passed on
      .flatMap((e) => readSaid((e.body as Bodies["user_msg"]).text ?? "").map((p, i) => ({ ...p, key: `said:${e.seq}${i ? `.${i}` : ""}`, at: e.ts })));

  /** The asks made, with when, and how each was answered (undefined while it waits). */
  const asks = () => {
    const evs = o.log.read({ kinds: ["decision", "decision_resolved"], limit: SCAN });
    const answered = new Map<string, string>();
    for (const e of evs) if (e.kind === "decision_resolved") answered.set((e.body as Bodies["decision_resolved"]).decisionId, (e.body as Bodies["decision_resolved"]).option);
    return evs
      .filter((e): e is LogEvent<"decision"> => e.kind === "decision" && !!(e.body as Bodies["decision"]).saying)
      .map((e) => ({ ...e.body.saying!, ts: e.ts, option: answered.get(e.body.decisionId) }));
  };

  const all = () => [...memory, ...fromLog()].sort((a, b) => a.at.localeCompare(b.at));

  return {
    all,
    rulesFor(kind) {
      if (!kind) return [];
      const saved = o.rules.list().filter((r) => !r.notice && r.kinds?.includes(kind));
      const made = asks();
      const live = all().filter(
        (p) =>
          p.kinds.includes(kind) &&
          // D401: kept as a rule already (the rule decides, or its removal does).
          !kept[p.key] &&
          // A rule saved since (or at the same time) is the person's newer word.
          !saved.some((r) => r.createdAt >= p.at) &&
          // Answered already (kept as a rule, or 只这次): not again, until they say it anew.
          !made.some((a) => a.option && sameSaying(a, p) && a.ts >= p.at),
      );
      // The newest per agent; then of the agents named to do it ("以后都用 X"), only the newest.
      const byAgent = new Map<string, SaidPref>();
      for (const p of live) byAgent.set(p.harness, p);
      const latest = [...byAgent.values()];
      const only = latest.filter((p) => !p.never).at(-1);
      return latest
        .filter((p) => p.never || p === only)
        .map((p) => ({ id: p.key, text: p.quote, harness: p.harness, match: [], kinds: p.kinds, ...(p.never ? { never: true as const } : {}), createdAt: p.at }));
    },
    fromMemory(hits) {
      let changed = false;
      for (const h of hits) {
        if (!h.id) continue;
        const key = `mem:${h.id}`;
        if (memory.some((p) => p.key === key)) continue;
        const at = h.date && /^\d{4}-\d{2}-\d{2}$/.test(h.date) ? `${h.date}T00:00:00.000Z` : now().toISOString();
        const found = readSaid(`${h.content}`);
        found.forEach((p, i) => memory.push({ ...p, key: `${key}${i ? `.${i}` : ""}`, at }));
        if (found.length) changed = true;
      }
      if (!changed) return;
      memory = memory.slice(-MAX_MEMORY);
      try {
        saveMemory();
      } catch (err) {
        console.warn("[said] couldn't keep what memory said:", (err as Error).message);
      }
    },
    asked: (p) => asks().some((a) => sameSaying(a, p)),
    keep(p) {
      if (kept[p.key]) return;
      try {
        const r = rules.add({ text: p.quote, harness: p.harness, match: [], kinds: p.kinds, ...(p.never ? { never: true } : {}) });
        kept[p.key] = r.id;
        saveMemory();
        return r;
      } catch (err) {
        console.warn("[said] couldn't keep what was said as a rule:", (err as Error).message);
        return;
      }
    },
    keptFrom(seq) {
      const ids = Object.entries(kept)
        .filter(([k]) => k === `said:${seq}` || k.startsWith(`said:${seq}.`))
        .map(([, id]) => id);
      return ids.length ? o.rules.list().filter((r) => ids.includes(r.id)) : [];
    },
    backfill() {
      const saved = o.rules.list().filter((r) => !r.notice);
      const made = asks();
      const out: RuleView[] = [];
      for (const p of fromLog()) {
        if (kept[p.key]) continue;
        // Answered on a D379 card (kept, or 只这次), or a rule they saved since covers its kind.
        if (made.some((a) => a.option && sameSaying(a, p) && a.ts >= p.at)) continue;
        if (saved.some((r) => r.createdAt >= p.at && (r.kinds ?? []).some((k) => p.kinds.includes(k)))) continue;
        const r = this.keep(p);
        if (r) out.push(r);
      }
      return out;
    },
  };
}

/**
 * D401: the person's own words are their rule at once. Each message of theirs in the conversation
 * (not words forwarded from someone else) is read as it lands; an explicit saying is kept before
 * the partner's turn starts, so a task opened in that same turn already goes by it.
 */
export function keepSaidAtOnce(log: LogStore, said: SaidStore): () => void {
  return log.subscribe((e) => {
    if (e.kind !== "user_msg" || e.origin !== "user") return;
    if (!(e.stream === "channel" || e.stream.startsWith("channel:"))) return;
    const b = e.body as Bodies["user_msg"];
    if (b.forwarded) return;
    readSaid(b.text ?? "").forEach((p, i) => said.keep({ ...p, key: `said:${e.seq}${i ? `.${i}` : ""}`, at: e.ts }));
  });
}

/**
 * Go on the ask keeps it: the person's words become a rule (on the Partner page, removable there).
 * 只这次 / Just this once (or no answer) keeps nothing. Ducter's own bookkeeping, no partner turn.
 */
export function keepSaidOnGo(log: LogStore, rules: RulesStore): () => void {
  return log.subscribe((e) => {
    if (e.kind !== "decision_resolved") return;
    const r = e.body as Bodies["decision_resolved"];
    if (r.option !== "go") return;
    const d = log.read({ stream: e.stream, kinds: ["decision"], limit: 2000 }).find((x) => (x.body as Bodies["decision"]).decisionId === r.decisionId)?.body as Bodies["decision"] | undefined;
    const s = d?.saying;
    if (!s || !isHarnessId(s.harness)) return;
    try {
      rules.add({ text: s.quote, harness: s.harness, match: [], kinds: s.kinds, ...(s.never ? { never: true } : {}) });
    } catch (err) {
      console.warn("[said] couldn't keep the rule:", (err as Error).message);
    }
  });
}
