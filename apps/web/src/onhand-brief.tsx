// D467 round 2: On hand as a partner that reports. The brief at the head (what changed since you
// looked, what needs you with its real fix inline, what comes back next), work in motion (a task's
// trail of steps on its own time, a group's parts as one track, the waits on one light time axis),
// results as outcomes (the PR it made, as an object), and at a wide window the peek: the focused
// task's live view, the conductor's "sit in". The Mac draws the same (apps/desktop/internal/views).
import { cantFixes, cantLine, doCantFix } from "./cant.tsx";
import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { Bodies, LogEvent } from "@ducter/protocol";
import { sayable } from "@ducter/protocol/src/say.ts";
import { A } from "./app.ts";
import { Btn } from "./controls.tsx";
import { ago, clock } from "./format.ts";
import { attention, cantOf, harnessOf, placeOf, reasonOf, reportOf, title, type Task } from "./store.ts";
import { harnessName } from "./format.ts";
import { computerName, computerOf } from "./where.ts";
import { heldFrame, openPhone } from "./phone-use.tsx";
import { liveSize } from "./live.tsx";
import { sayName, shortTitle } from "./transcript.tsx";
import { BrandMark } from "./brand.tsx";
import { isNewResult } from "./seen.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

// ---------- facts the brief, the cards and the peek read ----------

/** A step the client holds: a tool call or the agent's words. */
const isStep = (b: Bodies["task_event"]) => b.role === "tool" || (b.role === "assistant" && (!!b.text?.trim() || !!b.thinking?.length));

/** Tasks whose history On hand asked for this session (once each). */
const stepsAsked = new Set<string>();
/** D467: the client holds only what streamed since it connected; a working task's trail and the
 *  peek's steps ask once for its history (the same request the opened task's page makes). */
export function ensureSteps(task: Task) {
  if (stepsAsked.has(task.id) || task.historyLoaded || task.histPending || !A.S.welcomed) return;
  stepsAsked.add(task.id);
  A.S.historyAsked(task.id, 500);
  A.send({ t: "task_history", taskId: task.id, limit: 500 } as never);
}

/** The steps of a task this client holds, oldest first: their time, and whether one went wrong. */
export function stepsOf(task: Task): { at: number; bad: boolean; ev: LogEvent }[] {
  const out: { at: number; bad: boolean; ev: LogEvent }[] = [];
  for (const e of task.events) {
    if (e.kind !== "task_event") continue;
    const b = e.body as Bodies["task_event"];
    if (!isStep(b)) continue;
    const at = Date.parse(e.ts);
    if (Number.isFinite(at)) out.push({ at, bad: b.tool?.ok === false, ev: e });
  }
  const l = task.card?.latest;
  if (l && !out.some((s) => s.ev.seq === l.seq)) {
    const at = Date.parse(l.ts);
    const b = l.body as Bodies["task_event"] | undefined;
    if (Number.isFinite(at) && b) out.push({ at, bad: b.tool?.ok === false, ev: l });
    out.sort((a, b) => a.at - b.at);
  }
  return out;
}

/** Whether a task works on a phone (D217, D238): a phone tool among its steps, or the card says so. */
export function onPhone(task: Task): boolean {
  if (task.card?.handset || task.card?.phoning) return true;
  return stepsOf(task).some((s) => (s.ev.body as Bodies["task_event"]).tool?.name?.startsWith("phone_"));
}

/** A report's first sentence, cut short: what it said, in a breath (≤ 60 characters). */
export function firstSentence(s: string | undefined): string {
  const x = (s ?? "").trim().split("\n")[0]!;
  const m = /^(.*?[。！？!?]|.*?\.(?=\s|$))/.exec(x);
  const one = (m ? m[1]! : x).trim();
  return one.length > 60 ? `${one.slice(0, 59).trimEnd()}…` : one;
}

/** D467: a waiting line that only says the title again (「等 X 跑完再合并」 over 「等 X 跑完」) says
 *  nothing; strip a leading 等 / waiting until / until and see whether the title already holds it. */
export function echoes(titleText: string, words: string): boolean {
  const norm = (x: string) => x.toLowerCase().replace(/[\s「」“”"'。.，,：:]/g, "");
  const w = norm(words.replace(/^(等|waiting until|until|wait for|waiting for)\s*/i, ""));
  return w.length > 0 && norm(titleText).includes(w);
}

/** D467: what a finished task made, as an object: the PR, from its evidence, else a merge or
 *  draft PR made from Ducter, else a PR number its summary names on a repo task. */
export function outcomeOf(task: Task): { label: string; url?: string } | undefined {
  const r = reportOf(task);
  for (const e of [...(r?.evidence ?? []), ...task.evidence]) {
    const m = /\/pull\/(\d+)/.exec(e.ref ?? "");
    if (m) return { label: `#${m[1]}`, url: e.ref };
  }
  const i = task.card?.integrated?.ref;
  if (i) {
    const m = /\/pull\/(\d+)/.exec(i);
    if (m) return { label: `#${m[1]}`, url: i };
  }
  if (placeOf(task).kind === "repo") {
    const m = /(?:PR\s*)?#(\d+)/.exec(r?.summary ?? "");
    if (m) return { label: `#${m[1]}` };
  }
  return undefined;
}

/** The outcome chip: the app's mark and the PR's number, quiet; opens the PR (or the task). */
export function Outcome({ task, small }: { task: Task; small?: boolean }) {
  const o = outcomeOf(task);
  if (!o) return null;
  return (
    <a
      class={`ochip${small ? " sm" : ""}`}
      href={o.url ?? "#"}
      target={o.url ? "_blank" : undefined}
      rel="noreferrer"
      title={o.url ?? title(task)}
      onClick={(e) => {
        e.stopPropagation();
        if (!o.url) e.preventDefault(), A.go({ name: "task", id: task.id, full: A.route.name !== "conv" });
      }}
    >
      <BrandMark name="github" size={12} />
      <span>{o.label}</span>
    </a>
  );
}

/** When a wait comes back on its own (ms), or NaN. */
export function backAt(task: Task): number {
  const w = A.S.waiterFor(task.id);
  if (!w) return NaN;
  return Date.parse((w.check || w.event ? w.nextLookAt : w.at) ?? "");
}

// ---------- what stopped, and what fixes it (D467 round 4) ----------

export type StuckKind = "cant" | "signin" | "signin-pi" | "offline" | "perm" | "phone" | "failed" | "unknown" | "stopped";
/** `text` names the task (a sentence said anywhere); `line` is the card's own line, without its name. */
export type BriefNeed = { task: Task; kind: StuckKind; text: string; line: string; device?: string; harness?: string };

/** D471: a phone task the home stopped lending to, told by its own report when its steps aren't held. */
const PHONE_STOPPED = /(手机|phone)[^。.\n]{0,24}(访问|借用|access)[^。.\n]{0,16}(停止|停了|stopped|revoked|ended)/i;

/** D471: a failure whose words are a tool's or git's raw output, said instead in the partner's
 *  voice: a lock git left behind, else an error it doesn't know. */
export function rawFailure(reason: string): "lock" | "unknown" | undefined {
  if (!reason.trim()) return undefined;
  if (/index\.lock|another git process/i.test(reason)) return "lock";
  if (/^(fatal|error)[: ]|\n|git |exit (code|status)|Traceback|ENOENT|EACCES|[{}[\]]/i.test(reason)) return "unknown";
  return undefined;
}

/** D415's line for a task that couldn't start (the task page's own words; D472: one source, cant.tsx). */
function cantWords(task: Task): string {
  return cantLine(cantOf(task)!);
}

/**
 * What a stopped or failed task needs, from what the home already says, never a model: a start it
 * couldn't make (D395, D415), its agent signed out on its computer (D363), its computer gone (D157),
 * macOS's two switches off for a task in the person's apps (D235), a phone (D217, D238), else a
 * plain failure or a stop. `name` is how the task is named (the brief's short form).
 */
export function stuckOf(x: Task, name = briefName(title(x)) || t("task.unknown")): BriefNeed {
  const failed = attention(x) === "failed";
  const said = firstSentence(sayable(reportOf(x)?.summary ?? "", A.readerLang(x)));
  // The card's line is the sentence without the task's name (the card names it).
  const of = (kind: StuckKind, text: string, line: string, more: Partial<BriefNeed> = {}): BriefNeed => ({ task: x, kind, text, line, ...more });
  const cant = cantOf(x);
  if (failed && cant) {
    // D472: why it couldn't start and its real fix, one source with the task's page (cant.tsx).
    return of("cant", cantWords(x), cantWords(x));
  }
  const device = placeOf(x).device || "local";
  const h = computerOf(device)?.harnesses.find((y) => y.harness === harnessOf(x));
  if (h?.installed && !h.loggedIn) {
    const where = computerName(device);
    if (h.harness === "pi") return of("signin-pi", t("onhand.brief.signin.pi", name, where), t("onhand.stuck.signin.pi", where), { device });
    return of("signin", t("onhand.brief.signin", name, harnessName(h.harness), where), t("onhand.stuck.signin", harnessName(h.harness), where), { device, harness: h.harness });
  }
  const r = reasonOf(x);
  if (r.startsWith("device:unreachable:")) {
    const who = r.slice("device:unreachable:".length);
    const seen = computerOf(who)?.lastSeen;
    return of("offline", seen ? t("onhand.brief.offline", name, who, ago(A.L, seen)) : t("onhand.brief.offline.unknown", name, who), seen ? t("onhand.stuck.offline", who, ago(A.L, seen)) : t("onhand.stuck.offline.unknown", who));
  }
  const cu = x.card?.computing;
  const perms = cu ? computerOf(cu.device)?.abilities.find((a) => a.id === "computer")?.perms : undefined;
  if (cu && perms && (!perms.accessibility || !perms.screen)) return of("perm", t("onhand.brief.perm", name, computerName(cu.device)), t("onhand.stuck.perm", computerName(cu.device)), { device: cu.device });
  // D471: never a tool's or git's raw words: a lock is named, anything else is said to be unknown.
  const raw = failed && !said ? rawFailure(r) : undefined;
  if (raw === "lock") return of("unknown", t("onhand.brief.failed", name, t("onhand.stuck.lock")), t("onhand.stuck.lock"));
  if (failed && !said) return of("unknown", t("onhand.brief.failed", name, t("onhand.stuck.unknown")), t("onhand.stuck.unknown"));
  if (failed) return of("failed", t("onhand.brief.failed", name, said), t("onhand.stuck.failed", said));
  if (onPhone(x) || PHONE_STOPPED.test(reportOf(x)?.summary ?? "")) return of("phone", t("onhand.brief.stopped.phone", name), t("onhand.stuck.phone"));
  // D471: what a stopped task last said is its own words (the peek shows them); the card says what is true.
  return of("stopped", t("onhand.brief.stopped", name, t("onhand.wait.unsaid")), t("onhand.stuck.stopped"));
}

/** A card's own line for what stopped (the card names the task). */
export function stuckClause(n: BriefNeed): string {
  return n.line;
}

/** The fix for what stopped, as its buttons (the same in the brief and on a card). */
export function StuckActs({ n, onRetry }: { n: BriefNeed; onRetry?: () => void }) {
  const x = n.task;
  const go = (words: string) => A.send({ t: "past_continue", taskId: x.id, words });
  const drop = <Btn kind="text" size="sm" label={t("onhand.quiet.drop")} about={title(x)} onClick={() => A.taskAction(x.id, "drop")} />;
  switch (n.kind) {
    case "cant": {
      // D472: the page's own fixes, the real one first (cant.tsx), 看看为什么 stays on the page.
      const c = cantOf(x)!;
      return (
        <>
          {cantFixes(c)
            .filter((f) => f.act !== "why")
            .map((f) => (
              <Btn key={f.act} kind={f.kind === "primary" ? "secondary" : "text"} size="sm" label={f.label} about={title(x)} onClick={() => doCantFix(x.id, c, f)} />
            ))}
        </>
      );
    }
    case "signin":
      return (
        <>
          <Btn kind="secondary" size="sm" label={t("onhand.brief.signin.go")} about={title(x)} onClick={() => (A.agentSetup(n.device!, "login", { harness: n.harness! }), A.openSettings("devices"))} />
          {drop}
        </>
      );
    case "perm":
      return (
        <>
          <Btn kind="secondary" size="sm" label={t("onhand.brief.perm.go")} about={title(x)} onClick={() => A.send({ t: "computer_grant", device: n.device! })} />
          {drop}
        </>
      );
    case "phone":
      return (
        <>
          <Btn kind="secondary" size="sm" label={t("onhand.brief.phone.go")} about={title(x)} onClick={() => go(t("onhand.brief.phone.words"))} />
          {drop}
        </>
      );
    case "unknown":
      // D471: an error nobody recognised: where to look first, then another go.
      return (
        <>
          <Btn kind="secondary" size="sm" label={t("away.why")} about={title(x)} onClick={() => A.go({ name: "task", id: x.id, full: A.route.name !== "conv" })} />
          <Btn kind="text" size="sm" label={t("away.retry")} about={title(x)} onClick={onRetry ?? (() => (cantOf(x) ? A.cantAction(x.id, "reopen") : go(t("group.retry"))))} />
        </>
      );
    case "failed":
      return (
        <>
          <Btn kind="secondary" size="sm" label={t("away.retry")} about={title(x)} onClick={onRetry ?? (() => go(t("group.retry")))} />
          <Btn kind="text" size="sm" label={t("away.why")} about={title(x)} onClick={() => A.go({ name: "task", id: x.id, full: A.route.name !== "conv" })} />
        </>
      );
    case "offline":
    case "signin-pi":
      return drop;
    default:
      return (
        <>
          <Btn kind="secondary" size="sm" label={t("onhand.quiet.go")} about={title(x)} onClick={() => go(t("onhand.quiet.go"))} />
          {drop}
        </>
      );
  }
}

// ---------- names said in a sentence ----------

/** D471: a task named inside a sentence: its title whole when it fits, else cut at a word's end
 *  (never inside a word, never a title a source already cut cut again); the whole on hover. */
export function briefName(full: string): string {
  return sayName(full, 28);
}

// ---------- work in motion ----------

/** A second's tick while something on screen moves with time (the trail's now, the peek). */
export function useTick(ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => {
    const h = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(h);
  }, [ms]);
}

/** The trail (D467): a working task's own steps placed on its elapsed time, a tick each (an error
 *  in the failed ink), the head breathing at now; then how many steps and when the last one was. */
export function Trail({ task, now = Date.now() }: { task: Task; now?: number }) {
  useEffect(() => ensureSteps(task), [task.id, A.S.welcomed]);
  const start = Date.parse(task.card?.openedAt ?? task.openedAt ?? "");
  const steps = stepsOf(task);
  const span = Number.isFinite(start) ? Math.max(60_000, now - start) : 0;
  const x = (at: number) => (span ? Math.min(100, Math.max(0, ((at - start) / span) * 100)) : 100);
  const last = steps.at(-1);
  const runs = trailRuns(steps.map((s) => ({ x: x(s.at), bad: s.bad, key: s.ev.seq })));
  return (
    <span class="trail-row">
      <span class="trail" aria-hidden="true">
        <span class="rule" />
        {runs.map((r) =>
          r.to > r.from ? (
            <i key={r.key} class={`span${r.bad ? " bad" : ""}`} style={{ left: `${r.from}%`, width: `${r.to - r.from}%` }} />
          ) : (
            <i key={r.key} class={r.bad ? "bad" : ""} style={{ left: `${r.from}%` }} />
          ),
        )}
        <b class="head" />
      </span>
      {steps.length > 0 && <span class="tfact">{t("onhand.progress.steps", steps.length)}</span>}
      {last && <span class="tfact">{t("onhand.progress.last", now - last.at < 60_000 ? t("time.now") : ago(A.L, new Date(last.at).toISOString(), now))}</span>}
    </span>
  );
}

/** The trail's marks (D467 round 3): steps closer than about 6 px (1.2 % of a trail about 500 px
 *  wide) join one span from the first to the last; a lone step stays a tick. x in percent, in order. */
export function trailRuns(steps: { x: number; bad: boolean; key: number }[], gap = 1.2): { from: number; to: number; bad: boolean; key: number }[] {
  const out: { from: number; to: number; bad: boolean; key: number }[] = [];
  for (const s of steps) {
    const r = out.at(-1);
    if (r && s.x - r.to < gap) {
      r.to = s.x;
      r.bad ||= s.bad;
    } else out.push({ from: s.x, to: s.x, bad: s.bad, key: s.key });
  }
  return out;
}

// ---------- the peek ----------

/** The task the peek shows (D471): the one the keys moved to on this board, else the first at
 *  work, else the first in the walk. A focus kept from an opened task doesn't hold it. */
export function peekTask(focus: string, order: string[], walked = true): Task | undefined {
  if (walked && focus && order.includes(focus)) return A.S.tasks.get(focus);
  const working = order.find((id) => {
    const x = A.S.tasks.get(id);
    return !!x && (attention(x) === "working" || attention(x) === "queued");
  });
  return A.S.tasks.get(working ?? order[0] ?? "");
}

/** The peek's latest steps: the last six this client holds, oldest first. */
export function peekSteps(task: Task): LogEvent[] {
  return stepsOf(task)
    .slice(-6)
    .map((s) => s.ev);
}

/** D471: a step said in the peek: its words only, whole (a command or a path is the task's detail,
 *  never cut mid-word into the sentence); "" when the step has no words of its own. */
export function peekWords(words: string): string {
  const w = words.replace(/\s+/g, " ").trim();
  if (!w || /^[`"'$/~.]/.test(w) || /^[a-z][\w-]*\s+(-|\S*[./])/.test(w)) return "";
  return w;
}

/**
 * D467 round 4: the peek's picture, from what Ducter already streams (no new stream): the last frame
 * this session saw of the phone the task works on (D248's held frame), as a still with when it was;
 * and the way to watch it live: the task's browser (D190's watch view) or its phone (D217's view in
 * watch mode). Nothing moves here, so a resting board and reduced motion are untouched.
 */
export function PeekPicture({ task }: { task: Task }) {
  const c = task.card;
  const phone = c?.phoning?.device ?? c?.handset?.device;
  const held = phone ? heldFrame(phone) : undefined;
  if (!c?.browsing && !phone) return null;
  return (
    <div class="ppic">
      {held && (
        <figure class="pshot">
          <img src={held.src} alt="" draggable={false} style={held.w && held.h ? { aspectRatio: `${held.w} / ${held.h}` } : undefined} />
          <figcaption>{t("onhand.peek.last")}</figcaption>
        </figure>
      )}
      <span class="pacts">
        {c?.browsing && <Btn kind="secondary" size="sm" label={t("wb.browser.watch")} about={title(task)} onClick={() => A.watchLive(task.id, liveSize())} />}
        {phone && <Btn kind="secondary" size="sm" label={t("onhand.peek.phone")} about={title(task)} onClick={() => openPhone({ device: phone, taskId: task.id, mode: "watch" })} />}
      </span>
    </div>
  );
}
