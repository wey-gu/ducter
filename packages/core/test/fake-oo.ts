// A fake `oo` CLI on a temp PATH, for the oo link's tests (D122). It answers the commands the
// link runs from a JSON state file (OO_FAKE_STATE, an OO_* variable so it survives the link's
// minimal environment) and logs every call to OO_FAKE_LOG: its argv, its environment's keys, and
// for a run the input file's mode and contents (read while the file still exists).
import { appendFileSync, chmodSync, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface FakeOoState {
  signedIn: boolean;
  apps: { service: string; connectionName: string | null; accountLabel?: string; authType: string; status?: string; isDefault?: boolean }[];
  actions: { service: string; name: string; description?: string; inputSchema?: unknown }[];
  /** What a run returns, by "<service>.<action>"; absent: the action's own error. */
  results?: Record<string, unknown>;
  /** Milliseconds every run sleeps first (for the timeout test). */
  sleepMs?: number;
}

export interface FakeOoCall {
  argv: string[];
  env: string[];
  file?: { mode: number; input: unknown };
}

/** Writes the fake binary into dir; returns its path and helpers to set state and read calls. */
export function fakeOo(dir: string, state: FakeOoState) {
  const bin = join(dir, "oo");
  const statePath = join(dir, "oo-state.json");
  const logPath = join(dir, "oo-calls.jsonl");
  writeFileSync(bin, `#!${process.execPath}\nimport { main } from "${import.meta.path}";\nawait main();\n`);
  chmodSync(bin, 0o755);
  const set = (s: FakeOoState) => writeFileSync(statePath, JSON.stringify(s));
  set(state);
  return {
    bin,
    env: { OO_FAKE_STATE: statePath, OO_FAKE_LOG: logPath },
    set,
    calls: (): FakeOoCall[] => (existsSync(logPath) ? readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []),
  };
}

// ---------- the binary itself ----------

export async function main() {
  const argv = process.argv.slice(2);
  const s = JSON.parse(readFileSync(process.env.OO_FAKE_STATE!, "utf8")) as FakeOoState;
  const call: FakeOoCall = { argv, env: Object.keys(process.env).sort() };
  const out = (v: unknown) => process.stdout.write(JSON.stringify(v));
  const fail = (msg: string, code = 1) => {
    appendFileSync(process.env.OO_FAKE_LOG!, `${JSON.stringify(call)}\n`);
    process.stderr.write(`${msg}\n`);
    process.exit(code);
  };
  const [a, b] = argv;
  if (a === "auth" && b === "status") {
    out(s.signedIn ? { status: "logged-in", activeAccountId: "acct_1", accounts: [{ id: "acct_1", name: "test", endpoint: "oomol.com", active: true }] } : { status: "logged-out", activeAccountId: null, accounts: [] });
  } else if (!s.signedIn) {
    fail("You must log in before using this command.");
  } else if (a === "connector" && b === "apps") {
    out(s.apps.map((x) => ({ status: "active", isDefault: false, scopes: [], displayName: x.connectionName, ...x })));
  } else if (a === "connector" && b === "search") {
    const words = argv[2].toLowerCase().split(/\s+/);
    const hits = s.actions.filter((x) => words.some((w) => `${x.service} ${x.name} ${x.description ?? ""}`.toLowerCase().includes(w))).slice(0, 10);
    out([...hits, ...hits.slice(0, 2)].map((x) => ({ name: x.name, service: x.service, description: x.description, authenticated: true, accessStatus: "available" })));
  } else if (a === "connector" && b === "schema") {
    const ids = argv.slice(2).filter((x) => !x.startsWith("--"));
    out(ids.map((id) => s.actions.find((x) => `${x.service}.${x.name}` === id)).filter(Boolean).map((x) => ({ ...x, inputSchema: x!.inputSchema ?? { type: "object", properties: {} }, outputSchema: {} })));
  } else if (a === "connector" && b === "run") {
    const service = argv[2];
    const action = argv[argv.indexOf("-a") + 1];
    const d = argv[argv.indexOf("-d") + 1] ?? "";
    if (d.startsWith("@")) {
      const p = d.slice(1);
      call.file = { mode: statSync(p).mode & 0o777, input: JSON.parse(readFileSync(p, "utf8")) };
    }
    if (s.sleepMs) await Bun.sleep(s.sleepMs);
    const r = s.results?.[`${service}.${action}`];
    if (r === undefined) fail(`The connector action metadata request returned HTTP 404.`);
    out({ data: r, meta: { executionId: "exec_1" } });
  } else {
    fail(`unknown command: ${argv.join(" ")}`, 2);
  }
  appendFileSync(process.env.OO_FAKE_LOG!, `${JSON.stringify(call)}\n`);
}

