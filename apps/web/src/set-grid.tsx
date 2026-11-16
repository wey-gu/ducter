// D289: D273's settings grid as pieces, for the groups that are one thing each (a source, a calling
// connection, calls from your own number; the chat apps' `chat-*` rows, D283). Two edges only: the
// group's and the text edge; one row anatomy: an optional 40 tile, the title, one muted line, the
// control at the right edge. A group's last line holds its quiet note and its quiet actions; a
// destructive action is quiet until hovered and asks in place (GConfirm). The Mac's settings_rows.go.
// Layout only: every control is a shared one (controls.tsx).
import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { Btn, DangerButton } from "./controls.tsx";

/** One raised group whose first row is the thing itself. */
export function Group(p: { label: string; id?: string; class?: string; children: ComponentChildren }) {
  return (
    <section id={p.id} class={`set-card chat-app g-group${p.class ? ` ${p.class}` : ""}`} aria-label={p.label}>
      {p.children}
    </section>
  );
}

/** A group's first row: its tile, its name, one line of how it stands in that state's ink. */
export function GHead(p: { tile: ComponentChildren; name: string; line?: string; tone?: "done" | "ink" | "bad"; children?: ComponentChildren }) {
  return (
    <div class="chat-head">
      {p.tile}
      <span class="grow">
        <b>{p.name}</b>
        {p.line && <small class={p.tone ? `tone-${p.tone}` : undefined}>{p.line}</small>}
      </span>
      {p.children}
    </div>
  );
}

/** A row: the tile column (a tile, or empty so the words keep the text edge), title, one line, control. */
export function GRow(p: { tile?: ComponentChildren; title?: string; line?: string; children?: ComponentChildren }) {
  return (
    <div class={`chat-row${p.tile ? " tiled" : ""}`}>
      {p.tile}
      <span class="grow">
        {p.title && <b>{p.title}</b>}
        {p.line && <small>{p.line}</small>}
      </span>
      {p.children}
    </div>
  );
}

/** A block on the text column: what a row opened, a list. */
export function GBlock(p: { children: ComponentChildren }) {
  return <div class="g-block">{p.children}</div>;
}

/** A group's last line: its one quiet note, its quiet actions at the right edge. */
export function GFoot(p: { note: string; children?: ComponentChildren }) {
  return (
    <div class="chat-foot">
      <small class="grow">{p.note}</small>
      {p.children && <span class="g-acts">{p.children}</span>}
    </div>
  );
}

/** A destructive action asking in place, as the group's last line. */
export function GConfirm(p: { ask: string; keep: string; go: string; about?: string; onKeep: () => void; onGo: () => void }) {
  return (
    <div class="chat-foot g-confirm" role="group">
      <small class="grow">{p.ask}</small>
      <span class="g-acts">
        <Btn kind="text" size="sm" label={p.keep} about={p.about} onClick={p.onKeep} />
        <DangerButton label={p.go} about={p.about} onClick={p.onGo} />
      </span>
    </div>
  );
}

/** A tile: clay art fitted in the 40 column, or a drawn mark on a small white clay tile. */
export function Tile(p: { art?: string; faded?: boolean; mark?: boolean; children?: ComponentChildren }) {
  return (
    <span class={`g-tile${p.mark ? " mark" : ""}${p.faded ? " faded" : ""}`} aria-hidden="true">
      {p.art ? <img src={p.art} alt="" /> : p.children}
    </span>
  );
}

/** A short state word set apart at a row's right edge (即将推出 / Coming soon). */
export function Tag(p: { text: string }) {
  return <span class="g-tag">{p.text}</span>;
}

/** A section's header on the text edge. */
export function SecHead(p: { title: string }) {
  return <h3 class="g-sec">{p.title}</h3>;
}

// ---------- D296: the partner's one word after a change ----------

const SAID_MS = 4000;
const saidWords = new Map<string, { text: string; at: number }>();
const saidListeners = new Set<() => void>();

/** Keep the partner's word for a change you made, for <Said> to show. The Mac's `say`. */
export function say(key: string, text: string) {
  saidWords.set(key, { text, at: Date.now() });
  for (const f of saidListeners) f();
}

/**
 * The partner's one word after a change (D296): a small clay pebble pops in on the done ink, then the
 * line in its voice, on the text edge; it settles away by itself. Never a toast, never what a switch
 * already shows. The Mac's `saidLine`.
 */
export function Said(p: { k: string }) {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    saidListeners.add(f);
    return () => void saidListeners.delete(f);
  }, []);
  const w = saidWords.get(p.k);
  const left = w ? SAID_MS - (Date.now() - w.at) : 0;
  useEffect(() => {
    if (left <= 0) return;
    const h = setTimeout(() => bump((n) => n + 1), left);
    return () => clearTimeout(h);
  }, [w?.at]);
  if (!w || left <= 0) return null;
  return (
    <div class="said" role="status" key={w.at}>
      <span class="said-dot" aria-hidden="true" />
      <span>{w.text}</span>
    </div>
  );
}
