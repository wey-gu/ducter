// A demo core for D165/D166 on the phone and the Mac: the real core, broker and proactive engine,
// with a fake `oo` (two Gmail accounts, a calendar, Discord, GitHub) answering from the synthetic
// inbox in packages/core/test/fixtures/inbox.ts (no real mail), recorded triage (no model).
//   DUCTER_PORT=7966 DUCTER_DATA_DIR=$(mktemp -d) DEMO_ACCOUNTS=morning bun apps/web/demo-accounts.ts
// DEMO_ACCOUNTS: first (the offer after the one tap) | answered (the 3-day look and the question) |
// morning (the note, chips at 每天最多 3 件) | quiet (a quiet morning: only the header line).
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { startCore, stubRunner } from "@ducter/core";
import { ooSource } from "../../packages/core/src/connections.ts";
import { ooCli, ooEnv, ooExec } from "../../packages/core/src/oo-link.ts";
import { recordedTriage } from "../../packages/core/src/proactive/triage.ts";
import { fakeOo } from "../../packages/core/test/fake-oo.ts";
import { busyWeek, quietDay } from "../../packages/core/test/fixtures/inbox.ts";

const mode = process.env.DEMO_ACCOUNTS ?? "morning";
const dir = process.env.DUCTER_DATA_DIR!;
const fx = mode === "quiet" ? quietDay() : busyWeek();
const bin = join(dir, "fake-oo");
mkdirSync(bin, { recursive: true });
const withHeaders = fx.mail.map((m) => ({ ...m, ...(m.listUnsubscribe ? { headers: [{ name: "List-Unsubscribe", value: "<mailto:u@x>" }] } : {}) }));
const oo = fakeOo(bin, {
  signedIn: true,
  apps: [
    { service: "gmail", connectionName: "work", accountLabel: "wey@work.example.com", authType: "oauth2", isDefault: true },
    { service: "gmail", connectionName: "home", accountLabel: "wey@home.example.com", authType: "oauth2" },
    { service: "googlecalendar", connectionName: "cal", accountLabel: "wey@work.example.com", authType: "oauth2" },
    { service: "discord", connectionName: "wey", accountLabel: "wey", authType: "oauth2" },
    { service: "github", connectionName: "gh", accountLabel: "wey", authType: "oauth2" },
  ],
  actions: [
    { service: "gmail", name: "search_threads", description: "Search threads" },
    { service: "googlecalendar", name: "list_events", description: "List events" },
    { service: "github", name: "list_notifications", description: "List notifications" },
    { service: "discord", name: "list_mentions", description: "List mentions" },
  ],
  results: {
    "gmail.search_threads": { threads: withHeaders },
    "googlecalendar.list_events": { items: fx.events },
    "github.list_notifications": fx.github,
    "discord.list_mentions": { messages: fx.chat },
  },
});
const env = { ...process.env, ...oo.env, PATH: `${bin}:${process.env.PATH}` };
const cli = ooCli({ exec: ooExec(oo.bin, ooEnv(env, oo.bin)) });

const core = startCore({
  persona: { id: "default", name: "Ducter", identity: "" },
  hostname: "127.0.0.1",
  deviceProbes: { cua: async () => ({ missing: "demo" }), harnesses: async () => [], kind: async () => "laptop" },
  ooSource: ooSource({ env, dir: join(dir, "oo-config"), which: () => oo.bin, cli }),
  proactive: { triage: recordedTriage(fx.triage), zone: "Asia/Shanghai" },
});
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.settings.set({ language: "zh", quiet: { start: "23:00", end: "08:00", tz: "Asia/Shanghai" } });

const added = await core.connections.addFromOo();
if (!added.ok) throw new Error(`oo: ${added.reason}`);
const id = added.id;
await core.connections.recheck();
core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "帮我把周报草稿理一下" } });
core.log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: "理好了，放在「做好的」里。" } });

if (mode === "first" || mode === "answered") {
  core.proactive.added(id);
  if (mode === "answered") {
    const offer = core.log.read({ stream: "channel", kinds: ["finds"] }).at(-1)!.body as { noteId: string };
    await core.proactive.answer(offer.noteId, "first_look", true);
  }
} else {
  core.settings.set({ proactive: "three" });
  await core.proactive.lookNow(40);
  await core.proactive.morning();
}
console.log(`[demo-accounts] ${core.url.replace("ws://", "http://").replace("/ws", "/app")} · ${mode}`);
