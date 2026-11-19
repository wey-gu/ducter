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
// - Chat apps: WeChat and Telegram linked (stub adapters: nothing is sent), Slack never set up;
// - Passwords & cards: three sign-ins, two cards, the details, two keys;
// - quiet hours 23:00 to 08:00, three a day, autoupdate on.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ListedModel } from "@ducter/protocol/src/internal.ts";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import { demoAsk, pileIssues } from "./demo-pile.ts";
import { createModelCatalog } from "../../packages/core/src/models.ts";
import { httpLinker } from "../../packages/core/src/connections.ts";
import type { Channel } from "../../packages/core/src/channels/port.ts";
import { fakeOpenConnector } from "../../packages/core/test/fake-mcp.ts";
import { fakeGh } from "../../packages/core/test/fake-gh-issues.ts";
import { fakeTuwa } from "../../packages/core/test/fake-tuwa.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const dataDir = process.env.DUCTER_DATA_DIR;
if (!dataDir) throw new Error("set DUCTER_DATA_DIR to a scratch folder");
mkdirSync(dataDir, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), "ducter-demo-settings-"));

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
const oomol = fakeOpenConnector([{ id: "gmail.search_threads", operationType: "read", run: () => ({ threads: [] }) }], KEY, {
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
const to = (u: string) => u.replace("https://connector.oomol.com", oomol.url);
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
const stubChannel = (kind: "telegram" | "slack" | "wechat", bot: { id: string; name: string; handle?: string }): Channel => ({
  kind,
  caps: { buttons: true, edit: true, typing: true, files: true, maxText: 4000 } as Channel["caps"],
  start: async () => bot,
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
const core = startCore({
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
  update: { fetch: async () => new Response(JSON.stringify({ tag_name: "v0.0.93", body: "" })), how: "self", version: "0.0.93", homeName: "Hetzner Server", autoEveryMs: 0, run: () => new Promise(() => {}) },
  agents: { fetch: none as never, sys: { fetch: none as never, run: () => new Promise(() => {}), freeBytes: () => undefined, sleep: (ms: number) => Bun.sleep(ms), now: () => Date.now() }, autoEveryMs: 0 },
} as never);
core.setRunner(stubRunner(core));
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

core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: zh ? "把设置里的东西都过一遍" : "Let's go through Settings" } });
await Bun.sleep(300);
console.log(`[demo-settings-real] http://127.0.0.1:${core.port}/app · ${zh ? "zh" : "en"} · data ${dataDir}`);
