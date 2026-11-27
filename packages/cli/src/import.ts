// D651 (research/246): `ducter import [<file>|-] [--check]`.
//
// A reader (any program) prints `ducter-import/1` JSON lines; this command hands the stream to
// the home's import service, which validates it once and writes the Log itself. The running home
// is preferred (its clients see the imported tasks at once); when this machine's Ducter isn't
// running, the same service runs here against the local Log. `--check` only validates and counts:
// it writes nothing and never touches the data folder.
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ImportAnswer, ServerFrame } from "@ducter/protocol";
import { openLog } from "@ducter/core/src/log.ts";
import { createRegistry } from "@ducter/core/src/registry.ts";
import { importInto } from "@ducter/core/src/imports/service.ts";
import { parseImport } from "@ducter/core/src/imports/format.ts";
import { connect } from "./client.ts";
import type { T } from "./i18n.ts";
import type { Target } from "./home.ts";

export interface ImportCmdCtx {
  t: T;
  /** Where the home is (D147): this machine, or one the CLI follows. */
  target: Target;
  dataDir: string;
  json: boolean;
  /** The reader's file; "-" or absent reads stdin. */
  path?: string;
  check: boolean;
  print?: (s: string) => void;
  /** Injected in tests: the whole stream (stdin or a file). */
  read?: () => Promise<string>;
}

const CHUNK = 512 * 1024;
async function readInput(c: ImportCmdCtx): Promise<string | undefined> {
  if (c.read) return c.read();
  const path = c.path && c.path !== "-" ? c.path : undefined;
  if (path) return readFileSync(path, "utf8");
  // A bare `ducter import` at a terminal has nothing to read: say how it is used.
  if (process.stdin.isTTY) return undefined;
  return Bun.stdin.text();
}

/** The running home's answer, or undefined when nothing answers here. */
async function overSocket(c: ImportCmdCtx, data: string): Promise<ImportAnswer | undefined> {
  const conn = await connect(c.target, { timeoutMs: c.target.kind === "remote" ? 10_000 : 1500 });
  if (!conn) return undefined;
  const id = `imp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  try {
    conn.send({ t: "import", id, op: "begin" });
    for (let i = 0; i < data.length; i += CHUNK) conn.send({ t: "import", id, op: "chunk", data: data.slice(i, i + CHUNK) });
    conn.send({ t: "import", id, op: "end" });
    // An older home doesn't know the frame: its error ends this at once instead of waiting.
    const errored = new Promise<undefined>((res) => {
      const off = conn.on((f) => {
        if (f.t !== "error") return;
        off();
        res(undefined);
      });
    });
    const r = await Promise.race([conn.next((f): f is Extract<ServerFrame, { t: "import_result" }> => f.t === "import_result" && f.id === id, 5 * 60_000), errored]);
    return r && r.t === "import_result" ? (({ t: _t, id: _id, ...rest }) => rest as ImportAnswer)(r) : undefined;
  } finally {
    conn.close();
  }
}

/** The same service against this computer's Log, when no Ducter is running here. */
async function directly(data: string, dataDir: string): Promise<ImportAnswer> {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const log = openLog({ path: join(dataDir, "ducter.db"), persona: "default" });
  try {
    const tasks = createRegistry(log);
    return await importInto({ log, tasks, persona: "default" }, data);
  } finally {
    log.close();
  }
}

export async function cmdImport(c: ImportCmdCtx): Promise<number> {
  const print = c.print ?? ((s: string) => console.log(s));
  const raw = await readInput(c);
  if (raw === undefined) {
    print(c.t("import.usage"));
    return 2;
  }
  const check = parseImport(raw);
  if (c.check) {
    const answer = {
      ok: check.ok,
      ...(check.source ? { app: check.source.app, format: check.source.format } : {}),
      ...check.counts,
      ...(check.stopped ? { stopped: check.stopped } : {}),
    };
    if (c.json) print(JSON.stringify(answer, null, 2));
    else {
      print(c.t("import.check", { threads: String(check.counts.threads), messages: String(check.counts.messages), skipped: String(check.counts.skipped) }));
      if (check.stopped) print(c.t("import.stopped", { line: String(check.stopped.line), reason: check.stopped.reason }));
      if (!check.source) print("The stream has no source record, so there is nothing to import.");
    }
    return check.ok ? 0 : 1;
  }
  if (!check.source) {
    print(c.t("import.stopped", { line: "1", reason: check.stopped?.reason ?? "the stream has no source record" }));
    return 1;
  }
  // The running home first; it validates again through the one service that writes the Log.
  let r = await overSocket(c, raw);
  if (!r && c.target.kind === "local") r = await directly(raw, c.dataDir);
  if (!r) {
    print(c.t("import.noHome"));
    return 1;
  }
  if (c.json) print(JSON.stringify(r, null, 2));
  else {
    if (r.ok || r.threads || r.messages) print(c.t(r.threads === 1 ? "import.done.one" : "import.done", { threads: String(r.threads), messages: String(r.messages), skipped: String(r.skipped) }));
    if (r.stopped) print(c.t("import.stopped", { line: String(r.stopped.line), reason: r.stopped.reason }));
    if (r.error) print(r.error);
  }
  return r.ok ? 0 : 1;
}
