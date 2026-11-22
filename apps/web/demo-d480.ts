// D480: a demo core for opening an agent's Nowledge Mem mailbox in place. The home is the server hel
// (the partner listens on hel's own Nowledge Mem, in the person's "Only me" Space); the person's
// MacBook Pro M3 is a computer for tasks with Claude Code and Codex, Mem's plugin in both. No nmem
// runs: scripted stand-ins answer the read-only checks as nmem 0.10.122 would (the Spaces are the
// author's own list, 2026-11-22), and the Mac is a pretend worker over the real socket.
//   DUCTER_PORT=7481 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh DEMO_STAGE=choose bun apps/web/demo-d480.ts
// DEMO_STAGE:
//   choose  Codex reaches the partner both ways; Claude Code reaches it but Mem lists its mailbox closed.
//           The Mac's own Mem is hel's too, so 打开它的信箱 offers the Spaces.
//   apart   the Mac's own Mem is Nowledge Cloud while the partner listens on hel: two Mems.
//   card    as choose, with D470's mailbox task stopped on its question to the person (what the author
//           met: a Space name to type, and four buttons).
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const stage = process.env.DEMO_STAGE ?? "choose";
const SPACE = "personal-7d1e0c2a";
const HEL = "https://hel.siwei.info/remote-api";
const CLOUD = "https://cloud.nowledge.co/remote-api";
const MAC = "MacBook Pro M3";
const ok = (j: unknown) => ({ code: 0, out: JSON.stringify(j), err: "" });
// The author's Spaces as Mem's passive setup lists them (ids shortened where they carry a member id).
const candidates = [
  { id: "default", label: "Before the team", kind: "default", readers: 6, write_default: false },
  { id: "all", label: "Everyone", kind: "commons", readers: 10, write_default: false },
  { id: "codex", label: "Codex", kind: "team", readers: 7, write_default: false },
  { id: "dev-team", label: "dev team", kind: "team", readers: 7, write_default: false },
  { id: "nowledge-co/mem", label: "Nowledge Co/mem", kind: "team", readers: 7, write_default: false },
  { id: "nowledge-mem", label: "Nowledge Mem", kind: "team", readers: 7, write_default: false },
  { id: SPACE, label: "Only me", kind: "personal", readers: 1, write_default: true },
  { id: "userfiles", label: "userFiles", kind: "team", readers: 8, write_default: false },
];
const conn = { connection_id: "00000000-0000-4000-8000-000000000001", agent_id: "ducter", identity_birth: "00000000-0000-4000-8000-000000000900", client_label: "ducter", state: "active" };
// The home's nmem (hel's own Mem), as the partner's Bridge connection reads it.
const run = async (args: string[]) => {
  const a = args.join(" ");
  if (args[0] === "--version") return ok("nmem 0.10.122");
  if (a.includes("bridge connections --help")) return { code: 0, out: "", err: "" };
  if (a.includes("connections list --help")) return { code: 0, out: "", err: "" };
  if (a === "status") return ok({ status: "ok", backend: "remote", mode: "remote", api_url: HEL });
  if (a === "bridge setup") return ok({ state: "selection_needed", candidates });
  if (a.includes("connections connect")) {
    conn.client_label = args[args.indexOf("--context") + 1] ?? "ducter";
    return ok({ state: "connected", agent_context: conn.client_label, connection: conn, selection: { scope: { space_id: SPACE }, address: { agent_id: "ducter" } } });
  }
  if (a.includes("bridge setup")) return ok({ state: "enable_needed", endpoint: { address: { agent_id: "ducter" } } });
  if (a.includes("connections list")) return ok({ schema_version: 1, connections: conn.client_label === "ducter" ? [] : [conn], next_connection_id: null });
  return { code: 2, out: "", err: "demo: not scripted" };
};
const sys = { which: () => undefined, exists: () => false, read: () => undefined, list: () => [], real: (p: string) => p, home: "/home/weyl", platform: "linux" as const, uid: 1000 };
const core = startCore({
  ooSource: noOo,
  persona: { id: "default", name: "Ducter", identity: "" },
  hostname: process.env.DUCTER_HOST || "127.0.0.1",
  platform: "linux",
  bridgeLink: { run: run as never, env: {}, sys, exec: async () => new Promise<never>(() => {}) },
  deviceProbes: {
    cua: async () => ({ missing: "no" }),
    native: async () => undefined,
    harnesses: async () => [{ harness: "codex", installed: true, loggedIn: true, version: "0.169.1", how: "npm" }],
    kind: async () => "server",
  },
  update: { homeName: "hel", autoEveryMs: 0, run: () => new Promise(() => {}) },
  memPlugins: { inspectLocal: async () => ({ codex: { state: "installed", version: "0.7.37" } }), everyMs: 0, connected: () => true },
});
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.persona.mem = { agentId: "ducter", owned: true };
core.settings.setMemState("connected");
core.settings.set({ language: zh ? "zh" : "en" });
void core.bridgeLink.connect();
if (stage !== "apart") core.bridgeLink.setMailboxes?.([{ harness: "codex", open: true }, { harness: "claude-code", open: false }]);

// The Mac, a pretend worker: its own Mem is hel's (choose, card) or Nowledge Cloud (apart).
const macServer = stage === "apart" ? "cloud.nowledge.co" : "hel.siwei.info";
const w = core.devices.redeem(core.devices.createCode({ kind: "worker" }).code, { name: MAC, platform: "darwin-arm64", computer: MAC } as never) as { token: string };
const ws = new WebSocket(`ws://127.0.0.1:${core.port}/worker`, { headers: { "x-forwarded-for": "203.0.113.9", authorization: `Bearer ${w.token}` } } as never);
await new Promise<void>((r) => (ws.onopen = () => r()));
ws.onmessage = (m) => {
  const f = JSON.parse(String(m.data));
  if (f.t !== "req") return;
  const reply = (result: unknown) => ws.send(JSON.stringify({ t: "res", id: f.id, ok: true, result }));
  if (f.op === "mem_plugins") return reply({ "claude-code": { state: "installed", version: "0.7.37" }, codex: { state: "installed", version: "0.7.37" } });
  if (f.op === "mem_bridge_look") return reply({ signedIn: true, server: macServer, backend: stage === "apart" ? "cloud" : "remote", setup: { state: "selection_needed", candidates } });
  reply(null);
};
ws.send(
  JSON.stringify({
    t: "hello",
    os: "darwin",
    arch: "arm64",
    kind: "laptop",
    version: "0.1.16",
    how: "app",
    harnesses: [
      { id: "claude-code", installed: true, loggedIn: true, version: "2.1.322", how: "installer" },
      { id: "codex", installed: true, loggedIn: true, version: "0.169.1", how: "npm" },
    ],
    mem: { state: "ready", version: "0.10.122", agents: ["claude-code", "codex"], server: macServer },
  }),
);
await Bun.sleep(300);
void core.memPlugins?.check();

if (stage === "card") {
  // D470's mailbox task, stopped on its question: the Space by name, typed (what the author met).
  const log = core.log;
  const id = "t_mailbox";
  const title = zh ? `打开 ${MAC} 上 Claude Code 在 Nowledge Mem 的信箱` : `Open the Nowledge Mem mailbox of Claude Code on ${MAC}`;
  log.append({ stream: `task:${id}`, origin: "system", kind: "task_open", body: { taskId: id, title, project: "", place: { kind: "none", device: MAC }, harness: "claude-code", brief: "x" } as never });
  log.append({
    stream: "channel",
    origin: "partner",
    kind: "decision",
    body: {
      decisionId: "d_space",
      taskId: id,
      question: zh ? "Claude Code 的信箱放在哪个 Space？请回复 Space 名称（例如 dev-team）。不回复的话就先不开信箱，什么都不改。" : "Which Space should Claude Code's mailbox go in? Reply with the Space name (for example dev-team). Without a reply the mailbox stays closed and nothing changes.",
      goLabel: zh ? "先不开" : "Leave it closed",
      defaultOption: "hold",
      reversible: false,
    },
  });
  core.tasks.setState(id, "needs_you", "hot");
}

console.log(`[demo] up at http://127.0.0.1:${core.port}/app#settings=peers (data: ${core.dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
