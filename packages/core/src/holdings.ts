// D633: one settle path for anything Ducter holds about an outside thing. The holders are a
// task, a hand-off, a Keep's held item (a helper's, a loop's, a routine's watch) and a wait; the
// thing is a PR or an issue (a ref the reader below can read the true state of). When it merges,
// closes or is let go, every holder settles from that state: the task is done (its loop ended by
// the condition), the hand-off settles, the item leaves its Keep, the waits stop. Nothing here is
// named after one kind of helper: hel's helper is one holder among others.
//
// The reader is the same read-only `gh api …` the owned look uses: on start, then hourly, grouped by
// repository, plus every fact Ducter already knows (owned_news, a new hand-off). The person hears
// about closures once, as one quiet line in the partner's voice, only when a holder actually changed.
import type { Bodies, CheckSpec, LogEvent } from "@ducter/protocol";
import type { LogStore } from "@ducter/protocol/src/internal.ts";
import type { CheckResult } from "@ducter/protocol/src/checks-run.ts";
import { detect, fill, words, type LangTag } from "@ducter/protocol/src/lang.ts";
import { prsCarried } from "@ducter/protocol/src/pr-state.ts";
import { realClock, type Clock } from "./clock.ts";
import type { CoreRegistry } from "./registry.ts";
import type { Handoffs } from "./handoffs.ts";
import type { Waiters } from "./waiters.ts";
import { kindOf } from "./waiters.ts";
import type { Loops } from "./loops.ts";

/** D633: how often outside things are read when no owned look covers them. */
export const HOLDINGS_EVERY_MS = 60 * 60_000;
/** A ref this reader can read: owner/repo#123 (the hand-off item's normalized shape). */
const REF = /^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)#(\d+)$/;

type Check = (spec: CheckSpec, w: { taskId?: string }) => Promise<CheckResult>;
type Kind = "pr" | "issue";
export type State = "open" | "merged" | "closed";
interface Ref {
  ref: string;
  kind: Kind;
  /** research/244 rule 4: the thing's own title when Ducter holds one (a hand-off's item, a PR's
   *  standing, the task it belongs to), so the line names it in words, never only by its number. */
  title?: string;
}
interface Holders {
  r: Ref;
  tasks: Set<string>;
  handoffs: Set<string>;
  waits: Set<string>;
}

export interface Holdings {
  /** One read and one settle pass now (start, tests, the hourly timer). */
  sweep(): Promise<void>;
  /** The start's own pass (the repair waits for it). */
  started: Promise<void>;
  /** D628: the line a task hears when it wakes after a hand-off's ref ended. */
  noteFor(taskId: string, lang: LangTag): string | undefined;
  /** The PR's true state from the same read-only reader this pass uses (a review's "fixed" comment). */
  readPr(ref: string): Promise<State | undefined>;
  stop(): void;
}

const NOTE = {
  zh: {
    merged: "「{item}」已经合并了，交给「{helper}」的事也用不着了：用 report_to_main 报 done，不要再等它接手。",
    closed: "「{item}」关掉了，交给「{helper}」的事也用不着了：用 report_to_main 报 done，不要再等它接手。",
  },
  en: {
    merged: "{item} has merged, so there is nothing left for {helper} to take: report done with report_to_main, and never wait for an acknowledgement.",
    closed: "{item} is closed, so there is nothing left for {helper} to take: report done with report_to_main, and never wait for an acknowledgement.",
  },
} as const;

/** The one line a holder records, in the person's language. */
const LINE = {
  zh: { pr: "#{n} 已合并，这件结束。", issue: "#{n} 已关闭，这件结束。" },
  en: { pr: "#{n} merged; this is done.", issue: "#{n} closed; this is done." },
} as const;

/** The one quiet line the person hears when things that were held closed together. */
const SUMMARY = {
  zh: {
    // research/244 rule 4: each one by its title (from settled.names), never "4 个 PR".
    // Rule: one verb per kind, once: 「A」「B」「C」都合并了，相关的事都收了尾。
    many: "{parts}，相关的事都收了尾。",
    onePr: "{name}合并了，这件结束。",
    oneIssue: "{name}关闭了，这件结束。",
    prMerged: "{names}都合并了",
    issueClosed: "{names}都关闭了",
    prMergedOne: "{names}合并了",
    issueClosedOne: "{names}关闭了",
    // how titles and refs are listed: 「A」「B」 side by side; bare refs part with 、
    title: "「{t}」",
    sep: "",
    sepBare: "、",
    lastSep: "",
    lastSepBare: "、",
    partsSep: "，",
  },
  en: {
    many: "{parts}; everything around them is wrapped up.",
    onePr: "{name} merged; this is done.",
    oneIssue: "{name} closed; this is done.",
    prMerged: "{names} merged",
    issueClosed: "{names} closed",
    prMergedOne: "{names} merged",
    issueClosedOne: "{names} closed",
    title: "“{t}”",
    sep: ", ",
    sepBare: ", ",
    lastSep: " and ",
    lastSepBare: " and ",
    partsSep: "; ",
  },
} as const;

const num = (ref: string) => ref.split("#")[1] ?? ref;

/** Every ref a check reads (the structured command, never the words around it). */
export function refsInCheck(check: CheckSpec | undefined): Ref[] {
  if (!check?.argv?.length) return [];
  const s = check.argv.join(" ");
  const out: Ref[] = [];
  const add = (repo: string, n: string, kind: Kind) => out.push({ ref: `${repo}#${n}`.toLowerCase(), kind });
  for (const m of s.matchAll(/repos\/([\w.-]+)\/([\w.-]+)\/(pulls|issues)\/(\d+)/g)) add(`${m[1]}/${m[2]}`, m[4]!, m[3] === "pulls" ? "pr" : "issue");
  for (const m of s.matchAll(/github\.com\/([\w.-]+)\/([\w.-]+)\/(pull|issues)\/(\d+)/g)) add(`${m[1]}/${m[2]}`, m[4]!, m[3] === "pull" ? "pr" : "issue");
  const view = /gh\s+(pr|issue)\s+view\s+(?:https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/(?:pull|issues)\/)?(\d+)(?:.*?(?:--repo|-R)\s+([\w.-]+\/[\w.-]+))?/i.exec(s);
  if (view) {
    const repo = view[5] ?? (view[2] && view[3] ? `${view[2]}/${view[3]}` : "");
    if (repo) add(repo, view[4]!, view[1]!.toLowerCase() === "pr" ? "pr" : "issue");
  }
  const seen = new Set<string>();
  return out.filter((r) => (seen.has(`${r.kind}:${r.ref}`) ? false : (seen.add(`${r.kind}:${r.ref}`), true)));
}

/** A ref written in a report's evidence (a URL or owner/repo#n), if it is one. */
function refsInEvidence(value: string): Ref[] {
  const s = String(value ?? "");
  const out: Ref[] = [];
  for (const m of s.matchAll(/github\.com\/([\w.-]+)\/([\w.-]+)\/(pull|issues)\/(\d+)/gi)) out.push({ ref: `${m[1]}/${m[2]}#${m[4]}`.toLowerCase(), kind: m[3]!.toLowerCase() === "pull" ? "pr" : "issue" });
  const short = /([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)#(\d+)/.exec(s);
  if (short) out.push({ ref: `${short[1]}#${short[2]}`.toLowerCase(), kind: "pr" });
  return out;
}

export function createHoldings(o: {
  log: LogStore;
  tasks: CoreRegistry;
  handoffs: Pick<Handoffs, "all" | "open" | "observeGithub">;
  waiters: Waiters;
  loops?: Loops;
  /** D650: a Keep whose end is this ref ends at once, from the fact Ducter already read. */
  keeps?: () => { endByLook(ref: string, state: "merged" | "closed"): number } | undefined;
  /** One read-only look where a task works (work.look); no task: this home. */
  look: (spec: CheckSpec, taskId: string) => Promise<CheckResult>;
  clock?: Clock;
  /** 0 or undefined: no start read and no timer (tests call sweep themselves). */
  everyMs?: number;
  /** The person's language, for the one summary line. */
  lang?: () => LangTag;
  onChange?: () => void;
}): Holdings {
  const clock = o.clock ?? realClock;
  let stopped = false;
  let timer: unknown;
  let running: Promise<void> | undefined;
  const known = new Map<string, State>();
  const summarized = new Set<string>();
  const pending = new Set<string>();
  const pendingTitle = new Map<string, string>(); // research/244 rule 4: each ended ref's own title
  const busy = new Set<string>();
  let sweeping = false;
  const key = (r: Ref) => `${r.kind}:${r.ref}`;

  // What Ducter already knows from the Log: a PR's state from its own looks, so a restart or a
  // hand-off given after the merge settles without another read.
  for (const e of o.log.read({ fromSeq: 0, limit: Number.MAX_SAFE_INTEGER, kinds: ["owned_news"] })) {
    const b = e.body as Bodies["owned_news"];
    if (!b?.pr || !b.seen?.state || b.seen.state === "not_ours") continue;
    known.set(b.pr.toLowerCase(), b.seen.state);
  }

  const langOf = (titles: (string | undefined)[]): LangTag => (detect(titles.filter(Boolean).join(" "))?.lang ?? "en") as LangTag;
  const REF_ONLY = /^(?:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)?#?\d+$/;
  /** A title that says something in words, never the ref itself or a bare number. */
  const usefulTitle = (ref: string, title?: string): boolean => {
    const t = String(title ?? "").trim();
    return !!t && t.toLowerCase() !== ref.toLowerCase() && !REF_ONLY.test(t) && !/^https?:\/\//i.test(t);
  };

  /** Every holder of every outside ref, from tasks, hand-offs and armed waits. */
  const collect = (): Map<string, Holders> => {
    const out = new Map<string, Holders>();
    const add = (r: Ref, holder: { task?: string; handoff?: string; wait?: string }) => {
      if (!REF.test(r.ref)) return;
      const k = key(r);
      const w = out.get(k) ?? { r: { ref: r.ref, kind: r.kind }, tasks: new Set<string>(), handoffs: new Set<string>(), waits: new Set<string>() };
      // The first real title wins (a hand-off's own item names it best); a task's is a fallback.
      // A "title" that is only the ref or a number names nothing in words: ignore it.
      if (!w.r.title && usefulTitle(r.ref, r.title)) w.r.title = r.title!;
      if (holder.task) w.tasks.add(holder.task);
      if (holder.handoff) w.handoffs.add(holder.handoff);
      if (holder.wait) w.waits.add(holder.wait);
      out.set(k, w);
    };
    for (const h of o.handoffs.open()) {
      if (h.item.kind !== "pr" && h.item.kind !== "issue") continue;
      // The hand-off's own item, else the task it came from, names it in words (research/244 rule 4).
      const own = usefulTitle(h.item.ref, h.item.title);
      const task = h.from.task ? o.tasks.get(h.from.task)?.title : undefined;
      const title = own ? h.item.title : usefulTitle(h.item.ref, task) ? task : undefined;
      add({ ref: h.item.ref.toLowerCase(), kind: h.item.kind, ...(title ? { title } : {}) }, { handoff: h.handoffId, ...(h.from.task ? { task: h.from.task } : {}) });
    }
    const waits = o.waiters.views().filter((w) => w.state === "armed");
    for (const w of waits) {
      const wt = w.taskId ? o.tasks.get(w.taskId)?.title : undefined;
      for (const r of refsInCheck(w.check)) add({ ...r, ...(wt ? { title: wt } : {}) }, { ...(w.taskId ? { task: w.taskId } : {}), wait: w.waiterId });
      for (const r of refsInCheck(w.watch as CheckSpec | undefined)) add({ ...r, ...(wt ? { title: wt } : {}) }, { ...(w.taskId ? { task: w.taskId } : {}), wait: w.waiterId });
      // A full owner/repo#n in a timer's words is a ref Ducter holds, even with no check to read it.
      const full = /([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)#(\d+)/.exec(String(w.reason ?? ""));
      if (full && ![...out.values()].some((v) => v.r.ref === full[0].toLowerCase())) add({ ref: full[0].toLowerCase(), kind: "pr" }, { ...(w.taskId ? { task: w.taskId } : {}), wait: w.waiterId });
    }
    for (const c of o.tasks.list()) {
      // A finished task holds nothing open; done_claimed still carries its PR until it ends.
      if (["dropped", "superseded", "done", "failed"].includes(c.attention)) continue;
      for (const p of c.prs ?? []) add({ ref: p.pr.toLowerCase(), kind: "pr", ...(p.standing?.title ? { title: p.standing.title } : { title: c.title }) }, { task: c.taskId });
      if (c.handoff?.item.kind === "pr" || c.handoff?.item.kind === "issue") add({ ref: c.handoff.item.ref.toLowerCase(), kind: c.handoff.item.kind, ...(c.handoff.item.title ? { title: c.handoff.item.title } : { title: c.title }) }, { task: c.taskId });
      for (const e of c.lastReport?.evidence ?? []) for (const r of refsInEvidence(String(e.ref ?? ""))) add({ ...r, title: c.title }, { task: c.taskId });
    }
    // A wait whose words name a ref already collected (a timer on "#11389"): the ref is the door's,
    // the state still comes from the reader. Only a ref we already hold is matched by its number.
    for (const w of waits) {
      const reason = String(w.reason ?? "");
      if (!reason) continue;
      for (const h of out.values()) {
        const n = num(h.r.ref);
        if (reason.includes(h.r.ref) || new RegExp(`(^|[^0-9])#${n}([^0-9]|$)`).test(reason)) {
          if (w.taskId) h.tasks.add(w.taskId);
          h.waits.add(w.waiterId);
        }
      }
    }
    return out;
  };

  async function read(r: Ref, taskId?: string): Promise<State | undefined> {
    const [repo, n] = r.ref.split("#") as [string, string];
    const argv = r.kind === "pr" ? ["gh", "api", `repos/${repo}/pulls/${n}`, "--jq", "{state: .state, merged: .merged}"] : ["gh", "api", `repos/${repo}/issues/${n}`, "--jq", "{state: .state}"];
    const got = await o.look({ argv, succeedWhen: { exitCode: 0 } }, taskId ?? "").catch(() => undefined);
    if (!got || !got.ok || got.exitCode !== 0) return undefined;
    try {
      const j = JSON.parse(got.output ?? "") as { state?: string; merged?: boolean };
      if (r.kind === "pr") return j.merged ? "merged" : j.state === "closed" ? "closed" : j.state === "open" ? "open" : undefined;
      return j.state === "closed" ? "closed" : j.state === "open" ? "open" : undefined;
    } catch {
      return undefined;
    }
  }

  const lineFor = (r: Ref, lang: LangTag) => fill(words(LINE, lang)[r.kind], { n: num(r.ref) });

  /**
   * D633: THE settle path. A ref ended: every holder of it is settled from the fact. Returns
   * whether anything changed, so the person hears only real news. Idempotent; re-entrant calls from
   * our own writes are dropped by `busy`.
   */
  function settleRef(r: Ref, state: State, holders: Holders): boolean {
    if (stopped || state === "open" || busy.has(key(r))) return false;
    busy.add(key(r));
    let changed = false;
    try {
      // D650: a Keep whose testable end is this ref ends the minute the fact is read.
      if (o.keeps?.()?.endByLook(r.ref, state)) changed = true;
      // The hand-off records: D628's own settle, for every record about this ref.
      for (const h of o.handoffs.open()) {
        // D645 (research/245 §3.7, B7): one record per repo#n, so the ref alone matches it.
        if (h.item.ref.toLowerCase() !== r.ref) continue;
        o.handoffs.observeGithub(r.ref, state, r.kind);
        changed = true;
      }
      // The tasks, and the Keep items and waits that hang off them.
      for (const taskId of holders.tasks) {
        const c = o.tasks.get(taskId);
        if (!c || c.attention === "dropped" || c.attention === "superseded") continue;
        if (r.kind === "pr") {
          const was = c.prs?.find((p) => p.pr === r.ref);
          if (was?.state !== state && !was?.letGo) {
            o.log.append({ persona: c.persona, stream: `task:${taskId}`, origin: "system", kind: "owned_news", body: { taskId, pr: r.ref, news: [], seen: { since: new Date(clock.now()).toISOString(), state } } });
            changed = true;
          }
        }
        const armed = o.waiters.views().filter((w) => w.taskId === taskId && w.state === "armed");
        const about = armed.filter((w) => refsInCheck(w.check).some((x) => x.ref === r.ref) || String(w.reason ?? "").includes(r.ref) || new RegExp(`(^|[^0-9])#${num(r.ref)}([^0-9]|$)`).test(String(w.reason ?? "")));
        const real = armed.filter((w) => !about.includes(w) && kindOf(w) !== "timer");
        const otherOpen = prsCarried(c.prs).filter((p) => p.pr !== r.ref);
        // Its work must be over: no other open PR it carries, and no real wait that is not this ref.
        const inEvidence = (c.lastReport?.evidence ?? []).some((e) => refsInEvidence(String(e.ref ?? "")).some((x) => x.ref === r.ref));
        const itsWork = (c.prs ?? []).some((p) => p.pr === r.ref) || c.handoff?.item.ref.toLowerCase() === r.ref || about.length > 0 || inEvidence;
        if (!itsWork || otherOpen.length || real.length) {
          for (const w of about) {
            o.waiters.cancel(w.waiterId, { by: "system" });
            changed = true;
          }
          continue;
        }
        for (const w of armed) {
          o.waiters.cancel(w.waiterId, { by: "system" });
          changed = true;
        }
        const loop = o.loops?.get(taskId);
        if (loop && loop.state === "on") {
          o.loops!.end(taskId, "condition");
          changed = true;
        }
        let taskChanged: boolean = changed;
        if (c.attention !== "done") {
          o.tasks.setState(taskId, "done", c.residency);
          changed = taskChanged = true;
        }
        if (taskChanged) {
          const lang = langOf([c.title]);
          const text = lineFor(r, lang);
          o.log.append({ persona: c.persona, stream: `task:${taskId}`, origin: "system", kind: "task_event", body: { taskId, role: "system", from: "ducter", text, raw: { settled: { ref: r.ref, state, text } } } });
        }
      }
      // A wait with no task (the partner's own): it stops too.
      for (const waiterId of holders.waits) {
        const w = o.waiters.views().find((v) => v.waiterId === waiterId);
        if (!w || w.state !== "armed" || w.taskId) continue;
        o.waiters.cancel(waiterId, { by: "system" });
        changed = true;
      }
      if (changed) o.onChange?.();
    } finally {
      busy.delete(key(r));
    }
    return changed;
  }

  /** One line, once, for what just closed. Nothing when nothing closed. */
  function flushSummary() {
    if (stopped || sweeping || !pending.size) return;
    const refs = [...pending].filter((k) => !summarized.has(k));
    pending.clear();
    if (!refs.length) return;
    const prs = refs.filter((k) => k.startsWith("pr:"));
    const issues = refs.filter((k) => k.startsWith("issue:"));
    const lang = o.lang?.() ?? langOf([...o.tasks.list()].slice(0, 8).map((c) => c.title));
    const w = words(SUMMARY, lang);
    const named = refs.map((k) => {
      const kind = k.startsWith("pr:") ? "pr" : "issue";
      const ref = k.slice(k.indexOf(":") + 1);
      return { kind, ref, ...(pendingTitle.get(k) ? { title: pendingTitle.get(k)! } : {}) };
    });
    // research/244 rule 4: its subject in words. A title when Ducter holds one (the hand-off's
    // item, the PR's standing, the task), else its full ref; never only "#n".
    const one = (n: (typeof named)[number]) =>
      n.title ? fill(w.title, { t: n.title }) : n.ref;
    // The verb once, for the kind: 「A」「B」「C」都合并了, not 「A」已合并、「B」已合并…
    const list = (xs: (typeof named)[number][]) => {
      const q = xs.map(one);
      if (q.length <= 1) return q[0] ?? "";
      const titled = xs.every((x) => x.title);
      return q.slice(0, -1).join(titled ? w.sep : w.sepBare) + (titled ? w.lastSep : w.lastSepBare) + q.at(-1);
    };
    const parts: string[] = [];
    const merged = named.filter((n) => n.kind === "pr");
    const closed = named.filter((n) => n.kind === "issue");
    // 都 only over two or more: one merged PR beside closed issues is 「A」合并了.
    if (merged.length) parts.push(fill(merged.length > 1 ? w.prMerged : w.prMergedOne, { names: list(merged) }));
    if (closed.length) parts.push(fill(closed.length > 1 ? w.issueClosed : w.issueClosedOne, { names: list(closed) }));
    const text =
      named.length === 1
        ? fill(named[0]!.kind === "pr" ? w.onePr : w.oneIssue, { name: one(named[0]!) })
        : fill(w.many, { parts: parts.join(w.partsSep) });
    for (const k of refs) summarized.add(k);
    o.log.append({
      stream: "channel",
      origin: "partner",
      kind: "ai_msg",
      body: {
        text,
        settled: {
          prs: prs.length,
          issues: issues.length,
          refs: named.map((n) => n.ref),
          names: named.map((n) => ({ ref: n.ref, ...(n.title ? { title: n.title } : {}) })),
        },
      },
    });
  }

  async function sweepOnce() {
    sweeping = true;
    try {
      await sweepRefs();
    } finally {
      sweeping = false;
      flushSummary();
    }
  }

  async function sweepRefs() {
    const all = collect();
    // D633: read only what is not already known ended (a merged PR stays merged).
    for (const [k, h] of all) {
      if (stopped) return;
      const knownState = known.get(h.r.ref);
      let state: State | undefined = knownState;
      if (state === undefined || state === "open") {
        const task = [...h.tasks][0];
        state = await read(h.r, task);
        if (state) known.set(h.r.ref, state);
      }
      if (!state || state === "open" || stopped) continue;
      const changed = settleRef(h.r, state, h);
      if (changed && !summarized.has(k)) {
        pending.add(k);
        if (h.r.title) pendingTitle.set(k, h.r.title);
      }
    }
  }

  function sweep(): Promise<void> {
    if (running) return running.then(() => (stopped ? undefined : sweep()));
    running = sweepOnce().finally(() => (running = undefined));
    return running;
  }

  // D628's immediate path: a fact Ducter already knows (its own owned look, a new hand-off) settles
  // without waiting for the hourly read. The summary is batched to the next microtask.
  const onEvent = (e: LogEvent) => {
    if (stopped) return;
    if (e.kind === "owned_news") {
      const b = e.body as Bodies["owned_news"];
      if (!b?.pr || !b.seen?.state || b.seen.state === "not_ours") return;
      known.set(b.pr.toLowerCase(), b.seen.state);
      if (b.seen.state === "open") return;
      const h = collect().get(`pr:${b.pr.toLowerCase()}`);
      if (h && settleRef(h.r, b.seen.state, h)) {
        const k = `pr:${b.pr.toLowerCase()}`;
        pending.add(k);
        if (h.r.title) pendingTitle.set(k, h.r.title);
      }
      queueMicrotask(flushSummary);
      return;
    }
    if (e.kind !== "handoff") return;
    const b = e.body as import("@ducter/protocol/src/handoff.ts").HandoffBody;
    if (!b?.item || (b.item.kind !== "pr" && b.item.kind !== "issue")) return;
    const state = known.get(b.item.ref.toLowerCase());
    if (state !== "closed" && state !== "merged") return;
    const h = collect().get(`${b.item.kind}:${b.item.ref.toLowerCase()}`);
    if (h && settleRef(h.r, state, h)) {
      const k = `${b.item.kind}:${b.item.ref.toLowerCase()}`;
      pending.add(k);
      if (h.r.title) pendingTitle.set(k, h.r.title);
    }
    queueMicrotask(flushSummary);
  };
  const unsubscribe = o.log.subscribe(onEvent);

  const every = o.everyMs ?? 0;
  const started = every > 0 ? sweep().catch((err) => console.warn(`[holdings] the start read failed: ${(err as Error).message}`)) : Promise.resolve();
  if (every > 0) {
    const tick = () => {
      if (stopped) return;
      void sweep()
        .catch((err) => console.warn(`[holdings] the read failed: ${(err as Error).message}`))
        .finally(() => {
          if (!stopped) timer = clock.setTimeout(tick, every);
        });
    };
    timer = clock.setTimeout(tick, every);
  }

  return {
    sweep,
    started,
    noteFor(taskId, lang) {
      const h = [...o.handoffs.all()].reverse().find((x) => x.from.task === taskId && x.state === "settled" && x.settledBy);
      if (!h) return undefined;
      const w = words(NOTE, lang);
      return (h.settledBy === "merged" ? w.merged : w.closed).replaceAll("{item}", h.item.title?.trim() || h.item.ref).replaceAll("{helper}", h.to.name);
    },
    readPr(ref) {
      const m = REF.exec(ref.trim().toLowerCase());
      return m ? read({ ref: m[0], kind: "pr" }) : Promise.resolve(undefined);
    },
    stop() {
      stopped = true;
      unsubscribe();
      if (timer !== undefined) clock.clearTimeout(timer);
    },
  };
}
