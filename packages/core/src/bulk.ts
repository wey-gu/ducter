// D-PENDING (research/245 §3.5): many tasks at once, each through its own path. A selection's one
// gesture is never a second way to act: end goes through the task's end (and a Keep's stop), pause
// through the runner's interrupt, continue through reopen, move and reassign through the one
// loadout switch, put down through drop. This file only decides who is skipped, runs them in
// order, records the batch once, and keeps a real undo for ten seconds.
//
// A working task the person ends is not cut mid-turn: it is queued, and ends when this round ends
// (the line they read says so). The same ten seconds cancel it. A Keep that owns one of the ended
// tasks is stopped on the same clock, so its rounds stop with it (never a second mechanism).
import type { BulkOp } from "@ducter/protocol/src/views.ts";

/** What one task looks like to a batch. */
export interface BulkTask {
  id: string;
  title: string;
  /** The registry's attention (working and queued are at work now). */
  attention: string;
  harness: string;
  model?: string;
  /** The computer it runs on ("local" is the home). */
  device: string;
  imported?: boolean;
}

/** What a batch may do to one task; core wires each to the existing path. */
export interface BulkPort {
  task(id: string): BulkTask | undefined;
  /** The person's end (work.end): done, dropped, or already ended. */
  end(id: string): Promise<"done" | "dropped" | "ended">;
  interrupt(id: string): Promise<void>;
  /** 接着做: the runner's reopen (the same path Past tasks' Continue takes). */
  reopen(id: string): Promise<void>;
  drop(id: string): Promise<void>;
  undrop(id: string): Promise<{ ok: boolean; message?: string }>;
  switch(id: string, to: { device?: string; harness?: string; model?: string }): Promise<{ ok: boolean; message?: string }>;
  /** The Keep whose own work this task is (a task in rounds), if any. */
  keepOf(id: string): { id: string; name: string } | undefined;
  stopKeep(id: string): Promise<{ ok: boolean; message?: string }>;
  /** One record for the whole gesture, on the conversation's channel. */
  logBatch(b: { op: BulkOp; taskIds: string[]; done: number; skipped: number; pending: number; keeps: string[] }): void;
  now(): number;
}

export interface BulkRequest {
  op: BulkOp;
  taskIds: string[];
  device?: string;
  harness?: string;
  model?: string;
}

export interface BulkResult {
  batchId: string;
  op: BulkOp;
  total: number;
  done: number;
  skipped: number;
  /** Tasks at work that end when this round ends (end only). */
  pending: number;
  /** Keeps stopped (or queued to stop with their task) by this batch. */
  keeps: number;
  undoUntil: string;
  message?: string;
}

export const BULK_UNDO_MS = 10_000;

type Reverse =
  | { kind: "reopen"; id: string }
  | { kind: "interrupt"; id: string }
  | { kind: "switch"; id: string; to: { device?: string; harness?: string; model?: string } }
  | { kind: "undrop"; id: string };

interface Batch {
  id: string;
  op: BulkOp;
  until: number;
  reverse: Reverse[];
  pending: Set<string>;
  keeps: Map<string, { timer?: ReturnType<typeof setTimeout>; taskId?: string }>;
}

export function createBulk(port: BulkPort) {
  const batches = new Map<string, Batch>();
  let seq = 0;

  const atWork = (a: string) => a === "working" || a === "queued";
  const finished = (a: string) => a === "done" || a === "done_claimed" || a === "failed" || a === "dropped" || a === "superseded";

  /** The tasks a batch actually acts on, and those it skips, by the one rule each op has. */
  function plan(op: BulkOp, ts: BulkTask[]) {
    const act: BulkTask[] = [];
    const skip: BulkTask[] = [];
    const pending: BulkTask[] = [];
    for (const x of ts) {
      if (x.imported) {
        skip.push(x);
        continue;
      }
      switch (op) {
        case "end":
          if (atWork(x.attention)) pending.push(x);
          else act.push(x);
          break;
        case "pause":
          if (atWork(x.attention)) act.push(x);
          else skip.push(x);
          break;
        case "continue":
          if (atWork(x.attention)) skip.push(x);
          else act.push(x);
          break;
        case "move":
        case "reassign":
          if (finished(x.attention)) skip.push(x);
          else act.push(x);
          break;
        case "drop":
          if (finished(x.attention)) skip.push(x);
          else act.push(x);
          break;
      }
    }
    return { act, skip, pending };
  }

  function later(b: Batch, id: string, fn: () => Promise<void>) {
    b.keeps.set(id, {
      ...b.keeps.get(id),
      timer: setTimeout(() => {
        b.keeps.get(id)!.timer = undefined;
        void fn().catch(() => undefined);
      }, BULK_UNDO_MS),
    });
  }

  return {
    async run(req: BulkRequest): Promise<BulkResult> {
      const ids = [...new Set((req.taskIds ?? []).filter((x) => typeof x === "string" && x))].slice(0, 200);
      const ts = ids.map((id) => port.task(id)).filter((x): x is BulkTask => !!x);
      const { act, skip, pending } = plan(req.op, ts);
      const batchId = `bulk_${port.now().toString(36)}_${(seq++).toString(36)}`;
      const b: Batch = { id: batchId, op: req.op, until: port.now() + BULK_UNDO_MS, reverse: [], pending: new Set(pending.map((x) => x.id)), keeps: new Map() };
      batches.set(batchId, b);
      // Old batches are gone; their actions are not undone.
      for (const [id, x] of batches) if (x.until < port.now() - BULK_UNDO_MS) batches.delete(id);

      let done = 0;
      const keepIds = new Map<string, string>(); // keep id -> the task that brought it in (for a queued end)
      for (const x of act) {
        try {
          switch (req.op) {
            case "end": {
              const out = await port.end(x.id);
              done++;
              b.reverse.push(out === "dropped" ? { kind: "undrop", id: x.id } : { kind: "reopen", id: x.id });
              const k = port.keepOf(x.id);
              if (k) keepIds.set(k.id, x.id);
              break;
            }
            case "pause":
              await port.interrupt(x.id);
              done++;
              b.reverse.push({ kind: "reopen", id: x.id });
              break;
            case "continue":
              await port.reopen(x.id);
              done++;
              b.reverse.push({ kind: "interrupt", id: x.id });
              break;
            case "move": {
              const r = await port.switch(x.id, { device: req.device });
              if (!r.ok) throw new Error(r.message ?? "it didn't move.");
              done++;
              b.reverse.push({ kind: "switch", id: x.id, to: { device: x.device, harness: x.harness, model: x.model } });
              break;
            }
            case "reassign": {
              const r = await port.switch(x.id, { harness: req.harness, model: req.model });
              if (!r.ok) throw new Error(r.message ?? "it didn't switch.");
              done++;
              b.reverse.push({ kind: "switch", id: x.id, to: { device: x.device, harness: x.harness, model: x.model } });
              break;
            }
            case "drop":
              await port.drop(x.id);
              done++;
              b.reverse.push({ kind: "undrop", id: x.id });
              break;
          }
        } catch {
          skip.push(x);
        }
      }
      // A working task ends at the end of this round; the Keep that owns it stops with it. Cancelled
      // by Undo, so a person who changes their mind leaves both untouched.
      for (const x of pending) {
        const k = port.keepOf(x.id);
        if (k) keepIds.set(k.id, x.id);
      }
      // A Keep with no pending task stops within the undo window; one whose task is still finishing
      // waits for the queued end, so its rounds aren't cut mid-turn.
      for (const [id, k] of keepIds) {
        const waiting = [...b.pending].some((x) => port.keepOf(x)?.id === id);
        const stop = async () => {
          await port.stopKeep(id).catch(() => undefined);
        };
        if (waiting) b.keeps.set(id, { taskId: k });
        else later(b, id, stop);
      }
      port.logBatch({ op: req.op, taskIds: ts.map((x) => x.id), done, skipped: skip.length, pending: pending.length, keeps: [...keepIds.keys()] });
      return {
        batchId,
        op: req.op,
        total: ts.length,
        done,
        skipped: skip.length,
        pending: pending.length,
        keeps: keepIds.size,
        undoUntil: new Date(b.until).toISOString(),
      };
    },

    /** The queued ends of one batch arrived at a turn's boundary (core calls this from the Log). */
    async turnEnded(taskId: string): Promise<void> {
      for (const b of batches.values()) {
        if (!b.pending.delete(taskId)) continue;
        await port.end(taskId).catch(() => undefined);
        const k = port.keepOf(taskId);
        if (k) await port.stopKeep(k.id).catch(() => undefined);
      }
    },

    async undo(batchId: string): Promise<{ ok: boolean; undone: number; message?: string }> {
      const b = batches.get(batchId);
      if (!b) return { ok: false, undone: 0, message: "That is too long ago to undo." };
      if (port.now() > b.until) {
        batches.delete(batchId);
        return { ok: false, undone: 0, message: "That is too long ago to undo." };
      }
      batches.delete(batchId);
      for (const k of b.keeps.values()) if (k.timer) clearTimeout(k.timer);
      let undone = 0;
      for (const x of [...b.reverse].reverse()) {
        try {
          if (x.kind === "reopen") await port.reopen(x.id);
          else if (x.kind === "interrupt") await port.interrupt(x.id);
          else if (x.kind === "undrop") await port.undrop(x.id);
          else await port.switch(x.id, x.to);
          undone++;
        } catch {
          /* the rest still go back */
        }
      }
      return { ok: true, undone };
    },

    /** A test's seam: the batches still in their undo window. */
    open(): string[] {
      return [...batches.values()].filter((b) => b.until >= port.now()).map((b) => b.id);
    },
  };
}
