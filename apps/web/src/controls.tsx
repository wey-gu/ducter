// The shared controls (design/ui.md "Shared controls"): every button, switch, chip, coin and
// row a card or a settings page shows is one of these. test/controls.test.ts fails when the
// device card draws a control any other way. A new control is added here, never inline.
import type { ComponentChildren } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { A } from "./app.ts";
import { Coin } from "./coin.tsx";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

/** One clay button family (D76): primary last in a row, at most one per group. */
export function Btn(p: { kind: "primary" | "secondary" | "text" | "accent"; size?: "sm" | "lg"; onClick: () => void; label: string; about?: string; disabled?: boolean; grow?: boolean; class?: string; expanded?: boolean }) {
  return (
    <button
      class={`btn ${p.kind}${p.size ? ` ${p.size}` : ""}${p.grow ? " grow" : ""}${p.class ? ` ${p.class}` : ""}`}
      onClick={p.onClick}
      title={p.kind === "primary" ? p.label : undefined}
      aria-label={p.about ? `${p.label} · ${p.about}` : undefined}
      disabled={p.disabled}
      aria-expanded={p.expanded}
    >
      <span class="lbl">{p.label}</span>
    </button>
  );
}

/** The one switch, with its words and an optional note. */
export function Toggle(p: { label: string; help?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label class="switch">
      <span>
        {p.label}
        {p.help && <small>{p.help}</small>}
      </span>
      <input type="checkbox" role="switch" checked={p.checked} disabled={p.disabled} onChange={(e) => p.onChange((e.target as HTMLInputElement).checked)} />
    </label>
  );
}

/** The destructive text button: failed ink, flat (断开这台 MacBook, a connection's 断开). */
export function DangerButton(p: { label: string; about?: string; onClick: () => void }) {
  return (
    <button class="danger-text" aria-label={p.about ? `${p.label} · ${p.about}` : undefined} onClick={p.onClick}>
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
      <button class="dev-name" aria-label={`${t("device.rename")} · ${name}`} onClick={() => setDraft(name)}>
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
 * `state` words a failed chip's trouble when it isn't "didn't start" (打电话: 需要重新登录).
 */
export function Chip(p: { label: string; art?: string; look: "on" | "off" | "add" | "fail" | "later"; state?: string; info?: string; infoOpen?: boolean; onClick: () => void; onInfo?: () => void }) {
  const [squish, setSquish] = useState(0);
  const state = p.state ?? (p.look === "on" ? t("chip.state.on") : p.look === "off" ? t("chip.state.off") : p.look === "fail" ? t("chip.failed") : p.look === "later" ? t("chip.state.later") : "");
  return (
    <span class="chip-wrap">
      <button
        key={squish}
        class={`ach ${p.look}${squish ? " squish" : ""}`}
        aria-pressed={p.look === "later" ? undefined : p.look === "on"}
        aria-label={p.look === "add" ? `+ ${p.label}` : `${p.label} · ${state}`}
        onClick={() => (p.look === "later" || setSquish(squish + 1), p.onClick())}
      >
        {p.look !== "add" && p.art && <img src={p.art} alt="" />}
        {p.look === "add" ? `+ ${p.label}` : p.label}
        {p.look === "later" && (
          <small class="ach-later" aria-hidden="true">
            {t("chip.state.later")}
          </small>
        )}
      </button>
      {p.onInfo && (
        <button class={`chip-i${p.infoOpen ? " open" : ""}`} aria-label={`${t("chip.info")} · ${p.label}`} aria-expanded={!!p.infoOpen} onClick={p.onInfo}>
          i
        </button>
      )}
    </span>
  );
}

/** One line in a list of devices: clay, name, one word of state; never wraps. */
export function ListRow(p: { art: string; name: string; word: string; tone?: string; dot?: boolean; onClick: () => void; children?: ComponentChildren }) {
  return (
    <button class="li-row" aria-label={`${p.name} · ${p.word}`} onClick={p.onClick}>
      <img src={p.art} alt="" />
      <span class="t">
        <b>{p.name}</b>
        {p.dot && <i class="dot" aria-hidden="true" />}
        <small class={p.tone ?? ""}>· {p.word}</small>
      </span>
      <span class="chev" aria-hidden="true">
        ›
      </span>
    </button>
  );
}

/** Back to the list a page was pushed from. */
export function BackRow(p: { label: string; onClick: () => void }) {
  return (
    <button class="set-back" onClick={p.onClick}>
      <span class="back-chev" aria-hidden="true">
        ‹
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
      el.classList.remove("stack");
      el.classList.toggle("stack", el.scrollWidth > el.clientWidth + 1);
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
  const acc = p.about || [p.label, p.sub].filter(Boolean).join(" · ");
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
    <button class={`pill${p.open ? " open" : ""}`} aria-label={`${p.about} · ${p.label}`} aria-expanded={p.open} onClick={p.onClick}>
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
