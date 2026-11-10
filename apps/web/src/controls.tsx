// The shared controls (design/ui.md "Shared controls"): every button, switch, chip, coin and
// row a card or a settings page shows is one of these. test/controls.test.ts fails when the
// device card draws a control any other way. A new control is added here, never inline.
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
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

/** An ability as a toggle chip: its clay and 2–5 words; on, off, can be added (dashed) or failed; ⓘ beside it. */
export function Chip(p: { label: string; art?: string; look: "on" | "off" | "add" | "fail"; info?: string; infoOpen?: boolean; onClick: () => void; onInfo?: () => void }) {
  const [squish, setSquish] = useState(0);
  const state = p.look === "on" ? t("chip.state.on") : p.look === "off" ? t("chip.state.off") : p.look === "fail" ? t("chip.failed") : "";
  return (
    <span class="chip-wrap">
      <button
        key={squish}
        class={`ach ${p.look}${squish ? " squish" : ""}`}
        aria-pressed={p.look === "on"}
        aria-label={p.look === "add" ? `+ ${p.label}` : `${p.label} · ${state}`}
        onClick={() => (setSquish(squish + 1), p.onClick())}
      >
        {p.look !== "add" && p.art && <img src={p.art} alt="" />}
        {p.look === "add" ? `+ ${p.label}` : p.label}
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
