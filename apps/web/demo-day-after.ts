// D623: the day after the first run, for the shots and a walk. A home first used yesterday
// (a task that finished, a Gmail account, an app made), opened today: the partner's recap and the
// one offer of a morning line. It seeds the same Log lines core lays down, so the real clients render
// it; the partner's turn is stood in for by one message, as the real partner's would come.
//   DUCTER_PORT=7901 DUCTER_DATA_DIR=$(mktemp -d) bun apps/web/demo-day-after.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import { FakeClock } from "../../packages/core/src/clock.ts";

const DAY = 86_400_000;
const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const w = (z: string, e: string) => (zh ? z : e);
const data = process.env.DUCTER_DATA_DIR!;
mkdirSync(data, { recursive: true });
const now = Date.now();
const clock = new FakeClock(now - DAY);
const yesterday = new Date(now - DAY).toISOString();
// A Gmail account the person connected yesterday (a manual connection; no oo, no real account).
writeFileSync(join(data, "connections.json"), JSON.stringify({ connections: [{ id: "conn_gmail", name: "Gmail", url: "https://connector.example.test/mcp", source: "mcp", via: "manual", addedAt: yesterday }] }));
// The app store's own clock is real time, so write the app it made yesterday as its files are.
const appId = "aexpenses";
mkdirSync(join(data, "apps", appId), { recursive: true });
const appHtml = `<h1>${w("这周的花销", "This week's spending")}</h1><p>¥1,698</p>`;
writeFileSync(join(data, "apps", appId, "index.html"), appHtml);
writeFileSync(join(data, "apps", appId, "meta.json"), JSON.stringify({ id: appId, name: w("这周的花销", "This week's spending"), persona: "default", made: yesterday, updated: yesterday, version: 1, size: appHtml.length, note: w("把三笔记在了一起。", "Three expenses in one place."), ask: w("帮我记一下这周的花销", "Keep this week's spending") }, null, 2));


const core = startCore({
  dataDir: data,
  port: Number(process.env.DUCTER_PORT ?? 7901),
  hostname: "127.0.0.1",
  push: false,
  clock,
  ooSource: noOo,
  persona: { id: "default", name: w("小鸭", "Duckie"), identity: "" },
  deviceProbes: { cua: async () => null, kind: async () => "laptop", harnesses: async () => [{ harness: "codex", installed: true, loggedIn: true }] },
});
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en", brain: { harness: "codex" } });

// Yesterday: a task that finished, and an app the person made.
core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: w("帮我把登录页的跳转修好", "Fix the login redirect for me") } });
core.log.append({ stream: "task:t_login", origin: "partner", kind: "task_open", body: { taskId: "t_login", title: w("修好登录页的跳转", "Fix the login redirect"), project: "website", place: { kind: "none" }, harness: "codex", brief: w("修好登录页的跳转。", "Fix the login redirect.") } });
core.tasks.setState("t_login", "working", "hot");
core.tasks.setState("t_login", "done", "warm");
// Today: the person opens Ducter. Code finds what was set up; the partner says it in its words.
clock.advance(DAY);
await core.proactive.hello("Asia/Shanghai", true);
for (let i = 0; i < 50 && !core.log.read({ stream: "channel", kinds: ["day_after"], limit: 1 }).length; i++) await Bun.sleep(10);
const facts = core.log.read({ stream: "channel", kinds: ["day_after"], limit: 1 })[0]?.body as { items: { kind: string; title: string }[] } | undefined;
if (!facts) throw new Error("the day after found nothing; the demo's yesterday was empty");
console.log("[demo-day-after] facts:", JSON.stringify(facts.items), "apps:", JSON.stringify(core.apps.list("default").map((a) => [a.id, a.made])));
const text = zh ? "昨天我们弄好的这几件，都在这儿了。" : "Here's what we set up together yesterday.";
core.log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text, dayAfter: { items: facts.items } } });
console.log(`[demo-day-after] on ${core.url}`);
