// A demo core for D576's pictures: Agent messaging with the person's Claude Code (0.7.38), Codex (0.1.53)
// and pi on the home. DEMO_PI picks pi's Nowledge Mem plugin: 0.8.20 (it carries Bridge itself: hands work,
// reads the reply when asked), 0.8.19 (its update lets it talk; Mem's plugin check doesn't list pi, so
// 0.8.20 stands as the newer one out), absent (the invite to install). Tapping 让它能和我传话 opens the
// update task after 1 s, and it runs until the demo stops. No nmem runs: scripted stand-ins answer as
// nmem 0.10.123 would.
//   DUCTER_PORT=7576 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh DEMO_PI=0.8.19 bun apps/web/demo-d576.ts
// then open http://127.0.0.1:7576/app#settings=peers
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const pi = process.env.DEMO_PI ?? "0.8.20";
const ok = (j: unknown) => ({ code: 0, out: JSON.stringify(j), err: "" });
const SPACE = "6f1c0d2e-8b4a-4d1e-9c3f-2a7b5e0d9c11";
const conn = { connection_id: "00000000-0000-4000-8000-000000000001", agent_id: "ducter", identity_birth: "00000000-0000-4000-8000-000000000900", client_label: "ducter", state: "active" };
const run = async (args: string[]) => {
  const a = args.join(" ");
  if (args[0] === "doctor") return ok({ checks: [], failed: false });
  if (args[0] === "--version") return ok("nmem 0.10.123");
  if (a.includes("bridge connections --help")) return { code: 0, out: "", err: "" };
  if (a === "status") return ok({ status: "healthy", backend: "cloud", update: { current: "0.10.123", latest: "0.10.123", update_available: false } });
  if (a === "bridge setup") return ok({ state: "selection_needed", candidates: [{ id: SPACE, label: "Only me", kind: "personal", readers: 1, write_default: true }] });
  if (a.includes("connections list --help")) return { code: 0, out: "", err: "" };
  if (a.includes("connections connect")) {
    conn.client_label = args[args.indexOf("--context") + 1] ?? "ducter";
    return ok({ state: "connected", agent_context: conn.client_label, connection: conn, selection: { scope: { space_id: SPACE }, address: { agent_id: "ducter" } } });
  }
  if (a.includes("bridge setup")) return ok({ state: "enable_needed", endpoint: { address: { agent_id: "ducter" } } });
  if (a.includes("connections list")) return ok({ schema_version: 1, connections: conn.client_label === "ducter" ? [] : [conn], next_connection_id: null });
  return { code: 2, out: "", err: "demo: not scripted" };
};
const NMEM = "/Users/ada/.local/bin/nmem";
const sys = { which: (c: string) => (c === "nmem" ? NMEM : undefined), exists: (p: string) => p === NMEM, read: () => undefined, list: () => [], real: (p: string) => p, home: "/Users/ada", platform: "darwin" as const, uid: 501 };
const piLine = pi === "absent" ? { state: "absent" } : { state: "installed", version: pi };

const core = startCore({
  ooSource: noOo,
  persona: { id: "default", name: zh ? "小鸭" : "Duckie", identity: "" },
  hostname: "127.0.0.1",
  platform: "darwin",
  update: { homeName: "Ada's MacBook Air", autoEveryMs: 0, run: () => new Promise(() => {}) },
  deviceProbes: {
    cua: async () => ({ missing: "no" }),
    native: async () => undefined,
    kind: async () => "laptop",
    harnesses: async () => [
      { harness: "claude-code", installed: true, loggedIn: true, version: "2.1.330", how: "installer" },
      { harness: "codex", installed: true, loggedIn: true, version: "0.169.1", how: "npm" },
      { harness: "pi", installed: true, loggedIn: true, version: "1.6.0", how: "npm" },
    ],
  },
  memPlugins: { inspectLocal: async () => ({ "claude-code": { state: "installed", version: "0.7.38" }, codex: { state: "installed", version: "0.1.53" }, pi: piLine }), checkUpdates: async () => ({ "claude-code": "0.7.38" }), everyMs: 0, connected: () => true },
  bridgeLink: { run: run as never, env: {}, sys, exec: async () => new Promise<never>(() => {}) } as never,
} as never);
const stub = stubRunner(core);
core.setRunner({
  ...stub,
  openTask: async (i: Parameters<typeof stub.openTask>[0]) => {
    await new Promise((r) => setTimeout(r, 1000));
    const taskId = "t_piupdate";
    core.log.append({ stream: `task:${taskId}`, origin: "partner", kind: "task_open", body: { taskId, title: i.title, project: "", place: { kind: "none" }, harness: i.harness ?? "pi", brief: i.brief } } as never);
    core.tasks.setState(taskId, "working", "hot");
    return { taskId } as Awaited<ReturnType<typeof stub.openTask>>;
  },
} as typeof stub);
core.setPartner({ onTrigger() {} });
core.persona.mem = { agentId: "ducter", owned: true };
core.settings.setMemState("connected");
core.settings.set({ language: zh ? "zh" : "en", peers: { reach: "own", trusted: [], muted: [] } } as never);
void core.bridgeLink.connect();
setTimeout(() => void core.memPlugins?.check?.(), 500);
console.log(`[demo] up at http://127.0.0.1:${core.port}/app#settings=peers (data: ${core.dataDir})`);
