// D666 (research/247 Brief D): a demo core for Settings' screenshots of a connection that says
// what is true. It lays over a scratch home:
// - Tuwa added, then its fake provider stopped, so the calling connection is unreachable while the
//   phone card (its cap, voice and rails) is still known;
// - Telegram and Feishu / Lark linked, so Overview's 也能找我 and the Chat apps head have to name
//   the fourth app (the web already does; the Mac's shared table is the change);
// - Lody present and signed out, so Settings › 导入 has a source that needs Try again, and its
//   removal can be walked to the line that says what was hidden.
//   DUCTER_PORT=7961 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-conntrue.ts
// Never the network, never a real account, phone, bot or Lody.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import { httpLinker } from "../../packages/core/src/connections.ts";
import type { Channel, ChannelEvents } from "../../packages/core/src/channels/port.ts";
import { fakeTuwa } from "../../packages/core/test/fake-tuwa.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const w = (z: string, e: string) => (zh ? z : e);
const dataDir = process.env.DUCTER_DATA_DIR;
if (!dataDir) throw new Error("set DUCTER_DATA_DIR to a scratch folder");
mkdirSync(dataDir, { recursive: true });
const scratch = mkdtempSync(join(tmpdir(), "ducter-demo-conntrue-"));

const tuwa = fakeTuwa();
// The health recheck ignores a record younger than five minutes. A demo cannot wait that long, so
// the clock moves forward for the one probe and back before the page is read: the connection is
// unreachable while the phone card (its tools already known) is still on screen, exactly the state
// the brief is about.
// The recheck asks the clock twice before it probes (is the record stale, are its tools cached);
// those two reads see a six-minute-future, the probe and everything after it see the real clock.
let bump = 0;
const realNow = Date.now;
Date.now = () => realNow() + (bump > 0 && bump-- > 0 ? 6 * 60_000 : 0);

// Two linked apps: Telegram and Feishu / Lark. The stubs never leave the machine.
const stamp = new Date(Date.now() - 6 * 86_400_000).toISOString();
writeFileSync(
  join(dataDir, "channels.json"),
  JSON.stringify({
    telegram: { token: "demo-telegram-not-a-token", bot: { id: "8000000001", name: "Wey's Ducter", handle: "weys_ducter_bot" }, linked: { id: "1001", chat: "1001", name: "Wey Gu", at: stamp } },
    feishu: { token: "demo-feishu-not-a-secret", appId: "cli_demo", domain: "feishu", bot: { id: "ou_demo_bot", name: "Ducter" }, linked: { id: "ou_demo_person", chat: "ou_demo_person", name: "", at: stamp } },
    lastRoute: "app",
  }),
  { mode: 0o600 },
);
const heard = new Map<string, ChannelEvents>();
const stubChannel = (kind: "telegram" | "slack" | "feishu" | "wechat", bot: { id: string; name: string; handle?: string }): Channel => ({
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

// Lody on this computer, not signed in: the row says so, and Try again is its one action.
const run = async (args: string[]) => {
  if (args[0] === "workspace" && args[1] === "list") return { code: 1, stdout: "", stderr: "not logged in: run lody login" };
  return { code: 1, stdout: "", stderr: "not logged in: run lody login" };
};

const core = startCore({
  dataDir,
  push: false,
  persona: { id: "default", name: "Ducter", identity: "" },
  hostname: process.env.DUCTER_HOST || "127.0.0.1",
  platform: "linux",
  ooSource: noOo,
  connectionLinker: (u, k) => httpLinker(u, k),
  work: { connectionFetch: (u, i) => fetch(u, i) },
  channels: { gapMs: 0, sleep: async () => {}, make: (kind, rec) => stubChannel(kind, rec.bot ?? { id: "b", name: "Ducter" }) },
  importsRun: run,
} as never);
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en" } as never);

// The calling connection, known and out of reach: add it while the fake answers, then stop it.
const t = await core.connections.add({ url: tuwa.url, token: JSON.stringify({ accessToken: tuwa.access(), refreshToken: tuwa.refresh(), expires_in: 3600 }) });
if (!t.ok) console.warn("[demo-conntrue] Tuwa:", JSON.stringify(t));
await Bun.sleep(600);
const id0 = core.connections.view().find((c) => /tuwa/i.test(c.url) || /tuwa/i.test(c.name))?.id ?? "";
console.log("[demo] before:", core.connections.view().find((c) => c.id === id0)?.state, "phone view:", !!core.phone.view(id0));
tuwa.stop();
bump = 2;
await core.connections.recheck();
await Bun.sleep(300);
const conn = core.connections.view().find((c) => c.id === id0);
console.log("[demo] state:", conn?.state, "phone view:", !!core.phone.view(id0));
console.log(`[demo] Ducter demo is up at http://127.0.0.1:${core.port}/app (data: ${core.dataDir})`);
console.log(`[demo] Tuwa: ${w("连不上", "unreachable")}, chat apps: Telegram + Feishu / Lark, Lody: signed out`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
