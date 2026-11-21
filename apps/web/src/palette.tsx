// D391: 找什么都行 / Find anything (⌘K, ⌘O; design/sessions.md). The switcher grown into one field
// that finds any task (on hand here, earlier ones from the home's Past index by what anyone said,
// a file, a branch, a PR, a day), what Ducter made, the person's own sessions and the places, and acts
// on the one chosen: open it, carry it on, start a new task from one of its steps or from all it found; or tells
// the partner the words, or starts a new task with them.
import type { MadeItem, OutsideItem, PastItem, ServerFrame } from "@ducter/protocol";
import type { JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { A } from "./app.ts";
import { Coin } from "./coin.tsx";
import { Facts } from "./controls.tsx";
import { harnessName } from "./format.ts";
import { openIt as openMade, kindWord, Tile } from "./made.tsx";
import { storyOf, switchList } from "./onhand.tsx";
import { dateOf, Glyph, Marked, openPast } from "./past.tsx";
import { askSteps, forgetSteps, PV, startRedo } from "./past-preview.tsx";
import { attention, placeOf, projectOf, reportOf, title, type Task } from "./store.ts";
import { shortTitle } from "./transcript.tsx";
import { stateLabel } from "./views.tsx";
import { computerName, manyComputers } from "./where.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

const ACTIVE = new Set(["queued", "working", "needs_you", "blocked", "done_claimed"]);

type PastRes = Extract<ServerFrame, { t: "past_result" }>;
type MadeRes = Extract<ServerFrame, { t: "made_result" }>;

/** What the field holds between renders: the home's answers for the words typed. */
export const K = { q: "", past: undefined as PastRes | undefined, made: undefined as MadeRes | undefined, askedPast: "", askedMade: "", n: 0, timer: 0 as unknown as ReturnType<typeof setTimeout> | 0 };

function askHome(q: string) {
  if (K.timer) clearTimeout(K.timer);
  K.q = q;
  if (!q) return void ((K.past = K.made = undefined), (K.askedPast = K.askedMade = ""));
  K.timer = setTimeout(() => {
    K.timer = 0;
    K.askedPast = `kp${++K.n}`;
    K.askedMade = `km${K.n}`;
    A.send({ t: "past", id: K.askedPast, query: { q, limit: 8 } });
    A.send({ t: "made", id: K.askedMade, query: { q } });
  }, 120);
}

/** A fresh field each time it opens. */
export function resetPalette() {
  if (K.timer) clearTimeout(K.timer);
  K.timer = 0;
  forgetSteps(); // D456: a task at work moved on since: its steps are asked again
  K.q = "";
  K.past = K.made = undefined;
  K.askedPast = K.askedMade = "";
}

/** The home's answers to the field's own asks, handed here by app.ts (set below, so app.ts needn't import this file). */
queueMicrotask(() => (A.palette = { frame: (f) => onPaletteFrame(f), reset: () => resetPalette() }));

/** The home's answers to the field's own asks (app.ts hands them here); a stale one is dropped. */
export function onPaletteFrame(f: PastRes | MadeRes) {
  if (f.t === "past_result") {
    if (f.id !== K.askedPast) return;
    K.past = f;
  } else {
    if (f.id !== K.askedMade) return;
    K.made = f;
  }
  A.changed();
}

/** One task, as a row: from what the client holds or from the home's Past index. */
type TaskRow = { k: "task"; id: string; title: string; harness: string; line?: string; hit?: { label: string; text: string }; facts: (string | JSX.Element | undefined)[]; state?: { word: string; tone?: string }; done: boolean; place?: import("@ducter/protocol").Place; item: () => PastItem };

/** D456: a task the client holds, as the Past index would say it (for the peek beside the list). */
function itemOfTask(x: Task): PastItem {
  const p = placeOf(x);
  const r = reportOf(x);
  const dev = "device" in p ? p.device : undefined;
  const outcome = (r?.summary ?? "").split("\n").find((l) => l.trim())?.trim();
  const ch = r?.branch?.adds !== undefined ? { files: r.branch.files ?? 0, adds: r.branch.adds ?? 0, dels: r.branch.dels ?? 0, at: x.card?.updatedAt ?? "" } : undefined;
  return {
    taskId: x.id,
    title: title(x),
    project: projectOf(x),
    harness: x.card?.harness ?? x.open?.harness ?? "",
    ...((x.card?.model ?? x.open?.model) ? { model: x.card?.model ?? x.open?.model } : {}),
    ...(manyComputers() && dev ? { computer: computerName(dev) } : {}),
    openedAt: x.openedAt ?? x.card?.openedAt ?? "",
    updatedAt: x.card?.updatedAt ?? x.openedAt ?? "",
    attention: attention(x),
    ...(outcome ? { outcome } : {}),
    // A task at work: what it is doing now, in its own words (as its row on On hand says).
    ...(ACTIVE.has(attention(x)) && storyOf(x).words ? { lastWords: storyOf(x).words } : {}),
    ...(ch ? { changes: ch } : {}),
    ...(p.kind === "repo" && p.branch ? { branch: p.branch } : {}),
    ...(A.S.pendingDecision(x.id)?.question ? { asking: A.S.pendingDecision(x.id)!.question } : {}),
    kind: "build",
  } as PastItem;
}
type Row =
  | TaskRow
  | { k: "made"; id: string; it: MadeItem }
  | { k: "own"; id: string; it: OutsideItem }
  | { k: "go"; id: string; label: string; keys?: string; run: () => void }
  | { k: "tell"; id: string }
  | { k: "new"; id: string };

function liveRow(x: Task): TaskRow {
  const p = placeOf(x);
  const a = attention(x);
  const dev = "device" in p ? p.device : undefined;
  return {
    k: "task",
    id: x.id,
    title: shortTitle(title(x)),
    harness: x.card?.harness ?? x.open?.harness ?? "",
    facts: [projectOf(x) || (p.kind === "repo" ? p.repoPath.split("/").pop() : ""), p.kind === "repo" && p.branch ? <span class="k-mono">{p.branch}</span> : undefined, manyComputers() && dev ? computerName(dev) : undefined],
    state: { word: stateLabel(a), ...(a === "needs_you" ? { tone: "needs" } : a === "failed" ? { tone: "failed" } : {}) },
    done: !ACTIVE.has(a),
    place: p,
    item: () => itemOfTask(x),
  };
}

function pastRow(it: PastItem): TaskRow {
  const field = it.hit ? (it.hit.field === "name" ? "title" : it.hit.field) : "";
  const end = it.attention === "failed" ? { word: t("past.end.failed"), tone: "failed" } : it.attention === "dropped" ? { word: t("past.end.dropped") } : ACTIVE.has(it.attention) ? { word: t("past.end.active") } : undefined;
  return {
    k: "task",
    id: it.taskId,
    title: it.title,
    harness: it.harness,
    ...(it.hit ? { hit: { label: t(`past.hit.${field}`), text: it.hit.text } } : it.outcome ? { line: it.outcome } : {}),
    facts: [it.project || t("past.other"), it.branch ? <span class="k-mono">{it.branch}</span> : undefined, it.computer, dateOf(it.updatedAt)],
    ...(end ? { state: end } : {}),
    done: !ACTIVE.has(it.attention),
    item: () => it,
  };
}

const PLACES: { id: string; key: string; keys?: string; run: () => void }[] = [
  { id: "conv", key: "palette.go.conv", keys: "⌘1", run: () => A.command("conv") },
  { id: "onhand", key: "palette.go.onhand", keys: "⌘2", run: () => A.command("onhand") },
  { id: "past", key: "palette.go.past", keys: "⌘Y", run: () => openPast() },
  { id: "made", key: "palette.go.made", run: () => openPast("", "made") },
  // D410: 你的小应用 / Your apps.
  { id: "apps", key: "apps.title", run: () => A.command("apps") },
  { id: "devices", key: "palette.go.devices", keys: "⌘3", run: () => A.command("devices") },
  { id: "settings", key: "palette.go.settings", keys: "⌘,", run: () => A.command("settings") },
  // D456: 键盘 / Keyboard, every key in one list.
  { id: "keys", key: "keys.title", keys: "⌘/", run: () => void (A.sheet = { kind: "keys" }) },
];

/** The groups as drawn, in order: what it found, then the places, then the two ways on with the words. */
export function paletteGroups(q: string): { key: string; label?: string; rows: Row[] }[] {
  const words = q.trim();
  const out: { key: string; label?: string; rows: Row[] }[] = [];
  const low = words.toLowerCase();
  const places = PLACES.filter((p) => !low || t(p.key).toLowerCase().includes(low)).map((p): Row => ({ k: "go", id: `go:${p.id}`, label: t(p.key), ...(p.keys ? { keys: p.keys } : {}), run: p.run }));
  if (!words) {
    const recent = switchList("", 8).map(liveRow);
    if (recent.length) out.push({ key: "recent", label: t("palette.g.recent"), rows: recent });
    out.push({ key: "go", label: t("palette.g.go"), rows: places });
    return out;
  }
  // A place named in full ("做过的事", "Settings") is where the words were going: it leads.
  const named = places.filter((p) => p.k === "go" && p.label.toLowerCase() === low);
  if (named.length) out.push({ key: "go1", label: t("palette.g.go"), rows: named });
  const here = switchList(words, 6).map(liveRow);
  // D456: the home's index finds a task still on hand by a file, a branch or its words: it stands
  // with what is on hand (one place per task), saying where the words matched.
  const hits = new Map((K.past?.items ?? []).map((i) => [i.taskId, i]));
  for (const r of here) {
    const it = hits.get(r.id);
    if (it?.hit && !r.hit) Object.assign(r, { hit: pastRow(it).hit, line: undefined });
  }
  for (const it of K.past?.items ?? []) {
    const live = A.S.tasks.get(it.taskId);
    if (here.length >= 6 || !live || !title(live) || !ACTIVE.has(it.attention) || here.some((r) => r.id === it.taskId)) continue;
    here.push({ ...liveRow(live), ...(pastRow(it).hit ? { hit: pastRow(it).hit, line: undefined } : {}) });
  }
  if (here.length) out.push({ key: "onhand", label: t("palette.g.onhand"), rows: here });
  const shown = new Set(here.map((r) => r.id));
  const earlier = (K.past?.items ?? []).filter((i) => !shown.has(i.taskId)).slice(0, 8).map(pastRow);
  if (earlier.length) out.push({ key: "past", label: t("palette.g.past"), rows: earlier });
  const made = (K.made?.items ?? []).slice(0, 4).map((it): Row => ({ k: "made", id: `made:${it.id}`, it }));
  if (made.length) out.push({ key: "made", label: t("palette.g.made"), rows: made });
  const own = (K.past?.outside ?? []).slice(0, 3).map((it): Row => ({ k: "own", id: `own:${it.agent}:${it.id}`, it }));
  if (own.length) out.push({ key: "own", label: t("palette.g.own"), rows: own });
  const rest = places.filter((p) => !named.includes(p));
  if (rest.length) out.push({ key: "go", label: t("palette.g.go"), rows: rest });
  out.push({ key: "on", rows: [{ k: "tell", id: "tell" }, { k: "new", id: "new" }] });
  return out;
}

// ---------- acting ----------

function close() {
  A.sheet = null;
  A.changed();
}

function openTask(id: string) {
  A.sheet = null;
  const full = A.route.name !== "conv" && !!A.route.full;
  A.go({ name: "task", id, full });
}

function carryOn(r: TaskRow) {
  if (!r.done) return openTask(r.id);
  A.send({ t: "past_continue", taskId: r.id });
  A.toast(t("past.continued", r.title));
  openTask(r.id);
}

function seed(r: TaskRow) {
  A.sheet = null;
  const task = A.S.tasks.get(r.id);
  A.openNewTask(task?.open?.place ?? task?.card?.place ?? r.place);
  A.nt.from = { taskId: r.id, title: r.title };
  A.changed();
}

function redo(r: TaskRow) {
  A.sheet = null;
  startRedo({ taskId: r.id, title: r.title, harness: r.harness });
}

function first(r: Row, q: string) {
  switch (r.k) {
    case "task":
      return openTask(r.id);
    case "made":
      if (r.it.media || r.it.path || r.it.url) return close(), openMade(r.it, undefined, () => {});
      return openPast(q, "made");
    case "own":
      return openPast(q);
    case "go":
      return (A.sheet = null), r.run(), A.changed();
    case "tell":
      A.sheet = null;
      if (A.route.name !== "conv") A.go({ name: "conv" });
      A.sendMessage(q);
      return A.changed();
    case "new":
      A.sheet = null;
      A.openNewTask();
      A.nt.words = q;
      return A.changed();
  }
}

const coarse = () => typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
/** A phone-wide field: the short placeholder, so the line never cuts off mid-list. */
const narrow = () => typeof matchMedia === "function" && matchMedia("(max-width: 520px)").matches;
/** D456: room for the peek beside the list. */
const roomy = () => typeof matchMedia === "function" && matchMedia("(min-width: 1000px)").matches;

// ---------- the field ----------

export function Palette() {
  const [q, setQ] = useState(K.q);
  const [i, setI] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const words = q.trim();
  const groups = paletteGroups(words);
  const rows = groups.flatMap((g) => g.rows);
  const at = Math.min(i, Math.max(0, rows.length - 1));
  const cur = rows[at];
  const touch = coarse();
  // D456: on a wide screen, where the chosen task stopped stands beside the list.
  const peek = !touch && roomy();
  useEffect(() => {
    list.current?.querySelector(".k-row.on")?.scrollIntoView({ block: "nearest" });
  }, [at, words]);
  const keys = (e: KeyboardEvent) => {
    if (e.key === "Escape") return e.preventDefault(), e.stopPropagation(), close();
    if (e.key === "ArrowDown" || (e.key === "n" && e.ctrlKey)) return e.preventDefault(), setI(Math.min(at + 1, rows.length - 1));
    if (e.key === "ArrowUp" || (e.key === "p" && e.ctrlKey)) return e.preventDefault(), setI(Math.max(at - 1, 0));
    if (e.key !== "Enter" || e.isComposing || !cur) return;
    e.preventDefault();
    if (cur.k === "task") {
      if (e.altKey) return redo(cur);
      if ((e.metaKey || e.ctrlKey) && e.shiftKey) return seed(cur);
      if (e.metaKey || e.ctrlKey) return carryOn(cur);
    }
    first(cur, words);
  };
  let n = -1;
  return (
    <>
      <div class="scrim" onClick={close} />
      <div class={`switcher palette${touch ? " touch" : ""}`} role="dialog" aria-modal="true" aria-label={t("palette.label")} onKeyDown={keys}>
        <label class="k-field">
          <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M8.8 13.6a4.8 4.8 0 1 0 0-9.6 4.8 4.8 0 0 0 0 9.6zM12.3 12.3 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
          </svg>
          <input
            ref={ref}
            class="sw-in"
            value={q}
            placeholder={t(narrow() ? "palette.placeholder.short" : "palette.placeholder")}
            aria-label={t("palette.placeholder")}
            role="combobox"
            aria-expanded="true"
            aria-controls="k-list"
            autocomplete="off"
            spellcheck={false}
            onInput={(e) => (setQ(e.currentTarget.value), setI(0), askHome(e.currentTarget.value.trim()))}
          />
          {!touch && <kbd class="k-esc">esc</kbd>}
        </label>
        <div class={peek ? "k-body" : "k-body flat"}>
          <div class="sw-list k-list" id="k-list" role="listbox" ref={list}>
            {groups.map((g) => (
              <div class="k-group" key={g.key} role="group" aria-label={g.label}>
                {g.label && <p class="k-glabel">{g.label}</p>}
                {g.rows.map((r) => {
                  const idx = ++n;
                  return <RowView key={r.id} r={r} on={idx === at} q={words} hover={() => idx !== at && setI(idx)} touch={touch} peek={peek} />;
                })}
              </div>
            ))}
            {words && K.past === undefined && <p class="k-looking">{t("palette.looking")}</p>}
          </div>
          {peek && <Peek r={cur} />}
        </div>
        {!touch && cur && <Foot r={cur} />}
      </div>
    </>
  );
}

/** D456: 停在哪儿 / Where it stopped, beside the list: the chosen task's state, what it asks, how it
 *  ended or its newest words, its changes and its steps. Nothing to act on here: the foot holds the
 *  ways on, each with its key, so the hands stay on the keys. */
function Peek({ r }: { r: Row | undefined }) {
  const id = r?.k === "task" ? r.id : "";
  useEffect(() => {
    if (!id) return;
    const timer = setTimeout(() => askSteps(id), 140); // arrowing past a row asks nothing
    return () => clearTimeout(timer);
  }, [id]);
  if (!r || r.k !== "task") {
    return (
      <aside class="k-peek empty" aria-hidden="true">
        <p>{t("pv.pick")}</p>
      </aside>
    );
  }
  const it = r.item();
  const st = PV.steps.get(r.id);
  const report = st?.report || it.outcome || "";
  const last = it.lastWords && !report.includes(it.lastWords.trim()) ? it.lastWords : "";
  const ch = it.changes;
  const steps = st?.steps ?? [];
  return (
    <aside class="k-peek" aria-label={t("pv.title")}>
      <p class="pv-kicker">{t("pv.title")}</p>
      <h3 class="k-pname">{it.title}</h3>
      <Facts class="pv-facts" items={[it.project || undefined, it.branch ? <span class="pv-mono">{it.branch}</span> : undefined, it.computer, it.model ? `${harnessName(it.harness)} ${it.model}` : harnessName(it.harness), it.updatedAt ? dateOf(it.updatedAt) : undefined]} />
      {r.state && <p class={`k-pstate ${r.state.tone ?? ""}`}>{r.state.word}</p>}
      {it.asking && (
        <section class="pv-sec pv-ask">
          <h4>{t("pv.asking")}</h4>
          <p>{it.asking}</p>
        </section>
      )}
      {report && (
        <section class="pv-sec">
          <h4>{t("pv.result")}</h4>
          <p class={`pv-report k-clamp${it.attention === "failed" ? " failed" : ""}`}>{report || t("pv.noreport")}</p>
        </section>
      )}
      {last && (
        <section class="pv-sec">
          <h4>{t("pv.last")}</h4>
          <p class="pv-last k-clamp">{last}</p>
        </section>
      )}
      {((ch && (ch.adds || ch.dels)) || it.integrated) && (
        <section class="pv-sec pv-row">
          <h4>{t("pv.changes")}</h4>
          <span class="pv-ch">
            {ch && (ch.adds || ch.dels) ? (
              <span class="pdiff">
                <span class="add">+{ch.adds}</span> <span class="del">−{ch.dels}</span>
              </span>
            ) : null}
            {it.integrated && <span class="pint">{t(it.integrated.act === "merge" ? "onhand.pr.merged" : "onhand.pr.draft")}</span>}
          </span>
        </section>
      )}
      {steps.length > 0 && (
        <section class="pv-sec">
          <h4>{t("pv.steps")}</h4>
          <ol class="k-steps">
            {steps.slice(-4).map((s) => (
              <li key={s.n}>
                <span class="pv-n" aria-hidden="true">
                  {s.n}
                </span>
                <span class="k-said">{s.text}</span>
                {s.commit && <span class="pv-commit">{s.commit}</span>}
              </li>
            ))}
          </ol>
        </section>
      )}
    </aside>
  );
}

function RowView({ r, on, q, hover, touch, peek }: { r: Row; on: boolean; q: string; hover: () => void; touch: boolean; peek?: boolean }) {
  const cls = `sw-row k-row k-${r.k}${on ? " on" : ""}`;
  const click = () => (r.k === "task" && touch ? openTask(r.id) : first(r, q));
  if (r.k === "task") {
    return (
      <button role="option" aria-selected={on} class={cls} onMouseMove={hover} onClick={click}>
        <span class="k-coin">{r.harness ? <Coin harness={r.harness} size={26} /> : <Glyph g="build" size={18} />}</span>
        <span class="k-main">
          <span class="k-l1">
            <span class="t">
              <Marked text={r.title} q={q} />
            </span>
            {r.state && <b class={`st ${r.state.tone ?? ""}`}>{r.state.word}</b>}
          </span>
          {r.hit ? (
            <span class="k-l2 hit">
              <b>{r.hit.label}</b>
              <span>
                <Marked text={r.hit.text} q={q} />
              </span>
            </span>
          ) : (
            !peek && r.line && <span class="k-l2">{r.line}</span>
          )}
          <Facts class="k-facts" items={[...r.facts, r.harness ? harnessName(r.harness) : undefined]} />
        </span>
      </button>
    );
  }
  if (r.k === "made") {
    return (
      <button role="option" aria-selected={on} class={cls} onMouseMove={hover} onClick={click}>
        <span class="k-coin">
          <Tile it={r.it} />
        </span>
        <span class="k-main">
          <span class="k-l1">
            <span class="t">{r.it.title || kindWord(r.it)}</span>
          </span>
          <Facts class="k-facts" items={[kindWord(r.it), r.it.task?.title, dateOf(r.it.at)]} />
        </span>
      </button>
    );
  }
  if (r.k === "own") {
    return (
      <button role="option" aria-selected={on} class={cls} onMouseMove={hover} onClick={click}>
        <span class="k-coin">
          <Coin harness={r.it.agent} size={26} />
        </span>
        <span class="k-main">
          <span class="k-l1">
            <span class="t">{r.it.title}</span>
          </span>
          <Facts class="k-facts" items={[r.it.project, r.it.branch ? <span class="k-mono">{r.it.branch}</span> : undefined, harnessName(r.it.agent), dateOf(r.it.updatedAt)]} />
        </span>
      </button>
    );
  }
  if (r.k === "go") {
    return (
      <button role="option" aria-selected={on} class={cls} onMouseMove={hover} onClick={click}>
        <span class="k-coin go" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 20 20">
            <path d="M5 10h10M11 6l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
        <span class="t">{r.label}</span>
        {r.keys && !touch && <kbd>{r.keys}</kbd>}
      </button>
    );
  }
  return (
    <button role="option" aria-selected={on} class={`${cls}${r.k === "new" ? " new" : ""}`} onMouseMove={hover} onClick={click}>
      <span class="k-coin go" aria-hidden="true">
        {r.k === "tell" ? (
          <svg width="16" height="16" viewBox="0 0 20 20">
            <path d="M4.5 5.5h11v7h-6l-3.5 3v-3H4.5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 20 20">
            <path d="M10 4.5v11M4.5 10h11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          </svg>
        )}
      </span>
      <span class="t">{r.k === "tell" ? t("palette.tell", A.S.personaName || "Ducter", q) : t("switch.new", q)}</span>
    </button>
  );
}

/** A key or keys as the keyboard shows them; Return drawn (D211: no symbol that may turn emoji). */
function Kbd({ keys }: { keys: string }) {
  const mods = keys.replace(/enter$/, "");
  return (
    <kbd>
      {mods}
      {keys.endsWith("enter") && (
        <svg class="k-ret" width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M10 2.5v4H3M5 4.5 3 6.5l2 2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      )}
    </kbd>
  );
}

/** The chosen row's ways on, each a button with its own keys (D291: never one joined line). */
function Foot({ r }: { r: Row }) {
  const acts: { label: string; keys: string; run: () => void }[] = [];
  const q = K.q;
  if (r.k === "task") {
    acts.push({ label: t("palette.act.open"), keys: "enter", run: () => openTask(r.id) });
    if (r.done) acts.push({ label: t("palette.act.continue"), keys: "⌘enter", run: () => carryOn(r) });
    acts.push({ label: t("palette.act.redo"), keys: "⌥enter", run: () => redo(r) });
    acts.push({ label: t("palette.act.seed"), keys: "⇧⌘enter", run: () => seed(r) });
  } else if (r.k === "tell") acts.push({ label: t("palette.act.send"), keys: "enter", run: () => first(r, q) });
  else if (r.k === "new") acts.push({ label: t("palette.act.new"), keys: "enter", run: () => first(r, q) });
  else if (r.k === "go") acts.push({ label: t("palette.act.go"), keys: "enter", run: () => first(r, q) });
  else acts.push({ label: t("palette.act.open"), keys: "enter", run: () => first(r, q) });
  return (
    <div class="k-foot">
      {acts.map((a) => (
        <button key={a.label} class="k-act" onClick={a.run}>
          <span>{a.label}</span>
          <Kbd keys={a.keys} />
        </button>
      ))}
    </div>
  );
}
