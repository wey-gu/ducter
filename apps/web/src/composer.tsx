// D519: the one composer. Words for the partner or a task are typed in one box, wherever they are
// typed: the conversation (跟 Ducter 说点什么…), an opened task, a Keep's page (想改什么，直接说), a small
// app's ask, a call's reply. One card on the paper (`--surface`, `--r-xl`, `--base`), the words
// growing to five lines, what belongs beside them (pictures, the mic, the context ring, Stop), and the
// round accent send with its drawn arrow. Its states are the send's: empty (resting, not pressable),
// ready (raised on its ledge), sending (pressed in until the home has the words). The look comes from
// tokens only (app.css `.composer`, `.send`); apps/web/test/composer.test.ts fails on any other copy.
//
// D534: @ and / (design/mentions.md). Typing @ opens the @ list above the caret (tasks, files in the
// task's place, Keeps, partners, PRs and issues); typing / opens the / list (Ducter's actions and the
// person's skills, or the task agent's own commands and Ducter's task actions). ↑↓ walk it, Enter or
// Tab picks, Esc closes, typing filters, a tap picks; on a phone it is a sheet docked over the
// composer with rows a thumb can take. A picked reference is written as @its name, marked in the
// words on the chip's tint, and rides with the message; a sent message draws it as the chip (RefChip).
import type { ComponentChildren, JSX } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { mentionAt, placeToken, refPieces, refSpans, slashAt, tokenOf, type MentionItem, type Ref, type RefKind, type SlashEntry } from "@ducter/protocol";
import { A } from "./app.ts";
import { harnessName } from "./format.ts";
import { askMentions, closeMentions, M, mentionSections, pickRef, runSlash, slashOf, slashSections, type PopRow, type PopSection } from "./mentions.ts";
import { scaledRow } from "./text-scale.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

const coarse = () => matchMedia("(pointer: coarse)").matches && !matchMedia("(any-pointer: fine)").matches;
/** D534: the lists are a sheet over the composer where a thumb picks (a phone, a narrow window). */
const sheetLike = () => coarse() || matchMedia("(max-width: 560px)").matches;

/** The send's drawn arrow (never a glyph or an emoji). */
export const Arrow = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
    <path d="M10 15V5M5.5 9.5L10 5l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);

/** What the words hand the composer around them (D534): keys first, and where the caret went. */
type WordsHooks = { taRef?: { current: HTMLTextAreaElement | null }; keys?: (e: KeyboardEvent) => boolean; onCaret?: () => void; aria?: JSX.HTMLAttributes<HTMLTextAreaElement> };

/** Words that grow with what is typed (up to 140, scaled with the text size). Enter sends with a
 *  keyboard; on a phone Return breaks the line and the button sends; ⌘⏎ sends everywhere (D210). */
export function AutoText(p: { value: string; onInput: (v: string) => void; placeholder: string; label: string; onEnter?: () => void; onEscape?: () => void; autoFocus?: boolean; id?: string; disabled?: boolean } & WordsHooks) {
  const own = useRef<HTMLTextAreaElement>(null);
  const ref = p.taRef ?? own;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, scaledRow(140))}px`;
  }, [p.value]);
  useEffect(() => {
    if (p.autoFocus) ref.current?.focus();
  }, []);
  return (
    <textarea
      ref={ref as { current: HTMLTextAreaElement | null }}
      id={p.id}
      rows={1}
      value={p.value}
      placeholder={p.placeholder}
      aria-label={p.label}
      enterkeyhint="send"
      readOnly={p.disabled}
      {...p.aria}
      onInput={(e) => (p.onInput((e.target as HTMLTextAreaElement).value), p.onCaret?.())}
      onSelect={() => p.onCaret?.()}
      onClick={() => p.onCaret?.()}
      onBlur={() => p.onCaret?.()}
      onKeyDown={(e) => {
        if (p.keys?.(e)) return;
        if (e.key === "Enter" && !e.isComposing && p.onEnter && (e.metaKey || e.ctrlKey || (!e.shiftKey && !coarse()))) {
          e.preventDefault();
          p.onEnter();
        }
        // D482: Esc closes an ask's reply field and goes back to its buttons (never the sheet behind it).
        if (e.key === "Escape" && !e.isComposing && p.onEscape) {
          e.preventDefault();
          e.stopPropagation();
          p.onEscape();
        }
      }}
    />
  );
}

/** The composer's send: the round accent button with the drawn arrow. empty: resting and not
 *  pressable; sending: pressed into its ledge until the home has the words. */
export function SendButton({ state, label, onSend }: { state: "empty" | "ready" | "sending"; label?: string; onSend: () => void }) {
  return (
    <button type="button" class={`btn accent icon send${state === "sending" ? " sending" : ""}`} aria-label={label ?? A.L.t("composer.send")} aria-busy={state === "sending" || undefined} disabled={state !== "ready"} onClick={() => state === "ready" && onSend()}>
      <Arrow />
    </button>
  );
}

/** Whether words sent with this clientId reached the home (its echo is in the conversation). */
export const echoed = (clientId: string) => A.S.channel.some((e) => e.user?.clientId === clientId);

// ---------- D534: the drawn glyphs of the lists and the chips ----------

const STROKE = { fill: "none", stroke: "currentColor", "stroke-width": 1.6, "stroke-linecap": "round", "stroke-linejoin": "round" } as const;

/** One drawn glyph per kind of thing (never an emoji): 16 px, the ink it stands in. */
export function KindGlyph({ kind, size = 16 }: { kind: RefKind | "native" | "skills" | SlashEntry["name"]; size?: number }) {
  const d: Record<string, JSX.Element> = {
    // A task: the clay pebble with its line of work.
    task: <><rect x="2.5" y="3.5" width="11" height="9" rx="3" {...STROKE} /><path d="M5.5 8h5" {...STROKE} /></>,
    // Looking after: an open eye.
    keep: <><path d="M1.8 8c1.6-2.8 3.7-4.2 6.2-4.2s4.6 1.4 6.2 4.2c-1.6 2.8-3.7 4.2-6.2 4.2S3.4 10.8 1.8 8z" {...STROKE} /><circle cx="8" cy="8" r="1.7" {...STROKE} /></>,
    // A partner: a face.
    partner: <><circle cx="8" cy="8" r="5.8" {...STROKE} /><path d="M5.8 9.4c.6.8 1.3 1.2 2.2 1.2s1.6-.4 2.2-1.2" {...STROKE} /><path d="M6 6.4v.2M10 6.4v.2" {...STROKE} /></>,
    // A file: a page with its corner folded.
    file: <><path d="M4 2.5h5l3 3v8H4z" {...STROKE} /><path d="M9 2.5v3h3" {...STROKE} /></>,
    // A pull request: two branches joining.
    pr: <><circle cx="4.5" cy="3.8" r="1.5" {...STROKE} /><circle cx="4.5" cy="12.2" r="1.5" {...STROKE} /><circle cx="11.5" cy="12.2" r="1.5" {...STROKE} /><path d="M4.5 5.3v5.4M11.5 10.7V7.5c0-1.4-.8-2.2-2.2-2.2H7.5" {...STROKE} /></>,
    // An issue: a ring with its dot.
    issue: <><circle cx="8" cy="8" r="5.8" {...STROKE} /><circle cx="8" cy="8" r="1.3" fill="currentColor" /></>,
    // A skill, and the agent's own skills: a four-pointed spark.
    skill: <path d="M8 2.2c.5 3 1.8 4.3 4.8 4.8-3 .5-4.3 1.8-4.8 4.8-.5-3-1.8-4.3-4.8-4.8 3-.5 4.3-1.8 4.8-4.8z" {...STROKE} />,
    skills: <path d="M8 2.2c.5 3 1.8 4.3 4.8 4.8-3 .5-4.3 1.8-4.8 4.8-.5-3-1.8-4.3-4.8-4.8 3-.5 4.3-1.8 4.8-4.8z" {...STROKE} />,
    // The agent's own command: a slash on its key.
    native: <><rect x="2.2" y="2.2" width="11.6" height="11.6" rx="3" {...STROKE} /><path d="M9.6 5L6.4 11" {...STROKE} /></>,
    action: <path d="M9 2L4 9h4l-1 5 5-7H8z" {...STROKE} />,
    new: <><rect x="2.5" y="2.5" width="11" height="11" rx="3.5" {...STROKE} /><path d="M8 5.5v5M5.5 8h5" {...STROKE} /></>,
    remind: <><path d="M4.2 11V7.6a3.8 3.8 0 017.6 0V11l1 1.2H3.2z" {...STROKE} /><path d="M6.8 13.6c.3.4.7.6 1.2.6s.9-.2 1.2-.6" {...STROKE} /></>,
    handover: <><rect x="2" y="4" width="8" height="9" rx="2" {...STROKE} /><path d="M8 2.8h4.2a1.8 1.8 0 011.8 1.8V10" {...STROKE} /></>,
    find: <><circle cx="7" cy="7" r="4.3" {...STROKE} /><path d="M10.2 10.2L13.6 13.6" {...STROKE} /></>,
    pause: <><rect x="4.3" y="3.5" width="2.4" height="9" rx="1" {...STROKE} /><rect x="9.3" y="3.5" width="2.4" height="9" rx="1" {...STROKE} /></>,
    switch: <><path d="M3 5.5h9.5M10 3l2.5 2.5L10 8" {...STROKE} /><path d="M13 10.5H3.5M6 8l-2.5 2.5L6 13" {...STROKE} /></>,
    fork: <><circle cx="4.5" cy="3.8" r="1.5" {...STROKE} /><circle cx="11.5" cy="3.8" r="1.5" {...STROKE} /><circle cx="8" cy="12.2" r="1.5" {...STROKE} /><path d="M4.5 5.3c0 2.6 3.5 2.4 3.5 5.4M11.5 5.3c0 2.6-3.5 2.4-3.5 5.4" {...STROKE} /></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      {d[kind] ?? d.action}
    </svg>
  );
}

/** What a reference opens: a task its page, a PR or an issue its own page. */
function openRef(r: Ref) {
  if (r.kind === "task" && A.S.tasks.get(r.id)) return A.go({ name: "task", id: r.id });
  if ((r.kind === "pr" || r.kind === "issue") && /^https:\/\//.test(r.id)) window.open(r.id, "_blank", "noopener");
}

/** D534: a reference in a sent message: its glyph and its name on the chip's tint, inline in the words. */
export function RefChip({ r }: { r: Ref }) {
  const opens = (r.kind === "task" && !!A.S.tasks.get(r.id)) || ((r.kind === "pr" || r.kind === "issue") && /^https:\/\//.test(r.id));
  const inner = (
    <>
      <KindGlyph kind={r.kind === "action" ? (r.id as SlashEntry["name"]) : r.kind} size={13} />
      <span class="ref-w">{r.label}</span>
    </>
  );
  return opens ? (
    <button type="button" class={`ref-chip k-${r.kind}`} title={t(`mention.open.${r.kind}`)} onClick={(e) => (e.stopPropagation(), openRef(r))}>
      {inner}
    </button>
  ) : (
    <span class={`ref-chip k-${r.kind}`}>{inner}</span>
  );
}

/** D534: words with their references drawn as chips where their tokens stand. */
export function WordsWithRefs({ text, refs }: { text: string; refs?: Ref[] }) {
  if (!refs?.length) return <>{text}</>;
  return (
    <>
      {refPieces(text, refs).map((p, i) => ("ref" in p ? <RefChip key={`r${i}`} r={p.ref} /> : p.text))}
    </>
  );
}

// ---------- D534: the @ and / popover ----------

type Pop = { kind: "@" | "/"; start: number; q: string };

/** Where the caret stands in a textarea, from its left edge (a mirror of its text up to it). */
function caretLeft(ta: HTMLTextAreaElement, at: number): number {
  const cs = getComputedStyle(ta);
  const m = document.createElement("div");
  for (const k of ["font", "letterSpacing", "lineHeight", "padding", "border", "boxSizing", "whiteSpace", "wordWrap", "overflowWrap", "tabSize"] as const) m.style[k] = cs[k];
  Object.assign(m.style, { position: "absolute", visibility: "hidden", top: "0", left: "-9999px", width: `${ta.clientWidth}px`, whiteSpace: "pre-wrap", overflowWrap: "break-word" });
  m.textContent = ta.value.slice(0, at);
  const s = document.createElement("span");
  s.textContent = "​";
  m.appendChild(s);
  document.body.appendChild(m);
  const x = s.offsetLeft;
  m.remove();
  return x;
}

/** Ducter's own / entries in the person's words (slash.<name>). */
export const slashWord = (e: SlashEntry) => (e.group === "ducter" || e.group === "task" ? t(`slash.${e.name}`) : e.name);
const slashAbout = (e: SlashEntry) => (e.group === "ducter" || e.group === "task" ? t(`slash.${e.name}.about`) : e.about ? e.about : FIXED.has(e.name) ? t(`slash.cmd.${e.name}`) : "");
/** The agent commands Ducter offers on every agent that has them (harness-facts nativeCommands.fixed): worded here. */
const FIXED = new Set(["compact", "model", "effort"]);

function sectionName(key: string, harness?: string): string {
  const who = harness ? harnessName(harness) : "";
  if (key === "slash.group.native") return who ? t("slash.group.native", who) : t("slash.group.native.bare");
  if (key === "slash.group.skills") return harness ? t("slash.group.agentSkills", who) : t("slash.group.skills");
  return t(key);
}

function PopRowView(p: { row: PopRow; id: string; on: boolean; onHover: () => void; onPick: () => void }) {
  const r = p.row;
  const glyph = r.kind === "ref" ? r.item.kind : r.entry.group === "native" ? "native" : r.entry.group === "skills" ? "skills" : r.entry.name;
  const name = r.kind === "ref" ? r.item.label : r.entry.group === "native" || (r.entry.group === "skills" && r.entry.insert) ? (r.entry.insert ?? `/${r.entry.name}`).trim() : r.entry.group === "skills" ? `/${r.entry.name}` : slashWord(r.entry);
  const sub = r.kind === "ref" ? r.item.sub : slashAbout(r.entry);
  return (
    <button
      type="button"
      role="option"
      id={p.id}
      class={`mp-row${p.on ? " on" : ""}`}
      aria-selected={p.on}
      tabIndex={-1}
      onPointerDown={(e) => e.preventDefault()}
      onPointerMove={p.onHover}
      onClick={p.onPick}
    >
      <span class="mp-g">
        <KindGlyph kind={glyph as RefKind} />
      </span>
      <span class={`mp-name${r.kind === "slash" && (r.entry.group === "native" || r.entry.group === "skills") ? " mp-cmd" : ""}`} dir="auto">
        {name}
      </span>
      {sub && (
        <span class="mp-sub" dir="auto">
          {sub}
        </span>
      )}
    </button>
  );
}

/** The popover over the composer: its sections, its rows, its waiting and empty states, its keys. */
function MentionPop(p: { pop: Pop; sections: PopSection[]; waiting: boolean; sel: number; harness?: string; listId: string; left: number; maxH: number; sheet: boolean; onHover: (i: number) => void; onPick: (r: PopRow) => void; onClose: () => void }) {
  let n = -1;
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    ref.current?.querySelector(".mp-row.on")?.scrollIntoView({ block: "nearest" });
  }, [p.sel]);
  const empty = !p.sections.length;
  return (
    <div
      ref={ref}
      class={`mention-pop${p.sheet ? " sheet" : ""}`}
      style={p.sheet ? { maxHeight: `${p.maxH}px` } : { left: `${p.left}px`, maxHeight: `${p.maxH}px` }}
      role="listbox"
      id={p.listId}
      aria-label={t(p.pop.kind === "@" ? "mention.label" : "slash.label")}
      onPointerDown={(e) => e.preventDefault()}
    >
      {p.sheet && (
        <div class="mp-top">
          <span class="mp-grab" aria-hidden="true" />
          <button type="button" class="btn text sm mp-close" onPointerDown={(e) => e.preventDefault()} onClick={p.onClose}>
            {t("mention.close")}
          </button>
        </div>
      )}
      {empty && p.waiting && (
        <div class="mp-wait" role="status">
          <span class="mp-breath" aria-hidden="true" />
          <span>{p.pop.kind === "/" && p.harness ? t("slash.reading", harnessName(p.harness)) : t("mention.looking")}</span>
        </div>
      )}
      {empty && !p.waiting && (
        <div class="mp-empty" role="status">
          {p.pop.q ? t(p.pop.kind === "@" ? "mention.none" : "slash.none", p.pop.q) : t(p.pop.kind === "@" ? "mention.hint" : "slash.none.bare")}
        </div>
      )}
      {p.sections.map((s) => (
        <div class="mp-sec" role="group" aria-label={sectionName(s.key, p.harness)} key={s.key}>
          <div class="mp-head" aria-hidden="true">
            {sectionName(s.key, p.harness)}
          </div>
          {s.rows.map((r) => {
            const i = ++n;
            return <PopRowView key={`${s.key}${i}`} row={r} id={`${p.listId}-${i}`} on={i === p.sel} onHover={() => p.onHover(i)} onPick={() => p.onPick(r)} />;
          })}
        </div>
      ))}
      {!p.sheet && !empty && (
        <div class="mp-keys" aria-hidden="true">
          <span class="mp-k">
            <kbd>
              <KeyMark k="up" />
            </kbd>
            <kbd>
              <KeyMark k="down" />
            </kbd>
            <span>{t("mention.keys.walk")}</span>
          </span>
          <span class="mp-k">
            <kbd>
              <KeyMark k="return" />
            </kbd>
            <span>{t("mention.keys.pick")}</span>
          </span>
          <span class="mp-k">
            <kbd>esc</kbd>
            <span>{t("mention.keys.close")}</span>
          </span>
        </div>
      )}
    </div>
  );
}

/** A key's drawn mark on its cap (never a symbol iOS draws as an emoji). */
function KeyMark({ k }: { k: "up" | "down" | "return" }) {
  const d = k === "up" ? "M5 8.5V2.5M2.5 5L5 2.5 7.5 5" : k === "down" ? "M5 1.5v6M2.5 5L5 7.5 7.5 5" : "M8 2v3.2a1 1 0 01-1 1H2.5M4.5 4.2L2.5 6.2l2 2";
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

/** The words with their picked references marked on the chip's tint, behind the textarea. */
function Marks({ value, refs, taRef }: { value: string; refs: Ref[]; taRef: { current: HTMLTextAreaElement | null } }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const ta = taRef.current;
    const el = ref.current;
    if (!ta || !el) return;
    const sync = () => (el.scrollTop = ta.scrollTop);
    sync();
    ta.addEventListener("scroll", sync);
    return () => ta.removeEventListener("scroll", sync);
  });
  const spans = refSpans(value, refs);
  if (!spans.length) return null;
  const parts: JSX.Element[] = [];
  let at = 0;
  for (const s of spans) {
    if (s.start > at) parts.push(<span key={`t${at}`}>{value.slice(at, s.start)}</span>);
    parts.push(<mark key={`m${s.start}`}>{value.slice(s.start, s.end)}</mark>);
    at = s.end;
  }
  parts.push(<span key="end">{`${value.slice(at)}​`}</span>);
  return (
    <div ref={ref} class="words-marks" aria-hidden="true">
      {parts}
    </div>
  );
}

/**
 * The composer's card: `before` (add pictures, a reply pressed in), the words, `tools` (the mic, the
 * context ring, After this, Stop) and the send. `sending` keeps the words and presses the send in;
 * `canSend` overrides "has words" (pictures alone may go). D534 `mentions`: @ and / work here, for
 * the partner (where "") or the task (where its id, task true).
 */
export function ComposerBox(p: {
  id?: string;
  value: string;
  onInput: (v: string) => void;
  onSend: () => void;
  label: string;
  placeholder: string;
  sending?: boolean;
  canSend?: boolean;
  before?: ComponentChildren;
  tools?: ComponentChildren;
  sendLabel?: string;
  autoFocus?: boolean;
  class?: string;
  onKeyDownCapture?: JSX.KeyboardEventHandler<HTMLDivElement>;
  onKeyDown?: JSX.KeyboardEventHandler<HTMLDivElement>;
  mentions?: { where: string; task?: boolean };
}) {
  const ready = p.canSend ?? !!p.value.trim();
  const state = p.sending ? "sending" : ready ? "ready" : "empty";
  const taRef = useRef<HTMLTextAreaElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [pop, setPop] = useState<Pop | undefined>();
  const [sel, setSel] = useState(0);
  const [shut, setShut] = useState("");
  const [place, setPlace] = useState({ left: 0, maxH: 320 });
  const mn = p.mentions;
  const where = mn?.where ?? "";
  const refs = mn ? (A.refsFor.get(where) ?? []) : [];

  const detect = () => {
    const ta = taRef.current;
    if (!mn || !ta) return;
    const c = ta.selectionStart ?? 0;
    if (document.activeElement !== ta || ta.selectionEnd !== c) return setPop(undefined);
    const m = mentionAt(ta.value, c);
    const s = m ? undefined : slashAt(ta.value, c, !!mn.task);
    const next: Pop | undefined = m ? { kind: "@", ...m } : s ? { kind: "/", ...s } : undefined;
    if (!next || shut === `${next.kind}${next.start}`) {
      if (!next && shut) setShut("");
      if (pop) closeMentions();
      return setPop(undefined);
    }
    if (!pop || pop.kind !== next.kind || pop.q !== next.q || pop.start !== next.start) setSel(0);
    setPop(next);
    if (next.kind === "@") askMentions(where, next.q);
  };

  let sections: PopSection[] = [];
  let waiting = false;
  let harness: string | undefined;
  if (pop?.kind === "@") {
    const have = M.where === where ? M.items : undefined;
    waiting = !have || M.q !== pop.q;
    sections = have ? mentionSections(have) : [];
  } else if (pop?.kind === "/") {
    const list = slashOf(where);
    harness = mn?.task ? (list?.harness ?? undefined) : undefined;
    waiting = !list;
    sections = list ? slashSections(list.entries, pop.q, slashWord) : [];
  }
  const rows = sections.flatMap((s) => s.rows);
  const open = !!pop;
  const listId = `${p.id ?? "composer"}-pop`;

  useLayoutEffect(() => {
    const ta = taRef.current;
    const box = boxRef.current;
    if (!open || !ta || !box || !pop) return;
    const br = box.getBoundingClientRect();
    const tr = ta.getBoundingClientRect();
    const w = Math.min(360, br.width);
    const x = tr.left - br.left + caretLeft(ta, pop.start) - 14;
    setPlace({ left: Math.max(0, Math.min(x, br.width - w)), maxH: Math.max(160, Math.min(sheetLike() ? 420 : 340, br.top - 16)) });
  }, [open, pop?.start, pop?.kind]);

  const pick = (r: PopRow) => {
    const ta = taRef.current;
    if (!ta || !pop) return;
    const caret = ta.selectionStart ?? ta.value.length;
    let token = "";
    if (r.kind === "ref") {
      const ref: Ref = { kind: r.item.kind, id: r.item.id, label: r.item.label };
      pickRef(where, ref);
      token = tokenOf(ref);
    } else if (r.entry.run) {
      // Run at once: what was typed for it goes, its sheet opens.
      const next = ta.value.slice(0, pop.start) + ta.value.slice(caret).replace(/^ /, "");
      p.onInput(next);
      setPop(undefined);
      void runSlash(r.entry.run, where);
      return;
    } else if (r.entry.ref) {
      const label = r.entry.ref.kind === "action" ? t(`slash.${r.entry.name}.chip`) : r.entry.ref.label;
      const ref: Ref = { ...r.entry.ref, label };
      pickRef(where, ref);
      token = tokenOf(ref);
    } else token = (r.entry.insert ?? `/${r.entry.name}`).trimEnd();
    const out = placeToken(ta.value, pop.start, caret, token);
    p.onInput(out.text);
    setPop(undefined);
    closeMentions();
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(out.caret, out.caret);
    });
  };

  const keys = (e: KeyboardEvent): boolean => {
    if (!pop || e.isComposing) return false;
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || (e.ctrlKey && (e.key === "n" || e.key === "p"))) {
      if (!rows.length) return false;
      e.preventDefault();
      const d = e.key === "ArrowDown" || e.key === "n" ? 1 : -1;
      setSel((sel + d + rows.length) % rows.length);
      return true;
    }
    if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") {
      const r = rows[Math.min(sel, rows.length - 1)];
      if (!r) return e.key === "Tab" ? (e.preventDefault(), true) : false;
      e.preventDefault();
      pick(r);
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setShut(`${pop.kind}${pop.start}`);
      setPop(undefined);
      closeMentions();
      return true;
    }
    return false;
  };

  return (
    <div ref={boxRef} class={`composer${p.before ? "" : " bare"}${p.sending ? " is-sending" : ""}${open ? " has-pop" : ""}${p.class ? ` ${p.class}` : ""}`} onKeyDownCapture={p.onKeyDownCapture} onKeyDown={p.onKeyDown}>
      {open && pop && (
        <MentionPop
          pop={pop}
          sections={sections}
          waiting={waiting}
          sel={Math.min(sel, Math.max(0, rows.length - 1))}
          harness={harness}
          listId={listId}
          left={place.left}
          maxH={place.maxH}
          sheet={sheetLike()}
          onHover={setSel}
          onPick={pick}
          onClose={() => (setShut(`${pop.kind}${pop.start}`), setPop(undefined), closeMentions(), taRef.current?.focus())}
        />
      )}
      {p.before}
      <div class="words">
        {mn && <Marks value={p.value} refs={refs} taRef={taRef} />}
        <AutoText
          id={p.id}
          value={p.value}
          onInput={p.onInput}
          onEnter={() => state === "ready" && p.onSend()}
          label={p.label}
          placeholder={p.placeholder}
          autoFocus={p.autoFocus}
          disabled={p.sending}
          taRef={taRef}
          keys={mn ? keys : undefined}
          onCaret={mn ? () => requestAnimationFrame(detect) : undefined}
          aria={mn ? { role: "combobox", "aria-autocomplete": "list", "aria-expanded": open, "aria-controls": open ? listId : undefined, "aria-activedescendant": open && rows.length ? `${listId}-${Math.min(sel, rows.length - 1)}` : undefined } : undefined}
        />
      </div>
      {p.tools}
      <SendButton state={state} label={p.sendLabel} onSend={p.onSend} />
    </div>
  );
}

export type { MentionItem };
