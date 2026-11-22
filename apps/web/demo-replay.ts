// D471: On hand drawn from a home's own Log, replayed into a demo core: no runtimes, no network, no
// agents, no connectors, never port 7777. The rows (seq, ts, persona, stream, origin, kind, body,
// supersedes: the `events` table, one JSON object a line) are written into a fresh data folder
// before the core starts, so the core projects them as a home would after a restart. Computers the
// rows name (a device id with a name in a device_update) join as pretend workers under that name.
//
//   DEMO_REPLAY=<rows.jsonl> DUCTER_PORT=7471 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-replay.ts
//
// Without DEMO_REPLAY it replays the synthetic shapes (`demo-replay-shapes.ts`: invented words in
// the shapes and lengths a heavy home has). A person's own export stays outside git (a scratch
// folder or .shots/); only the synthetic shapes are committed.
//   DEMO_NOW=<iso> pins the clock (default: six minutes after the last row).
//   DEMO_HOME_NAME=<name> names the home (default: the demo's pretend computer).
import { Database } from "bun:sqlite";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openLog, startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import { shapeRows } from "./demo-replay-shapes.ts";

export interface Row {
  seq: number;
  ts: string;
  persona: string;
  stream: string;
  origin: string;
  kind: string;
  body: string;
  supersedes: number | null;
}

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const file = process.env.DEMO_REPLAY;
const rows: Row[] = file
  ? readFileSync(file, "utf8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as Row)
  : shapeRows(Date.now());
if (!rows.length) throw new Error("nothing to replay");
const last = Date.parse(rows[rows.length - 1]!.ts);
const nowAt = process.env.DEMO_NOW ? Date.parse(process.env.DEMO_NOW) : last + 6 * 60_000;
const shift = nowAt - Date.now();
const clock = { now: () => Date.now() + shift, setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>) };

const dataDir = process.env.DUCTER_DATA_DIR || join(mkdtempSync(join(tmpdir(), "ducter-demo-replay-")), "data");
mkdirSync(dataDir, { recursive: true });
const persona = { id: rows[0]!.persona || "default", name: "Ducter", identity: "" };

// What would reach outside this process is a fake: a look's command, the model's judge, release
// and agent channels, agent CLIs on this computer, the person's gh.
const offline = {
  dataDir,
  push: false,
  persona,
  ooSource: noOo,
  clock,
  work: { exec: async () => ({ code: 1, out: "", err: "not in the replay" }), judge: async () => ({ met: false, summary: "not in the replay" }) },
  update: { fetch: async () => { throw new Error("not in the replay"); }, ...(process.env.DEMO_HOME_NAME ? { homeName: process.env.DEMO_HOME_NAME } : {}) },
  agents: { which: () => undefined, fetch: async () => new Response("{}", { status: 404 }) },
} as never;

// 1. The computers: each named device in the rows joins as a pretend worker; its id is mapped.
const names = new Map<string, string>();
for (const r of rows) {
  if (r.kind !== "device_update" && r.kind !== "agent_update") continue;
  const b = JSON.parse(r.body) as { device?: string; name?: string };
  if (b.device && b.name && b.device !== "local") names.set(b.device, b.name);
}
const ids = new Map<string, string>();
if (names.size) {
  const first = startCore({ ...(offline as object), port: 0 } as never);
  for (const [id, name] of names) {
    const got = first.devices.redeem(first.devices.createCode({ kind: "worker" }).code, { name, platform: "darwin-arm64", computer: name } as never) as { device?: { id: string } };
    if (got.device) ids.set(id, got.device.id);
  }
  await first.stop();
}

// 2. The rows, with those ids, written as the Log's own; a look's command is dropped (never run).
const remap = (s: string) => {
  let out = s;
  for (const [from, to] of ids) out = out.split(`"${from}"`).join(`"${to}"`);
  return out;
};
const quiet = (r: Row): string => {
  if (r.kind !== "task_loop") return r.body;
  const b = JSON.parse(r.body) as { look?: { check?: unknown } };
  if (b.look?.check) delete b.look.check;
  return JSON.stringify(b);
};
openLog({ path: join(dataDir, "ducter.db"), persona: persona.id }).close?.();
const db = new Database(join(dataDir, "ducter.db"));
const put = db.prepare("INSERT INTO events (seq, ts, persona, stream, origin, kind, body, supersedes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
db.transaction(() => {
  for (const r of rows) put.run(r.seq, r.ts, r.persona, r.stream, r.origin, r.kind, remap(quiet(r)), r.supersedes ?? null);
})();
db.close();

// 3. The core, on that Log.
const port = Number(process.env.DUCTER_PORT || 0);
if (port === 7777) throw new Error("never the home's port");
const core = startCore({ ...(offline as object), port } as never);
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en" });
// More pairing links for more simulators (DEMO_PAIRS=n), each used once.
for (let i = 1; i < Number(process.env.DEMO_PAIRS ?? 0); i++) void core.devicesView.pairCode().then((p) => console.log(`[demo] phone: -pairLink 'http://127.0.0.1:${core.port}/pair#c=${p.code}'`));
console.log(`[demo] replay of ${rows.length} rows at ${new Date(nowAt).toISOString()}: http://127.0.0.1:${core.port}/`);
