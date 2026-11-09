// A stdio MCP server that forwards every JSON-RPC message to Ducter's MCP endpoint over HTTP.
// For harnesses whose sessions take stdio MCP servers only (DeepSeek Harness through OAR: no
// HTTP, no headers, no env). The endpoint and its bearer token come from a 0600 file whose path
// is the only argument, so the token never shows in a process list or a harness's own config.
//
//   <bun> mcp-bridge.ts <file>        (from source)
//   ducter mcp-bridge <file>          (the single binary)
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

export interface BridgeTarget {
  url: string;
  headers: Record<string, string>;
}

/** Writes the target for one MCP config under dir (0600) and returns the file path. Same config, same file. */
export function writeBridgeTarget(dir: string, target: BridgeTarget): string {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const body = JSON.stringify(target);
  const file = join(dir, `${createHash("sha256").update(body).digest("hex").slice(0, 16)}.json`);
  writeFileSync(file, body, { mode: 0o600 });
  chmodSync(file, 0o600);
  return file;
}

/** The command a harness runs to reach this bridge: this file under the running Bun, or the binary's subcommand. */
export function bridgeCommand(file: string): { command: string; args: string[] } {
  const compiled = import.meta.path.startsWith("/$bunfs/") || /^[A-Z]:[\\/]~BUN[\\/]/.test(import.meta.path);
  return compiled ? { command: process.execPath, args: ["mcp-bridge", file] } : { command: process.execPath, args: [import.meta.path, file] };
}

/**
 * Runs the bridge on the given streams until input ends. One line in is one JSON-RPC message;
 * a request's answer is one line out. Ducter's endpoint is stateless and answers JSON.
 */
export async function runBridge(
  target: BridgeTarget,
  io: { lines: AsyncIterable<string>; write: (line: string) => void; fetch?: typeof fetch },
): Promise<void> {
  const f = io.fetch ?? fetch;
  const pending: Promise<void>[] = [];
  for await (const line of io.lines) {
    const raw = line.trim();
    if (!raw) continue;
    let msg: { id?: unknown; method?: string } | undefined;
    try {
      msg = JSON.parse(raw);
    } catch {
      continue;
    }
    const id = msg?.id;
    pending.push(
      (async () => {
        try {
          const res = await f(target.url, {
            method: "POST",
            headers: { ...target.headers, "content-type": "application/json", accept: "application/json, text/event-stream" },
            body: raw,
          });
          const text = await res.text();
          if (id === undefined) return; // a notification: nothing to answer
          if (!res.ok || !text.trim()) {
            io.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32603, message: `Ducter answered ${res.status}` } }));
            return;
          }
          for (const out of jsonOf(text)) io.write(out);
        } catch (err) {
          if (id !== undefined) io.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32603, message: `Ducter is unreachable: ${(err as Error).message}` } }));
        }
      })(),
    );
  }
  await Promise.all(pending);
}

/** A JSON body, or the data lines of an event stream. */
function jsonOf(text: string): string[] {
  const t = text.trim();
  if (t.startsWith("{") || t.startsWith("[")) return [JSON.stringify(JSON.parse(t))];
  return t
    .split("\n")
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trim())
    .filter(Boolean);
}

async function* stdinLines(): AsyncIterable<string> {
  const decoder = new TextDecoder();
  let buf = "";
  for await (const chunk of Bun.stdin.stream()) {
    buf += decoder.decode(chunk, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      yield buf.slice(0, i);
      buf = buf.slice(i + 1);
    }
  }
  if (buf.trim()) yield buf;
}

/** Entry for both forms: reads the target file and serves stdin/stdout. */
export async function bridgeMain(file: string | undefined): Promise<number> {
  if (!file) {
    console.error("usage: mcp-bridge <target-file>");
    return 2;
  }
  const target = JSON.parse(readFileSync(file, "utf8")) as BridgeTarget;
  await runBridge(target, { lines: stdinLines(), write: (l) => process.stdout.write(l + "\n") });
  return 0;
}

if (import.meta.main) process.exit(await bridgeMain(process.argv[2]));
