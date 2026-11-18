// D381: 置顶 / Pin, on the home. What the person pinned from the default conversation, kept in
// pins.json in the data folder: the block as it is now, the message it is in now, a checklist's
// ticks by their words. A pin is made by a tap (pin: the block of a partner message) or by the
// partner when the person asked ("pin": true in the block); the partner changes one in place by
// writing its whole new block with "pin":"<id>" (claim, then put). The Log keeps every message as
// it was; a pin only points at the newest one that changed it.
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { carryTicks, knownBlock, PIN_WAS_MAX, PINNABLE, PINS_MAX, pinTitle, type Bodies, type PinView, type RichPinAsk, type RichUi } from "@ducter/protocol";
import type { LogStore } from "@ducter/protocol/src/internal.ts";

export const PINS_FILE = "pins.json";

export type PinRefusal = "full" | "gone" | "kind";

export interface PinsStore {
  /** Newest first (by when it was pinned or last changed). */
  list(): PinView[];
  get(id: string): PinView | undefined;
  /** The person's tap: the block `index` of the partner message `seq` goes to the top. */
  pin(seq: number, index: number): { ok: true; pin: PinView; already?: true } | { ok: false; error: PinRefusal };
  /**
   * The partner's asks in one message, before it is written: each gets the id it will be (a new
   * one for "pin": true while there is room; an existing id as it is), or none (full, unknown).
   */
  claim(asks: readonly RichPinAsk[]): Map<number, string>;
  /** After the message is written: the claimed blocks become (or replace) their pins. */
  put(seq: number, ui: readonly RichUi[], asks: readonly RichPinAsk[]): void;
  unpin(id: string): boolean;
  /** A pinned checklist's item, by its words, ticked or not. */
  tick(id: string, item: string, on: boolean): boolean;
  onChange(fn: () => void): () => void;
}

const strip = (b: RichUi): RichUi => {
  const { pin: _p, ...rest } = b;
  return rest as RichUi;
};

export function openPins(o: { dataDir: string; log: Pick<LogStore, "read">; now?: () => Date }): PinsStore {
  const now = o.now ?? (() => new Date());
  const path = join(o.dataDir, PINS_FILE);
  let pins: PinView[] = [];
  if (existsSync(path)) {
    try {
      const raw = JSON.parse(readFileSync(path, "utf8"));
      if (Array.isArray(raw?.pins)) pins = raw.pins.filter((p: PinView) => p && typeof p.id === "string" && typeof p.seq === "number" && p.ui && knownBlock(p.ui));
    } catch (err) {
      console.warn(`[pins] ${path} is unreadable; starting with none:`, (err as Error).message);
    }
  }
  const listeners = new Set<() => void>();
  const save = () => {
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify({ pins }, null, 2) + "\n", { mode: 0o600 });
    chmodSync(tmp, 0o600);
    renameSync(tmp, path);
    listeners.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        console.warn("[pins] listener:", (err as Error).message);
      }
    });
  };
  const newId = () => {
    for (;;) {
      const id = "p" + randomBytes(5).toString("hex").slice(0, 8);
      if (!pins.some((p) => p.id === id)) return id;
    }
  };
  const sorted = () => [...pins].sort((a, b) => (b.updated ?? b.at).localeCompare(a.updated ?? a.at));
  const make = (id: string, b: RichUi, seq: number, index: number, ticks?: string[]): PinView => {
    const ui = strip(b);
    const t = ui.type === "checklist" ? { ticks: ticks ?? [] } : {};
    return { id, ui, title: pinTitle(ui), seq, index, ...t, at: now().toISOString(), version: 1 };
  };
  const blockOf = (seq: number, index: number): RichUi | undefined => {
    const e = o.log.read({ stream: "channel", fromSeq: seq, limit: 1 })[0];
    if (!e || e.seq !== seq || e.kind !== "ai_msg") return undefined;
    return (e.body as Bodies["ai_msg"]).ui?.[index];
  };
  return {
    list: sorted,
    get: (id) => pins.find((p) => p.id === id),
    pin(seq, index) {
      const b = blockOf(seq, index);
      if (!b) return { ok: false, error: "gone" };
      if (!PINNABLE.includes(b.type)) return { ok: false, error: "kind" };
      // An older version of a pin is that pin: never a second one beside it.
      const already = pins.find((p) => (p.seq === seq && p.index === index) || p.was?.some((w) => w.seq === seq && w.index === index));
      if (already) return { ok: true, pin: already, already: true };
      if (pins.length >= PINS_MAX) return { ok: false, error: "full" };
      const p = make(newId(), b, seq, index);
      pins.push(p);
      save();
      return { ok: true, pin: p };
    },
    claim(asks) {
      const ids = new Map<number, string>();
      let room = PINS_MAX - pins.length;
      for (const a of asks) {
        if (a.want === true) {
          if (room <= 0) continue;
          room--;
          ids.set(a.index, newId());
        } else if (pins.some((p) => p.id === a.want) && ![...ids.values()].includes(a.want)) ids.set(a.index, a.want);
      }
      return ids;
    },
    put(seq, ui, asks) {
      let changed = false;
      for (const a of asks) {
        const b = ui[a.index];
        const id = b?.pin;
        if (!b || !id) continue;
        const old = pins.find((p) => p.id === id);
        if (!old) {
          if (pins.length >= PINS_MAX) continue;
          pins.push(make(id, b, seq, a.index, a.ticked));
          changed = true;
          continue;
        }
        const next = strip(b);
        const ticks = next.type === "checklist" ? (a.ticked ?? carryTicks(old.ticks, next)) : undefined;
        const was = [...(old.was ?? []), { seq: old.seq, index: old.index }].slice(-PIN_WAS_MAX);
        Object.assign(old, { ui: next, title: pinTitle(next), seq, index: a.index, was, updated: now().toISOString(), version: old.version + 1 });
        if (ticks) old.ticks = ticks;
        else delete old.ticks;
        changed = true;
      }
      if (changed) save();
    },
    unpin(id) {
      const n = pins.length;
      pins = pins.filter((p) => p.id !== id);
      if (pins.length === n) return false;
      save();
      return true;
    },
    tick(id, item, on) {
      const p = pins.find((x) => x.id === id);
      if (!p || p.ui.type !== "checklist" || !p.ui.items.includes(item)) return false;
      const set = new Set(p.ticks ?? []);
      if (on === set.has(item)) return true;
      if (on) set.add(item);
      else set.delete(item);
      p.ticks = p.ui.items.filter((x) => set.has(x));
      save();
      return true;
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
