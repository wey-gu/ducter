// D285: 做过的事 / Past tasks (design/past.md): every earlier task, found by what anyone said,
// what it changed, where it ran and when; the person's marks on it (a name, a star, a few tags,
// a picture); and the ways back: 接着做 / Continue, 带着它开新任务 / New task from this, or just
// open it. A sheet: a centred panel when wide, the whole screen on a phone.
import type { OngoingAction, OngoingItem, OngoingRun, OutsideAgent, OutsideItem, PastGlyph, PastItem, PastMarkPatch, PastQuery, PastTint, ServerFrame } from "@ducter/protocol";
import { PAST_GLYPHS, PAST_TAGS_MAX, PAST_TINTS } from "@ducter/protocol";
import { useEffect, useRef, useState } from "preact/hooks";
import { A } from "./app.ts";
import type { TableLang } from "./i18n.ts";
import { Btn, Facts } from "./controls.tsx";
import { harnessName, spoken } from "./format.ts";
import { askMade, M, MadeTab } from "./made.tsx";
import { forgetSteps, Preview, PV, startRedo, type PreviewActs } from "./past-preview.tsx";
import { ROOMY, useRoomy } from "./wide.ts";
import { openApp } from "./apps.tsx";
import { Menu, MenuHead, MenuItem, MenuSep } from "./menu.tsx";
import { FirstMeetLine } from "./first-meet.tsx";
import { importOffer, ImportOfferLine } from "./imports.tsx";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

type Filter = { kind: "all" } | { kind: "starred" } | { kind: "project"; v: string } | { kind: "harness"; v: string } | { kind: "tag"; v: string };
type Result = Extract<ServerFrame, { t: "past_result" }>;

/** What the sheet holds between renders. */
export const P = {
  q: "",
  filter: { kind: "all" } as Filter,
  res: undefined as Result | undefined,
  asked: "",
  n: 0,
  focus: "",
  markFor: "",
  moreFor: "",
  popped: "",
  timer: 0 as unknown as ReturnType<typeof setTimeout> | 0,
  /** D285: which collection: 做过的事 / Past or 一直在跑的 / Ongoing; D383: 给你做的 / Made for you. */
  tab: "past" as "past" | "made" | "ongoing",
  og: undefined as OngoingItem[] | undefined,
  ogMenu: "",
  ogPause: "",
  ogEdit: "",
  /** D427: the card whose 多久跑一轮 / How often menu is open. */
  ogRhythm: "",
  settling: "",
  /** D299: the outside session being carried on (agent:id), opened when its task is there. */
  adopting: "",
  /** D391: the computer and the ending narrowing the list (each beside the filter above). */
  computer: undefined as string | undefined,
  ended: undefined as PastQuery["ended"],
  /** D391: the card whose 停在哪儿 / Where it stopped stands beside the list (wide). */
  sel: "",
};

const ACTIVE = new Set(["queued", "working", "needs_you", "blocked", "done_claimed"]);

/** Opens 做过的事, with words when given (On hand's Find, the switcher); or 一直在跑的 / Ongoing. */
queueMicrotask(() => {
  A.openPast = (q, tab) => openPast(q ?? "", tab);
  A.onPastWelcome = () => void (A.sheet?.kind === "past" && (ask(true), askMade(P.q, true)));
  // Opened from a link before this registered (the first load): follow it now.
  if (typeof location !== "undefined" && /^#(past|find|ongoing)/.test(location.hash)) A.fromHash();
});

export function openPast(q = "", tab: "past" | "made" | "ongoing" = "past") {
  P.q = q;
  P.tab = tab;
  P.filter = { kind: "all" };
  P.focus = P.markFor = P.moreFor = P.ogMenu = P.ogPause = P.ogEdit = P.ogRhythm = P.sel = "";
  P.computer = P.ended = undefined;
  PV.sheet = "";
  forgetSteps();
  M.kind = undefined;
  M.open = "";
  A.sheet = { kind: "past" };
  ask(true);
  askMade(q, true);
  A.send({ t: "ongoing", id: "og" });
  // D655: the one line under 也在这台电脑上 when a source is detected and nothing came in yet.
  A.send({ t: "imports" });
  A.changed();
}

function queryOf(): PastQuery {
  const f = P.filter;
  return {
    ...(P.q.trim() ? { q: P.q.trim() } : {}),
    ...(f.kind === "starred" ? { starred: true } : f.kind === "project" ? { project: f.v } : f.kind === "harness" ? { harness: f.v } : f.kind === "tag" ? { tag: f.v } : {}),
    ...(P.computer !== undefined ? { computer: P.computer } : {}),
    ...(P.ended ? { ended: P.ended } : {}),
  };
}

/** Asks the home (after a short pause while typing). */
function ask(now = false) {
  if (P.timer) clearTimeout(P.timer);
  const go = () => {
    P.timer = 0;
    P.asked = `p${++P.n}`;
    A.send({ t: "past", id: P.asked, query: queryOf() });
  };
  if (now) go();
  else P.timer = setTimeout(go, 120);
}

/** past_result and past_marked from the home (app.ts hands them here). */
export function onPastFrame(f: Extract<ServerFrame, { t: "past_result" } | { t: "past_marked" } | { t: "ongoing_result" } | { t: "outside_adopted" } | { t: "outside_hidden" }>) {
  if (f.t === "ongoing_result") return void ((P.og = f.items), A.changed());
  // D299: a session from outside Ducter became a task: it opens (or why it couldn't).
  if (f.t === "outside_adopted") {
    const mine = P.adopting === `${f.agent}:${f.id}`;
    P.adopting = mine ? "" : P.adopting;
    if (!f.ok || !f.taskId) return void (mine && A.toast(f.message || t("past.out.failed")), A.changed());
    if (mine) {
      close();
      A.go({ name: "task", id: f.taskId });
    }
    return void ask(true);
  }
  if (f.t === "outside_hidden") return void ask(true);
  if (f.t === "past_result") {
    if (f.id !== P.asked) return;
    P.res = f;
    if (P.focus && !f.items.some((i) => i.taskId === P.focus)) P.focus = "";
    return A.changed();
  }
  const it = P.res?.items.find((i) => i.taskId === f.taskId);
  if (it) {
    const own = it.original ?? it.title;
    if (f.mark) it.mark = f.mark;
    else delete it.mark;
    it.title = f.mark?.name ?? own;
    if (f.mark?.name && f.mark.name !== own) it.original = own;
    else delete it.original;
  }
  const task = A.S.tasks.get(f.taskId);
  if (task?.card) {
    if (f.mark) task.card.mark = f.mark;
    else delete task.card.mark;
  }
  A.changed();
}

function mark(id: string, patch: PastMarkPatch) {
  A.send({ t: "past_mark", taskId: id, patch });
  // Shown at once; the home's past_marked settles it.
  const it = P.res?.items.find((i) => i.taskId === id);
  if (it) {
    const m = { ...(it.mark ?? {}), at: new Date().toISOString() } as NonNullable<PastItem["mark"]>;
    if (patch.starred !== undefined) patch.starred ? (m.starred = true) : delete m.starred;
    if (patch.tags !== undefined) m.tags = patch.tags;
    if (patch.glyph !== undefined) patch.glyph ? (m.glyph = patch.glyph) : delete m.glyph;
    if (patch.tint !== undefined) patch.tint ? (m.tint = patch.tint) : delete m.tint;
    if (patch.name !== undefined) patch.name ? (m.name = patch.name) : delete m.name;
    it.mark = m;
  }
  A.changed();
}

function star(it: PastItem) {
  const on = !it.mark?.starred;
  if (on) P.popped = it.taskId;
  mark(it.taskId, { starred: on });
}

function close() {
  A.sheet = null;
  P.markFor = P.moreFor = "";
  A.changed();
}

function open(it: PastItem) {
  close();
  A.go({ name: "task", id: it.taskId });
}

function carryOn(it: PastItem, harness?: string) {
  // D651 (research/246): what another app had is read only: Open, never Continue.
  if (it.imported || (ACTIVE.has(it.attention) && !harness)) return open(it);
  A.send({ t: "past_continue", taskId: it.taskId, ...(harness ? { harness } : {}) });
  A.toast(t("past.continued", it.title));
  open(it);
}

function seedFrom(it: PastItem) {
  close();
  const task = A.S.tasks.get(it.taskId);
  const place = task?.open?.place ?? task?.card?.place;
  A.openNewTask(place);
  A.nt.from = { taskId: it.taskId, title: it.title };
  A.changed();
}

// ---------- the pictures: literal kinds of work, drawn (D211: never emoji) ----------

const G: Record<PastGlyph, string> = {
  fix: "M7 8.5a3 3 0 0 1 6 0V12a3 3 0 0 1-6 0zM10 5.5V4M7 10H4.5M13 10h2.5M7.2 13.4 5 15M12.8 13.4 15 15M7.6 6.6 6 5M12.4 6.6 14 5",
  build: "M4 15.5h12M5.5 15.5V11h4v4.5M10.5 15.5V8h4v7.5M8 11V7.5h3.5",
  look: "M8.8 13.6a4.8 4.8 0 1 0 0-9.6 4.8 4.8 0 0 0 0 9.6zM12.3 12.3 16 16",
  review: "M5 4.5h7.5L15 7v8.5H5zM7.5 10.5l1.8 1.8L12.8 9",
  write: "M4.5 15.5l1-3.5 7.6-7.6a1.6 1.6 0 0 1 2.3 2.3L7.8 14.3zM11.8 5.7l2.4 2.4",
  ship: "M4 7.5 10 4.5l6 3v6L10 16.5 4 13.5zM4 7.5l6 3 6-3M10 10.5v6",
  data: "M4.5 15.5h11M6 15.5V11M9 15.5V7M12 15.5V9.5M15 15.5V5.5",
  talk: "M4.5 5.5h11v7h-6l-3.5 3v-3H4.5z",
  errand: "M5 7.5h10l-.8 8H5.8zM7.5 7.5V6.3a2.5 2.5 0 0 1 5 0v1.2",
  idea: "M10 3.8a4.4 4.4 0 0 0-2.6 8c.5.4.8 1 .8 1.6v.4h3.6v-.4c0-.6.3-1.2.8-1.6a4.4 4.4 0 0 0-2.6-8zM8.4 16.2h3.2",
};

export function Glyph({ g, size = 20 }: { g: PastGlyph; size?: number }) {
  return (
    <svg class="pg" width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <path d={G[g] ?? G.build} fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

export function Pebble({ it, size = 36 }: { it: Pick<PastItem, "kind" | "mark">; size?: number }) {
  const own = !!it.mark?.glyph;
  const g = it.mark?.glyph ?? it.kind;
  return (
    <span class={`pebble${own ? ` own tint-${it.mark?.tint ?? "clay"}` : " guess"}`} style={{ width: size, height: size }} aria-hidden="true">
      <Glyph g={g} size={Math.round(size * 0.56)} />
    </span>
  );
}

const StarMark = ({ on }: { on: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true">
    <path d="M10 3.2l2.1 4.3 4.7.7-3.4 3.3.8 4.7L10 14l-4.2 2.2.8-4.7L3.2 8.2l4.7-.7z" fill={on ? "currentColor" : "none"} stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
  </svg>
);

// ---------- dates ----------

const DAY = 24 * 3600_000;
const startOfDay = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const startOfWeek = (ms: number) => startOfDay(ms) - ((new Date(ms).getDay() + 6) % 7) * DAY;

/** The section a date falls in: today, yesterday, this week, last week, this month, then its month. */
export function groupOf(iso: string, now = Date.now()): { key: string; label: string } {
  const at = Date.parse(iso);
  const today = startOfDay(now);
  if (at >= today) return { key: "today", label: t("past.g.today") };
  if (at >= today - DAY) return { key: "yesterday", label: t("past.g.yesterday") };
  if (at >= startOfWeek(now)) return { key: "week", label: t("past.g.week") };
  if (at >= startOfWeek(now) - 7 * DAY) return { key: "lastweek", label: t("past.g.lastweek") };
  const d = new Date(at);
  const n = new Date(now);
  if (d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth()) return { key: "month", label: t("past.g.month") };
  const label = DATES[A.L.lang].month(d, d.getFullYear() !== n.getFullYear());
  return { key: `m${d.getFullYear()}-${d.getMonth()}`, label };
}

/** A card's date: a time today, a weekday this week, else the day of the month. */
export function dateOf(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  const f = DATES[A.L.lang];
  if (Date.parse(iso) >= startOfDay(now)) return d.toLocaleTimeString(f.intl, { hour: "2-digit", minute: "2-digit", hour12: false });
  if (Date.parse(iso) >= startOfWeek(now)) return d.toLocaleDateString(f.intl, { weekday: "short" });
  return f.day(d);
}

/** The range a search read, said and dated apart ("上周", 11月9日–11月15日; D291). */
function rangeLine(r: NonNullable<Result["range"]>): string[] {
  const a = new Date(r.since);
  const b = new Date(Date.parse(r.before) - 1);
  const f = DATES[A.L.lang].day;
  return [r.words, a.toDateString() === b.toDateString() ? f(a) : `${f(a)}–${f(b)}`];
}

// ---------- pieces ----------

/** The words in a line marked where the query's words are. */
export function Marked({ text, q }: { text: string; q: string }) {
  const words = q
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1);
  if (!words.length) return <>{text}</>;
  const lower = text.toLowerCase();
  const out: (string | preact.JSX.Element)[] = [];
  let i = 0;
  while (i < text.length) {
    let hit = -1;
    let len = 0;
    for (const w of words) {
      const j = lower.indexOf(w, i);
      if (j >= 0 && (hit < 0 || j < hit)) (hit = j), (len = w.length);
    }
    if (hit < 0) break;
    if (hit > i) out.push(text.slice(i, hit));
    out.push(<mark key={hit}>{text.slice(hit, hit + len)}</mark>);
    i = hit + len;
  }
  out.push(text.slice(i));
  return <>{out}</>;
}

function endWord(it: PastItem): string {
  // D651: Brought in is the end filter's word. On a card the app's name is the fact; the ending
  // is said there only when the app isn't known (the app pill would otherwise repeat it).
  if (it.imported) return it.imported.app ? "" : t("past.end.imported");
  if (ACTIVE.has(it.attention)) return t("past.end.active");
  if (it.attention === "failed") return t("past.end.failed");
  if (it.attention === "dropped") return t("past.end.dropped");
  if (it.attention === "superseded") return t("past.end.superseded");
  return "";
}

/** D391: a card's click: beside the list (wide) it is chosen for 停在哪儿; else its preview fills the screen. */
function choose(it: PastItem, wide: boolean) {
  P.focus = P.sel = it.taskId;
  if (!wide) PV.sheet = it.taskId;
  A.changed();
}

/** What the preview's buttons do for one card. */
export function actsFor(it: PastItem): PreviewActs {
  return { open: () => open(it), carryOn: (h) => carryOn(it, h), seed: () => seedFrom(it), dateOf: (iso) => dateOf(iso), active: ACTIVE.has(it.attention) };
}

function Card({ it, wide }: { it: PastItem; wide: boolean }) {
  const on = P.focus === it.taskId;
  const chosen = wide && P.sel === it.taskId;
  const marking = P.markFor === it.taskId;
  const more = P.moreFor === it.taskId;
  const active = ACTIVE.has(it.attention);
  const openOnly = active || !!it.imported;
  const end = endWord(it);
  const ch = it.changes;
  const meta = [it.project || t("past.other"), harnessName(it.harness), it.computer, dateOf(it.updatedAt)].filter(Boolean) as string[];
  const hitLabel = it.hit ? t(`past.hit.${it.hit.field === "name" ? "title" : it.hit.field}`) : "";
  return (
    <div
      class={`pcard${on ? " on" : ""}${chosen ? " picked" : ""}${marking || more ? " open" : ""}`}
      data-id={it.taskId}
      onMouseEnter={() => P.focus !== it.taskId && ((P.focus = it.taskId), A.changed())}
    >
      <button class="pmain" onClick={() => choose(it, wide)} onDblClick={() => open(it)} aria-label={it.title} aria-current={chosen || undefined}>
        <Pebble it={it} />
        <span class="pbody">
          <span class="pl1">
            <span class="pt">{it.title}</span>
            {it.mark?.starred && (
              <span class={`pstar on${P.popped === it.taskId ? " pop" : ""}`} onAnimationEnd={() => (P.popped = "")}>
                <StarMark on />
              </span>
            )}
            {(it.mark?.tags ?? []).map((g) => (
              <span class="ptag" key={g}>
                {g}
              </span>
            ))}
          </span>
          {it.hit ? (
            <span class="pl2 hit">
              <b>{hitLabel}</b>
              <span>
                <Marked text={it.hit.text} q={P.q} />
              </span>
            </span>
          ) : (
            it.outcome && <span class="pl2">{it.outcome}</span>
          )}
          <span class="pl3">
            <Facts items={meta} />
            {ch && (ch.adds || ch.dels) ? (
              <span class="pdiff">
                <span class="add">+{ch.adds}</span> <span class="del">−{ch.dels}</span>
              </span>
            ) : null}
            {it.integrated && <span class="pint">{t(it.integrated.act === "merge" ? "onhand.pr.merged" : "onhand.pr.draft")}</span>}
            {it.outside && <span class="pint">{t("past.out.from", harnessName(it.outside.agent))}</span>}
            {it.imported?.app && <span class="pint">{t("past.imp.from", it.imported.app)}</span>}
            {it.imported?.gone && <span class="pint">{t("past.out.gone")}</span>}
            {it.from?.step && <span class="pfrom">{t("past.from.step", it.from.title, it.from.step)}</span>}
            {end && <span class={`pend${active ? " live" : ""}`}>{end}</span>}
          </span>
        </span>
      </button>
      <span class="pacts">
        <button class={`pstar-btn${it.mark?.starred ? " on" : ""}`} aria-pressed={!!it.mark?.starred} aria-label={t(it.mark?.starred ? "past.unstar" : "past.star")} title={t(it.mark?.starred ? "past.unstar" : "past.star")} onClick={() => star(it)}>
          <StarMark on={!!it.mark?.starred} />
        </button>
        <Btn kind="secondary" size="sm" label={t(openOnly ? "past.open" : "past.continue")} onClick={() => carryOn(it)} />
        <button class={`more-btn${more ? " open" : ""}`} aria-label={t("past.mark")} aria-expanded={more} onClick={() => ((P.moreFor = more ? "" : it.taskId), (P.markFor = ""), A.changed())}>
          ⋯
        </button>
      </span>
      {more && <More it={it} />}
      {marking && <MarkSheet it={it} />}
    </div>
  );
}

function More({ it }: { it: PastItem }) {
  const [others, setOthers] = useState(false);
  const harnesses = ["claude-code", "codex", "pi", "deepseek-harness", "antigravity", "cursor", "devin", "kimi", "opencode", "dim"].filter((h) => h !== it.harness);
  const shut = () => ((P.moreFor = ""), A.changed());
  return (
    <Menu class="pmenu" onClose={shut}>
      <MenuItem onClick={() => (shut(), seedFrom(it))}>
        {t("past.seed")}
      </MenuItem>
      {!it.imported && (
        <MenuItem onClick={() => (shut(), startRedo(it))}>
          {t("pv.redo.any")}
        </MenuItem>
      )}
      {!it.imported && (
        <MenuItem expanded={others} onClick={() => setOthers(!others)}>
          {t("past.other.agent")}
        </MenuItem>
      )}
      {!it.imported &&
        others &&
        harnesses.map((h) => (
          <MenuItem class="sub" key={h} onClick={() => (shut(), carryOn(it, h))}>
            {t("past.with", harnessName(h))}
          </MenuItem>
        ))}
      <MenuSep />
      <MenuItem onClick={() => ((P.moreFor = ""), (P.markFor = it.taskId), A.changed())}>
        {t("past.mark")}
      </MenuItem>
    </Menu>
  );
}

/** 标记 / Mark: its name, the star, a few tags, a picture on a tint. */
function MarkSheet({ it }: { it: PastItem }) {
  const [name, setName] = useState(it.mark?.name ?? "");
  const [tag, setTag] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const tags = it.mark?.tags ?? [];
  const sugg = (P.res?.suggestions ?? []).filter((s) => !tags.includes(s) && (!tag.trim() || s.includes(tag.trim().toLowerCase()))).slice(0, 6);
  const addTag = (raw: string) => {
    const v = raw.trim().replace(/^#/, "").toLowerCase();
    if (!v || tags.includes(v) || tags.length >= PAST_TAGS_MAX) return;
    mark(it.taskId, { tags: [...tags, v] });
    setTag("");
  };
  const keepName = () => {
    const v = name.trim();
    if (v !== (it.mark?.name ?? "")) mark(it.taskId, { name: v || null });
  };
  const done = () => (keepName(), (P.markFor = ""), A.changed());
  return (
    <div class="pmark" role="dialog" aria-label={t("past.mark")} onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), done())}>
      <label class="pm-row">
        <span class="pm-k">{t("past.rename")}</span>
        <input ref={ref} value={name} placeholder={it.original ?? it.title} aria-label={t("past.rename")} onInput={(e) => setName(e.currentTarget.value)} onBlur={keepName} onKeyDown={(e) => e.key === "Enter" && !e.isComposing && (e.preventDefault(), keepName())} />
      </label>
      <div class="pm-row">
        <span class="pm-k">{t("past.tags")}</span>
        <div class="pm-tags">
          {tags.map((g) => (
            <span class="ptag big drop" key={g}>
              {g}
              <button aria-label={t("past.tag.remove", g)} onClick={() => mark(it.taskId, { tags: tags.filter((x) => x !== g) })}>
                ×
              </button>
            </span>
          ))}
          {tags.length < PAST_TAGS_MAX && (
            <input
              class="pm-tag-in"
              value={tag}
              placeholder={t("past.tag.add")}
              aria-label={t("past.tag.add")}
              onInput={(e) => setTag(e.currentTarget.value)}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === ",") && !e.isComposing) e.preventDefault(), addTag(tag);
                else if (e.key === "Backspace" && !tag && tags.length) mark(it.taskId, { tags: tags.slice(0, -1) });
              }}
            />
          )}
        </div>
      </div>
      {sugg.length > 0 && tags.length < PAST_TAGS_MAX && (
        <div class="pm-sugg">
          {sugg.map((s) => (
            <button class="ptag add" key={s} onClick={() => addTag(s)}>
              + {s}
            </button>
          ))}
        </div>
      )}
      <div class="pm-row top">
        <span class="pm-k">{t("past.glyph")}</span>
        <div class="pm-pics">
          <div class="pm-glyphs" role="radiogroup" aria-label={t("past.glyph")}>
            {PAST_GLYPHS.map((g) => (
              <button key={g} role="radio" aria-checked={it.mark?.glyph === g} title={t(`past.g.${g}`)} aria-label={t(`past.g.${g}`)} class={`pm-g${it.mark?.glyph === g ? " on" : ""}`} onClick={() => mark(it.taskId, { glyph: g, ...(it.mark?.tint ? {} : { tint: "clay" as PastTint }) })}>
                <Pebble it={{ kind: g, mark: { glyph: g, tint: it.mark?.tint ?? "clay", at: "" } }} size={34} />
              </button>
            ))}
          </div>
          <div class="pm-tints" role="radiogroup" aria-label={t("past.glyph")}>
            {PAST_TINTS.map((c) => (
              <button key={c} role="radio" aria-checked={(it.mark?.tint ?? "") === c} title={t(`past.t.${c}`)} aria-label={t(`past.t.${c}`)} class={`pm-t tint-${c}${it.mark?.tint === c ? " on" : ""}`} onClick={() => mark(it.taskId, { tint: c, ...(it.mark?.glyph ? {} : { glyph: it.kind }) })} />
            ))}
            {it.mark?.glyph && (
              <button class="pm-none" onClick={() => mark(it.taskId, { glyph: null, tint: null })}>
                {t("past.glyph.none")}
              </button>
            )}
          </div>
        </div>
      </div>
      <div class="pm-foot">
        <button class={`pstar-btn wide${it.mark?.starred ? " on" : ""}`} aria-pressed={!!it.mark?.starred} onClick={() => star(it)}>
          <StarMark on={!!it.mark?.starred} />
          <span>{t(it.mark?.starred ? "past.unstar" : "past.star")}</span>
        </button>
        <Btn kind="primary" size="sm" label={t("past.done")} onClick={done} />
      </div>
    </div>
  );
}

function Chips() {
  const r = P.res;
  const f = P.filter;
  const chips: { key: string; label: string; f: Filter }[] = [{ key: "all", label: t("past.all"), f: { kind: "all" } }, { key: "starred", label: t("past.starred"), f: { kind: "starred" } }];
  for (const p of (r?.facets.projects ?? []).slice(0, 6)) chips.push({ key: `p:${p.name}`, label: p.name || t("past.other"), f: { kind: "project", v: p.name } });
  if ((r?.facets.harnesses.length ?? 0) > 1) for (const h of r!.facets.harnesses) if (h.harness) chips.push({ key: `h:${h.harness}`, label: harnessName(h.harness), f: { kind: "harness", v: h.harness } });
  for (const g of (r?.facets.tags ?? []).slice(0, 8)) chips.push({ key: `t:${g.tag}`, label: `#${g.tag}`, f: { kind: "tag", v: g.tag } });
  const keyOf = (x: Filter) => (x.kind === "all" || x.kind === "starred" ? x.kind : `${x.kind[0]}:${x.v}`);
  const cur = keyOf(f);
  const all = cur === "all" && P.computer === undefined && !P.ended;
  return (
    <div class="pchips" role="group">
      {chips.map((c) => {
        const on = c.key === "all" ? all : cur === c.key;
        const pick = () => {
          if (c.key === "all") (P.filter = { kind: "all" }), (P.computer = undefined), (P.ended = undefined);
          else P.filter = cur === c.key ? { kind: "all" } : c.f;
          ask(true);
          A.changed();
        };
        return (
          <button key={c.key} aria-pressed={on} class={`pchip${on ? " on" : ""}`} onClick={pick}>
            {c.key === "starred" && <StarMark on={on} />}
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

/** D391: the computer it ran on (from two) and how it ended: a row of their own under the filters,
 *  each a toggle that holds beside the one above. */
function Narrow() {
  const computers = P.res?.facets.computers ?? [];
  const home = A.homeName || t("past.c.home");
  const endings: NonNullable<PastQuery["ended"]>[] = ["done", "failed", "cancelled", "on_hand", "imported"];
  return (
    <div class="pchips narrow" role="group">
      {computers.length > 1 &&
        computers.map((c) => (
          <button key={`c:${c.name}`} aria-pressed={P.computer === c.name} class={`pchip where${P.computer === c.name ? " on" : ""}`} onClick={() => ((P.computer = P.computer === c.name ? undefined : c.name), ask(true), A.changed())}>
            <ComputerMark />
            {c.name || home}
          </button>
        ))}
      {computers.length > 1 && <span class="pchip-gap" aria-hidden="true" />}
      {endings.map((e) => (
        <button key={`e:${e}`} aria-pressed={P.ended === e} class={`pchip end-${e}${P.ended === e ? " on" : ""}`} onClick={() => ((P.ended = P.ended === e ? undefined : e), ask(true), A.changed())}>
          {t(`past.e.${e}`)}
        </button>
      ))}
    </div>
  );
}

const ComputerMark = () => (
  <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true">
    <path d="M3.5 5.5h13v8h-13zM7.5 16.5h5M10 13.5v3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);

/** The list as drawn: starred first, then by when, while browsing; one ranked list with words. */
function sections(items: PastItem[]): { key: string; label: string; items: PastItem[] }[] {
  if (P.q.trim() || P.computer !== undefined || P.ended) return [{ key: "found", label: t("past.n", P.res?.total ?? items.length), items }];
  const out: { key: string; label: string; items: PastItem[] }[] = [];
  const starred = P.filter.kind === "all" ? items.filter((i) => i.mark?.starred) : [];
  if (starred.length) out.push({ key: "starred", label: t("past.starred"), items: starred });
  for (const it of items) {
    if (starred.includes(it)) continue;
    const g = groupOf(it.updatedAt);
    const last = out.at(-1);
    if (last?.key === g.key) last.items.push(it);
    else out.push({ ...g, items: [it] });
  }
  return out;
}

export function PastSheet() {
  const ref = useRef<HTMLInputElement>(null);
  const wide = useRoomy(ROOMY) && !coarsePointer();
  useEffect(() => ref.current?.focus(), []);
  const items = P.res?.items ?? [];
  const secs = sections(items);
  const order = secs.flatMap((s) => s.items);
  const at = order.findIndex((i) => i.taskId === P.focus);
  // D391: beside the list, the chosen card's 停在哪儿; none chosen yet, the first one drawn.
  const pv = wide ? chosenOf(order) : undefined;
  if (pv && P.sel !== pv.taskId) P.sel = pv.taskId;
  const walk = (by: number) => {
    if (!order.length) return;
    const n = at < 0 ? (by > 0 ? 0 : order.length - 1) : Math.max(0, Math.min(order.length - 1, at + by));
    P.focus = order[n]!.taskId;
    if (wide) P.sel = P.focus;
    A.changed();
    requestAnimationFrame(() => document.querySelector(`.pcard[data-id="${CSS.escape(P.focus)}"]`)?.scrollIntoView({ block: "nearest" }));
  };
  const keys = (e: KeyboardEvent) => {
    const inField = (e.target as HTMLElement)?.tagName === "INPUT";
    const cur = at >= 0 ? order[at] : undefined;
    if (P.markFor || PV.redo) return;
    if (PV.sheet && e.key === "Escape") return e.preventDefault(), e.stopPropagation(), (PV.sheet = ""), A.changed();
    // D383: on Made for you, Esc and / only (its cards are buttons, walked by Tab).
    if (P.tab === "made" && e.key !== "Escape" && e.key !== "/") return;
    if (e.key === "Escape") {
      e.preventDefault(), e.stopPropagation();
      if (P.moreFor) return void ((P.moreFor = ""), A.changed());
      if (P.q) return void ((P.q = ""), ask(true), askMade("", true), A.changed());
      return close();
    }
    if (e.key === "ArrowDown" || (!inField && e.key === "j")) return e.preventDefault(), walk(1);
    if (e.key === "ArrowUp" || (!inField && e.key === "k")) return e.preventDefault(), walk(-1);
    if (e.key === "/" && !inField) return e.preventDefault(), ref.current?.focus();
    if (!cur) return;
    // D391: Space or → looks at where it stopped (beside the list, or filling the screen).
    if (!inField && (e.key === " " || e.key === "ArrowRight")) {
      e.preventDefault();
      if (!wide) return choose(cur, false);
      P.sel = cur.taskId;
      A.changed();
      return requestAnimationFrame(() => (document.querySelector(".past-sheet .pv .pv-foot .btn") as HTMLElement | null)?.focus());
    }
    if (e.key === "Enter" && !e.isComposing) {
      e.preventDefault();
      if (e.altKey) return startRedo(cur);
      if (e.metaKey && e.shiftKey) return seedFrom(cur);
      if (e.metaKey || e.ctrlKey) return carryOn(cur);
      return open(cur);
    }
    if (!inField && e.key === "s") return e.preventDefault(), star(cur);
    if (!inField && e.key === "r") return e.preventDefault(), (P.markFor = cur.taskId), A.changed();
  };
  const searching = !!P.q.trim();
  const loading = !P.res;
  const ongoing = P.tab === "ongoing";
  const made = P.tab === "made";
  return (
    <>
      <div class="scrim" onClick={close} />
      <div class={`past-sheet${wide && P.tab === "past" ? " with-pv" : ""}`} role="dialog" aria-modal="true" aria-label={t("past.title")} onKeyDown={keys}>
        <div class="past-head">
          <h2>{t(ongoing ? "og.tab" : made ? "made.tab" : "past.title")}</h2>
          <button class="past-x" aria-label={t("nav.back")} onClick={close}>
            ×
          </button>
        </div>
        <div class="past-tabs" role="tablist">
          {(["past", "made", "ongoing"] as const).map((k) => (
            <button key={k} role="tab" aria-selected={P.tab === k} class={`pchip${P.tab === k ? " on" : ""}`} onClick={() => ((P.tab = k), k === "ongoing" && A.send({ t: "ongoing", id: "og" }), k === "made" && askMade(P.q, true), A.changed())}>
              {t(k === "past" ? "past.tab" : k === "made" ? "made.tab" : "og.tab")}
              {k === "ongoing" && (P.og?.length ?? 0) > 0 && <span class="ptab-n">{P.og!.length}</span>}
            </button>
          ))}
        </div>
        {ongoing ? (
          <OngoingList />
        ) : made ? (
          <MadeTab
            q={P.q}
            group={(iso) => groupOf(iso)}
            dateOf={(iso) => dateOf(iso)}
            close={close}
            mark={(text, q) => <Marked text={text} q={q} />}
            field={
              <>
                <label class="past-find">
                  <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
                    <path d={G.look} fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
                  </svg>
                  <input ref={ref} value={P.q} placeholder={t("made.find")} aria-label={t("made.find")} autocomplete="off" spellcheck={false} onInput={(e) => ((P.q = e.currentTarget.value), askMade(P.q), ask(), A.changed())} />
                </label>
                {M.res?.range && <Facts class="past-range" items={rangeLine(M.res.range)} />}
              </>
            }
          />
        ) : (
          <>
        <label class="past-find">
          <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
            <path d={G.look} fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
          </svg>
          <input ref={ref} value={P.q} placeholder={t("past.find")} aria-label={t("past.find")} autocomplete="off" spellcheck={false} onInput={(e) => ((P.q = e.currentTarget.value), (P.focus = ""), ask(), askMade(P.q), A.changed())} />
        </label>
        {P.res?.range && <Facts class="past-range" items={rangeLine(P.res.range)} />}
        <Chips />
        <Narrow />
        <div class="past-body">
        <div class="past-list">
          {!loading && !items.length && !P.res?.outside?.length && <p class="past-none">{searching || P.filter.kind !== "all" ? t("past.none") : t("past.empty")}</p>}
          {secs.map((s) => (
            <section key={s.key} class="past-sec">
              <h3>{s.label}</h3>
              {s.items.map((it) => (
                <Card key={it.taskId} it={it} wide={wide} />
              ))}
            </section>
          ))}
          <OutsideSection />
        </div>
        {wide && <Preview it={pv} acts={pv && actsFor(pv)} />}
        </div>
        {!wide && PV.sheet && <PhonePreview items={items} />}
          </>
        )}
      </div>
    </>
  );
}

/** The card beside the list: the one chosen, else the first. */
function chosenOf(items: PastItem[]): PastItem | undefined {
  return items.find((i) => i.taskId === P.sel) ?? items[0];
}

const coarsePointer = () => typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

/** D391: on a phone (and narrow), where it stopped fills the screen; back goes to the list. */
function PhonePreview({ items }: { items: PastItem[] }) {
  const it = items.find((i) => i.taskId === PV.sheet);
  if (!it) return null;
  return (
    <div class="pv-sheet" role="dialog" aria-label={t("pv.title")}>
      <div class="pv-sheet-head">
        <button class="pv-back" aria-label={t("nav.back")} onClick={() => ((PV.sheet = ""), A.changed())}>
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M12.5 4.5 7 10l5.5 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <span>{t("past.title")}</span>
        </button>
      </div>
      <Preview it={it} acts={actsFor(it)} />
    </div>
  );
}

// ---------- D299: 也在这台电脑上 / Also on this computer ----------

const outKey = (it: OutsideItem) => `out:${it.agent}:${it.id}`;

/** 接着做: the same agent resumes that very session in a new task (or another agent takes it over there). */
function carryOut(it: OutsideItem, harness?: string) {
  if (it.gone) return void A.toast(t("past.out.gone.why", it.cwd));
  P.adopting = `${it.agent}:${it.id}`;
  A.send({ t: "outside_continue", agent: it.agent, id: it.id, ...(harness && harness !== it.agent ? { harness } : {}) });
  A.toast(t("past.out.continued", it.title));
  A.changed();
}

function hideAgent(agent: OutsideAgent, hidden: boolean) {
  A.send({ t: "outside_hide", agent, hidden });
  if (P.res) {
    if (hidden) P.res.outside = (P.res.outside ?? []).filter((x) => x.agent !== agent);
    P.res.sources = (P.res.sources ?? []).map((s) => (s.agent === agent ? { ...s, hidden } : s));
  }
  P.moreFor = "";
  A.changed();
}

/** D327: 这个文件夹别看了: its sessions go from here and from the first words' offers, for good. */
function leaveFolder(path: string) {
  A.send({ t: "outside_folder", path, hidden: true });
  const inside = (p: string) => p === path || p.startsWith(`${path}/`);
  if (P.res) P.res.outside = (P.res.outside ?? []).filter((x) => !inside(x.cwd));
  if (A.S.first) A.S.first.outsideFolders = [...(A.S.first.outsideFolders ?? []), path];
  P.moreFor = "";
  A.toast(t("past.out.left", path));
  A.changed();
}

/** One session from outside Ducter: the same card as a task's, its picture guessed from its words. */
function OutsideCard({ it }: { it: OutsideItem }) {
  const key = outKey(it);
  const on = P.focus === key;
  const more = P.moreFor === key;
  const busy = P.adopting === `${it.agent}:${it.id}`;
  const hitLabel = it.hit ? t(`past.hit.${it.hit.field}`) : "";
  const others = ["claude-code", "codex", "pi", "deepseek-harness", "antigravity", "cursor", "devin", "kimi", "opencode", "dim"].filter((h) => h !== it.agent);
  return (
    <div class={`pcard out${on ? " on" : ""}${more ? " open" : ""}${it.gone ? " gone" : ""}`} data-id={key} onMouseEnter={() => P.focus !== key && ((P.focus = key), A.changed())}>
      <button class="pmain" onClick={() => carryOut(it)} aria-label={it.title} disabled={busy}>
        <Pebble it={{ kind: it.kind }} />
        <span class="pbody">
          <span class="pl1">
            <span class="pt">{it.title}</span>
          </span>
          {it.hit ? (
            <span class="pl2 hit">
              <b>{hitLabel}</b>
              <span>
                <Marked text={it.hit.text} q={P.q} />
              </span>
            </span>
          ) : (
            it.ask && <span class="pl2">{it.ask}</span>
          )}
          <span class="pl3 pmeta">
            <span>{it.project}</span>
            <span>{harnessName(it.agent)}</span>
            {it.branch && <span class="pbr">{it.branch}</span>}
            <span>{dateOf(it.updatedAt)}</span>
            {it.gone && <span class="pend">{t("past.out.gone")}</span>}
          </span>
        </span>
      </button>
      <span class="pacts">
        <Btn kind="secondary" size="sm" label={t(busy ? "past.out.opening" : "past.continue")} disabled={busy || !!it.gone} onClick={() => carryOut(it)} />
        <button class={`more-btn${more ? " open" : ""}`} aria-label={t("past.out.more")} aria-expanded={more} onClick={() => ((P.moreFor = more ? "" : key), A.changed())}>
          ⋯
        </button>
      </span>
      {more && (
        <Menu class="pmenu" onClose={() => ((P.moreFor = ""), A.changed())}>
          {!it.gone && <MenuHead>{t("past.other.agent")}</MenuHead>}
          {!it.gone &&
            others.map((h) => (
              <MenuItem class="sub" key={h} onClick={() => ((P.moreFor = ""), carryOut(it, h))}>
                {t("past.with", harnessName(h))}
              </MenuItem>
            ))}
          {!it.gone && <MenuSep />}
          <MenuItem onClick={() => hideAgent(it.agent, true)}>
            {t("past.out.hide", harnessName(it.agent))}
          </MenuItem>
          <MenuItem onClick={() => leaveFolder(it.cwd)}>
            {t("past.out.leave")}
          </MenuItem>
        </Menu>
      )}
    </div>
  );
}

/** The quiet section under Ducter's own: sessions the person ran in their own agents here. */
function OutsideSection() {
  // The offer's source: asked once this sheet is up, so a frame that arrives changes the section.
  useEffect(() => {
    if (A.S.welcomed) A.send({ t: "imports" });
  }, [A.S.welcomed]);
  const items = P.res?.outside ?? [];
  const hidden = (P.res?.sources ?? []).filter((s) => s.hidden);
  const offer = importOffer();
  if (!items.length && !hidden.length && !offer) return null;
  return (
    <section class="past-sec outside" aria-label={t("past.out.title")}>
      <h3>
        <span>{t("past.out.title")}</span>
        {items.length > 0 && <span class="psec-n">{items.length}</span>}
      </h3>
      {items.length > 0 && <p class="past-out-sub">{t("past.out.sub", A.S.first?.computer ?? t("first.here"))}</p>}
      <ImportOfferLine />
      {items.map((it) => (
        <OutsideCard key={outKey(it)} it={it} />
      ))}
      {hidden.length > 0 && (
        <p class="past-out-hidden">
          <span>{t("past.out.hidden", hidden.map((h) => harnessName(h.agent)).join(t("past.out.sep")))}</span>
          {hidden.map((h) => (
            <button key={h.agent} class="linkish" onClick={() => hideAgent(h.agent, false)}>
              {hidden.length > 1 ? t("past.out.show.one", harnessName(h.agent)) : t("past.out.show")}
            </button>
          ))}
        </p>
      )}
    </section>
  );
}

// ---------- D285: 一直在跑的 / Ongoing ----------

const RANK: Record<OngoingItem["state"], number> = { needs_you: 0, running: 1, resting: 2, proposed: 3, paused: 4 };

function og(it: OngoingItem, a: OngoingAction) {
  A.send({ t: "ongoing_action", kind: it.kind, id: it.id, ...a });
  P.ogMenu = P.ogPause = P.ogEdit = P.ogRhythm = "";
  // The card settles (pause) or lifts (resume) at once; the home's ongoing_result follows.
  if (a.action === "pause") (it.state = "paused"), (P.settling = it.id), a.until ? (it.pausedUntil = a.until) : delete it.pausedUntil, delete it.nextAt;
  if (a.action === "resume") (it.state = "resting"), (P.settling = ""), delete it.pausedUntil;
  A.changed();
}

/** A time in a card's words: 21:40 today, 周三 09:00 this week, else 11月20日 09:00. */
function soon(iso: string): string {
  const d = new Date(iso);
  const f = DATES[A.L.lang];
  const hm = d.toLocaleTimeString(f.intl, { hour: "2-digit", minute: "2-digit", hour12: false });
  const now = Date.now();
  if (Date.parse(iso) < startOfDay(now) + DAY) return hm;
  if (Date.parse(iso) < startOfDay(now) + 2 * DAY) return `${f.tomorrow} ${hm}`;
  if (Date.parse(iso) < startOfDay(now) + 6 * DAY) return `${d.toLocaleDateString(f.intl, { weekday: "short" })} ${hm}`;
  return `${f.day(d)} ${hm}`;
}

/** D533: a rhythm as people say it: 每 45 分钟, 每小时, 每 2 小时, 每天 (never 每 1 小时); every hour, every 2 hours.
 *  For how long something took or is late, interval() says the span. */
export function rhythm(ms: number): string {
  const m = Math.max(1, Math.round(ms / 60_000));
  if (m % 1440 === 0) return m === 1440 ? A.L.t("every.day") : A.L.t("every.days", m / 1440);
  if (m % 60 === 0) return m === 60 ? A.L.t("every.hour") : A.L.t("every.hours", m / 60);
  return A.L.t("every.min", m);
}

export function interval(ms: number): string {
  const m = Math.round(ms / 60_000);
  const f = DATES[A.L.lang];
  if (m < 60) return f.min(m);
  const h = Math.round(m / 60);
  return f.hours(h);
}

/** How Past and Ongoing write dates and spans, per language (D292). */
const DATES: Record<TableLang, { intl: string; month(d: Date, year: boolean): string; day(d: Date): string; tomorrow: string; min(m: number): string; hours(h: number): string }> = {
  zh: {
    intl: "zh-CN",
    month: (d, year) => `${year ? `${d.getFullYear()} 年 ` : ""}${d.getMonth() + 1} 月`,
    day: (d) => `${d.getMonth() + 1}月${d.getDate()}日`,
    tomorrow: "明天",
    min: (m) => `${m} 分钟`,
    hours: (h) => `${h} 小时`,
  },
  en: {
    intl: "en",
    month: (d, year) => d.toLocaleDateString("en", { month: "long", ...(year ? { year: "numeric" } : {}) }),
    day: (d) => d.toLocaleDateString("en", { month: "short", day: "numeric" }),
    tomorrow: "tomorrow",
    min: (m) => `${m} min`,
    hours: (h) => `${h} h`,
  },
};

/** An ongoing thing's line: its state, else how often it runs and when next, each its own fact (D291). */
function stateLine(it: OngoingItem): string[] {
  if (it.state === "paused") {
    if (it.pausedBy === "system" && it.pauseWhy) return [t(`routine.paused.${it.pauseWhy}`)];
    return [it.pausedUntil ? t("og.paused.until", soon(it.pausedUntil)) : t("og.paused")];
  }
  if (it.state === "running") return [t("og.s.running")];
  if (it.state === "needs_you") return [t("og.s.needs_you")];
  if (it.state === "proposed") return [t("og.s.proposed")];
  const how = it.kind === "routine" ? (it.cadence ?? "") : it.everyMs ? t(it.loop ? "og.round.every" : "og.every", rhythm(it.everyMs)) : "";
  return [how, it.nextAt ? t("og.next", soon(it.nextAt)) : ""].filter(Boolean);
}

/** D427: when it isn't keeping its time: how late or how many failed, and why, each its own fact. On time says nothing. */
export function healthLine(h: NonNullable<OngoingItem["health"]>): string[] {
  if (h.state === "back") return [t("og.h.back", h.since ? ago(h.since) : "")];
  const why =
    h.why === "asleep" ? (h.detail ? t("og.h.asleep", h.detail) : t("og.h.asleep.any"))
    : h.why === "quota" ? (h.resetsAt ? t("og.h.quota", soon(h.resetsAt)) : t("og.h.quota.any"))
    : h.why === "signin" ? t("og.h.signin")
    : h.why === "stuck" ? t("og.h.stuck")
    : h.why === "lost" ? t("og.h.lost")
    : h.detail ?? "";
  // Its why is the last round's line, right under it.
  if (h.state === "failing") return [t("og.h.failing", h.fails ?? 3)];
  // D429: another computer awake to take it: said as its own fact, beside the button that moves it.
  return [h.lateMin && h.why !== "quota" ? t("og.h.late", interval(h.lateMin * 60_000)) : "", why, h.fix === "move" && h.moveTo ? t("og.h.awake", h.moveTo.name) : ""].filter(Boolean);
}

/** D427: the last run or round, when, and its one line. */
function lastLine(it: OngoingItem): string[] {
  const l = it.last;
  if (!l || it.state === "running") return [];
  return [t(it.kind === "routine" ? "og.last.run" : "og.last", ago(l.at)), l.line ?? t(`og.run.${l.state}`)];
}

/** D427: the rhythms a task in rounds can take, in minutes. */
const RHYTHMS = [15, 30, 45, 60, 120, 240];

/** A time behind: the clock today, else the day with it. */
function ago(iso: string): string {
  const d = new Date(iso);
  const f = DATES[A.L.lang];
  const hm = d.toLocaleTimeString(f.intl, { hour: "2-digit", minute: "2-digit", hour12: false });
  return Date.parse(iso) >= startOfDay(Date.now()) ? hm : `${f.day(d)} ${hm}`;
}

/** D394: a review task's standing after its last round, each its own fact (D291). */
export function reviewLine(r: NonNullable<OngoingItem["reviews"]>): string[] {
  const head =
    r.waiting === 0 ? t("og.rev.none")
    : r.waiting === 1 ? t(r.again ? "og.rev.one.again" : "og.rev.one.same")
    : r.again && r.same ? t("og.rev.mixed", r.waiting, r.again, r.same)
    : r.again ? t("og.rev.all", r.waiting)
    : t("og.rev.same", r.waiting);
  // D413: posted without asking this round, as the person said.
  const posted = r.posted ? (r.posted === 1 ? t("og.rev.posted.1") : t("og.rev.posted", r.posted)) : "";
  return [head, posted, r.drafted ? (r.drafted === 1 ? t("og.rev.drafted.1") : t("og.rev.drafted", r.drafted)) : ""].filter(Boolean);
}

export const RepeatGlyph = ({ task }: { task: boolean }) => (
  <svg class="pg" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
    {task ? (
      <path d="M10 16a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM10 7v3.2l2.2 1.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
    ) : (
      <path d="M5 9.5a5 5 0 0 1 8.6-3.4L15 7.5M15 4.5v3h-3M15 10.5a5 5 0 0 1-8.6 3.4L5 12.5M5 15.5v-3h3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
    )}
  </svg>
);

/** D427: the health line's small drawn mark: a clock running behind, a crack, or a pebble set back in place. */
const HealthGlyph = ({ state }: { state: NonNullable<OngoingItem["health"]>["state"] }) => (
  <svg class="og-hg" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    {state === "late" ? (
      <path d="M7 12.2A5.2 5.2 0 1 0 7 1.8a5.2 5.2 0 0 0 0 10.4zM7 4.3V7l2 1.3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
    ) : state === "failing" ? (
      <path d="M7 1.8 12.4 11.6H1.6L7 1.8zM7 5.6v2.6M7 10v.1" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
    ) : (
      <path d="M2.4 7.4a4.6 4.6 0 1 0 1.5-3.6M2.2 2.4v2.4h2.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
    )}
  </svg>
);

/** The runs, oldest first, each a small pebble with its outcome. */
function Runs({ runs }: { runs: OngoingRun[] }) {
  if (!runs.length) return null;
  return (
    <span class="og-runs" role="list" aria-label={t("og.runs", runs.length)}>
      {runs.map((r, i) => {
        const label = spoken(A.L, t(`og.run.${r.state}`), soon(r.at), r.line);
        return (
          <span
            key={i}
            role="listitem"
            class={`og-run ${r.state}${r.taskId ? " link" : ""}`}
            title={label}
            aria-label={label}
            onClick={(e) => {
              if (!r.taskId) return;
              e.stopPropagation();
              close();
              A.go({ name: "task", id: r.taskId });
            }}
          />
        );
      })}
    </span>
  );
}

function pauseUntil(k: "hour" | "morning" | "week"): string {
  const now = new Date();
  if (k === "hour") return new Date(now.getTime() + 3600_000).toISOString();
  if (k === "week") return new Date(now.getTime() + 7 * DAY).toISOString();
  const m = new Date(now);
  m.setDate(m.getDate() + 1);
  m.setHours(8, 0, 0, 0);
  return m.toISOString();
}

function Retime({ it }: { it: OngoingItem }) {
  const tr = it.trigger?.kind === "time" ? it.trigger : undefined;
  const [every, setEvery] = useState<"day" | "weekday" | "week" | "hours">(tr && ["day", "weekday", "week", "hours"].includes(tr.every) ? (tr.every as "day") : "day");
  const [time, setTime] = useState(tr?.time ?? "09:00");
  if (!tr) return null;
  return (
    <div class="og-edit">
      <div class="og-seg" role="radiogroup">
        {(["day", "weekday", "week", "hours"] as const).map((k) => (
          <button key={k} role="radio" aria-checked={every === k} class={`pchip${every === k ? " on" : ""}`} onClick={() => setEvery(k)}>
            {t(`og.e.${k}`)}
          </button>
        ))}
      </div>
      <input type="time" value={time} aria-label={t("og.retime")} onInput={(e) => setTime(e.currentTarget.value)} />
      <Btn kind="primary" size="sm" label={t("og.retime.save")} onClick={() => og(it, { action: "retime", trigger: { ...tr, every, time, ...(every === "week" && !tr.days?.length ? { days: [new Date().getDay()] } : {}), ...(every === "hours" && !tr.hours ? { hours: 4 } : {}) } })} />
    </div>
  );
}

function OgCard({ it }: { it: OngoingItem }) {
  const paused = it.state === "paused";
  const menu = P.ogMenu === it.id;
  const pausing = P.ogPause === it.id;
  const editing = P.ogEdit === it.id;
  const openTask = it.taskId ?? [...it.runs].reverse().find((r) => r.taskId)?.taskId;
  return (
    <div class={`pcard og ${it.state}${menu || pausing || editing ? " open" : ""}${P.settling === it.id ? " settle" : ""}`}>
      <button class="pmain" onClick={() => openTask && (close(), A.go({ name: "task", id: openTask }))} aria-label={it.title}>
        {it.mark?.glyph ? (
          <Pebble it={{ kind: it.mark.glyph, mark: it.mark }} />
        ) : (
          <span class="pebble guess og-peb" style={{ width: 36, height: 36 }} aria-hidden="true">
            <RepeatGlyph task={it.kind === "task"} />
          </span>
        )}
        <span class="pbody">
          <span class="pl1">
            <span class="pt">{it.title}</span>
          </span>
          <span class={`pl2 og-line${paused ? " paused" : ""}`}><Facts items={stateLine(it)} /></span>
          {/* D427: only when it isn't keeping its time; on time says nothing. */}
          {it.health && !paused && (
            <span class={`pl2 og-health ${it.health.state}`} role="status">
              <HealthGlyph state={it.health.state} />
              <Facts items={healthLine(it.health)} />
            </span>
          )}
          {lastLine(it).length > 0 && (
            <span class="pl2 og-last">
              <Facts items={lastLine(it)} />
            </span>
          )}
          {it.reviews && (
            <span class="pl2 og-standing">
              <Facts items={reviewLine(it.reviews)} />
            </span>
          )}
          <span class="pl3">
            {it.project && <span>{it.project}</span>}
            {/* D427: where its rounds run and which agent does them, each its own fact. */}
            {it.where && <Facts class="og-where" items={[it.where.deviceName, it.where.harness ? harnessName(it.where.harness) : ""]} />}
            <Runs runs={it.runs} />
          </span>
        </span>
      </button>
      <span class="pacts on">
        {/* D407: the small app this task keeps current: the same truth as the line above, opened whole. */}
        {it.app && <Btn kind="secondary" size="sm" label={t("board.open", it.app.name)} onClick={() => (close(), openApp(it.app!.id))} />}
        {/* D427: its one fix, right where it says what's wrong. */}
        {it.health?.fix === "run_now" && !paused && <Btn kind="primary" size="sm" label={t("og.run")} about={it.title} onClick={() => og(it, { action: "run_now" })} />}
        {/* D429: its computer asleep, another awake: the move, on the person's tap (task_switch's move, then a round there). */}
        {it.health?.fix === "move" && it.health.moveTo && !paused && <Btn kind="primary" size="sm" label={t("og.move")} about={it.title} onClick={() => og(it, { action: "move", device: it.health!.moveTo!.device })} />}
        {paused ? (
          <Btn kind="secondary" size="sm" label={t("og.resume")} onClick={() => og(it, { action: "resume" })} />
        ) : (
          <Btn kind="text" size="sm" label={t("og.pause")} expanded={pausing} onClick={() => ((P.ogPause = pausing ? "" : it.id), (P.ogMenu = ""), A.changed())} />
        )}
        {it.state !== "running" && it.state !== "proposed" && it.health?.fix !== "run_now" && it.health?.fix !== "move" && <Btn kind="text" size="sm" label={t(it.kind === "routine" || it.loop ? "og.run" : "wait.look")} onClick={() => og(it, { action: "run_now" })} />}
        <button class={`more-btn${menu ? " open" : ""}`} aria-label={t("past.mark")} aria-expanded={menu} onClick={() => ((P.ogMenu = menu ? "" : it.id), (P.ogPause = ""), A.changed())}>
          ⋯
        </button>
      </span>
      {/* D451: the first loop the person sees says, once, that Ducter keeps it going. */}
      {it.loop && !paused && (!it.health || it.health.state === "back") && <FirstMeetLine name="loop" at={it.id} />}
      {pausing && (
        <Menu class="pmenu" onClose={() => ((P.ogPause = ""), A.changed())}>
          {(["hour", "morning", "week"] as const).map((k) => (
            <MenuItem key={k} onClick={() => og(it, { action: "pause", until: pauseUntil(k) })}>
              {t(`og.pause.${k}`)}
            </MenuItem>
          ))}
          <MenuItem onClick={() => og(it, { action: "pause" })}>
            {t("og.pause.open")}
          </MenuItem>
        </Menu>
      )}
      {menu && (
        <Menu class="pmenu" onClose={() => ((P.ogMenu = ""), A.changed())}>
          {it.kind === "routine" && it.trigger?.kind === "time" && (
            <MenuItem onClick={() => ((P.ogEdit = it.id), (P.ogMenu = ""), A.changed())}>
              {t("og.retime")}
            </MenuItem>
          )}
          {it.loop && it.state !== "paused" && (
            <MenuItem onClick={() => ((P.ogRhythm = it.id), (P.ogMenu = ""), A.changed())}>
              {t("og.rhythm")}
            </MenuItem>
          )}
          {openTask && (
            <MenuItem onClick={() => (close(), A.go({ name: "task", id: openTask }))}>
              {t("og.open")}
            </MenuItem>
          )}
          <MenuSep />
          <MenuItem danger onClick={() => og(it, { action: "end" })}>
            {t(it.kind === "routine" || it.loop ? "og.end" : "wait.cancel")}
          </MenuItem>
        </Menu>
      )}
      {P.ogRhythm === it.id && (
        <Menu class="pmenu" onClose={() => ((P.ogRhythm = ""), A.changed())}>
          <MenuHead>{t("og.rhythm")}</MenuHead>
          {RHYTHMS.map((m) => (
            <MenuItem key={m} onClick={() => og(it, { action: "every", minutes: m })}>
              {t("og.rhythm.m", rhythm(m * 60_000))}
              {it.everyMs === m * 60_000 && <span class="og-now" aria-hidden="true" />}
            </MenuItem>
          ))}
        </Menu>
      )}
      {editing && <Retime it={it} />}
    </div>
  );
}

function OngoingList() {
  // D427: opened from a link before the socket was up (#ongoing): ask again until the list comes.
  useEffect(() => {
    if (P.og) return;
    const again = setInterval(() => (P.og ? clearInterval(again) : A.send({ t: "ongoing", id: "og" })), 1000);
    return () => clearInterval(again);
  }, []);
  const items = [...(P.og ?? [])].sort((a, b) => RANK[a.state] - RANK[b.state]);
  const secs: { key: string; label: string; items: OngoingItem[] }[] = [];
  const name = (s: OngoingItem["state"]) => (s === "needs_you" ? t("lane.needs_you") : s === "running" ? t("og.s.running") : s === "paused" ? t("og.sec.paused") : t("og.sec.next"));
  for (const it of items) {
    const key = it.state === "proposed" ? "resting" : it.state;
    const last = secs.at(-1);
    if (last?.key === key) last.items.push(it);
    else secs.push({ key, label: name(it.state), items: [it] });
  }
  return (
    <div class="past-list og-list">
      {P.og && !items.length && <p class="past-none">{t("og.empty")}</p>}
      {secs.map((s) => (
        <section key={s.key} class="past-sec">
          <h3>{s.label}</h3>
          {s.items.map((it) => (
            <OgCard key={`${it.kind}:${it.id}`} it={it} />
          ))}
        </section>
      ))}
    </div>
  );
}

/** D285: New task's chip, 带着「{name}」的发现 / With what "{name}" found, and its ×. */
export function SeedChip() {
  const from = A.nt.from;
  if (!from) return null;
  return (
    <div class="nt-from">
      <span class="ptag big">
        {t("past.seed.chip", from.title)}
        <button aria-label={t("past.seed.drop")} title={t("past.seed.drop")} onClick={() => ((A.nt.from = undefined), A.changed())}>
          ×
        </button>
      </span>
    </div>
  );
}
