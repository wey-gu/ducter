// D285: 做过的事 / Past tasks (design/past.md): every earlier task, found by what anyone said,
// what it changed, where it ran and when; the person's marks on it (a name, a star, a few tags,
// a picture); and the ways back: 接着做 / Continue, 带着它开新任务 / New task from this, or just
// open it. A sheet: a centred panel when wide, the whole screen on a phone.
import type { OngoingAction, OngoingItem, OngoingRun, OutsideAgent, OutsideItem, PastGlyph, PastItem, PastMarkPatch, PastQuery, PastTint, ServerFrame } from "@ducter/protocol";
import { PAST_GLYPHS, PAST_TAGS_MAX, PAST_TINTS } from "@ducter/protocol";
import { useEffect, useRef, useState } from "preact/hooks";
import { A } from "./app.ts";
import { Btn } from "./controls.tsx";
import { harnessName } from "./format.ts";

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
  /** D285: which collection: 做过的事 / Past or 一直在跑的 / Ongoing. */
  tab: "past" as "past" | "ongoing",
  og: undefined as OngoingItem[] | undefined,
  ogMenu: "",
  ogPause: "",
  ogEdit: "",
  settling: "",
  /** D299: the outside session being carried on (agent:id), opened when its task is there. */
  adopting: "",
};

const ACTIVE = new Set(["queued", "working", "needs_you", "blocked", "done_claimed"]);

/** Opens 做过的事, with words when given (On hand's Find, the switcher); or 一直在跑的 / Ongoing. */
export function openPast(q = "", tab: "past" | "ongoing" = "past") {
  P.q = q;
  P.tab = tab;
  P.filter = { kind: "all" };
  P.focus = P.markFor = P.moreFor = P.ogMenu = P.ogPause = P.ogEdit = "";
  A.sheet = { kind: "past" };
  ask(true);
  A.send({ t: "ongoing", id: "og" });
  A.changed();
}

function queryOf(): PastQuery {
  const f = P.filter;
  return {
    ...(P.q.trim() ? { q: P.q.trim() } : {}),
    ...(f.kind === "starred" ? { starred: true } : f.kind === "project" ? { project: f.v } : f.kind === "harness" ? { harness: f.v } : f.kind === "tag" ? { tag: f.v } : {}),
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
  if (ACTIVE.has(it.attention) && !harness) return open(it);
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
  const label = A.L.lang === "zh" ? `${d.getFullYear() !== n.getFullYear() ? `${d.getFullYear()} 年 ` : ""}${d.getMonth() + 1} 月` : d.toLocaleDateString("en", { month: "long", ...(d.getFullYear() !== n.getFullYear() ? { year: "numeric" } : {}) });
  return { key: `m${d.getFullYear()}-${d.getMonth()}`, label };
}

/** A card's date: a time today, a weekday this week, else the day of the month. */
function dateOf(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  const zh = A.L.lang === "zh";
  if (Date.parse(iso) >= startOfDay(now)) return d.toLocaleTimeString(zh ? "zh-CN" : "en", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (Date.parse(iso) >= startOfWeek(now)) return d.toLocaleDateString(zh ? "zh-CN" : "en", { weekday: "short" });
  return zh ? `${d.getMonth() + 1}月${d.getDate()}日` : d.toLocaleDateString("en", { month: "short", day: "numeric" });
}

function rangeLine(r: NonNullable<Result["range"]>): string {
  const a = new Date(r.since);
  const b = new Date(Date.parse(r.before) - 1);
  const f = (d: Date) => (A.L.lang === "zh" ? `${d.getMonth() + 1}月${d.getDate()}日` : d.toLocaleDateString("en", { month: "short", day: "numeric" }));
  return `${r.words} · ${a.toDateString() === b.toDateString() ? f(a) : `${f(a)} – ${f(b)}`}`;
}

// ---------- pieces ----------

/** The words in a line marked where the query's words are. */
function Marked({ text, q }: { text: string; q: string }) {
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
  if (ACTIVE.has(it.attention)) return t("past.end.active");
  if (it.attention === "failed") return t("past.end.failed");
  if (it.attention === "dropped") return t("past.end.dropped");
  if (it.attention === "superseded") return t("past.end.superseded");
  return "";
}

function Card({ it }: { it: PastItem }) {
  const on = P.focus === it.taskId;
  const marking = P.markFor === it.taskId;
  const more = P.moreFor === it.taskId;
  const active = ACTIVE.has(it.attention);
  const end = endWord(it);
  const ch = it.changes;
  const meta = [it.project || t("past.other"), harnessName(it.harness), it.computer, dateOf(it.updatedAt)].filter(Boolean) as string[];
  const hitLabel = it.hit ? t(`past.hit.${it.hit.field === "name" ? "title" : it.hit.field}`) : "";
  return (
    <div
      class={`pcard${on ? " on" : ""}${marking || more ? " open" : ""}`}
      data-id={it.taskId}
      onMouseEnter={() => P.focus !== it.taskId && ((P.focus = it.taskId), A.changed())}
    >
      <button class="pmain" onClick={() => open(it)} aria-label={it.title}>
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
            {meta.join(" · ")}
            {ch && (ch.adds || ch.dels) ? (
              <span class="pdiff">
                <span class="add">+{ch.adds}</span> <span class="del">−{ch.dels}</span>
              </span>
            ) : null}
            {it.integrated && <span class="pint">{t(it.integrated.act === "merge" ? "onhand.pr.merged" : "onhand.pr.draft")}</span>}
            {it.outside && <span class="pint">{t("past.out.from", harnessName(it.outside.agent))}</span>}
            {end && <span class={`pend${active ? " live" : ""}`}>{end}</span>}
          </span>
        </span>
      </button>
      <span class="pacts">
        <button class={`pstar-btn${it.mark?.starred ? " on" : ""}`} aria-pressed={!!it.mark?.starred} aria-label={t(it.mark?.starred ? "past.unstar" : "past.star")} title={t(it.mark?.starred ? "past.unstar" : "past.star")} onClick={() => star(it)}>
          <StarMark on={!!it.mark?.starred} />
        </button>
        <Btn kind="secondary" size="sm" label={t(active ? "past.open" : "past.continue")} onClick={() => carryOn(it)} />
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
  const harnesses = ["claude-code", "codex", "pi", "deepseek-harness"].filter((h) => h !== it.harness);
  const shut = () => ((P.moreFor = ""), A.changed());
  return (
    <div class="pmenu" role="menu">
      <button role="menuitem" onClick={() => (shut(), seedFrom(it))}>
        {t("past.seed")}
      </button>
      <button role="menuitem" aria-expanded={others} onClick={() => setOthers(!others)}>
        {t("past.other.agent")}
      </button>
      {others &&
        harnesses.map((h) => (
          <button role="menuitem" class="sub" key={h} onClick={() => (shut(), carryOn(it, h))}>
            {t("past.with", harnessName(h))}
          </button>
        ))}
      <hr />
      <button role="menuitem" onClick={() => ((P.moreFor = ""), (P.markFor = it.taskId), A.changed())}>
        {t("past.mark")}
      </button>
    </div>
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
  if ((r?.facets.harnesses.length ?? 0) > 1) for (const h of r!.facets.harnesses) chips.push({ key: `h:${h.harness}`, label: harnessName(h.harness), f: { kind: "harness", v: h.harness } });
  for (const g of (r?.facets.tags ?? []).slice(0, 8)) chips.push({ key: `t:${g.tag}`, label: `#${g.tag}`, f: { kind: "tag", v: g.tag } });
  const keyOf = (x: Filter) => (x.kind === "all" || x.kind === "starred" ? x.kind : `${x.kind[0]}:${x.v}`);
  const cur = keyOf(f);
  return (
    <div class="pchips" role="radiogroup">
      {chips.map((c) => (
        <button key={c.key} role="radio" aria-checked={cur === c.key} class={`pchip${cur === c.key ? " on" : ""}`} onClick={() => ((P.filter = cur === c.key ? { kind: "all" } : c.f), ask(true), A.changed())}>
          {c.key === "starred" && <StarMark on={cur === c.key} />}
          {c.label}
        </button>
      ))}
    </div>
  );
}

/** The list as drawn: starred first, then by when, while browsing; one ranked list with words. */
function sections(items: PastItem[]): { key: string; label: string; items: PastItem[] }[] {
  if (P.q.trim()) return [{ key: "found", label: t("past.n", P.res?.total ?? items.length), items }];
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
  useEffect(() => ref.current?.focus(), []);
  const items = P.res?.items ?? [];
  const secs = sections(items);
  const order = secs.flatMap((s) => s.items);
  const at = order.findIndex((i) => i.taskId === P.focus);
  const walk = (by: number) => {
    if (!order.length) return;
    const n = at < 0 ? (by > 0 ? 0 : order.length - 1) : Math.max(0, Math.min(order.length - 1, at + by));
    P.focus = order[n]!.taskId;
    A.changed();
    requestAnimationFrame(() => document.querySelector(`.pcard[data-id="${CSS.escape(P.focus)}"]`)?.scrollIntoView({ block: "nearest" }));
  };
  const keys = (e: KeyboardEvent) => {
    const inField = (e.target as HTMLElement)?.tagName === "INPUT";
    const cur = at >= 0 ? order[at] : undefined;
    if (P.markFor) return;
    if (e.key === "Escape") {
      e.preventDefault(), e.stopPropagation();
      if (P.moreFor) return void ((P.moreFor = ""), A.changed());
      if (P.q) return void ((P.q = ""), ask(true), A.changed());
      return close();
    }
    if (e.key === "ArrowDown" || (!inField && e.key === "j")) return e.preventDefault(), walk(1);
    if (e.key === "ArrowUp" || (!inField && e.key === "k")) return e.preventDefault(), walk(-1);
    if (e.key === "/" && !inField) return e.preventDefault(), ref.current?.focus();
    if (!cur) return;
    if (e.key === "Enter" && !e.isComposing) {
      e.preventDefault();
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
  return (
    <>
      <div class="scrim" onClick={close} />
      <div class="past-sheet" role="dialog" aria-modal="true" aria-label={t("past.title")} onKeyDown={keys}>
        <div class="past-head">
          <h2>{t(ongoing ? "og.tab" : "past.title")}</h2>
          <button class="past-x" aria-label={t("nav.back")} onClick={close}>
            ×
          </button>
        </div>
        <div class="past-tabs" role="tablist">
          {(["past", "ongoing"] as const).map((k) => (
            <button key={k} role="tab" aria-selected={P.tab === k} class={`pchip${P.tab === k ? " on" : ""}`} onClick={() => ((P.tab = k), k === "ongoing" && A.send({ t: "ongoing", id: "og" }), A.changed())}>
              {t(k === "past" ? "past.tab" : "og.tab")}
              {k === "ongoing" && (P.og?.length ?? 0) > 0 && <span class="ptab-n">{P.og!.length}</span>}
            </button>
          ))}
        </div>
        {ongoing ? (
          <OngoingList />
        ) : (
          <>
        <label class="past-find">
          <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
            <path d={G.look} fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
          </svg>
          <input ref={ref} value={P.q} placeholder={t("past.find")} aria-label={t("past.find")} autocomplete="off" spellcheck={false} onInput={(e) => ((P.q = e.currentTarget.value), (P.focus = ""), ask(), A.changed())} />
        </label>
        {P.res?.range && <div class="past-range">{rangeLine(P.res.range)}</div>}
        <Chips />
        <div class="past-list">
          {!loading && !items.length && !P.res?.outside?.length && <p class="past-none">{searching || P.filter.kind !== "all" ? t("past.none") : t("past.empty")}</p>}
          {secs.map((s) => (
            <section key={s.key} class="past-sec">
              <h3>{s.label}</h3>
              {s.items.map((it) => (
                <Card key={it.taskId} it={it} />
              ))}
            </section>
          ))}
          <OutsideSection />
        </div>
          </>
        )}
      </div>
    </>
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

/** One session from outside Ducter: the same card as a task's, its picture guessed from its words. */
function OutsideCard({ it }: { it: OutsideItem }) {
  const key = outKey(it);
  const on = P.focus === key;
  const more = P.moreFor === key;
  const busy = P.adopting === `${it.agent}:${it.id}`;
  const hitLabel = it.hit ? t(`past.hit.${it.hit.field}`) : "";
  const others = ["claude-code", "codex", "pi", "deepseek-harness"].filter((h) => h !== it.agent);
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
        <div class="pmenu" role="menu">
          {!it.gone && <div class="pmenu-k">{t("past.other.agent")}</div>}
          {!it.gone &&
            others.map((h) => (
              <button role="menuitem" class="sub" key={h} onClick={() => ((P.moreFor = ""), carryOut(it, h))}>
                {t("past.with", harnessName(h))}
              </button>
            ))}
          {!it.gone && <hr />}
          <button role="menuitem" onClick={() => hideAgent(it.agent, true)}>
            {t("past.out.hide", harnessName(it.agent))}
          </button>
        </div>
      )}
    </div>
  );
}

/** The quiet section under Ducter's own: sessions the person ran in their own agents here. */
function OutsideSection() {
  const items = P.res?.outside ?? [];
  const hidden = (P.res?.sources ?? []).filter((s) => s.hidden);
  if (!items.length && !hidden.length) return null;
  return (
    <section class="past-sec outside" aria-label={t("past.out.title")}>
      <h3>
        <span>{t("past.out.title")}</span>
        {items.length > 0 && <span class="psec-n">{items.length}</span>}
      </h3>
      {items.length > 0 && <p class="past-out-sub">{t("past.out.sub")}</p>}
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
  P.ogMenu = P.ogPause = P.ogEdit = "";
  // The card settles (pause) or lifts (resume) at once; the home's ongoing_result follows.
  if (a.action === "pause") (it.state = "paused"), (P.settling = it.id), a.until ? (it.pausedUntil = a.until) : delete it.pausedUntil, delete it.nextAt;
  if (a.action === "resume") (it.state = "resting"), (P.settling = ""), delete it.pausedUntil;
  A.changed();
}

/** A time in a card's words: 21:40 today, 周三 09:00 this week, else 11月20日 09:00. */
function soon(iso: string): string {
  const d = new Date(iso);
  const zh = A.L.lang === "zh";
  const hm = d.toLocaleTimeString(zh ? "zh-CN" : "en", { hour: "2-digit", minute: "2-digit", hour12: false });
  const now = Date.now();
  if (Date.parse(iso) < startOfDay(now) + DAY) return hm;
  if (Date.parse(iso) < startOfDay(now) + 2 * DAY) return `${zh ? "明天" : "tomorrow"} ${hm}`;
  if (Date.parse(iso) < startOfDay(now) + 6 * DAY) return `${d.toLocaleDateString(zh ? "zh-CN" : "en", { weekday: "short" })} ${hm}`;
  return `${zh ? `${d.getMonth() + 1}月${d.getDate()}日` : d.toLocaleDateString("en", { month: "short", day: "numeric" })} ${hm}`;
}

function interval(ms: number): string {
  const m = Math.round(ms / 60_000);
  const zh = A.L.lang === "zh";
  if (m < 60) return zh ? `${m} 分钟` : `${m} min`;
  const h = Math.round(m / 60);
  return zh ? `${h} 小时` : `${h} h`;
}

function stateLine(it: OngoingItem): string {
  if (it.state === "paused") {
    if (it.pausedBy === "system" && it.pauseWhy) return t(`routine.paused.${it.pauseWhy}`);
    return it.pausedUntil ? t("og.paused.until", soon(it.pausedUntil)) : t("og.paused");
  }
  if (it.state === "running") return t("og.s.running");
  if (it.state === "needs_you") return t("og.s.needs_you");
  if (it.state === "proposed") return t("og.s.proposed");
  const how = it.kind === "routine" ? (it.cadence ?? "") : it.everyMs ? t("og.every", interval(it.everyMs)) : "";
  return [how, it.nextAt ? t("og.next", soon(it.nextAt)) : ""].filter(Boolean).join(" · ");
}

const RepeatGlyph = ({ task }: { task: boolean }) => (
  <svg class="pg" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
    {task ? (
      <path d="M10 16a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM10 7v3.2l2.2 1.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
    ) : (
      <path d="M5 9.5a5 5 0 0 1 8.6-3.4L15 7.5M15 4.5v3h-3M15 10.5a5 5 0 0 1-8.6 3.4L5 12.5M5 15.5v-3h3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
    )}
  </svg>
);

/** The runs, oldest first, each a small pebble with its outcome. */
function Runs({ runs }: { runs: OngoingRun[] }) {
  if (!runs.length) return null;
  return (
    <span class="og-runs" role="list" aria-label={t("og.runs", runs.length)}>
      {runs.map((r, i) => {
        const label = `${t(`og.run.${r.state}`)} · ${soon(r.at)}${r.line ? ` · ${r.line}` : ""}`;
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
          <span class={`pl2 og-line${paused ? " paused" : ""}`}>{stateLine(it)}</span>
          <span class="pl3">
            {it.project && <span>{it.project}</span>}
            <Runs runs={it.runs} />
          </span>
        </span>
      </button>
      <span class="pacts on">
        {paused ? (
          <Btn kind="secondary" size="sm" label={t("og.resume")} onClick={() => og(it, { action: "resume" })} />
        ) : (
          <Btn kind="text" size="sm" label={t("og.pause")} expanded={pausing} onClick={() => ((P.ogPause = pausing ? "" : it.id), (P.ogMenu = ""), A.changed())} />
        )}
        {it.state !== "running" && it.state !== "proposed" && <Btn kind="text" size="sm" label={t(it.kind === "routine" ? "og.run" : "wait.look")} onClick={() => og(it, { action: "run_now" })} />}
        <button class={`more-btn${menu ? " open" : ""}`} aria-label={t("past.mark")} aria-expanded={menu} onClick={() => ((P.ogMenu = menu ? "" : it.id), (P.ogPause = ""), A.changed())}>
          ⋯
        </button>
      </span>
      {pausing && (
        <div class="pmenu" role="menu">
          {(["hour", "morning", "week"] as const).map((k) => (
            <button key={k} role="menuitem" onClick={() => og(it, { action: "pause", until: pauseUntil(k) })}>
              {t(`og.pause.${k}`)}
            </button>
          ))}
          <button role="menuitem" onClick={() => og(it, { action: "pause" })}>
            {t("og.pause.open")}
          </button>
        </div>
      )}
      {menu && (
        <div class="pmenu" role="menu">
          {it.kind === "routine" && it.trigger?.kind === "time" && (
            <button role="menuitem" onClick={() => ((P.ogEdit = it.id), (P.ogMenu = ""), A.changed())}>
              {t("og.retime")}
            </button>
          )}
          {openTask && (
            <button role="menuitem" onClick={() => (close(), A.go({ name: "task", id: openTask }))}>
              {t("og.open")}
            </button>
          )}
          <hr />
          <button role="menuitem" class="danger" onClick={() => og(it, { action: "end" })}>
            {t(it.kind === "routine" ? "og.end" : "wait.cancel")}
          </button>
        </div>
      )}
      {editing && <Retime it={it} />}
    </div>
  );
}

function OngoingList() {
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
