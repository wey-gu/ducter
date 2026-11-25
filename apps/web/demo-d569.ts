// A demo core for D569's pictures: the author's three computers on 0.1.67. hel is the home (Mem
// connected, pretend); haswell is a pretend worker over the real socket with its Claude Code signed out
// there and Codex signed in, its Nowledge Mem plugin 0.7.37 with 0.7.38 out. Mem couldn't settle four
// things (the author's real asks, read only on 2026-11-25), each with the partner's suggestion as haiku
// judged it (research/232). 更新 opens the update task after 1.5 s; it ends DEMO_DONE_MS later (default
// 8 s) with 0.7.38 there. DEMO_AWAY=1: haswell is asleep.
//   DUCTER_PORT=7869 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-d569.ts
// then open http://127.0.0.1:7869/app#settings=memory (or #settings=home)
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const ok = (j: unknown) => ({ code: 0, out: JSON.stringify(j), err: "" });
const SPACE = "6f1c0d2e-8b4a-4d1e-9c3f-2a7b5e0d9c11";
const conn = { connection_id: "00000000-0000-4000-8000-000000000001", agent_id: "ducter", identity_birth: "00000000-0000-4000-8000-000000000900", client_label: "ducter", state: "active" };
const ago = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
const review = (rec: string) => ({ state: "pending", allowed_actions: ["keep_newer_as_latest", "keep_older_as_latest", "keep_both_linked", "no_change_needed", "dismiss"], recommended_action: rec, expires_at: ago(-25) });
const contra = (id: string, d: number, a: string, b: string) => ({ id, event_type: "flag_contradiction", resolved: false, created_at: ago(d), metadata: { memory_ids: ["m-old", "m-new"], new_memory_id: "m-new", memory_pairs: [{ date: "2026-11-24", title: a, source: "cli" }, { date: "2026-11-24", title: b, source: "cli" }] }, review: review("keep_both_linked") });
const events = [
  contra("3c9f7ab8", 1, "D524 one row hover", "D527 one row hover (renumbered)"),
  contra("d1fb295d", 1.01, "D529 one row hover (final number)", "D527 one row hover (renumbered)"),
  contra("8628c162", 16, "D148 opened task transcript and key redaction", "Ducter v0.0.4 release"),
];
const rules = [{ id: "feishu-github-actions", title: "Feishu 生产部署必须经 GitHub Actions 故障安全门禁", body: "Production Feishu Worker 必须通过 GitHub Actions 的 fail-closed 门禁部署，且部署源需与当前 origin/main 的精确 SHA 完全一致。", status: "draft", scope: "global", priority: 50, tags: [], createdAt: "2026-09-04T08:00:00Z" }];
// The partner's judgement, as haiku gave it over Mem's facts (research/232), in each language.
const advice = zh
  ? [["3c9f7ab8", "newer", "后记的那条是更正：编号改成了 D527。"], ["d1fb295d", "older", "先记的 D529 是统一分配的最终编号。"], ["8628c162", "both", "发布说明收录了 D148，两条并不冲突。"], ["rule:feishu-github-actions", "use", "这是一条长期的部署规矩，值得每个 AI 都照着做。"]]
  : [["3c9f7ab8", "newer", "The later one is a correction: the number moved to D527."], ["d1fb295d", "older", "The earlier note gives D529, the number assigned in the end."], ["8628c162", "both", "The release notes list D148 as shipped; both hold."], ["rule:feishu-github-actions", "use", "A lasting deploy rule every AI tool should follow."]];
const run = async (args: string[]) => {
  const a = args.join(" ");
  if (args[0] === "doctor") return ok({ checks: [], failed: false });
  if (args[0] === "--version") return ok("nmem 0.10.123");
  if (a.includes("bridge connections --help")) return { code: 0, out: "", err: "" };
  if (a === "status") return ok({ status: "healthy", backend: "cloud", update: { current: "0.10.123", latest: "0.10.123", update_available: false } });
  if (a === "bridge setup") return ok({ state: "selection_needed", candidates: [{ id: SPACE, label: "Only me", kind: "personal", readers: 1, write_default: true }] });
  if (a.includes("connections connect")) return ok({ state: "connected", agent_context: "ducter", connection: conn, selection: { scope: { space_id: SPACE }, address: { agent_id: "ducter" } } });
  if (a.includes("--agent-context ducter bridge setup")) return ok({ state: "enable_needed", endpoint: { address: { agent_id: "ducter" } } });
  if (a.includes("connections list")) return ok({ schema_version: 1, connections: [conn], next_connection_id: null });
  if (a.startsWith("feed --type flag_contradiction")) return ok({ events });
  if (a.startsWith("feed reviews")) return ok({ events: [], total: 1051 });
  if (a === "rules list") return ok({ rules });
  if (args[0] === "m" && args[1] === "list") {
    // D569: said preferences kept with their kind, newest first (Mem's order, kept by Ducter too).
    const mem = (t: string, d: number, source: string, unit: string) => ({ id: `m-${d}-${unit}`, title: t, source, unit_type: unit, created_at: ago(d) });
    const prefs = zh
      ? [mem("GitHub 评审不想逐次确认", 5, "ducter", "preference"), mem("构建验证优先选高配置机器", 6, "ducter", "preference"), mem("生活相关的事不用 Claude Code", 7, "ducter", "preference"), mem("Owner's blog writing voice preferences", 62, "thread_distillation", "preference")]
      : [mem("No one-by-one confirmation for GitHub reviews", 5, "ducter", "preference"), mem("Builds and checks go to the beefier machine", 6, "ducter", "preference"), mem("Not Claude Code for life errands", 7, "ducter", "preference"), mem("Owner's blog writing voice preferences", 62, "thread_distillation", "preference")];
    const unit = args[args.indexOf("--unit-type") + 1];
    return ok({ memories: args.includes("--unit-type") ? (unit === "preference" ? prefs : []) : prefs, total: 11286 });
  }
  if (args[0] === "feed" && args[1] === "resolve") return ok(args.includes("--plan-id") ? { applied: true } : { preview: true, plan_id: "plan_demo" });
  if (args[0] === "rules" && args[1] === "upsert") return ok({});
  return { code: 2, out: "", err: "demo: not scripted" };
};
const NMEM = "/home/wei/.local/bin/nmem";
const sys = { which: (c: string) => (c === "nmem" ? NMEM : undefined), exists: (p: string) => p === NMEM, read: () => undefined, list: () => [], real: (p: string) => p, home: "/home/wei", platform: "linux" as const, uid: 1000 };

let ccVersion = "0.7.37";
const core = startCore({
  ooSource: noOo,
  persona: { id: "default", name: zh ? "小鸭" : "Duckie", identity: "" },
  hostname: "127.0.0.1",
  platform: "linux",
  update: { homeName: "hel", autoEveryMs: 0, run: () => new Promise(() => {}) },
  deviceProbes: { cua: async () => ({ missing: "no" }), native: async () => undefined, kind: async () => "server", harnesses: async () => [{ harness: "claude-code", installed: true, loggedIn: true, version: "2.1.330", how: "installer" }, { harness: "codex", installed: true, loggedIn: true, version: "0.169.1", how: "npm" }] },
  memPlugins: { inspectLocal: async () => ({ "claude-code": { state: "installed", version: "0.7.38" }, codex: { state: "installed", version: "0.1.53" } }), checkUpdates: async () => ({ "claude-code": "0.7.38" }), everyMs: 0, connected: () => true },
  memAdvise: async (prompt: string) => JSON.stringify({ items: advice.filter(([id]) => prompt.includes(`"id":"${id}"`)).map(([id, answer, why]) => ({ id, answer, why })) }),
  bridgeLink: { run: run as never, env: {}, sys, exec: async () => new Promise<never>(() => {}) } as never,
} as never);
const stub = stubRunner(core);
core.setRunner({
  ...stub,
  openTask: async (i: Parameters<typeof stub.openTask>[0]) => {
    await new Promise((r) => setTimeout(r, 1500));
    const taskId = "t_memupdate";
    core.log.append({ stream: `task:${taskId}`, origin: "partner", kind: "task_open", body: { taskId, title: i.title, project: "", place: { kind: "none" }, harness: i.harness ?? "codex", brief: i.brief } } as never);
    core.tasks.setState(taskId, "working", "hot");
    setTimeout(() => {
      ccVersion = "0.7.38";
      core.tasks.setState(taskId, "done_claimed", "hot");
    }, Number(process.env.DEMO_DONE_MS ?? 8000));
    return { taskId } as Awaited<ReturnType<typeof stub.openTask>>;
  },
} as typeof stub);
core.setPartner({ onTrigger() {} });
core.persona.mem = { agentId: "ducter", owned: true };
core.settings.setMemState("connected");
core.settings.set({ language: zh ? "zh" : "en" });
void core.bridgeLink.connect();

// haswell: lent for tasks, Claude Code signed out there, Codex signed in.
const w = core.devices.redeem(core.devices.createCode({ kind: "worker" }).code, { name: "haswell", platform: "linux-x64", computer: "haswell" } as never) as { token: string };
if (process.env.DEMO_AWAY !== "1") {
  const ws = new WebSocket(`ws://127.0.0.1:${core.port}/worker`, { headers: { "x-forwarded-for": "203.0.113.9", authorization: `Bearer ${w.token}` } } as never);
  await new Promise<void>((r) => (ws.onopen = () => r()));
  ws.onmessage = (m) => {
    const f = JSON.parse(String(m.data));
    if (f.t !== "req") return;
    if (f.op === "mem_plugins") return ws.send(JSON.stringify({ t: "res", id: f.id, ok: true, result: { "claude-code": { state: "installed", version: ccVersion }, codex: { state: "installed", version: "0.1.53" } } }));
    ws.send(JSON.stringify({ t: "res", id: f.id, ok: true, result: null }));
  };
  ws.send(JSON.stringify({ t: "hello", os: "linux", arch: "x64", kind: "server", version: "0.1.67", how: "self", abilities: [], harnesses: [{ id: "claude-code", installed: true, loggedIn: false, version: "2.1.330", how: "installer" }, { id: "codex", installed: true, loggedIn: true, version: "0.169.1", how: "npm" }], mem: { state: "ready", version: "0.10.123", agents: ["claude-code", "codex"] } }));
  setTimeout(() => void core.memPlugins?.check?.(), 800);
}
console.log(`[demo] up at http://127.0.0.1:${core.port}/app#settings=memory (data: ${core.dataDir})`);
