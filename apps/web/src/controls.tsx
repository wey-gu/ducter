// The shared controls (design/ui.md "Shared controls"): every button, switch, chip, coin and
// row a card or a settings page shows is one of these. test/controls.test.ts fails when the
// device card draws a control any other way. A new control is added here, never inline.
import type { ComponentChildren } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { A } from "./app.ts";
import { Coin } from "./coin.tsx";
import { spoken } from "./format.ts";
import { Menu, MenuItem } from "./menu.tsx";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

/** One clay button family (D76): primary first in a row, on the left (D533), at most one per group. chev: a text button
 *  that opens something in place ends in a drawn chevron, turned down while open (never a font's
 *  arrow: iOS draws some of those as an emoji or a missing glyph; D211). */
export function Btn(p: { kind: "primary" | "secondary" | "text" | "accent"; size?: "sm" | "lg"; onClick: () => void; label: string; about?: string; disabled?: boolean; grow?: boolean; class?: string; expanded?: boolean; chev?: boolean; busy?: boolean }) {
  // D552: busy, the button's own working state (更新中…): its clay stays, the shared spinner before
  // its words, and it takes no tap until what it started answers.
  return (
    <button
      class={`btn ${p.kind}${p.size ? ` ${p.size}` : ""}${p.grow ? " grow" : ""}${p.busy ? " busy" : ""}${p.class ? ` ${p.class}` : ""}`}
      onClick={p.onClick}
      title={p.kind === "primary" ? p.label : undefined}
      aria-label={p.about ? spoken(A.L, p.label, p.about) : undefined}
      disabled={p.disabled || p.busy}
      aria-busy={p.busy || undefined}
      aria-expanded={p.expanded}
    >
      {p.busy && <span class="spin sm" aria-hidden="true" />}
      <span class="lbl">{p.label}</span>
      {p.chev && <Chev cls="btn-chev" />}
    </button>
  );
}

/** D262: a button of the shell's bar (a place's own action, the way to another place): the
 *  secondary clay at the small size, a drawn glyph before its word. here: the place shown, pressed
 *  into the bar (sunken, no ledge). icon: the glyph alone, its name the tooltip and the label. */
export function NavBtn(p: { label: string; onClick: () => void; glyph?: ComponentChildren; here?: boolean; icon?: boolean; about?: string; cls?: string; short?: string }) {
  return (
    <button
      class={`btn secondary sm nav${p.here ? " is-here" : ""}${p.icon ? " icon" : ""}${p.cls ? ` ${p.cls}` : ""}`}
      onClick={() => !p.here && p.onClick()}
      aria-current={p.here ? "page" : undefined}
      aria-label={p.icon ? p.label : p.about}
      title={p.icon ? p.label : p.about}
    >
      {p.glyph}
      {!p.icon && <span class="lbl">{p.label}</span>}
      {/* D446: what a phone shows in place of the words (the update pill's count). */}
      {!p.icon && p.short && (
        <span class="lbl-short" aria-hidden="true">
          {p.short}
        </span>
      )}
    </button>
  );
}

/** D264, D270: the places as one control: a small sunk track of drawn marks, the place shown a
 *  raised knob in it, the others flat. Marks alone at every width: each says its name as tooltip
 *  and accessible name. */
export function PlaceSeg(p: { segs: { key: string; label: string; about: string; glyph: ComponentChildren; on: boolean; go: () => void }[] }) {
  return (
    <nav class="places">
      {/* D290: the knob is its own piece under the marks, so it slides to the place shown. */}
      {p.segs.some((s) => s.on) && <span class="knob" aria-hidden="true" style={{ "--i": p.segs.findIndex((s) => s.on) }} />}
      {p.segs.map((s) => (
        <button
          key={s.key}
          class={`place${s.on ? " on" : ""}`}
          aria-current={s.on ? "page" : undefined}
          aria-label={s.about}
          title={s.label}
          onClick={() => !s.on && s.go()}
        >
          {s.glyph}
        </button>
      ))}
    </nav>
  );
}

/** D548: the places on a narrow phone: one button (44, a drawn grid of nine dots) that opens the one
 *  clay menu (D421) with each place, its mark and its name, the place shown checked; a quiet accent
 *  dot on the button while an update waits (its row first in the menu). The wider bars keep
 *  PlaceSeg. */
export function PlacesMenu(p: { segs: { key: string; label: string; glyph: ComponentChildren; on: boolean; go: () => void }[]; dot?: boolean }) {
  const [open, setOpen] = useState(false);
  const at = useRef<HTMLSpanElement>(null);
  const label = A.L.t("nav.places");
  return (
    <span class="places-menu" ref={at}>
      <button type="button" class={`places-btn${open ? " open" : ""}`} aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <svg class="nav-g" viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
          {[4, 9, 14].flatMap((y) => [4, 9, 14].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" fill="currentColor" />))}
        </svg>
        {p.dot && <span class="places-dot" aria-hidden="true" />}
      </button>
      {open && (
        <Menu class="pmenu places-list" label={label} anchor={at} focusFirst onClose={() => setOpen(false)}>
          {p.segs.map((s) => (
            <MenuItem key={s.key} glyph={s.glyph} checked={s.on || undefined} onClick={() => (setOpen(false), !s.on && s.go())}>
              {s.label}
            </MenuItem>
          ))}
        </Menu>
      )}
    </span>
  );
}

/** On hand's mark: three things in hand, a dot and a line each. */
export const OnHandMark = () => (
  <svg class="nav-g" viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
    {[9, 7, 8].map((w, i) => (
      <g key={i}>
        <circle cx="3" cy={4 + i * 5} r="1.4" fill="currentColor" />
        <path d={`M6.4 ${4 + i * 5}h${w}`} stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      </g>
    ))}
  </svg>
);
/** Devices' mark: a laptop with a phone standing in front. */
export const DevicesMark = () => (
  <svg class="nav-g" viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
    <path d="M4 11.5V4h10v3" />
    <path d="M1.5 13.5h8.5" stroke-linecap="round" />
    <path d="M12 8.5h4.5V16H12z" />
  </svg>
);

/** D410: 你的小应用 / Your apps' mark: a small shelf of four rounded tiles, one of them filled. */
export const AppsMark = () => (
  <svg class="nav-g" viewBox="0 0 18 18" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
    <rect x="2" y="2" width="6" height="6" rx="1.8" fill="currentColor" />
    <rect x="10" y="2" width="6" height="6" rx="1.8" />
    <rect x="2" y="10" width="6" height="6" rx="1.8" />
    <rect x="10" y="10" width="6" height="6" rx="1.8" />
  </svg>
);

/** The drawn marks of the bar (D262): Settings' gear, New task's ＋, the update pebble. */
export const Gear = () => {
  return (
    <svg class="nav-g" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <circle cx="10" cy="10" r="5.4" fill="none" stroke="currentColor" stroke-width="2.6" />
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const a = (i * Math.PI) / 3 + Math.PI / 6;
        return <path key={i} d={`M${10 + Math.cos(a) * 6} ${10 + Math.sin(a) * 6}L${10 + Math.cos(a) * 8.6} ${10 + Math.sin(a) * 8.6}`} stroke="currentColor" stroke-width="3.6" stroke-linecap="round" />;
      })}
    </svg>
  );
}
export const PlusMark = () => {
  return (
    <svg class="nav-g" viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
      <path d="M7 2v10M2 7h10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
    </svg>
  );
}
export const UpdatePebble = () => {
  return (
    <svg class="nav-g up" viewBox="0 0 22 22" width="22" height="22" aria-hidden="true">
      <circle cx="11" cy="12" r="9" fill="var(--press-accent, #C9642A)" />
      <circle cx="11" cy="11" r="9" fill="var(--accent)" />
      <path d="M11 15V7M7.6 10.2 11 6.8l3.4 3.4" fill="none" stroke="var(--surface)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

/** A Btn that opens a page elsewhere (a sign-in, a vendor's site) in a new tab: the same look. */
export function LinkBtn(p: { kind: "primary" | "secondary" | "text"; size?: "sm"; href: string; label: string; class?: string; onOpen?: () => void }) {
  return (
    <a class={`btn ${p.kind}${p.size ? ` ${p.size}` : ""}${p.class ? ` ${p.class}` : ""}`} href={p.href} target="_blank" rel="noopener noreferrer" onClick={p.onOpen ? () => p.onOpen!() : undefined}>
      <span class="lbl">{p.label}</span>
      {p.kind === "text" && <Chev cls="btn-chev" />}
    </a>
  );
}

/** D482: a page named in running words (a source under 怎么知道的): underlined words that wrap
 *  inside their column, never a one-line button past the card's edge; its chevron after them. */
export function TextLink(p: { href: string; label: string; class?: string; about?: string }) {
  // D566: about, what a short link acts on ("Open": the file in Nowledge Mem), for its accessible name.
  return (
    <a class={`tlink${p.class ? ` ${p.class}` : ""}`} href={p.href} target="_blank" rel="noopener noreferrer" aria-label={p.about ? spoken(A.L, p.label, p.about) : undefined}>
      {p.label}
      <Chev cls="btn-chev" />
    </a>
  );
}

/** The one drawn chevron (D211, D213): every text link, button or row that opens more ends in it,
 *  in its text's ink; it turns down while what it opens is open (open, or an aria-expanded parent);
 *  back points the way back. Never a font's › ‹ ⌄: iOS draws some of those as an emoji or a
 *  missing glyph, and each font draws them at its own size and weight. */
export function Chev(p: { open?: boolean; back?: boolean; cls?: string }) {
  return (
    <svg class={`chev-g${p.open ? " open" : ""}${p.back ? " back" : ""}${p.cls ? ` ${p.cls}` : ""}`} width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M4.5 2.5 8 6l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

/** D535: a needs-you count as a door (the Mac's needsDoor): its words in the needs-you ink on a small
 *  clay pill of the needs-you surface, the drawn chevron after them; it sinks into its ledge pressed.
 *  A tap opens the next item that waits (app.css .needs-door). */
export function NeedsDoor(p: { words: string; about: string; onClick: () => void; cls?: string }) {
  return (
    <button type="button" class={`needs-door${p.cls ? ` ${p.cls}` : ""}`} aria-label={spoken(A.L, p.words, p.about)} onClick={p.onClick}>
      <span>{p.words}</span>
      <Chev />
    </button>
  );
}

/** D535: 「n 个等你」 in the conversation's bar (the Mac's countDoor): the count's own words in the
 *  needs-you ink, a quiet button of the bar, the door to the next item. */
export function CountDoor(p: { words: string; about: string; onClick: () => void }) {
  return (
    <button type="button" class="sum-needs" aria-label={spoken(A.L, p.words, p.about)} onClick={p.onClick}>
      {p.words}
    </button>
  );
}

/** D517: a count of what needs you, on a figure's shoulder or beside a back button: a clay pebble in
 *  the needs-you surface and ink on its ledge (app.css .pl-n), the Mac's countPebble. */
export function CountPebble(p: { n: number }) {
  return (
    <span class="pl-n" aria-hidden="true">
      {p.n}
    </span>
  );
}

/** D273: a group's "add" row, the row anatomy of every Settings row: a plus in its icon tile, the
 *  title, one muted line. */
export function AddRow(p: { label: string; help?: string; onClick: () => void }) {
  return (
    <button class="set-row set-add" onClick={p.onClick}>
      <span class="set-tile" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 14 14">
          <path d="M7 2.5v9M2.5 7h9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
      </span>
      <span class="grow">
        <b>{p.label}</b>
        {p.help && <small>{p.help}</small>}
      </span>
    </button>
  );
}

/** The one switch, with its words and an optional note. */
export function Toggle(p: { label: string; help?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; lead?: ComponentChildren; how?: string }) {
  const row = (
    <label class={`switch${p.lead ? " lead" : ""}`}>
      {p.lead}
      <span>
        {p.label}
        {p.help && <small>{p.help}</small>}
      </span>
      <input type="checkbox" role="switch" checked={p.checked} disabled={p.disabled} onChange={(e) => p.onChange((e.target as HTMLInputElement).checked)} />
    </label>
  );
  // D424: the explanation one quiet tap away, outside the label so the tap never flips the switch.
  if (!p.how) return row;
  return (
    <div class="switch-how">
      {row}
      <How about={p.label} detail={p.how} />
    </div>
  );
}

/** 怎么做到的 / How it works (D424): an explanation kept reachable, not shown. The quiet link with
 *  its drawn chevron; pressed, the words open under it in the muted ink and it reads 收起 / Hide. */
export function How(p: { about: string; detail: string }) {
  const [open, setOpen] = useState(false);
  const label = t(open ? "how.less" : "how.more");
  return (
    <div class={`how${open ? " open" : ""}`}>
      <button type="button" class="qlink how-tap" aria-expanded={open} aria-label={spoken(A.L, p.about, label)} onClick={() => setOpen(!open)}>
        {label}
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d={open ? "M3 4.5l3 3 3-3" : "M4.5 3l3 3-3 3"} />
        </svg>
      </button>
      {open && <p class="how-text">{p.detail}</p>}
    </div>
  );
}

/** The destructive text button: failed ink, flat (断开这台 MacBook, a connection's 断开). `quiet`
 *  (D289): before it is confirmed, the soft ink, the failed ink only under the pointer. */
export function DangerButton(p: { label: string; about?: string; quiet?: boolean; onClick: () => void }) {
  return (
    <button class={`danger-text${p.quiet ? " quiet" : ""}`} aria-label={p.about ? spoken(A.L, p.label, p.about) : undefined} onClick={p.onClick}>
      {p.label}
    </button>
  );
}

/** The one ⋯: it opens more in place, never a floating menu. */
export function MoreButton(p: { label: string; open: boolean; onClick: () => void }) {
  return (
    <button class={`more-btn${p.open ? " open" : ""}`} aria-label={p.label} aria-expanded={p.open} onClick={p.onClick}>
      ⋯
    </button>
  );
}

/** A name that renames in place: a tap makes it a field; Enter keeps it, Esc puts it back. */
export function RenameTitle({ id, name, renamable }: { id: string; name: string; renamable: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const save = () => {
    const next = (draft ?? "").trim();
    if (next && next !== name) A.renameDevice(id, next);
    setDraft(null);
  };
  if (draft === null)
    return renamable ? (
      <button class="dev-name" aria-label={spoken(A.L, t("device.rename"), name)} onClick={() => setDraft(name)}>
        {name}
        <span class="pen" aria-hidden="true" />
      </button>
    ) : (
      <div class="dev-name">{name}</div>
    );
  return (
    <div class="dev-edit">
      <input
        class="dev-input"
        value={draft}
        aria-label={t("device.rename")}
        autoFocus
        onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") e.stopPropagation(), setDraft(null);
        }}
        onBlur={save}
      />
      <div class="small sub">{t("device.rename.keys")}</div>
    </div>
  );
}

/** A coin in a device's tray, its name under it; the dot when there is an update; a ring while one runs. */
export function CoinButton(p: { harness: string; name: string; label: string; off: boolean; dot: boolean; running: boolean; pop: boolean; sel: boolean; onClick: () => void }) {
  return (
    <button class={`coin-tile${p.sel ? " sel" : ""}${p.off ? " off" : ""}`} aria-label={p.label} aria-pressed={p.sel} onClick={p.onClick}>
      <span class={`c${p.pop ? " pop" : ""}`}>
        <Coin harness={p.harness} size={52} off={p.off} />
        {p.dot && !p.running && <i class="cdot" />}
        {p.running && !p.sel && <i class="cring" />}
      </span>
      <span class="cn">{p.name}</span>
    </button>
  );
}

/** The dashed coin-sized socket at the tray's end: 再登录一个. */
export function SocketButton(p: { label: string; sel: boolean; onClick: () => void }) {
  return (
    <button class={`coin-tile socket${p.sel ? " sel" : ""}`} aria-pressed={p.sel} onClick={p.onClick}>
      <span class="c">+</span>
      <span class="cn">{p.label}</span>
    </button>
  );
}

/**
 * An ability as a toggle chip: its clay and 2–5 words; on, off, can be added (dashed) or failed; ⓘ
 * beside it. D199: later is a ghost (the desaturated clay and 以后会有): it only explains itself.
 * D237: elsewhere is the home having it through another computer: full clay, flat on the page,
 * `where` (在 MacBook Pro M3 上) and a chevron; a tap opens that computer's card.
 * `state` words a failed chip's trouble when it isn't "didn't start" (打电话: 需要重新登录).
 */
export function Chip(p: { label: string; art?: string; look: "on" | "off" | "add" | "fail" | "later" | "elsewhere"; state?: string; where?: string; info?: string; infoOpen?: boolean; onClick: () => void; onInfo?: () => void }) {
  const [squish, setSquish] = useState(0);
  const still = p.look === "later" || p.look === "elsewhere";
  const state = p.state ?? (p.look === "on" ? t("chip.state.on") : p.look === "off" ? t("chip.state.off") : p.look === "fail" ? t("chip.failed") : p.look === "later" ? t("chip.state.later") : p.look === "elsewhere" ? (p.where ?? "") : "");
  return (
    <span class="chip-wrap">
      <button
        key={squish}
        class={`ach ${p.look}${squish ? " squish" : ""}`}
        aria-pressed={still ? undefined : p.look === "on"}
        aria-label={p.look === "add" ? `+ ${p.label}` : spoken(A.L, p.label, state)}
        onClick={() => (still || setSquish(squish + 1), p.onClick())}
      >
        {p.art && <img src={p.art} alt="" />}
        {p.look === "add" ? `+ ${p.label}` : p.label}
        {p.look === "later" && (
          <small class="ach-later" aria-hidden="true">
            {t("chip.state.later")}
          </small>
        )}
        {p.look === "elsewhere" && (
          <small class="ach-where" aria-hidden="true">
            <span>{p.where}</span>
            <i class="ach-go" />
          </small>
        )}
      </button>
      {p.onInfo && (
        <button class={`chip-i${p.infoOpen ? " open" : ""}`} aria-label={spoken(A.L, t("chip.info"), p.label)} aria-expanded={!!p.infoOpen} onClick={p.onInfo}>
          i
        </button>
      )}
    </span>
  );
}

/**
 * D398: a card's foot: a hairline, then one quiet row (its title, a muted summary, a chevron) that
 * opens in place, pushing what is under it down, never over anything. The Mac's sheetFold.
 */
export function Fold({ title, summary, children }: { title: string; summary?: string; children: ComponentChildren }) {
  const [open, setOpen] = useState(false);
  return (
    <div class="dc-fold">
      <button class="dc-fold-row" aria-expanded={open} onClick={() => setOpen(!open)}>
        <b>{title}</b>
        {summary && <small>{summary}</small>}
        <Chev open={open} />
      </button>
      {open && <div class="dc-fold-body">{children}</div>}
    </div>
  );
}

/** A step's number in a short numbered sequence: a sunken disc (the lend sheet's three steps' look; D518 a sign-in's two). */
export function StepNumber({ n }: { n: number }) {
  return (
    <span class="step-n" aria-hidden="true">
      {n}
    </span>
  );
}

/** D398: an optional step as one framed row (its mark, its title, a muted line, a chevron); open, the step is under it. */
export function StepRow({ mark, title, sub, open, onClick }: { mark: ComponentChildren; title: string; sub?: string; open: boolean; onClick: () => void }) {
  return (
    <button class={`hs-lock${open ? " open" : ""}`} aria-expanded={open} onClick={onClick}>
      {mark}
      <span class="grow">
        <b>{title}</b>
        {sub && <small>{sub}</small>}
      </span>
      <Chev open={open} />
    </button>
  );
}

/**
 * One line in a list of devices: clay, the name alone, and under it one short line: what it is
 * doing (14 小时前在线 / Online 14 hours ago), or a state word in its color with its dot; 有更新 a
 * fact of its own beside it (D291: never "iPhone · 14 小时前"). Each line ellipsizes on its own.
 */
export function ListRow(p: { art: string; name: string; word: string; tone?: string; update?: string; plus?: boolean; onClick: () => void; children?: ComponentChildren }) {
  return (
    <button class={p.plus ? "li-row add" : "li-row"} aria-label={spoken(A.L, p.name, p.word, p.update)} onClick={p.onClick}>
      <img src={p.art} alt="" />
      {/* D358: 加一台设备's row: a plus drawn on the empty slot (never a typed glyph). */}
      {p.plus && <i class="li-plus" aria-hidden="true" />}
      <span class="t">
        <b>{p.name}</b>
        {(p.word || p.update) && (
          <span class="li-line">
            {p.word && (
              <small class={p.tone ?? ""}>
                {p.tone && <i class="sdot" aria-hidden="true" />}
                {p.word}
              </small>
            )}
            {p.update && <small class="update">{p.update}</small>}
          </span>
        )}
      </span>
      <span class="chev" aria-hidden="true">
        <Chev />
      </span>
    </button>
  );
}

/** Back to the list a page was pushed from. */
export function BackRow(p: { label: string; onClick: () => void }) {
  return (
    <button class="set-back" onClick={p.onClick}>
      <span class="back-chev" aria-hidden="true">
        <Chev back />
      </span>
      {p.label}
    </button>
  );
}

/** A segmented single choice (D76): the chosen one a white surface on its base; stacks when the words don't fit. */
export function Seg<V extends string | number>(p: { label: string; value: V | undefined; options: { v: V; label: string }[]; onPick: (v: V) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const words = p.options.map((o) => o.label).join("\n");
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.classList.remove("stack", "two");
      // D445: a choice whose own words overflow it counts too (the buttons shrink before the row does:
      // To-do sources' "Take it directly" ran into "Don't tell me" at 390).
      const spill = () => el.scrollWidth > el.clientWidth + 1 || [...el.children].some((b) => b.scrollWidth > b.clientWidth + 1);
      if (!spill()) return;
      // D468: four that don't fit in a line sit two by two while their words fit (发现了就说 stood four
      // lines tall on a phone); else one per line.
      if (el.children.length === 4) {
        el.classList.add("two");
        if (!spill()) return;
        el.classList.remove("two");
      }
      el.classList.add("stack");
    };
    fit();
    if (typeof ResizeObserver === "undefined") return;
    let w = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== w) (w = el.clientWidth), fit();
    });
    ro.observe(el);
    // Fonts arriving late change the words' widths.
    document.fonts?.ready.then(fit).catch(() => {});
    return () => ro.disconnect();
  }, [words]);
  return (
    <div class="seg" role="radiogroup" aria-label={p.label} ref={ref}>
      {p.options.map((o) => (
        <button key={String(o.v)} role="radio" aria-checked={o.v === p.value} class={o.v === p.value ? "on" : ""} onClick={() => o.v !== p.value && p.onPick(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * D166: one app a source can read, on the accounts card: a literal rounded square with the app's
 * mark, its label under it (the app, then the account). sel: its detail is open; off: not watched
 * (faded); grey: excluded or unreachable; add: the dashed tile at the tray's end (再连一个).
 */
export function AppTile(p: { label: string; sub?: string; about?: string; sel?: boolean; off?: boolean; grey?: boolean; add?: boolean; onClick: () => void; children?: ComponentChildren }) {
  // about is the whole name (Slack · Nowledge Labs, Inc): what it is called aloud, and on hover when a line is cut short (D192).
  const acc = p.about || spoken(A.L, p.label, p.sub);
  return (
    <button class={`app-tile${p.sel ? " sel" : ""}${p.off ? " off" : ""}${p.grey ? " grey" : ""}${p.add ? " add" : ""}`} aria-label={acc} title={acc} aria-pressed={p.add ? undefined : !!p.sel} onClick={p.onClick}>
      <span class="sq" aria-hidden="true">
        {p.add ? "+" : p.children}
      </span>
      <span class="an" aria-hidden="true">
        {p.label}
      </span>
      {p.sub && (
        <span class="as" aria-hidden="true">
          {p.sub}
        </span>
      )}
    </button>
  );
}

/**
 * D185: one property of a sheet that opens a short list under it (New task's place, branch,
 * computer, who and when): one height, flat on the sunken tint, a caret at its end; open, white
 * with an ink hairline. The Mac's `pill`.
 */
export function Pill(p: { label: string; about: string; open: boolean; onClick: () => void; children: ComponentChildren }) {
  return (
    <button class={`pill${p.open ? " open" : ""}`} aria-label={spoken(A.L, p.about, p.label)} aria-expanded={p.open} onClick={p.onClick}>
      {p.children}
      <svg class="caret" viewBox="0 0 10 10" aria-hidden="true">
        <path d="M2 3.5 5 6.7 8 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
  );
}

/** D202: one short choice in a row of them (a model, an effort): the chosen one raised. The Mac's `choice`. */
export function Choice(p: { label: string; on: boolean; onClick: () => void; children: ComponentChildren }) {
  return (
    <button class={`nt-chip${p.on ? " on" : ""}`} role="radio" aria-checked={p.on} aria-label={p.label} onClick={() => !p.on && p.onClick()}>
      {p.children}
    </button>
  );
}

/** D185: one choice in the list a Pill opens: the chosen one sunken with a check, off greyed. The Mac's `menuRow`. */
export function MenuRow(p: { label: string; on: boolean; off?: boolean; why?: string; onClick: () => void; children: ComponentChildren }) {
  return (
    <button class={`menu-row${p.on ? " on" : ""}`} role="radio" aria-checked={p.on} aria-label={p.label} disabled={p.off} title={p.why} onClick={p.onClick}>
      <span class="mr-body">{p.children}</span>
      {p.on && (
        <svg class="mr-check" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M2.5 7.4 5.6 10.4 11.5 3.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      )}
    </button>
  );
}

/** A group of separate facts (D291): each its own small element, spaced by a gap token and free to
 *  wrap, never one string joined by "·". Empty facts drop out; nothing renders when none is left.
 *  A fact with a role of its own (a state word with its dot, a time) is passed as an element. */
export function Facts(p: { items: (ComponentChildren | false | null | undefined)[]; class?: string }) {
  const xs = p.items.filter((x) => x !== false && x != null && x !== "");
  if (!xs.length) return null;
  return <span class={`facts${p.class ? ` ${p.class}` : ""}`}>{xs.map((x, i) => <span key={i}>{x}</span>)}</span>;
}

/** D289: a row that opens more under it (a source's service, a setup's step): its tile, words and
 *  chevron are the button; a switch may stand apart at its right edge. The Mac's `openRow`. */
export function OpenRow(p: { tile: ComponentChildren; title: string; line?: string; warn?: boolean; state?: { text: string; tone?: "done" | "bad" }; open: boolean; onClick: () => void; sw?: { label: string; on: boolean; onChange: (v: boolean) => void } }) {
  return (
    <div class="g-open-row">
      <button class="g-open" aria-expanded={p.open} onClick={p.onClick}>
        {p.tile}
        <span class="grow">
          <b>
            {p.title}
            <Chev open={p.open} />
          </b>
          {p.line && <small class={p.warn ? "warn" : undefined}>{p.line}</small>}
        </span>
      </button>
      {p.state && <span class={`g-state${p.state.tone ? ` tone-${p.state.tone}` : ""}`}>{p.state.text}</span>}
      {p.sw && <Switch label={p.sw.label} on={p.sw.on} onChange={p.sw.onChange} />}
    </div>
  );
}

/** The one switch alone at a row's right edge, its words being the row's own (D289, D295). */
export function Switch(p: { label: string; on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label class="switch bare">
      <input type="checkbox" role="switch" aria-label={p.label} checked={p.on} disabled={p.disabled} onChange={(e) => p.onChange((e.target as HTMLInputElement).checked)} />
    </label>
  );
}

/** D403: words someone may edit in place before they go out (a reply in a find): a sunken well that grows with its text up to 40vh, no grip (as D385's notes); CSS field-sizing does it where the browser can. */
export function TextBox(p: { value: string; label: string; lang?: string; class?: string; onInput: (v: string) => void }) {
  const fit = (el: HTMLTextAreaElement | null) => {
    if (!el || CSS.supports?.("field-sizing", "content")) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight + 2, window.innerHeight * 0.4)}px`;
  };
  return (
    <textarea class={`textbox${p.class ? ` ${p.class}` : ""}`} value={p.value} rows={2} lang={p.lang} aria-label={p.label} ref={fit} onInput={(e) => (fit(e.target as HTMLTextAreaElement), p.onInput((e.target as HTMLTextAreaElement).value))} />
  );
}

/** D536: one line of words someone types (a partner's name, what it looks after): 44 tall, a hairline
 *  that becomes the one accent ring while typing in it (never the page's outer focus ring on top).
 *  The Mac's `lineField`. */
export function Field(p: { value: string; label: string; placeholder?: string; maxLength?: number; autoFocus?: boolean; strong?: boolean; onInput: (v: string) => void; onKeyDown?: (e: KeyboardEvent) => void }) {
  return (
    <input
      class={`field${p.strong ? " strong" : ""}`}
      value={p.value}
      aria-label={p.label}
      placeholder={p.placeholder}
      maxLength={p.maxLength}
      autoFocus={p.autoFocus}
      onInput={(e) => p.onInput((e.target as HTMLInputElement).value)}
      onKeyDown={p.onKeyDown}
    />
  );
}

/** D457: one part of a path's breadcrumb that steps back there (the folder browser's). */
export function CrumbStep(p: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={p.onClick}>
      {p.label}
    </button>
  );
}

/** D457: a row of a list walked with the keys (↑↓): `at` is the row the keys are on; hovering moves it there. */
export function OptionRow(p: { at: boolean; class?: string; onClick: () => void; onHover?: () => void; children: ComponentChildren }) {
  return (
    <button type="button" role="option" aria-selected={p.at} class={`${p.class ?? ""}${p.at ? " at" : ""}`} onClick={p.onClick} onMouseMove={p.onHover}>
      {p.children}
    </button>
  );
}

/** D519: a section's name over its card, the quiet label On hand's sections wear (a heading). */
export function SectionHead(p: { label: string; end?: ComponentChildren }) {
  return (
    <h2 class="sec-head">
      <span class="nm">{p.label}</span>
      {p.end && <span class="end">{p.end}</span>}
    </h2>
  );
}

/** D519: a small state word on its own tint (a Keep's 照看中, 1 件在等你, 从 11 月 22 日起): on, needs, or plain. */
/** D542: a Tag's tint: on (done), needs, and the other states' own (working, waiting, failed); plain sunken. */
export type TagTone = "on" | "needs" | "working" | "waiting" | "failed" | "";
export function Tag(p: { text: string; tone?: TagTone }) {
  return <span class={`tag${p.tone ? ` ${p.tone}` : ""}`}>{p.text}</span>;
}

/** D519: a list's time column: one line, tabular figures, one fixed width, so the rows line up (today
 *  its clock, else its day: format.ts colTime). */
export function TimeCol(p: { at: string; text: string }) {
  return (
    <time class="time-col" dateTime={p.at}>
      {p.text}
    </time>
  );
}

/**
 * D533: a rule row changed in place (a Keep's 怎么照看): its name, a quiet 改 / Change at the name's
 * right while it may change, its value lines and a muted one. Open: the control in the slot under
 * the name, then 保存 / Save (primary, first, on the left) and 取消 / Cancel; Enter saves, Escape cancels. `error`
 * stands under the control in the failed ink; `busy` says the change is on its way.
 */
export function EditRow(p: {
  label: string;
  values: string[];
  muted?: string;
  editable: boolean;
  open: boolean;
  busy?: boolean;
  error?: string;
  onOpen: () => void;
  onSave: () => void;
  onCancel: () => void;
  children?: ComponentChildren;
}) {
  return (
    <div
      class={`edit-row${p.open ? " open" : ""}`}
      onKeyDown={(e) => {
        if (!p.open) return;
        if (e.key === "Escape") e.stopPropagation(), p.onCancel();
        if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement) && !(e.target instanceof HTMLButtonElement)) e.preventDefault(), p.onSave();
      }}
    >
      <span class="er-head">
        <span class="k">{p.label}</span>
        {p.editable && !p.open && <Btn kind="text" size="sm" label={t("keep.edit")} about={t("keep.edit.about", p.label)} onClick={p.onOpen} />}
      </span>
      {!p.open &&
        p.values.map((v) => (
          <span key={v} class="v">
            {v}
          </span>
        ))}
      {!p.open && p.muted && <span class="v m">{p.muted}</span>}
      {p.open && (
        <>
          <div
            class="er-slot"
            ref={(el) => {
              // Open: the keys are the row's at once (Escape cancels, Enter saves), even when its control is a choice, not a field.
              if (el && !el.closest(".edit-row")?.contains(document.activeElement)) (el.querySelector<HTMLElement>("input, textarea, [aria-checked=true], button") ?? el).focus({ preventScroll: true });
            }}
          >
            {p.children}
          </div>
          {p.error && (
            <p class="er-err" role="alert">
              {p.error}
            </p>
          )}
          <span class="er-acts">
            <Btn kind="primary" size="sm" label={p.busy ? t("keep.edit.saving") : t("keep.edit.save")} disabled={p.busy} onClick={p.onSave} />
            <Btn kind="text" size="sm" label={t("keep.edit.cancel")} onClick={p.onCancel} />
          </span>
        </>
      )}
    </div>
  );
}

/** D533: a whole number with its unit word after it ([45] 分钟一轮), on D536's Field: digits only; the caller checks its range. */
export function NumberField(p: { value: string; label: string; unit: string; autoFocus?: boolean; onInput: (v: string) => void }) {
  return (
    <span class="num-field">
      <Field value={p.value} label={p.label} maxLength={5} autoFocus={p.autoFocus} onInput={(v) => p.onInput(v.replace(/[^\d]/g, "").slice(0, 5))} />
      <span class="unit">{p.unit}</span>
    </span>
  );
}

/** D521: a drawn glyph alone as a button (a row's 停下 / Stop): its name the tooltip and the label,
 *  the hit area the row's height (28, 44 on a phone), the glyph in the muted ink, warming under the
 *  pointer (danger: the failed ink). The Mac's `iconButton`. */
export function IconBtn(p: { label: string; about?: string; tip?: string; pressed?: boolean; cls?: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: ComponentChildren }) {
  // tip: the tooltip when it says more than the name (its key, D567's 铺满 ⌘Return); pressed: a toggle's state.
  return (
    <button type="button" class={`icon-btn${p.danger ? " danger" : ""}${p.cls ? ` ${p.cls}` : ""}`} title={p.tip ?? p.label} aria-label={p.about ? spoken(A.L, p.label, p.about) : p.label} aria-pressed={p.pressed} disabled={p.disabled} onClick={p.onClick}>
      {p.children}
    </button>
  );
}

/**
 * D521: one dense row of a quiet tray (the opened task's 后台 / In the background): a drawn mark,
 * its words cut with an ellipsis (the whole in the tooltip), its facts at the right edge in mono
 * (a time, a state), an optional chevron when it opens (open: what it holds, under it), and an
 * optional action apart at its far right (an IconBtn). head: the tray's own head row (stronger
 * words). The Mac's `trayRow`.
 */
export function TrayRow(p: { mark?: ComponentChildren; markAbout?: string; words: string; head?: boolean; tone?: string; side?: ComponentChildren; open?: boolean; onClick?: () => void; act?: ComponentChildren; children?: ComponentChildren }) {
  const inner = (
    <>
      {p.mark && (
        <span class="tray-mark" role={p.markAbout ? "img" : undefined} aria-label={p.markAbout} title={p.markAbout}>
          {p.mark}
        </span>
      )}
      <span class="tray-words" title={p.words}>
        {p.words}
      </span>
      {p.side && <span class="tray-side">{p.side}</span>}
      {p.onClick && p.open !== undefined && <Chev open={p.open} cls="tray-chev" />}
    </>
  );
  return (
    <div class={`tray-row${p.head ? " head" : ""}${p.tone ? ` ${p.tone}` : ""}${p.act !== undefined ? " has-act" : ""}`}>
      <div class="tray-line">
        {p.onClick ? (
          <button type="button" class="tray-main" aria-expanded={p.open} onClick={p.onClick}>
            {inner}
          </button>
        ) : (
          <span class="tray-main">{inner}</span>
        )}
        {p.act !== undefined && <span class="tray-act">{p.act}</span>}
      </div>
      {p.open && p.children}
    </div>
  );
}

/**
 * D532: a system notice, the app speaking (design/ui.md "Notices"; the Mac's `notice`): a slim strip
 * just above the composer, a sunken tint (done, alert: their own surfaces), a drawn glyph at its
 * start, 13/12px words, small buttons at its end.
 */
export function Notice(p: { tone?: "info" | "done" | "alert"; glyph?: "pebble"; title?: string; body?: string; sub?: string; actions?: ComponentChildren; class?: string }) {
  return (
    <div class={`notice ${p.tone ?? "info"}${p.class ? ` ${p.class}` : ""}`} role={p.tone === "alert" ? "alert" : "status"}>
      {p.glyph === "pebble" && (
        <svg class="notice-g" viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
          <ellipse cx="9" cy="11" rx="7" ry="5.4" fill="var(--ink-muted)" opacity="0.45" />
          <ellipse cx="9" cy="9.6" rx="7" ry="5.4" fill="var(--ink-muted)" />
          <ellipse cx="7.2" cy="7.6" rx="2.6" ry="1.3" fill="var(--surface)" opacity="0.35" />
        </svg>
      )}
      <div class="notice-w">
        {p.title && <b>{p.title}</b>}
        {p.body && <span>{p.body}</span>}
        {p.sub && <small>{p.sub}</small>}
      </div>
      {p.actions && <div class="notice-a">{p.actions}</div>}
    </div>
  );
}

// ---------- D530: the opened task's steps ----------

const StackMark = () => (
  <svg class="g" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
    <path d="M3 4.5h10M3 8h10M3 11.5h6" />
  </svg>
);

/** D530: a turn's work under one quiet line: the drawn stack (the shared spinner while it works),
 *  "12 步，3 条消息", a small × in the failed ink with how many failed, the chevron, and a hairline on
 *  to the column's edge. The Mac's workHead. */
export function WorkHead(p: { words: string; failed: number; live?: boolean; open: boolean; onClick: () => void }) {
  const failed = p.failed > 0 ? t("work.failed", p.failed) : "";
  return (
    <button type="button" class={`work-head${p.open ? " open" : ""}`} aria-expanded={p.open} aria-label={spoken(A.L, p.words, failed)} onClick={p.onClick}>
      <StackMark />
      <span class="words">{p.words}</span>
      {failed && (
        <span class="failed" title={failed} aria-hidden="true">
          <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <path d="M3.5 3.5l5 5M8.5 3.5l-5 5" />
          </svg>
          {p.failed}
        </span>
      )}
      <Chev open={p.open} />
      <span class="rule" aria-hidden="true" />
    </button>
  );
}

/** D530: a step's object in mono on the inline code tint: one line, cut with an ellipsis, its whole
 *  on hover. Never pressable on its own. The Mac's stepChip. */
export function CodeChip(p: { text: string; title?: string }) {
  return (
    <code class="chip-code" title={p.title ?? p.text}>
      {p.text}
    </code>
  );
}

const PageMark = () => (
  <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round">
    <path d="M2.5 1.5h4.8l2.2 2.2v6.8h-7z M4.5 6h3M4.5 8.2h3" />
  </svg>
);
const PictureMark = () => (
  <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round">
    <path d="M1.5 2.5h9v7h-9z M1.5 8.5l3-2.8 2.2 2 1.3-1 2.5 1.8" />
    <circle cx="8" cy="4.6" r="0.9" fill="currentColor" stroke="none" />
  </svg>
);

/** D530: a file a step read or edited: its kind's small mark and its name in mono on the inline code
 *  tint, its tail on hover; with onOpen it opens the file inside Ducter (D356's viewer). The Mac's
 *  fileChip. */
export function FileChip(p: { name: string; tail: string; picture?: boolean; cls?: string; onOpen?: () => void }) {
  const cls = `chip-file${p.cls ? ` ${p.cls}` : ""}`;
  const inner = (
    <>
      {p.picture ? <PictureMark /> : <PageMark />}
      <span>{p.name}</span>
    </>
  );
  return p.onOpen ? (
    <button
      type="button"
      class={cls}
      title={p.tail}
      aria-label={t("file.open", p.name)}
      onClick={(e) => {
        e.stopPropagation();
        p.onOpen!();
      }}
    >
      {inner}
    </button>
  ) : (
    <span class={cls} title={p.tail}>
      {inner}
    </span>
  );
}

/** D530: a key drawn in its cap and what it does, in the small muted type: the working composer's
 *  「↩ 插一句」 and 「⌥↩ 等它做完再说」. Keys are drawn, never typed glyphs. The Mac's keyHint. */
export function KeyHint(p: { opt?: boolean; words: string }) {
  return (
    <span class="key-hint">
      <kbd aria-hidden="true">
        {p.opt && (
          <svg width="11" height="11" viewBox="0 0 12 12">
            <path d="M1.5 3h3l3.3 6h2.7M7.2 3h3.3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        )}
        <svg width="11" height="11" viewBox="0 0 12 12">
          <path d="M10 2.5v4H3M5 4.5 3 6.5l2 2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </kbd>
      {p.words}
    </span>
  );
}

/** D544: a slim clay pill on the reading measure: a 24 mark, then its facts (the lead in ink, one in
 *  the needs ink, the rest muted; each its own element, D291), the whole one action. The Mac's
 *  factPill (shared.go). */
export function FactPill(p: { mark: ComponentChildren; facts: { text: string; lead?: boolean; needs?: boolean }[]; label: string; on: boolean; onClick: () => void }) {
  return (
    <button class={`fact-pill${p.on ? " on" : ""}`} tabIndex={p.on ? 0 : -1} aria-hidden={!p.on} onClick={p.onClick} aria-label={p.label}>
      <span class="fp-mk" aria-hidden="true">
        {p.mark}
      </span>
      {p.facts.map((f, i) => (
        <span key={i} class={f.lead ? "fp lead" : f.needs ? "fp needs" : "fp"} aria-hidden="true">
          {f.text}
        </span>
      ))}
    </button>
  );
}

/** The bar's way back (‹ 对话, ‹ 手头的事): the one drawn back mark, 18. */
export const BackGlyph = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <path d="M11 4L6 9l5 5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);
