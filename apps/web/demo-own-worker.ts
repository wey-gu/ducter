// A demo core for D377's pictures: the person's own Claude Code session on a computer for tasks.
// The home is a Linux server (Hetzner Server); the person's terminal Claude Code ran on their
// MacBook, a pretend worker over the real socket that says which agents kept records there (by file
// times) and takes the yes on its card. Nothing is read from this machine; obviously fake content.
//   DUCTER_PORT=7951 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh DEMO_STAGE=ask bun apps/web/demo-own-worker.ts
// DEMO_STAGE=ask: the partner's first look (the home's records) and the code's one line asking for
//   the yes on the MacBook's card; the card says 还没读过 / Not read yet.
// DEMO_STAGE=after: the yes given; the first look names the MacBook, and the session is carried on
//   there as a task, its earlier turns above Ducter's.
import { ADOPTED } from "../../packages/runner/src/brief.ts";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const stage = process.env.DEMO_STAGE === "after" ? "after" : "ask";
const z = (a: string, b: string) => (zh ? a : b);
const HOME = "Hetzner Server";
const MAC = "Macbook Pro M3";
const core = startCore({ ooSource: noOo, persona: { id: "default", name: "Ducter", identity: "" }, hostname: "127.0.0.1", platform: "linux", update: { homeName: HOME, autoEveryMs: 0, run: () => new Promise(() => {}) }, deviceProbes: { cua: async () => ({ missing: "no" }), native: async () => undefined, harnesses: async () => [{ harness: "codex", installed: true, loggedIn: true, version: "0.170.0", how: "npm" }], kind: async () => "server" } });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });

// The MacBook, joined as a computer for tasks.
const w = core.devices.redeem(core.devices.createCode({ kind: "worker" }).code, { name: MAC, platform: "darwin-arm64", computer: MAC } as never) as { token: string; deviceId?: string };
const ws = new WebSocket(`ws://127.0.0.1:${core.port}/worker`, { headers: { authorization: `Bearer ${w.token}` } } as never);
await new Promise<void>((r) => (ws.onopen = () => r()));
const agents = [
  { agent: "claude-code", lastAt: new Date(Date.now() - 6 * 60_000).toISOString() },
  { agent: "codex", lastAt: new Date(Date.now() - 26 * 3600_000).toISOString() },
];
let state = stage === "after" ? "on" : "unasked";
ws.onmessage = (m) => {
  const f = JSON.parse(String(m.data));
  if (f.t !== "req") return;
  if (f.op === "records_allow") {
    state = f.args.on ? "on" : "off";
    ws.send(JSON.stringify({ t: "res", id: f.id, ok: true, result: { state, agents } }));
    ws.send(JSON.stringify({ t: "records", records: { state, agents } }));
    return;
  }
  ws.send(JSON.stringify({ t: "res", id: f.id, ok: true, result: null }));
};
ws.send(
  JSON.stringify({
    t: "hello",
    os: "darwin",
    arch: "arm64",
    kind: "laptop",
    version: "0.0.84",
    how: "app",
    abilities: [{ id: "web", state: "on", where: "chrome" }],
    harnesses: [
      { id: "claude-code", installed: true, loggedIn: true, version: "2.1.326", how: "installer" },
      { id: "codex", installed: true, loggedIn: true, version: "0.170.0", how: "npm" },
    ],
    records: { state, agents },
  }),
);

const log = core.log;
const ask = z("接着我终端里那个 Claude 在做的，把剩下的测试补上", "Carry on what Claude was doing in my terminal, and add the missing tests");
const u = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: ask } });
// Said by the code: the first look at the home's records, then the ask for the MacBook's yes.
log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: z(`我看了 ${HOME} 上你在 Claude Code 里的对话记录：只看名字、文件夹、时间和你说的头一句，不看代码和文件。`, `I looked at your Claude Code conversations on ${HOME}: only their names, folders, times and your first words, no code or files.`), replyTo: u.seq } });
log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: z(`你最近在 ${MAC} 上用过 Claude Code，那台电脑上的记录我还没读过。在「你的设备」里打开 ${MAC}，点「读它们留下的记录」，我就去找。`, `You used Claude Code on ${MAC} lately, and I haven't read its records yet. Open ${MAC} in Your devices and tap Read what they keep, and I'll look.`), replyTo: u.seq } });
if (stage === "after") {
  const u2 = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: z("点了，找吧", "Done, go ahead") } });
  log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: z(`我看了 ${MAC} 上你在 Claude Code 里的对话记录：只看名字、文件夹、时间和你说的头一句，不看代码和文件。`, `I looked at your Claude Code conversations on ${MAC}: only their names, folders, times and your first words, no code or files.`), replyTo: u2.seq } });
  const taskId = "t_mac";
  const title = z("compaction 阈值做成可配置", "Make the compaction threshold configurable");
  const at = new Date(Date.now() - 70 * 60_000).toISOString();
  const sid = "fake0000-cc00-4000-8000-0000000000d1";
  log.append({ stream: `task:${taskId}`, origin: "system", kind: "task_open", body: { taskId, title, project: "hawdb", place: { kind: "folder", device: MAC, path: "/Users/demo/dev/hawdb" }, harness: "claude-code", brief: z("把 L0 compaction 的触发阈值做成可配置的，默认 8", "Make the L0 compaction trigger configurable, default 8"), origin: "you", outside: { agent: "claude-code", sessionId: sid, startedAt: at } } });
  const ev = (body: Record<string, unknown>) => log.append({ stream: `task:${taskId}`, origin: "system", kind: "task_event", body: { taskId, ...body } as never });
  ev({ role: "system", from: "runner", raw: { folder: { direct: true } } });
  ev({ role: "system", from: "runner", text: "carried on from a Claude Code session started outside Ducter", raw: { outside: { agent: "claude-code", at, turns: 2 }, sessionId: sid, harness: "claude-code" } });
  ev({ role: "user", from: "user", text: z("把 L0 compaction 的触发阈值做成可配置的，默认 8", "Make the L0 compaction trigger configurable, default 8"), raw: { outside: true, at } });
  ev({ role: "assistant", text: z("改好了：新增 compaction.l0_trigger 配置项，默认 8。测试还没补。", "Done: a new compaction.l0_trigger setting, default 8. Tests aren't written yet."), raw: { outside: true, at } });
  ev({ role: "user", from: "ducter", text: `${ADOPTED} It began in Claude Code on ${at.slice(0, 10)}, in /Users/demo/dev/hawdb; this is that same session, resumed, so its earlier turns are yours.` });
  ev({ role: "user", from: "partner", text: z("把剩下的测试补上", "Add the missing tests") });
  log.append({ stream: "channel", origin: "partner", kind: "ack", body: { jobId: "j_mac", text: z(`我在 ${MAC} 上接着做你在 Claude Code 里改的 compaction 阈值，把测试补上。`, `I'll carry on your Claude Code change to the compaction threshold on ${MAC} and add the tests.`), replyTo: u2.seq } });
  log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: "j_mac", text: title, state: "running", taskId } });
  core.tasks.setState(taskId, "working", "hot");
}
console.log(`demo-own-worker ready on :${core.port} (${stage}, ${zh ? "zh" : "en"})`);
