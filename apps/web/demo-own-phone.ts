// A demo core for D218, calls from your own number: the real core against a fake Android phone
// (adb's answers), a loopback cable and a fake real-time voice engine (packages/core/test/
// fake-own-phone.ts). No phone, call, sound card or key.
//   DUCTER_PORT=7972 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh DEMO_OWN=voice bun apps/web/demo-own-phone.ts
// DEMO_OWN: none (nothing plugged in) | allow (tap Allow on the phone) | voice (the key is the next
// step) | asking (the test call asks if they heard it) | ready | call (a Go card from your number).
import { startCore, stubRunner } from "@ducter/core";
import type { Bodies } from "@ducter/protocol";
import { loopbackBridge } from "../../packages/core/src/phone-own/audio.ts";
import { fakePhone, fakeVoice } from "../../packages/core/test/fake-own-phone.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const mode = process.env.DEMO_OWN ?? "voice";
const dataDir = process.env.DUCTER_DATA_DIR!;
const persona = { id: "default", name: "Ducter", identity: "" };
const ooSource = { detect: () => ({ installed: false, account: false }), read: () => undefined };
const phone = fakePhone({ carrier: zh ? "中国移动" : "T-Mobile" });
phone.authorized = mode !== "allow";
phone.autoAnswerAfterReads = 2;
const voice = fakeVoice();
const KEY = "sk-test-0123456789abcdefghij";
const core = startCore({
  dataDir,
  hostname: process.env.DUCTER_HOST || "127.0.0.1",
  push: false,
  persona,
  ooSource,
  update: { homeName: "Studio" },
  ownNumber: {
    exec: mode === "none" ? async () => ({ code: 0, out: "List of devices attached\n\n", err: "" }) : phone.exec,
    bridge: (e) => loopbackBridge({ inRate: e.inRate, outRate: e.outRate }),
    engineUrl: voice.url,
    listAudio: async () => ({ inputs: ["MacBook Pro Microphone", "USB Audio Device"], outputs: ["MacBook Pro Speakers", "USB Audio Device"], tool: true }),
    speak: async () => undefined,
    stepMs: 60,
    savedNumber: () => (zh ? "+8613912345678" : "+14155550123"),
  },
});
core.setPartner({ onTrigger() {} });
core.setRunner(stubRunner(core));
core.settings.set({ language: zh ? "zh" : "en" });
// The steps, the way the card's taps make them.
const act = (a: Parameters<typeof core.ownNumber.act>[0]) => core.ownNumber.act(a);
await act({ action: "scan" });
if (["asking", "ready", "call"].includes(mode)) {
  await act({ action: "key", engine: "openai", key: KEY });
  await act({ action: "test", to: zh ? "+8613800001111" : "+14155550999" });
  while (core.ownNumber.view().test.state !== "asking") await Bun.sleep(100);
}
if (["ready", "call"].includes(mode)) await act({ action: "heard", heard: true });
if (mode === "call") {
  await Bun.sleep(300);
  const d = await core.phone.draft({ to: zh ? "+862161234567" : "+862161234567", name: zh ? "鼎泰丰" : "Din Tai Fung", goal: zh ? "问周六晚上 7 点还有没有 4 位的位子" : "Ask whether they have a table for 4 at 7 pm on Saturday", say: [zh ? "姓顾" : "Gu"], present: true, forName: "Weyl" }, { lang: zh ? "zh" : "en" });
  if (d.ok && !d.needsInput) core.log.append({ stream: "channel", origin: "partner", kind: "decision", body: d.card as Bodies["decision"] });
  else console.log("[demo] draft:", JSON.stringify(d));
}
const pair = await core.devicesView.pairCode();
console.log(`[demo-own-phone] ${mode} on http://127.0.0.1:${core.port}/pair#c=${pair.code}`);
