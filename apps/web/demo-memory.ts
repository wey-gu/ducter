// A demo core for Settings › 记忆 / Memory and › 连上的 AI agent (D257), in one state. No nmem runs: a
// scripted stand-in answers the read-only checks. Noted lines are seeded into the Log across a few
// days (realistic, not anyone's own memories). For pictures, web and phone.
//   DUCTER_PORT=7864 DUCTER_DATA_DIR=/tmp/x DEMO_LANG=zh DEMO_MEM=newer bun apps/web/demo-memory.ts
// D329: closed (the Nowledge Mem app on home-server isn't open; the home can open it).
// DEMO_MEM: newer (connected, Bridge on, Mem says 0.10.121 is out; pipx copy) · on (connected, up to
//   date) · empty (connected, nothing noted yet) · off (switched off) · fresh (no nmem on the home) ·
//   sign_in (nmem there, not signed in) · old (0.10.116 by pipx: too old for Bridge)
// D375: DEMO_HEALTH: what Mem's own doctor answers (made-up details): ok · unreachable · signed_out ·
//   plugin (Claude Code here isn't connected; 接上 runs a pretend `nmem connect` for 3 s) · old (no doctor)
// D466: DEMO_HEALTH=update: Claude Code's Mem plugin 0.7.34 with 0.7.37 out, Codex's in twice (0.1.10, 0.1.53)
// D552: DEMO_HEALTH=update552: Claude Code's 0.7.34 with 0.7.38 out; 更新 opens its task after 1.5 s (the
//   button reads 更新中… from the tap), and the task ends DEMO_DONE_MS later (default 8 s) with 0.7.38 there.
// then open http://127.0.0.1:7864/app#settings=memory (or #settings=peers)
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const want = process.env.DEMO_MEM ?? "newer";
const SPACE = "6f1c0d2e-8b4a-4d1e-9c3f-2a7b5e0d9c11";
const ok = (j: unknown) => ({ code: 0, out: JSON.stringify(j), err: "" });
const conn = { connection_id: "00000000-0000-4000-8000-000000000001", agent_id: "ducter", identity_birth: "00000000-0000-4000-8000-000000000900", client_label: "ducter", state: "active" };
const version = want === "old" ? "0.10.116" : "0.10.118";
const health = process.env.DEMO_HEALTH;
let ccIn = false;
let ccVersion = "0.7.34";
// D465: DEMO_CHECK=1 adds what Nowledge Mem would like checked (a contradiction, a learned rule) and a rule on.
const check = process.env.DEMO_CHECK === "1";
const checkContra = {
  id: "56e40028-8aff-4659-8564-5f7ffff46c4b",
  event_type: "flag_contradiction",
  resolved: false,
  created_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  metadata: {
    memory_ids: ["m-old", "m-new"],
    new_memory_id: "m-new",
    memory_pairs: zh
      ? [{ date: "2026-11-09", title: "周报每周五下午发，发给整个组" }, { date: "2026-11-18", title: "周报改到每周一上午发，只发给 Weizhen" }]
      : [{ date: "2026-11-09", title: "The weekly report goes out Friday afternoon, to the whole team" }, { date: "2026-11-18", title: "The weekly report moves to Monday morning, to Weizhen only" }],
  },
  review: { state: "pending", allowed_actions: ["keep_newer_as_latest", "keep_older_as_latest", "keep_both_linked", "no_change_needed", "dismiss"], recommended_action: "keep_newer_as_latest", expires_at: new Date(Date.now() + 20 * 86_400_000).toISOString() },
};
const checkRules = [
  zh
    ? { id: "release-ci", title: "发版前先等 CI 全绿", body: "发新版本前，等主干的 CI 全部通过、读过失败数再推送；不要在测试后直接接着推送。", status: "draft", scope: "global", priority: 50, tags: ["release"] }
    : { id: "release-ci", title: "Release only after CI is green", body: "Before a new version goes out, wait for main's CI to pass and read the fail count before pushing; never chain a push after the tests.", status: "draft", scope: "global", priority: 50, tags: ["release"] },
  zh
    ? { id: "reply-zh", title: "聊天用中文，仓库里的文档和代码用英文", body: "", status: "active", scope: "global", priority: 60, tags: [] }
    : { id: "reply-zh", title: "Chat in Chinese; docs and code in the repo in English", body: "", status: "active", scope: "global", priority: 60, tags: [] },
];
const chk = (name: string, status: string, detail = "", tool: string | null = null) => ({ name, status, detail, tool });
const doctorOut = () => {
  const cred = chk("credential home", "pass", "/home/wei/.nowledge-mem/config.json — url https://mem.example.invalid (config), key nmem_xx…0000");
  const up = chk("server reachable", "pass", "https://mem.example.invalid (server v0.1.0)");
  const key = chk("api key", "pass", "authenticated probe ok");
  const tools = [chk("Claude Code", health === "plugin" && !ccIn ? "warn" : "pass", "registered", "claude-code"), chk("Codex", "pass", "registered", "codex-cli")];
  if (health === "unreachable") return { code: 1, out: JSON.stringify({ checks: [cred, chk("server reachable", "fail", "error sending request"), chk("api key", "warn", "skipped (server unreachable)")], failed: true }), err: "" };
  if (health === "signed_out") return { code: 1, out: JSON.stringify({ checks: [cred, up, chk("api key", "fail", "key invalid or rotated")], failed: true }), err: "" };
  if (health === "old") return { code: 2, out: "", err: "error: unrecognized subcommand 'doctor'" };
  return { code: 0, out: JSON.stringify({ checks: [cred, up, key, ...tools], failed: false }), err: "" };
};
const run = async (args: string[]) => {
  const a = args.join(" ");
  if (want === "fresh") return undefined;
  if (args[0] === "doctor" && health) return doctorOut();
  if (args[0] === "--version") return ok(`nmem ${version}`);
  if (a.includes("bridge connections --help")) return { code: want === "old" ? 2 : 0, out: "", err: "" };
  if (a === "status" && want === "closed") return { code: 1, out: "", err: "error: connecting to http://127.0.0.1:14242 for /health/details: error sending request: tcp connect error: Connection refused (os error 61)" };
  if (a === "status")
    return want === "sign_in"
      ? { code: 1, out: "", err: "not signed in" }
      : ok({ status: "healthy", backend: "cloud", update: { current: version, latest: want === "newer" ? "0.10.121" : version, update_available: want === "newer" } });
  if (a === "bridge setup") return ok({ state: "selection_needed", candidates: [{ id: SPACE, label: "Only me", kind: "personal", readers: 1, write_default: true }] });
  if (a.includes("connections connect")) return ok({ state: "connected", agent_context: "ducter", connection: conn, selection: { scope: { space_id: SPACE }, address: { agent_id: "ducter" } } });
  if (a.includes("--agent-context ducter bridge setup")) return ok({ state: "enable_needed", endpoint: { address: { agent_id: "ducter" } } });
  if (a.includes("connections list")) return ok({ schema_version: 1, connections: [conn], next_connection_id: null });
  if (check) {
    // D465 (DEMO_CHECK=1): Mem's own asks, shaped as research/202 read them; answers are taken.
    if (a.startsWith("feed --type flag_contradiction")) return ok({ events: [checkContra] });
    if (a.startsWith("feed reviews")) return ok({ events: [], total: 40 });
    if (a === "rules list") return ok({ rules: checkRules });
    if (args[0] === "feed" && args[1] === "resolve") return ok(args.includes("--plan-id") ? { applied: true } : { preview: true, plan_id: "plan_demo" });
    if (args[0] === "rules" && args[1] === "upsert") return ok({});
  }
  return { code: 2, out: "", err: "demo: not scripted" };
};
// The home's nmem: a pipx copy, so Ducter can update it in one tap.
const NMEM = "/home/wei/.local/pipx/venvs/nmem-cli/bin/nmem";
const tools: Record<string, string> = want === "fresh" ? { pipx: "/usr/bin/pipx" } : { nmem: NMEM, pipx: "/usr/bin/pipx" };
const sys = {
  which: (c: string) => tools[c],
  exists: (p: string) => p === NMEM && want !== "fresh",
  read: () => undefined,
  list: () => [],
  real: (p: string) => p,
  home: "/home/wei",
  platform: "linux" as const,
  uid: 1000,
};
const exec = async () => new Promise<never>(() => {}); // a tap stays "updating…"

let shift = 0;
const clock = { now: () => Date.now() - shift, setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>) };
const healthOpts = health
  ? {
      deviceProbes: { cua: async () => ({ missing: "no" }), native: async () => undefined, kind: async () => "server", harnesses: async () => [{ harness: "claude-code", installed: true, loggedIn: true, version: "2.1.322", how: "installer" }, { harness: "codex", installed: true, loggedIn: true, version: "0.169.1", how: "npm" }] },
      memPlugins: {
        inspectLocal: async () =>
          health === "update552"
            ? { "claude-code": { state: "installed", version: ccVersion }, codex: { state: "installed", version: "0.1.53" } }
            : health === "update"
            ? { "claude-code": { state: "installed", version: "0.7.34" }, codex: { state: "review", why: "multiple", versions: ["0.1.10", "0.1.53"] } }
            : { "claude-code": health === "plugin" && !ccIn ? { state: "absent" } : { state: "installed", version: "0.7.36" }, codex: { state: "installed", version: "0.7.36" } },
        // D466: Mem's own `plugins check` says 0.7.37 is out (DEMO_HEALTH=update).
        ...(health === "update" ? { checkUpdates: async () => ({ "claude-code": "0.7.37" }) } : health === "update552" ? { checkUpdates: async () => ({ "claude-code": "0.7.38" }) } : {}),
        everyMs: 0,
        connected: () => true,
        connectLocal: async () => (await new Promise((r) => setTimeout(r, 3000)), (ccIn = true), { code: 0, out: "{}", err: "" }),
      },
    }
  : {};
const core = startCore({ ...(healthOpts as object), ooSource: noOo, clock, persona: { id: "default", name: zh ? "小鸭" : "Duckie", identity: "" }, hostname: process.env.DUCTER_HOST || "127.0.0.1", update: { homeName: "home-server" }, bridgeLink: { run: run as never, env: {}, sys, exec, ...(want === "closed" ? { memApp: () => "/Applications/Nowledge Mem.app" } : {}) } as never });
const stub = stubRunner(core);
core.setRunner(
  health === "update552"
    ? ({
        ...stub,
        // D552: the runner takes its time (a session starting), then the task updates it and ends.
        openTask: async (i: Parameters<typeof stub.openTask>[0]) => {
          await new Promise((r) => setTimeout(r, 1500));
          const card = await stub.openTask(i);
          setTimeout(() => {
            ccVersion = "0.7.38";
            core.log.append({ stream: `task:${card.taskId}`, origin: "system", kind: "task_state", body: { taskId: card.taskId, attention: "done_claimed", residency: "hot" } });
          }, Number(process.env.DEMO_DONE_MS ?? 8000));
          return card;
        },
      } as typeof stub)
    : stub,
);
core.setPartner({ onTrigger() {} });
if (want !== "fresh" && want !== "sign_in") core.persona.mem = { agentId: "ducter", owned: true };
core.settings.setMemState(want === "fresh" || want === "sign_in" ? "missing" : "connected");
core.settings.set({ language: zh ? "zh" : "en", ...(want === "off" ? { memory: false } : {}) });

// What it noted, as the partner writes it: a stated preference, a decision, a fact about the work.
const H = 3600_000;
const notes: [number, string, string][] = [
  [9 * 24 * H, "家里的网是电信，路由器在书房", "Home internet is on China Telecom; the router is in the study"],
  [4 * 24 * H, "HawDB 的发布说明用英文写", "HawDB release notes are written in English"],
  [2 * 24 * H + 3 * H, "Weizhen 负责 HawDB 的代码审查", "Weizhen reviews HawDB's code"],
  [26 * H, "测试统一用假时钟，不用真的 sleep", "Tests use the fake clock, never a real sleep"],
  [3 * H, "周报每周五下午发，发给整个组", "The weekly report goes out Friday afternoon, to the whole team"],
  [40 * 60_000, "开会别排在中午 12 点到 1 点", "No meetings between 12 and 1"],
];
if (want !== "empty" && want !== "fresh" && want !== "sign_in")
  for (const [back, z, e] of notes) {
    shift = back;
    core.log.append({ stream: "channel", origin: "partner", kind: "memory_noted", body: { title: zh ? z : e, memoryId: `m-${back}` } });
  }
shift = 0;
if (want === "newer" || want === "on" || want === "empty") void core.bridgeLink.connect();
console.log(`[demo] up at http://127.0.0.1:${core.port}/app#settings=memory (data: ${core.dataDir})`);
