// D519: the one composer. Words for the partner or a task are typed in one box, wherever they are
// typed: the conversation (跟 Ducter 说点什么…), an opened task, a Keep's page (想改什么，直接说), a small
// app's ask, a call's reply. One card on the paper (`--surface`, `--r-xl`, `--base`), the words
// growing to five lines, what belongs beside them (pictures, the mic, the context ring, Stop), and the
// round accent send with its drawn arrow. Its states are the send's: empty (resting, not pressable),
// ready (raised on its ledge), sending (pressed in until the home has the words). The look comes from
// tokens only (app.css `.composer`, `.send`); apps/web/test/composer.test.ts fails on any other copy.
import type { ComponentChildren, JSX } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { A } from "./app.ts";
import { KeyHint } from "./controls.tsx";
import { Menu, MenuItem } from "./menu.tsx";
import { scaledRow } from "./text-scale.ts";

const coarse = () => matchMedia("(pointer: coarse)").matches && !matchMedia("(any-pointer: fine)").matches;

/** The send's drawn arrow (never a glyph or an emoji). */
export const Arrow = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
    <path d="M10 15V5M5.5 9.5L10 5l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);

/** Words that grow with what is typed (up to 140, scaled with the text size). Enter sends with a
 *  keyboard; on a phone Return breaks the line and the button sends; ⌘⏎ sends everywhere (D210). */
export function AutoText(p: { value: string; onInput: (v: string) => void; placeholder: string; label: string; onEnter?: () => void; onEscape?: () => void; autoFocus?: boolean; id?: string; disabled?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
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
      ref={ref}
      id={p.id}
      rows={1}
      value={p.value}
      placeholder={p.placeholder}
      aria-label={p.label}
      enterkeyhint="send"
      readOnly={p.disabled}
      onInput={(e) => p.onInput((e.target as HTMLTextAreaElement).value)}
      onKeyDown={(e) => {
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

/** One of the send's alternates (D530): its words and whether its key takes ⌥. */
export type SendAlt = { words: string; opt?: boolean; onPick: () => void };

/** The composer's send: the round accent button with the drawn arrow. empty: resting and not
 *  pressable; sending: pressed into its ledge until the home has the words. alts: its alternates in
 *  the one clay menu (D421), on a right-click or a long press while there is something to send. */
export function SendButton({ state, label, onSend, alts }: { state: "empty" | "ready" | "sending"; label?: string; onSend: () => void; alts?: SendAlt[] }) {
  const [menu, setMenu] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const held = useRef<{ timer?: ReturnType<typeof setTimeout>; opened?: boolean }>({});
  const can = state === "ready" && !!alts?.length;
  return (
    <span class="send-anchor">
      <button
        ref={btn}
        type="button"
        class={`btn accent icon send${state === "sending" ? " sending" : ""}`}
        aria-label={label ?? A.L.t("composer.send")}
        aria-busy={state === "sending" || undefined}
        aria-haspopup={can ? "menu" : undefined}
        aria-expanded={can ? menu : undefined}
        disabled={state !== "ready"}
        onClick={() => {
          if (held.current.opened) return void (held.current.opened = false);
          if (state === "ready") onSend();
        }}
        onContextMenu={(e) => can && (e.preventDefault(), setMenu(true))}
        onPointerDown={(e) => {
          if (!can || e.pointerType === "mouse") return;
          held.current.timer = setTimeout(() => ((held.current.opened = true), setMenu(true)), 450);
        }}
        onPointerUp={() => clearTimeout(held.current.timer)}
        onPointerLeave={() => clearTimeout(held.current.timer)}
      >
        <Arrow />
      </button>
      {menu && can && (
        <Menu class="pmenu send-menu" anchor={btn} focusFirst onClose={() => setMenu(false)}>
          {alts!.map((x) => (
            <MenuItem key={x.words} onClick={() => (setMenu(false), x.onPick())}>
              <KeyHint opt={x.opt} words={x.words} />
            </MenuItem>
          ))}
        </Menu>
      )}
    </span>
  );
}

/** Whether words sent with this clientId reached the home (its echo is in the conversation). */
export const echoed = (clientId: string) => A.S.channel.some((e) => e.user?.clientId === clientId);

/**
 * The composer's card: `before` (add pictures, a reply pressed in), the words, `tools` (the mic, the
 * context ring, After this, Stop) and the send. `sending` keeps the words and presses the send in;
 * `canSend` overrides "has words" (pictures alone may go).
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
  /** D530: the send's alternates (the working task's 插一句 / 等它做完再说). */
  sendAlts?: SendAlt[];
  autoFocus?: boolean;
  class?: string;
  onKeyDownCapture?: JSX.KeyboardEventHandler<HTMLDivElement>;
  onKeyDown?: JSX.KeyboardEventHandler<HTMLDivElement>;
}) {
  const ready = p.canSend ?? !!p.value.trim();
  const state = p.sending ? "sending" : ready ? "ready" : "empty";
  return (
    <div class={`composer${p.before ? "" : " bare"}${p.sending ? " is-sending" : ""}${p.class ? ` ${p.class}` : ""}`} onKeyDownCapture={p.onKeyDownCapture} onKeyDown={p.onKeyDown}>
      {p.before}
      <AutoText id={p.id} value={p.value} onInput={p.onInput} onEnter={() => state === "ready" && p.onSend()} label={p.label} placeholder={p.placeholder} autoFocus={p.autoFocus} disabled={p.sending} />
      {p.tools}
      <SendButton state={state} label={p.sendLabel} onSend={p.onSend} {...(p.sendAlts ? { alts: p.sendAlts } : {})} />
    </div>
  );
}
