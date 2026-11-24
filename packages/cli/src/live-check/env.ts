// D463: the real CheckEnv. Reads only: the Log opened read-only, the home over its own socket with
// read-only frames (kit.ts READ_FRAMES), commands the checks name. The one fetch is free-key-429's,
// asked first.
import { Database } from "bun:sqlite";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import type { ServerFrame } from "@ducter/protocol";
import { whichNow } from "@ducter/protocol/src/which.ts";
import { connect } from "../client.ts";
import type { CheckEnv, LoggedEvent, ReadFrame } from "./kit.ts";
import { READ_FRAMES } from "./kit.ts";

export function realCheckEnv(o: { dataDir: string; port: number; version: string }): CheckEnv {
  const tty = Boolean(process.stdin.isTTY);
  return {
    now: () => Date.now(),
    wait: (ms) => new Promise((r) => setTimeout(r, ms)),
    platform: process.platform,
    arch: process.arch,
    version: o.version,
    dataDir: o.dataDir,
    home: homedir(),
    vars: process.env,
    which: (cmd) => whichNow(cmd) ?? undefined,
    async run(argv, ms = 30_000) {
      let proc: ReturnType<typeof Bun.spawn>;
      try {
        proc = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
      } catch {
        return undefined;
      }
      const timer = setTimeout(() => proc.kill(), ms);
      try {
        const [out, err, code] = await Promise.all([new Response(proc.stdout as ReadableStream).text(), new Response(proc.stderr as ReadableStream).text(), proc.exited]);
        return { code, out, err };
      } finally {
        clearTimeout(timer);
      }
    },
    readText(path) {
      try {
        return readFileSync(path, "utf8");
      } catch {
        return undefined;
      }
    },
    exists: (p) => existsSync(p),
    list(dir) {
      try {
        return readdirSync(dir);
      } catch {
        return [];
      }
    },
    events(kinds, sinceMs) {
      const path = join(o.dataDir, "ducter.db");
      if (!existsSync(path)) return undefined;
      const db = new Database(path, { readonly: true });
      try {
        const rows = db
          .query(`SELECT seq, ts, stream, kind, body FROM events WHERE kind IN (${kinds.map(() => "?").join(",")}) AND ts >= ? ORDER BY seq`)
          .all(...kinds, new Date(sinceMs).toISOString()) as { seq: number; ts: string; stream: string; kind: string; body: string }[];
        return rows.map((r): LoggedEvent => {
          let body: unknown;
          try {
            body = JSON.parse(r.body);
          } catch {
            body = {};
          }
          return { seq: r.seq, ts: r.ts, stream: r.stream, kind: r.kind, body };
        });
      } finally {
        db.close();
      }
    },
    async homeAsk(frame: ReadFrame, match: (f: ServerFrame) => boolean, ms = 8000) {
      if (!READ_FRAMES.has(frame.t)) throw new Error(`not a read-only frame: ${frame.t}`);
      const conn = await connect({ kind: "local", port: o.port });
      if (!conn) return undefined;
      try {
        const wait = conn.next(match, ms);
        conn.send(frame);
        return await wait;
      } finally {
        conn.close();
      }
    },
    fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(60_000) }),
    async ask(prompt) {
      if (!tty) return undefined;
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        return await rl.question(prompt);
      } finally {
        rl.close();
      }
    },
    secret: (prompt) => (tty ? readHidden(prompt) : Promise.resolve(undefined)),
    say: (line) => console.log(line),
  };
}

/** A line typed without echo (a key): never printed, never kept past the caller. */
function readHidden(prompt: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    stdin.setRawMode?.(true);
    stdin.resume();
    let s = "";
    const done = (v: string | undefined) => {
      stdin.off("data", on);
      stdin.setRawMode?.(false);
      stdin.pause();
      process.stdout.write("\n");
      resolve(v);
    };
    const on = (b: Buffer) => {
      for (const ch of b.toString("utf8")) {
        if (ch === "\r" || ch === "\n") return done(s);
        if (ch === "\u0003") return done(undefined);
        if (ch === "\u007f" || ch === "\b") s = s.slice(0, -1);
        else s += ch;
      }
    };
    stdin.on("data", on);
  });
}
