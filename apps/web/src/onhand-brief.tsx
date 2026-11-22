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
import { attention, harnessOf, placeOf, reasonOf, reportOf, title, type Task } from "./store.ts";
import { harnessName } from "./format.ts";
import { computerName, computerOf } from "./where.ts";
import { heldFrame, openPhone } from "./phone-use.tsx";
import { liveSize } from "./live.tsx";
import { shortTitle } from "./transcript.tsx";
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

export type StuckKind = "cant" | "signin" | "signin-pi" | "offline" | "perm" | "phone" | "failed" | "stopped";
export type BriefNeed = { task: Task; kind: StuckKind; text: string; device?: string; harness?: string };

/** D415's line for a task that couldn't start (the task page's own words; D472: one source, cant.tsx). */
function cantWords(task: Task): string {
  return cantLine(task.card!.cant!);
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
  if (failed && x.card?.cant) return { task: x, kind: "cant", text: cantWords(x) };
  const device = placeOf(x).device || "local";
  const h = computerOf(device)?.harnesses.find((y) => y.harness === harnessOf(x));
  if (h?.installed && !h.loggedIn) {
    const where = computerName(device);
    if (h.harness === "pi") return { task: x, kind: "signin-pi", text: t("onhand.brief.signin.pi", name, where), device };
    return { task: x, kind: "signin", text: t("onhand.brief.signin", name, harnessName(h.harness), where), device, harness: h.harness };
  }
  const r = reasonOf(x);
  if (r.startsWith("device:unreachable:")) {
    const who = r.slice("device:unreachable:".length);
    const seen = computerOf(who)?.lastSeen;
    return { task: x, kind: "offline", text: seen ? t("onhand.brief.offline", name, who, ago(A.L, seen)) : t("onhand.brief.offline.unknown", name, who) };
  }
  const cu = x.card?.computing;
  const perms = cu ? computerOf(cu.device)?.abilities.find((a) => a.id === "computer")?.perms : undefined;
  if (cu && perms && (!perms.accessibility || !perms.screen)) return { task: x, kind: "perm", text: t("onhand.brief.perm", name, computerName(cu.device)), device: cu.device };
  if (failed) return { task: x, kind: "failed", text: t("onhand.brief.failed", name, said || t("state.failed")) };
  if (onPhone(x)) return { task: x, kind: "phone", text: t("onhand.brief.stopped.phone", name) };
  return { task: x, kind: "stopped", text: t("onhand.brief.stopped", name, said || t("onhand.wait.unsaid")) };
}

/** A card's own line for what stopped: the words after its task's name (the card names it). */
export function stuckClause(n: BriefNeed): string {
  if (n.kind === "cant") return n.text;
  const i = n.text.search(/[：:]/);
  return i > 0 ? n.text.slice(i + 1).trim() : n.text;
}

/** The fix for what stopped, as its buttons (the same in the brief and on a card). */
export function StuckActs({ n, onRetry }: { n: BriefNeed; onRetry?: () => void }) {
  const x = n.task;
  const go = (words: string) => A.send({ t: "past_continue", taskId: x.id, words });
  const drop = <Btn kind="text" size="sm" label={t("onhand.quiet.drop")} about={title(x)} onClick={() => A.taskAction(x.id, "drop")} />;
  switch (n.kind) {
    case "cant": {
      // D472: the page's own fixes, the real one first (cant.tsx), 看看为什么 stays on the page.
      const c = x.card!.cant!;
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

// ---------- the brief ----------

/** D467 round 4 (D297): tasks waiting on one agent's limit, said once under 接下来 with when it
 *  comes back and, when another agent can take them, the hand-over. */
export type BriefLimit = { text: string; tasks: Task[]; handTo?: string; waiterIds: string[] };
export type Brief = { since?: { text: string; task: Task }; needs: BriefNeed[]; asks: number; back?: string; limits: BriefLimit[]; rest?: boolean; told: Set<string> };

/** D467 round 3: a task named in the brief's needs line, short: its short title cut to 12
 *  characters of Han text or 28 of Latin, ending in "…" when cut (the whole on hover). */
export function briefName(full: string): string {
  const s = shortTitle(full) || full;
  const han = /[\u3400-\u9fff]/.test(s);
  const max = han ? 12 : 28;
  const cs = [...s];
  return cs.length > max ? `${cs.slice(0, max - 1).join("").trimEnd()}…` : s;
}

/**
 * The partner's brief over a lens (D467), from what is there, never a model: the new results since
 * you looked; at most two of what stopped or didn't work out, each with what fixes it; how many
 * questions wait below; when the first wait comes back.
 */
export function briefOf(parts: { stopped: Task[]; failed: Task[]; waiting: Task[]; today: Task[] }, needsYou: number, now = Date.now(), working = 0): Brief {
  const told = new Set<string>();
  const fresh = parts.today.filter((x) => isNewResult(x.id, attention(x), x.card?.updatedAt));
  const name = (x: Task) => shortTitle(title(x)) || t("task.unknown");
  let since: Brief["since"];
  if (fresh.length === 1) since = { text: t("onhand.brief.done.one", name(fresh[0]!)), task: fresh[0]! };
  else if (fresh.length === 2) since = { text: t("onhand.brief.done.two", name(fresh[0]!), name(fresh[1]!)), task: fresh[0]! };
  else if (fresh.length > 2) since = { text: t("onhand.brief.done.many", name(fresh[0]!), fresh.length - 1), task: fresh[0]! };
  // D467 round 3: what the brief names gets no card (with "等 n 个", only the first).
  for (const x of fresh.slice(0, fresh.length === 2 ? 2 : 1)) told.add(x.id);
  const halted = [...parts.stopped, ...parts.failed];
  const needs: BriefNeed[] = halted.slice(0, 2).map((x) => stuckOf(x));
  const asks = Math.max(0, needsYou - halted.length);
  // D467 round 4: the waits on an agent's limit, one line per agent (D297), told once.
  const byHarness = new Map<string, Task[]>();
  for (const x of parts.waiting) {
    const l = A.S.waiterFor(x.id)?.limit;
    if (l) byHarness.set(l.harness, [...(byHarness.get(l.harness) ?? []), x]);
  }
  const limits: BriefLimit[] = [];
  for (const [h, ts] of byHarness) {
    const ws = ts.map((x) => A.S.waiterFor(x.id)!);
    const at = ws.map((w) => Date.parse(w.at ?? "")).filter(Number.isFinite).sort((a, b) => a - b)[0];
    const when = at ? clock(new Date(at).toISOString()) : "";
    const to = ws.find((w) => w.limit?.handTo)?.limit?.handTo?.harness;
    limits.push({
      text: ts.length === 1 ? t("onhand.brief.limit", briefName(title(ts[0]!)), harnessName(h), when) : t("onhand.brief.limit.many", ts.length, harnessName(h), when),
      tasks: ts,
      waiterIds: ws.map((w) => w.waiterId),
      ...(to ? { handTo: to } : {}),
    });
    for (const x of ts) told.add(x.id);
  }
  const coming = parts.waiting
    // A wait on a limit's reset is said by its own group (D297), never named here.
    .filter((x) => !A.S.waiterFor(x.id)?.limit)
    .map((x) => ({ x, at: backAt(x) }))
    .filter((c) => Number.isFinite(c.at) && c.at > now)
    .sort((a, b) => a.at - b.at);
  let back: string | undefined;
  if (coming.length) {
    const c = coming[0]!;
    const at = clock(new Date(c.at).toISOString());
    back = coming.length > 1 ? t("onhand.brief.back.more", name(c.x), at, coming.length - 1) : t("onhand.brief.back", name(c.x), at);
    told.add(c.x.id);
  }
  // D467 round 3: nothing needs you, nothing works, nothing comes back on its own: the partner still talks.
  const rest = !needsYou && !working && !back && !limits.length;
  return { since, needs, asks, back, limits, rest, told };
}

/** One labelled line of the brief: its label in a quiet column, then the words and what to do. */
function Line({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <p class="bline">
      <span class="blabel">{label}</span>
      <span class="btext">{children}</span>
    </p>
  );
}

/** The brief's lines under the lead (D467): since you looked, what needs you (with its fix), next. */
export function BriefLines({ b }: { b: Brief }) {
  return (
    <div class="blines">
      {b.since && (
        <Line label={t("onhand.brief.since")}>
          <span class="bsince">
            {b.since.text}
            <Outcome task={b.since.task} small />
          </span>
        </Line>
      )}
      {(b.needs.length > 0 || b.asks > 0) && (
        <Line label={t("lane.needs_you")}>
          {b.needs.map((n) => (
            <span key={n.task.id} class={`bneed k-${n.kind}`}>
              <span class="bwords" title={title(n.task)}>
                {n.text}
              </span>
              <span class="bacts">
                <StuckActs n={n} />
              </span>
            </span>
          ))}
          {b.asks > 0 && <span class="bwords asks">{b.asks === 1 ? t("onhand.brief.asks.one") : t("onhand.brief.asks", b.asks)}</span>}
        </Line>
      )}
      {(b.back || b.limits.length > 0) && (
        <Line label={t("onhand.next")}>
          {b.back && <span class="bnext">{b.back}</span>}
          {b.limits.map((l) => (
            <span key={l.waiterIds.join()} class="bneed k-limit">
              <span class="bwords" title={l.tasks.map((x) => title(x)).join("\n")}>
                {l.text}
              </span>
              {l.handTo && (
                <span class="bacts">
                  <Btn kind="secondary" size="sm" label={t("limit.handoff", harnessName(l.handTo))} onClick={() => l.waiterIds.forEach((id) => A.waiterAction(id, "handoff"))} />
                </span>
              )}
            </span>
          ))}
        </Line>
      )}
      {b.rest && (
        <Line label={t("onhand.next")}>
          <span>{t("onhand.brief.rest")}</span>
        </Line>
      )}
    </div>
  );
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

/** D467: 在等 placed in time: one light axis from now to the latest return within 12 hours, each
 *  wait a hollow bead at its return, its time under it; its title on hover. */
export function WaitAxis({ tasks, now = Date.now() }: { tasks: Task[]; now?: number }) {
  const HORIZON = 12 * 3600_000;
  const items = tasks
    .map((x) => ({ x, at: backAt(x) }))
    .filter((c) => Number.isFinite(c.at) && c.at > now && c.at - now <= HORIZON)
    .sort((a, b) => a.at - b.at);
  // D467 round 3: only with two or more on it: one wait's time is already the brief's and its card's.
  if (items.length < 2) return null;
  const end = Math.max(items.at(-1)!.at, now + 30 * 60_000);
  const x = (at: number) => 8 + ((at - now) / (end - now)) * 84;
  return (
    <div class="waxis" role="group" aria-label={t("onhand.next")}>
      <span class="rule" />
      <span class="now" style={{ left: "0%" }}>
        <b />
        <span>{t("onhand.day.now")}</span>
        <span class="tm">{clock(new Date(now).toISOString())}</span>
      </span>
      {items.map((c) => (
        <button key={c.x.id} class="wbead" style={{ left: `${x(c.at)}%` }} title={shortTitle(title(c.x))} aria-label={`${clock(new Date(c.at).toISOString())} ${shortTitle(title(c.x))}`} onClick={() => A.go({ name: "task", id: c.x.id, full: A.route.name !== "conv" })}>
          <b />
          <span class="tm">{clock(new Date(c.at).toISOString())}</span>
        </button>
      ))}
    </div>
  );
}

// ---------- the peek ----------

/** The task the peek shows: the keys' focus, else the first in the walk. */
export function peekTask(focus: string, order: string[]): Task | undefined {
  if (focus && order.includes(focus)) return A.S.tasks.get(focus);
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
