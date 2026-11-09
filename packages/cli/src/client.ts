// A small client of the running Ducter's WebSocket (the same protocol the apps speak), for the
// commands that talk to it: task, say, tail, answer, open <task>. It says hello as a CLI, so
// Ducter never asks it to show a task (open_task goes to the apps).
import type { ClientFrame, LogEvent, OnHand, ServerFrame } from "@ducter/protocol";

export interface Conn {
  personaName: string;
  headSeq: number;
  /** Channel events replayed after hello (the last 200, or from the cursor). */
  replayed: LogEvent[];
  onHand: OnHand;
  send(f: ClientFrame): void;
  /** Every frame after the greeting. Returns an unsubscribe. */
  on(fn: (f: ServerFrame) => void): () => void;
  /** The next frame that matches, or undefined after ms. */
  next<T extends ServerFrame>(match: (f: ServerFrame) => f is T, ms: number): Promise<T | undefined>;
  next(match: (f: ServerFrame) => boolean, ms: number): Promise<ServerFrame | undefined>;
  /** Resolves when the socket closes (Ducter stopped). */
  closed: Promise<void>;
  close(): void;
}

/** Connects and greets; undefined when nothing answers on the port within timeoutMs. */
export async function connect(port: number, opts: { cursor?: number; timeoutMs?: number; url?: string } = {}): Promise<Conn | undefined> {
  const url = opts.url ?? `ws://127.0.0.1:${port}/ws`;
  let ws: WebSocket;
  try {
    ws = new WebSocket(url);
  } catch {
    return undefined;
  }
  const listeners = new Set<(f: ServerFrame) => void>();
  let closedResolve!: () => void;
  const closed = new Promise<void>((r) => (closedResolve = r));
  return new Promise((resolve) => {
    let personaName = "Ducter";
    let headSeq = 0;
    const replayed: LogEvent[] = [];
    let greeted = false;
    const timer = setTimeout(() => {
      if (!greeted) {
        resolve(undefined);
        try {
          ws.close();
        } catch {}
      }
    }, opts.timeoutMs ?? 3000);
    ws.onopen = () => ws.send(JSON.stringify({ t: "hello", client: "cli", ...(opts.cursor != null ? { cursor: opts.cursor } : {}) } satisfies ClientFrame));
    ws.onerror = () => {
      if (!greeted) {
        clearTimeout(timer);
        resolve(undefined);
      }
    };
    ws.onclose = () => {
      closedResolve();
      if (!greeted) {
        clearTimeout(timer);
        resolve(undefined);
      }
    };
    ws.onmessage = (m) => {
      let f: ServerFrame;
      try {
        f = JSON.parse(String(m.data));
      } catch {
        return;
      }
      if (greeted) {
        for (const fn of [...listeners]) fn(f);
        return;
      }
      if (f.t === "welcome") (personaName = f.personaName), (headSeq = f.headSeq);
      else if (f.t === "events") replayed.push(...f.events);
      else if (f.t === "on_hand") {
        greeted = true;
        clearTimeout(timer);
        const conn: Conn = {
          personaName,
          headSeq,
          replayed,
          onHand: f.onHand,
          send: (frame) => ws.send(JSON.stringify(frame)),
          on(fn) {
            listeners.add(fn);
            return () => listeners.delete(fn);
          },
          next(match: (f: ServerFrame) => boolean, ms: number) {
            return new Promise<ServerFrame | undefined>((res) => {
              const off = conn.on((x) => {
                if (!match(x)) return;
                off();
                clearTimeout(t);
                res(x);
              });
              const t = setTimeout(() => (off(), res(undefined)), ms);
              void closed.then(() => (off(), clearTimeout(t), res(undefined)));
            });
          },
          closed,
          close: () => {
            try {
              ws.close();
            } catch {}
          },
        };
        // Keep On hand fresh for callers that read it later.
        conn.on((x) => {
          if (x.t === "on_hand") conn.onHand = x.onHand;
        });
        resolve(conn);
      }
    };
  });
}
