// A demo core for D531: Slack's setup as Slack is today, walked in Settings › 聊天软件 / Chat apps.
// Real core and real web client; Slack is a stub adapter (nothing leaves the machine, no workspace).
//   DUCTER_PORT=7981 DUCTER_DATA_DIR=$(mktemp -d) DEMO_SLACK=off bun apps/web/demo-slack-setup.ts
// then open http://127.0.0.1:7981/app#settings=chats.
// DEMO_SLACK: off (the steps, after 设置 / Set up), unlinked (获得口令 / Get a code, then the code with
// 在 Slack 里打开 / Open in Slack), linked, reinstall (an app made before the current manifest).
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Channel } from "../../packages/core/src/channels/port.ts";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const dataDir = process.env.DUCTER_DATA_DIR;
if (!dataDir) throw new Error("set DUCTER_DATA_DIR to a scratch folder");
const state = process.env.DEMO_SLACK ?? "off";
const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const bot = { id: "UBOT", name: "Ducter", team: "Nowledge Labs", teamId: "T0NOWLEDGE", appId: "A0DUCTER" };
if (state !== "off") {
  const linked = state === "unlinked" ? {} : { linked: { id: "UWEY", chat: "DUWEY", name: "Wey Gu", at: new Date(Date.now() - 3600_000).toISOString() } };
  writeFileSync(join(dataDir, "channels.json"), JSON.stringify({ slack: { token: "demo-slack-not-a-token", appToken: "demo-slack-app-not-a-token", bot, ...linked }, lastRoute: "app" }), { mode: 0o600 });
}
const stub = (kind: "telegram" | "slack" | "wechat"): Channel => ({
  kind,
  caps: { buttons: true, edit: true, typing: false, files: true, maxText: 4000, as: kind === "slack" } as Channel["caps"],
  start: async () => ({ ...bot, ...(state === "reinstall" ? { customize: false, reinstall: true } : {}) }),
  stop() {},
  send: async () => "m1",
  edit: async () => {},
  typing: async () => {},
  answerTap: async () => {},
  sendFile: async () => "m2",
});
const core = startCore({
  ooSource: noOo,
  persona: { id: "default", name: "Ducter", identity: "" },
  hostname: "127.0.0.1",
  channels: { gapMs: 0, sleep: async () => {}, make: (kind) => stub(kind) },
} as never);
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en" } as never);
console.log(`[demo] http://127.0.0.1:${core.port}/app#settings=chats (${state})`);
