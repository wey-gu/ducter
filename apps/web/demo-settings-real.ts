// A demo core for the third Settings pass (D399): every pane at the author's real counts, read off
// his own home (hel, read only: counts, kinds and names, never a value) and laid over fakes, so each
// pane is walked with what a heavy user actually has, not three tidy rows. Never the network, never
// a real account.
//   DUCTER_PORT=7951 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-settings-real.ts
// What is laid over it:
// - the home is Hetzner Server (a server) with Codex and Claude Code signed in; Codex lists six
//   models; a MacBook Pro M3 does tasks with four AI agents (DeepSeek Harness among them), haswell
//   with two; an iPhone, an iPad and a Pixel Fold (lent to tasks) reach it;
// - OOMOL with seven accounts (two Gmail, two Google Calendar, Slack, the Slack bot, a Discord bot,
//   one left out) and Tuwa for calls;
// - To-do sources: GitHub with 557 open, and an Obsidian vault whose name is long;
// - Chat apps: WeChat and Telegram linked (stub adapters: nothing is sent; Telegram set up again
//   links itself 2.5 s after its code shows), Slack never set up;
// - Passwords & cards: three sign-ins, two cards, the details, two keys;
// - quiet hours 23:00 to 08:00, three a day, autoupdate on.
// D469 round 2, DEMO_NEEDS=1: what Settings' Overview must show first: Nowledge Mem connected with
// two things it would like confirmed (a contradiction, a learned rule), Claude Code's Mem plugin a
// version behind, OOMOL unreachable once its accounts are listed, and Ducter 0.0.94 out.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ListedModel } from "@ducter/protocol/src/internal.ts";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import { demoAsk, pileIssues } from "./demo-pile.ts";
import { createModelCatalog } from "../../packages/core/src/models.ts";
import { httpLinker } from "../../packages/core/src/connections.ts";
import type { Channel, ChannelEvents } from "../../packages/core/src/channels/port.ts";
import { fakeOpenConnector } from "../../packages/core/test/fake-mcp.ts";
import { fakeGh } from "../../packages/core/test/fake-gh-issues.ts";
import { fakeTuwa } from "../../packages/core/test/fake-tuwa.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const dataDir = process.env.DUCTER_DATA_DIR;
if (!dataDir) throw new Error("set DUCTER_DATA_DIR to a scratch folder");
mkdirSync(dataDir, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), "ducter-demo-settings-"));
// D568, DEMO_PARTNERS=1: the author's four partners as hel had them at 0.1.67 (Ducter, 多比 in sky,
// 小新 in plum, 小玛 in coral thinking with Claude Code), 小玛 given the sprout; open the window on
// 小玛 (the page's #p=p4/settings, the Mac's switch) to walk Settings as he did.
if (process.env.DEMO_PARTNERS) {
  const at = "2026-11-20T08:00:00.000Z";
  const others = [
    { id: "p2", name: zh ? "多比" : "Dobby", look: "sky", createdAt: at },
    { id: "p3", name: zh ? "小新" : "Sunny", look: "plum", createdAt: at },
    { id: "p4", name: zh ? "小玛" : "Mara", look: "apricot", figure: "sprout", createdAt: at, brain: { harness: "claude-code", model: "opus" } },
  ];
  writeFileSync(join(dataDir, "partners.json"), JSON.stringify({ defaultLook: "sand", others }, null, 2));
}

// Codex's own list (six, as 0.169.1 lists them).
const E = ["low", "medium", "high", "xhigh", "max", "ultra"];
const codex: ListedModel[] = [
  { id: "gpt-6.2-sol", label: "GPT-6.2-Sol", efforts: E, defaultEffort: "low", default: true },
  { id: "gpt-6.2-astra", label: "GPT-6.2-Astra", efforts: E, defaultEffort: "low" },
  { id: "gpt-6.1-terra", label: "GPT-6.1-Terra", efforts: E, defaultEffort: "low" },
  { id: "gpt-6.1-sol", label: "GPT-6.1-Sol", efforts: E, defaultEffort: "low" },
  { id: "gpt-6-astra", label: "GPT-6-Astra", efforts: E, defaultEffort: "medium" },
  { id: "gpt-6-luna", label: "GPT-6-Luna", efforts: E.slice(0, 5), defaultEffort: "medium" },
];

// OOMOL's look-alike: the author's seven accounts, one he left out.
const KEY = "demo_oomol_not_a_key";
const app = (id: string, service: string, displayName: string, accountLabel: string) => ({ id, service, displayName, accountLabel, alias: null, authType: "oauth2", status: "active" });
// D404: each service answers what Ducter watches with (else every calendar and Slack row reads 读不了).
const reads = [
  { id: "gmail.search_threads", operationType: "read", run: () => ({ threads: [] }) },
  { id: "googlecalendar.list_events", operationType: "read", run: () => ({ items: [] }) },
  { id: "slack.list_direct_messages", operationType: "read", run: () => ({ messages: [] }) },
];
const oomol = fakeOpenConnector(reads, KEY, {
  path: "/v1/mcp",
  plain401: true,
  apps: [
    app("a1", "gmail", "nowledge-labs-mail", "w@nowledge-labs.ai"),
    app("a2", "gmail", "personal-gmail", "weyl.gu@gmail.com"),
    app("a3", "googlecalendar", "nowledge-labs-calendar", "w@nowledge-labs.ai"),
    app("a4", "googlecalendar", "personal-calendar", "weyl.gu@gmail.com"),
    app("a5", "slack", "nowledge-labs-inc", "Nowledge Labs, Inc"),
    app("a6", "slackbot", "nowledge-labs-bot", "Nowledge Labs, Inc"),
    app("a7", "discordbot", "nowledge-community-bot", "Nowledge Community"),
  ],
});
const needs = process.env.DEMO_NEEDS === "1";
let oomolDown = false; // DEMO_NEEDS: OOMOL stops answering once its accounts are listed
const to = (u: string) => u.replace("https://connector.oomol.com", oomolDown ? "http://127.0.0.1:9" : oomol.url);
const tuwa = fakeTuwa();

// GitHub with the author's load; an Obsidian vault with a long name.
const gh = fakeGh(pileIssues(), { login: "wey-gu" });
const home = join(scratch, "home");
const vault = join(scratch, zh ? "个人知识库（工作、生活和读书笔记）" : "Second Brain — work, life and reading notes");
mkdirSync(join(vault, "Inbox"), { recursive: true });
writeFileSync(join(vault, "Inbox", zh ? "这周.md" : "This week.md"), (zh ? ["- [ ] 给房东回邮件，问暖气什么时候修", "- [ ] 整理 11 月的报销单", "- [ ] 订下周去上海的高铁票"] : ["- [ ] Reply to the landlord about the heating", "- [ ] Sort November's expense receipts", "- [ ] Book the train to Shanghai next week"]).join("\n") + "\n");
const cfg = join(home, ".config", "obsidian");
mkdirSync(cfg, { recursive: true });
writeFileSync(join(cfg, "obsidian.json"), JSON.stringify({ vaults: { a: { path: vault, ts: 2 } } }));

// Chat apps: WeChat and Telegram already linked; adapters that never leave the machine.
const stamp = new Date(Date.now() - 6 * 86400_000).toISOString();
writeFileSync(
  join(dataDir, "channels.json"),
  JSON.stringify({
    telegram: { token: "demo-telegram-not-a-token", bot: { id: "8000000001", name: "Wey's Ducter", handle: "weys_ducter_bot" }, linked: { id: "1001", chat: "1001", name: "Wey Gu", at: stamp } },
    wechat: { token: "demo-wechat-not-a-token", base: "https://wechat.invalid", bot: { id: "wx-demo-bot", name: "Ducter" }, linked: { id: "wx-demo-person", chat: "wx-demo-person", name: "", at: stamp } },
    lastRoute: "app",
  }),
  { mode: 0o600 },
);
// The stubs' readers, so the demo's Telegram can answer its own link code (below).
const heard = new Map<string, ChannelEvents>();
const stubChannel = (kind: "telegram" | "slack" | "wechat", bot: { id: string; name: string; handle?: string }): Channel => ({
  kind,
  caps: { buttons: true, edit: true, typing: true, files: true, maxText: 4000 } as Channel["caps"],
  start: async (on) => (heard.set(kind, on), bot),
  stop() {},
  send: async () => "m1",
  edit: async () => {},
  typing: async () => {},
  answerTap: async () => {},
  sendFile: async () => "m2",
});

const harnessesHome = [
  { harness: "codex", installed: true, loggedIn: true, version: "0.169.1", how: "npm", canBePartner: true, billing: "plan", allowance: { left: 0.64, resetsAt: new Date(Date.now() + 3 * 86400_000).toISOString() } },
  { harness: "claude-code", installed: true, loggedIn: true, version: "2.1.400", how: "installer", canBePartner: true, billing: "plan", allowance: { left: 0.31, resetsAt: new Date(Date.now() + 9 * 3600_000).toISOString() } },
];
const none = async () => new Response("", { status: 404 });
// DEMO_NEEDS: a scripted nmem (never the real one): connected, healthy, and Mem's own asks.
const ok = (j: unknown) => ({ code: 0, out: JSON.stringify(j), err: "" });
const memConn = { connection_id: "00000000-0000-4000-8000-000000000001", agent_id: "ducter", identity_birth: "00000000-0000-4000-8000-000000000900", client_label: "ducter", state: "active" };
const SPACE = "6f1c0d2e-8b4a-4d1e-9c3f-2a7b5e0d9c11";
const contra = {
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
const memRules = [
  zh
    ? { id: "release-ci", title: "发版前先等 CI 全绿", body: "发新版本前，等主干的 CI 全部通过、读过失败数再推送；不要在测试后直接接着推送。", status: "draft", scope: "global", priority: 50, tags: ["release"] }
    : { id: "release-ci", title: "Release only after CI is green", body: "Before a new version goes out, wait for main's CI to pass and read the fail count before pushing; never chain a push after the tests.", status: "draft", scope: "global", priority: 50, tags: ["release"] },
];
const nmemRun = async (args: string[]) => {
  const a = args.join(" ");
  if (args[0] === "--version") return ok("nmem 0.10.122");
  if (a.includes("bridge connections --help")) return { code: 0, out: "", err: "" };
  if (a === "status") return ok({ status: "healthy", backend: "cloud", update: { current: "0.10.122", latest: "0.10.122", update_available: false } });
  if (a === "bridge setup") return ok({ state: "selection_needed", candidates: [{ id: SPACE, label: "Only me", kind: "personal", readers: 1, write_default: true }] });
  if (a.includes("connections connect")) return ok({ state: "connected", agent_context: "ducter", connection: memConn, selection: { scope: { space_id: SPACE }, address: { agent_id: "ducter" } } });
  if (a.includes("--agent-context ducter bridge setup")) return ok({ state: "enable_needed", endpoint: { address: { agent_id: "ducter" } } });
  if (a.includes("connections list")) return ok({ schema_version: 1, connections: [memConn], next_connection_id: null });
  if (a.startsWith("feed --type flag_contradiction")) return ok({ events: [contra] });
  if (a.startsWith("feed reviews")) return ok({ events: [], total: 40 });
  if (a === "rules list") return ok({ rules: memRules });
  if (args[0] === "feed" && args[1] === "resolve") return ok(args.includes("--plan-id") ? { applied: true } : { preview: true, plan_id: "plan_demo" });
  if (args[0] === "rules" && args[1] === "upsert") return ok({});
  return { code: 2, out: "", err: "demo: not scripted" };
};
const NMEM = "/home/wey/.local/pipx/venvs/nmem-cli/bin/nmem";
const memTools: Record<string, string> = { nmem: NMEM, pipx: "/usr/bin/pipx" };
const memSys = { which: (c: string) => memTools[c], exists: (p: string) => p === NMEM, read: () => undefined, list: () => [], real: (p: string) => p, home: "/home/wey", platform: "linux" as const, uid: 1000 };
const needsOpts = needs
  ? {
      bridgeLink: { run: nmemRun, env: {}, sys: memSys, exec: async () => new Promise<never>(() => {}) },
      memPlugins: {
        inspectLocal: async () => ({ "claude-code": { state: "installed", version: "0.7.34" }, codex: { state: "installed", version: "0.1.53" } }),
        checkUpdates: async () => ({ "claude-code": "0.7.37" }),
        everyMs: 0,
        connected: () => true,
      },
    }
  : {};
const core = startCore({
  ...(needsOpts as object),
  dataDir,
  ooSource: noOo,
  persona: { id: "default", name: "Ducter", identity: "" },
  hostname: process.env.DUCTER_HOST || "127.0.0.1",
  platform: "linux",
  models: createModelCatalog({ read: async (_device, harness) => (harness === "codex" ? codex : undefined) }),
  deviceProbes: { cua: async () => ({ missing: "no" }), native: async () => undefined, harnesses: async () => harnessesHome as never, kind: async () => "server" },
  connectionLinker: (u, k) => httpLinker(to(u), k),
  work: { connectionFetch: (u, i) => fetch(to(u), i) },
  taskSources: { ghRun: gh.run, ghEnv: {}, home, quietMs: 0, pollMs: 3_600_000, ask: demoAsk(zh, 50) },
  channels: { gapMs: 0, sleep: async () => {}, make: (kind, rec) => stubChannel(kind, rec.bot ?? { id: "b", name: "Ducter" }) },
  // D568: DEMO_VERSION=0.1.67 is the author's home as he reported it.
  update: { fetch: async () => new Response(JSON.stringify({ tag_name: needs ? "v0.0.94" : `v${process.env.DEMO_VERSION ?? "0.0.93"}`, body: "" })), how: "self", version: process.env.DEMO_VERSION ?? "0.0.93", homeName: "Hetzner Server", autoEveryMs: 0, run: () => new Promise(() => {}) },
  agents: { fetch: none as never, sys: { fetch: none as never, run: () => new Promise(() => {}), freeBytes: () => undefined, sleep: (ms: number) => Bun.sleep(ms), now: () => Date.now() }, autoEveryMs: 0 },
} as never);
core.setRunner(stubRunner(core));
// D408: a chat app set up again links, as the person sending the code to the bot would: the demo's
// Telegram sends /start with each new code 2.5 s after it is shown, so 连上了 / Linked can be reached.
const codeFor = core.channels.code.bind(core.channels);
core.channels.code = (kind) => {
  const r = codeFor(kind);
  if (r.ok && kind === "telegram") {
    setTimeout(() => void heard.get(kind)?.message({ id: `link-${Date.now()}`, chat: "1001", from: { id: "1001", name: "Wey Gu" }, direct: true, text: `/start ${r.code}` }), 2500);
  }
  return r;
};
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en", quiet: { start: "23:00", end: "08:00", tz: "Asia/Shanghai" }, proactive: "three", proactiveBy: "user", autoUpdate: true, brain: { harness: "codex" } } as never);

// The computers that do tasks, and the handhelds.
async function worker(name: string, os: string, kind: string, abilities: unknown[], harnesses: unknown[]) {
  const w = core.devices.redeem(core.devices.createCode({ kind: "worker" }).code, { name, platform: `${os}-arm64`, computer: name } as never) as { token: string };
  const ws = new WebSocket(`ws://127.0.0.1:${core.port}/worker`, { headers: { authorization: `Bearer ${w.token}` } } as never);
  await new Promise<void>((r) => (ws.onopen = () => r()));
  ws.send(JSON.stringify({ t: "hello", os, arch: "arm64", kind, version: "0.0.93", how: "app", abilities, harnesses }));
}
await worker("Macbook Pro M3", "darwin", "laptop", [{ id: "web", state: "on", where: "chrome" }, { id: "computer", state: "on" }, { id: "phone", state: "off" }], [
  { id: "claude-code", installed: true, loggedIn: true, version: "2.1.400", how: "installer" },
  { id: "codex", installed: true, loggedIn: true, version: "0.169.1", how: "brew" },
  { id: "pi", installed: true, loggedIn: true, version: "1.4.0", how: "installer" },
  { id: "deepseek-harness", installed: true, loggedIn: true, version: "0.3.0", how: "npm" },
]);
await worker("haswell", "linux", "server", [{ id: "web", state: "on", where: "ducter" }], [
  { id: "claude-code", installed: true, loggedIn: true, version: "2.1.400", how: "installer" },
  { id: "codex", installed: true, loggedIn: true, version: "0.169.1", how: "npm" },
]);
core.devices.redeem(core.devices.createCode().code, { name: "Siweis-MacBook-Pro", platform: "darwin" } as never);
core.devices.redeem(core.devices.createCode().code, { name: "iPhone", platform: "ios-app" } as never);
const pad = core.devices.redeem(core.devices.createCode().code, { name: "iPad", platform: "ios-app" } as never) as { device: { id: string } };
core.devices.setShape?.(pad.device.id, "tablet");
const fold = core.devices.redeem(core.devices.createCode().code, { name: "Pixel Fold", platform: "android-app" } as never) as { token: string; device: { id: string } };
const phone = new WebSocket(`ws://127.0.0.1:${core.port}/ws`, { headers: { authorization: `Bearer ${fold.token}` } } as never);
await new Promise<void>((r) => (phone.onopen = () => r()));
phone.send(JSON.stringify({ t: "hello", client: "handset" }));
await Bun.sleep(100);
phone.send(JSON.stringify({ t: "handset_hello", state: { bridge: 1, sdk: 34, model: "Pixel Fold", foldable: true, service: true, pictures: true } }));
await Bun.sleep(200);
core.handsets.set(fold.device.id, true);

// Accounts: OOMOL (the Discord bot watched by itself, one left out), then Tuwa.
if (!core.connections.view().length) {
  const r = await core.connections.add({ url: "https://connector.oomol.com", token: KEY });
  if (!r.ok) console.warn("[demo-settings-real] OOMOL:", JSON.stringify(r));
  const id = core.connections.view()[0]?.id;
  if (id) core.connections.setApp(id, "discordbot", "Nowledge Community", { excluded: true });
  const t = await core.connections.add({ url: tuwa.url, token: JSON.stringify({ accessToken: tuwa.access(), refreshToken: tuwa.refresh(), expires_in: 3600 }) });
  if (!t.ok) console.warn("[demo-settings-real] Tuwa:", JSON.stringify(t));
}

if (needs) {
  core.persona.mem = { agentId: "ducter", owned: true };
  core.settings.setMemState("connected");
  void core.bridgeLink.connect();
  oomolDown = true;
  await core.connections.recheck();
}

// To-do sources: GitHub's 557, then the vault.
const ts = core.taskSources;
await ts.add("github");
await ts.add("obsidian", vault);
await ts.look();

// Passwords & cards at a traveller's count.
const S = core.autofill.store;
S.put({ kind: "signin", site: "united.com", username: "weyl.gu@gmail.com", password: "demo-pass-one", label: "United MileagePlus" });
S.put({ kind: "signin", site: "booking.com", username: "weyl.gu@gmail.com", password: "demo-pass-two" });
S.put({ kind: "signin", site: "12306.cn", username: "weyl-gu-2024", password: "demo-pass-three", label: zh ? "铁路 12306" : "China Railway 12306" });
S.put({ kind: "card", name: "Wey Gu", label: zh ? "招商银行信用卡" : "Chase Sapphire Reserve", number: "4000000000000002", expMonth: 8, expYear: 2029 });
S.put({ kind: "card", name: "Wey Gu", label: zh ? "公司差旅卡" : "Company travel card", number: "5500000000000004", expMonth: 3, expYear: 2028 });
S.put({ kind: "detail", values: { name: "Wey Gu", email: "weyl.gu@gmail.com", phone: "+86 138 0000 0000", address: zh ? "上海市徐汇区漕溪北路 88 号 1203 室" : "88 Caoxi North Road, Room 1203, Xuhui, Shanghai" } as never });
S.put({ kind: "key", name: zh ? "DigitalOcean 部署用的令牌" : "DigitalOcean deploy token", env: "DO_TOKEN", value: "demo-do-not-a-token" });
S.put({ kind: "key", name: zh ? "Cloudflare 的 API 令牌（ducter.ai）" : "Cloudflare API token (ducter.ai)", env: "CLOUDFLARE_API_TOKEN", value: "demo-cf-not-a-token" });

// D413: one standing permission, in the author's own words (hel, 2026-11-19), so 不用问我的 shows.
if (!core.standing.list().length) core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: zh ? "review 做好了直接发别和我确认" : "Just post the reviews when they're done, don't ask me." } });
core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: zh ? "把设置里的东西都过一遍" : "Let's go through Settings" } });
// D547, DEMO_TASK=1: a Codex task at work on the home, so the task's composer shows what it carries
// while it works: the model chip (GPT-6.2-Sol, its effort), the context ring at 22% and Stop.
if (process.env.DEMO_TASK) {
  const id = "t_codex";
  const ev = (b: Record<string, unknown>) => core.log.append({ stream: `task:${id}`, origin: "task", kind: "task_event", body: { taskId: id, ...b } as never });
  const place = { kind: "repo", device: "local", repoPath: "/root/ducter/repos/mem", worktree: "/root/ducter/worktrees/mem/ci-flaky", branch: "ducter/ci-flaky-compaction", baseBranch: "main" };
  core.log.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", body: { taskId: id, title: zh ? "查 mem 这周 main 上红的 CI" : "Find why mem's CI went red on main this week", project: "Mem", place, harness: "codex", model: "gpt-6.2-sol", effort: "medium", brief: zh ? "看 nowledge-co/mem 这周 main 上红了的 job，是不是同一个 flaky 测试；是的话修掉，跑 20 遍确认。" : "Look at the jobs that went red on nowledge-co/mem's main this week; if it is one flaky test, fix it and run it 20 times to confirm." } as never });
  core.tasks.setState(id, "working", "hot");
  ev({ role: "tool", tool: { name: "shell", input: { command: ["bash", "-lc", "gh run list --branch main --status failure --limit 20"] }, ok: true, output: "12 runs" } });
  ev({ role: "assistant", text: zh ? "这周 main 上红了 12 次，9 次是同一个测试：compaction_resumes_after_restart。" : "Main went red 12 times this week; 9 of them are one test: compaction_resumes_after_restart." });
  ev({ role: "system", text: "", raw: { kind: "context", contextTokens: 60000, contextWindow: 272000 } });
  ev({ role: "tool", tool: { name: "shell", input: { command: ["bash", "-lc", "cargo test compaction_resumes_after_restart -- --nocapture"] }, ok: true, output: "" } });
}
// D591: DEMO_USAGE=1 adds a week of counted work (Overview's 这周的额度用在了哪儿).
if (process.env.DEMO_USAGE === "1") (await import("./demo-usage.ts")).seedUsage(core as never, zh);
await Bun.sleep(300);
console.log(`[demo-settings-real] http://127.0.0.1:${core.port}/app · ${zh ? "zh" : "en"} · data ${dataDir}`);
