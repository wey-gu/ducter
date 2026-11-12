// D214: the home's side of the opened task's workbench. The ops run where the task's working copy
// is (the runner, through a worker when it is one); the home adds what only it knows: the ports
// the task's own output named (from the Log), the ports never to offer (its own, its browser's),
// and the address of a page's preview (preview.ts).
import type { Bodies, LogEvent } from "@ducter/protocol";
import type { LogStore, Runner } from "@ducter/protocol/src/internal.ts";
import { portsSaid, simsSaid, type WbAnswer, type WbError, type WbRequest } from "@ducter/protocol/src/workbench.ts";
import type { Previews } from "./preview.ts";

export interface WbFrames {
  handle(taskId: string, req: WbRequest): Promise<{ ok: true; answer: WbAnswer } | { ok: false; error: WbError; message?: string }>;
}

/** The ports a task's stream named as local pages, newest first (its output and its words). */
export function saidPorts(events: LogEvent[]): number[] {
  const out: number[] = [];
  for (let i = events.length - 1; i >= 0 && out.length < 8; i--) {
    const b = events[i]!.body as Bodies["task_event"];
    if (events[i]!.kind !== "task_event" || !b) continue;
    const text = `${b.text ?? ""}\n${b.tool?.output ?? ""}\n${typeof b.tool?.input === "object" ? JSON.stringify(b.tool.input).slice(0, 4000) : ""}`;
    for (const p of portsSaid(text)) if (!out.includes(p)) out.push(p);
  }
  return out;
}

/** D220: whether the task's stream touched an iOS Simulator (its commands, their output, its words). */
export function saidSims(events: LogEvent[]): boolean {
  for (let i = events.length - 1; i >= 0; i--) {
    const b = events[i]!.body as Bodies["task_event"];
    if (events[i]!.kind !== "task_event" || !b) continue;
    const text = `${b.text ?? ""}\n${(b.tool?.output ?? "").slice(0, 4000)}\n${typeof b.tool?.input === "object" ? JSON.stringify(b.tool.input).slice(0, 4000) : ""}`;
    if (simsSaid(text)) return true;
  }
  return false;
}

export function createWbFrames(o: { log: LogStore; runner: () => Runner | undefined; previews?: Previews; exclude: () => number[] }): WbFrames {
  const said = (taskId: string) => saidPorts(o.log.read({ stream: `task:${taskId}`, limit: 600 }));
  const fail = (e: unknown) => {
    const code = (e as { code?: unknown })?.code;
    const known: WbError[] = ["outside", "missing", "conflict", "too_big", "binary", "not_text", "offline", "busy", "unsupported", "failed"];
    return { ok: false as const, error: (known.includes(code as WbError) ? code : "failed") as WbError, ...((e as Error)?.message && (e as Error).message !== code ? { message: String((e as Error).message).slice(0, 200) } : {}) };
  };
  return {
    async handle(taskId, req) {
      const r = o.runner();
      if (!r?.workbench) return { ok: false, error: "unsupported" };
      try {
        if (req?.op === "preview") {
          const port = Number(req.port);
          if (!o.previews || !Number.isInteger(port)) return { ok: false, error: "unsupported" };
          // Only a page the task serves gets an address (never an arbitrary port of that computer).
          const pages = (await r.workbench(taskId, { op: "ports" }, { said: said(taskId), exclude: o.exclude() })) as Extract<WbAnswer, { op: "ports" }>;
          if (!pages.ports.some((p) => p.port === port)) return { ok: false, error: "missing" };
          const p = o.previews.open(taskId, port);
          return { ok: true, answer: { op: "preview", port, previewPort: p.previewPort, token: p.token } };
        }
        const extra = req?.op === "ports" ? { said: said(taskId), exclude: o.exclude() } : req?.op === "sims" ? { simSaid: saidSims(o.log.read({ stream: `task:${taskId}`, limit: 600 })) } : {};
        return { ok: true, answer: await r.workbench(taskId, req, extra) };
      } catch (e) {
        return fail(e);
      }
    },
  };
}
