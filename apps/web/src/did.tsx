// D300: 替你做过的 / Done for you (design/did.md): every outward action Ducter took for the
// person, day by day: what it sent, paid, called, signed in to or filled, changed, deleted, and
// which accounts it looked at (counts only). Each card says who asked, the Go, where, links its
// task, and offers Undo only where one truly exists. A sheet like Past tasks: a centred panel
// when wide, the whole screen on a phone. Facts are separate elements (D291), never joined.
import type { DidItem, DidKind, ServerFrame } from "@ducter/protocol";
import { DID_KINDS, DID_OUTWARD } from "@ducter/protocol";
import { useEffect, useRef } from "preact/hooks";
import { A } from "./app.ts";
import { Btn, Facts } from "./controls.tsx";
import { clock, day } from "./format.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);
type Result = Extract<ServerFrame, { t: "did_result" }>;

const DAY = 24 * 3600_000;
const startOfDay = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** What the sheet holds between renders. */
export const D = {
  q: "",
  kind: "all" as "all" | DidKind,
  days: 7,
  res: undefined as Result | undefined,
  asked: "",
  n: 0,
  undoing: new Set<string>(),
  timer: 0 as unknown as ReturnType<typeof setTimeout> | 0,
};

/** Opens 替你做过的 (On hand's end, the morning note, the Mac's menu). */
export function openDid() {
  D.q = "";
  D.kind = "all";
  D.days = 7;
  D.res = undefined;
  A.sheet = { kind: "did" };
  ask(true);
  A.changed();
}

function ask(now = false) {
  if (D.timer) clearTimeout(D.timer);
  const go = () => {
    D.timer = 0;
    D.asked = `d${++D.n}`;
    const since = new Date(startOfDay(Date.now()) - (D.days - 1) * DAY).toISOString();
    A.send({ t: "did", id: D.asked, query: { since, ...(D.kind !== "all" ? { kinds: [D.kind] } : {}), ...(D.q.trim() ? { q: D.q.trim() } : {}) } });
  };
  if (now) go();
  else D.timer = setTimeout(go, 120);
}

/** did_result from the home (app.ts hands it here). */
export function onDidFrame(f: Result) {
  if (f.id !== D.asked) return;
  D.res = f;
  A.changed();
}

function close() {
  A.sheet = null;
  A.changed();
}

// ---------- the pictures: one drawn glyph per kind (D211: never emoji) ----------

const G: Record<DidKind, string> = {
  sent: "M3.6 9.6 16.2 4l-4.6 12.4-2.9-5.1zM8.7 11.3 16.2 4",
  paid: "M3.5 6h13v8.6h-13zM3.5 8.9h13M6 12.1h3.2",
  called: "M6.2 3.8h2.1l1.1 3.3-1.7 1.2a8 8 0 0 0 4 4l1.2-1.7 3.3 1.1v2.1a1.7 1.7 0 0 1-1.9 1.7A12.3 12.3 0 0 1 4.5 5.7a1.7 1.7 0 0 1 1.7-1.9z",
  filled: "M12.6 11.2a3.6 3.6 0 1 0-3.4-2.4L4 14v2.2h2.4v-1.6H8v-1.6h1.6l1.3-1.3a3.6 3.6 0 0 0 1.7-.5zM13 6.6h.01",
  changed: "M4.5 15.5l1-3.5 7.6-7.6a1.6 1.6 0 0 1 2.3 2.3L7.8 14.3zM11.8 5.7l2.4 2.4",
  deleted: "M4.8 6.2h10.4M8 6.2V4.6h4v1.6M6.3 6.2l.8 9.8h5.8l.8-9.8M8.9 8.8v4.6M11.1 8.8v4.6",
  read: "M2.8 10S5.5 5.2 10 5.2s7.2 4.8 7.2 4.8-2.7 4.8-7.2 4.8S2.8 10 2.8 10zM10 12.1a2.1 2.1 0 1 0 0-4.2 2.1 2.1 0 0 0 0 4.2z",
};
const TINT: Record<DidKind, string> = { sent: "clay", paid: "sand", called: "sage", filled: "mist", changed: "lilac", deleted: "stone", read: "" };

export function DidGlyph({ k, size = 20 }: { k: DidKind; size?: number }) {
  return (
    <svg class="pg" width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <path d={G[k]} fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

// ---------- words ----------

/** The card's line, from the table by kind and sub-kind (design/did.md). */
export function lineOf(it: DidItem): string {
  const app = it.via || t("did.app");
  switch (`${it.kind}.${it.sub}`) {
    case "sent.mail":
    case "sent.agent":
      return t(`did.l.${it.kind}.${it.sub}`, it.to ?? it.via ?? "");
    case "sent.message":
      return it.to ? t("did.l.sent.message", it.to) : t("did.l.sent.message.none");
    case "paid.card":
    case "called.call":
    case "filled.signin":
    case "filled.detail":
    case "filled.key":
      return t(`did.l.${it.kind}.${it.sub}`, it.to ?? "");
    case "changed.calendar":
    case "deleted.calendar":
      return t(`did.l.${it.kind}.calendar.${it.cal ?? "create"}`);
    case "changed.merge":
      return it.to ? t("did.l.changed.merge", it.to) : t("did.l.changed.merge.none");
    case "changed.files":
      return t("did.l.changed.files", it.count ?? 0);
    case "read.account":
      return t("did.l.read.account", it.via ?? "");
    default:
      return t(`did.l.${it.kind}.${it.sub}`, app);
  }
}

function whoOf(it: DidItem): string {
  if (it.who.by === "routine") return t("did.who.routine", it.who.routine ?? it.who.title ?? "");
  if (it.who.by === "task" && it.who.title) return t("did.who.task", it.who.title);
  return t("did.who.you");
}

function goOf(it: DidItem): string {
  if (!it.go) return "";
  if (it.go.by === "you") return t("did.go.you", it.go.at ? clock(it.go.at) : "");
  return t(`did.go.${it.go.by}`);
}

function whereOf(it: DidItem): string {
  const w = it.where;
  if (!w) return "";
  if (w.kind === "ducter_phone" || w.kind === "own_number") return t(`did.where.${w.kind}`);
  if (w.kind === "browser") return w.name ? t("did.where.computer", w.name) : t("did.where.browser");
  // A read or an account's write is said once, as the account itself: "through Gmail" would repeat it.
  if (w.kind === "home") return it.kind === "read" || !w.name || w.name === it.via ? "" : t("did.where.home", w.name);
  return w.name ? t(`did.where.${w.kind}`, w.name) : "";
}

/** The day header's label: 今天, 昨天, else the weekday (its date beside it, its own element). */
function dayLabel(dayStart: number): { name: string; date?: string } {
  const today = startOfDay(Date.now());
  if (dayStart === today) return { name: t("did.day.today") };
  if (dayStart === today - DAY) return { name: t("did.day.yesterday") };
  const d = new Date(dayStart);
  return { name: d.toLocaleDateString(A.L.lang, { weekday: "long" }), date: day(A.L, d.toISOString()) };
}

// ---------- pieces ----------

function undo(it: DidItem) {
  if (!it.undo) return;
  D.undoing.add(it.id);
  A.folderAction(it.undo.taskId, "undo");
  A.toast(t("did.undo.sent"));
}

function Card({ it }: { it: DidItem }) {
  const openTask = it.taskId && A.S.tasks.get(it.taskId) ? it.taskId : undefined;
  const undoable = it.undo && Date.parse(it.undo.until) > Date.now() && !D.undoing.has(it.id);
  const tint = TINT[it.kind];
  return (
    <div class={`pcard did ${it.kind}`} data-id={it.id}>
      <div class="pmain did-main">
        <span class="did-time">{clock(it.at)}</span>
        <span class={`pebble${tint ? ` own tint-${tint}` : " guess"}`} style={{ width: 36, height: 36 }} aria-hidden="true">
          <DidGlyph k={it.kind} />
        </span>
        <span class="pbody">
          <span class="pl1">
            <span class="pt">{lineOf(it)}</span>
            {it.amount && <span class="did-amount">{it.amount}</span>}
          </span>
          {it.line && <span class="pl2 did-what">{it.line}</span>}
          <Facts
            class="did-facts"
            items={[
              it.unsure && <b class="unsure">{t(`did.unsure.${it.unsure}`)}</b>,
              it.kind === "read" && it.count ? t("did.times", it.count) : null,
              it.files && it.files.added > 0 && t("did.files", it.files.added),
              it.files && it.files.changed > 0 && t("did.files.changed", it.files.changed),
              it.files && it.files.removed > 0 && t("did.files.removed", it.files.removed),
              whoOf(it),
              goOf(it),
              whereOf(it),
              it.kind !== "read" && it.via && it.where?.kind === "home" && it.sub !== "agent" && t("did.where.home", it.via),
            ]}
          />
        </span>
      </div>
      {(openTask || it.link || undoable) && (
        <span class="pacts on did-acts">
          {undoable && <span class="did-until">{t("did.undo.until", day(A.L, it.undo!.until))}</span>}
          {undoable && <Btn kind="secondary" size="sm" label={t("did.undo")} onClick={() => undo(it)} />}
          {it.link && <Btn kind="text" size="sm" label={t("did.see")} onClick={() => window.open(it.link, "_blank", "noopener")} />}
          {openTask && <Btn kind="text" size="sm" label={t("did.open")} onClick={() => (close(), A.go({ name: "task", id: openTask }))} />}
        </span>
      )}
    </div>
  );
}

function Chips() {
  const counts = D.res?.counts ?? {};
  const keys: ("all" | DidKind)[] = ["all", ...DID_KINDS.filter((k) => counts[k] || D.kind === k)];
  return (
    <div class="pchips" role="radiogroup">
      {keys.map((k) => (
        <button key={k} role="radio" aria-checked={D.kind === k} class={`pchip${D.kind === k ? " on" : ""}`} onClick={() => ((D.kind = D.kind === k ? "all" : k), ask(true), A.changed())}>
          <span>{t(`did.k.${k}`)}</span>
          {k !== "all" && counts[k] ? <span class="did-n">{counts[k]}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** Today with nothing sent, paid or called: the character with its notebook, and what did happen. */
function EmptyDay({ items }: { items: DidItem[] }) {
  const rest = DID_KINDS.filter((k) => !DID_OUTWARD.includes(k)).map((k) => [k, items.filter((i) => i.kind === k).length] as const).filter(([, n]) => n > 0);
  return (
    <div class="did-empty">
      <img src="app/art/idle.webp" alt="" draggable={false} />
      <p>{t("did.empty")}</p>
      <Facts class="did-facts center" items={rest.length ? rest.map(([k, n]) => t(`did.n.${k}`, n)) : [t("did.empty.else")]} />
    </div>
  );
}

function DayHead({ start, items }: { start: number; items: DidItem[] }) {
  const l = dayLabel(start);
  const n = DID_KINDS.map((k) => [k, items.filter((i) => i.kind === k).length] as const).filter(([, c]) => c > 0);
  return (
    <div class="did-dayhead">
      <h3>
        <span>{l.name}</span>
        {l.date && <span class="did-date">{l.date}</span>}
      </h3>
      <Facts class="did-facts" items={n.map(([k, c]) => t(`did.n.${k}`, c))} />
    </div>
  );
}

export function DidSheet() {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus({ preventScroll: true }), []);
  const items = D.res?.items ?? [];
  const browsing = D.kind === "all" && !D.q.trim();
  const today = startOfDay(Date.now());
  const days = new Map<number, DidItem[]>();
  if (browsing) days.set(today, []);
  for (const it of items) {
    const s = startOfDay(Date.parse(it.at));
    if (!days.has(s)) days.set(s, []);
    days.get(s)!.push(it);
  }
  const keys = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.preventDefault(), e.stopPropagation();
    if (D.q) return void ((D.q = ""), ask(true), A.changed());
    close();
  };
  return (
    <>
      <div class="scrim" onClick={close} />
      <div class="past-sheet did-sheet" role="dialog" aria-modal="true" aria-label={t("did.title")} onKeyDown={keys}>
        <div class="past-head">
          <h2>{t("did.title")}</h2>
          <button class="past-x" aria-label={t("nav.back")} onClick={close}>
            ×
          </button>
        </div>
        <label class="past-find">
          <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M8.8 13.6a4.8 4.8 0 1 0 0-9.6 4.8 4.8 0 0 0 0 9.6zM12.3 12.3 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
          </svg>
          <input ref={ref} value={D.q} placeholder={t("did.find")} aria-label={t("did.find")} autocomplete="off" spellcheck={false} onInput={(e) => ((D.q = e.currentTarget.value), ask(), A.changed())} />
        </label>
        <Chips />
        <div class="past-list did-list">
          {D.res && !items.length && !browsing && <p class="past-none">{t("did.none")}</p>}
          {[...days.entries()]
            .sort((a, b) => b[0] - a[0])
            .map(([start, list]) => (
              <section key={start} class="past-sec did-day">
                <DayHead start={start} items={list} />
                {browsing && start === today && D.res && !list.some((i) => DID_OUTWARD.includes(i.kind)) && <EmptyDay items={list} />}
                {list.map((it) => (
                  <Card key={it.id} it={it} />
                ))}
              </section>
            ))}
          {D.res && (
            <div class="did-foot">
              <button class="past-link" onClick={() => ((D.days += 7), ask(true))}>
                <span>{t("did.earlier")}</span>
              </button>
              <p class="did-coverage">{t("did.coverage")}</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
