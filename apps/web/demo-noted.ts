// A demo core for D329's 记下了 / Noted lines in the conversation: one that took the place of an
// earlier memory (said before the person's last message, so Forget), one fresh (Undo), one waiting
// for Nowledge Mem to come back, and one taken back (Not kept). No nmem runs (the home's nmem calls
// answer nothing), so nothing here reads the machine's real Mem; the Mem steps are stubs.
//   DUCTER_PORT=7980 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-noted.ts
// then open http://127.0.0.1:7980/app (Details shown: localStorage ducter.details = "shown").
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const core = startCore({ ooSource: noOo, persona: { id: "default", name: zh ? "小鸭" : "Duckie", identity: "" }, hostname: process.env.DUCTER_HOST || "127.0.0.1", update: { homeName: "home-server" }, bridgeLink: { run: async () => undefined, env: {} } });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.persona.mem = { agentId: "ducter", owned: true };
core.settings.setMemState("connected");
core.settings.set({ language: zh ? "zh" : "en" });
core.settings.setMemHooks({ undo: async () => true, waiting: () => new Set(["k-wait"]) });

const say = (origin: "user" | "partner", text: string, replyTo?: number) =>
  core.log.append({ stream: "channel", origin, kind: origin === "user" ? "user_msg" : "ai_msg", body: origin === "user" ? { text } : { text, ...(replyTo !== undefined ? { replyTo } : {}) } } as never);
const noted = (title: string, replyTo: number, o: { replaced?: string; waiting?: string } = {}) =>
  core.log.append({ stream: "channel", origin: "partner", kind: "memory_noted", body: { title, memoryId: `m-${title.length}`, replyTo, ...(o.replaced ? { replaced: { id: "m-old", title: o.replaced } } : {}), ...(o.waiting ? { waiting: o.waiting } : {}) } });

const u1 = say("user", zh ? "周报以后改成发给产品组和设计组" : "From now on the weekly report goes to product and design");
say("partner", zh ? "好，以后周报发给产品组和设计组。" : "Got it: the weekly report goes to product and design from now on.", u1.seq);
noted(zh ? "周报发给产品组和设计组" : "Weekly report goes to product and design", u1.seq, { replaced: zh ? "周报发给产品组" : "Weekly report goes to product" });
const u2 = say("user", zh ? "记一下：开会别排在中午 12 点到 1 点，还有我不喝咖啡" : "Note: no meetings between 12 and 1, and I don't drink coffee");
say("partner", zh ? "记住了。订会议室和点东西时都按这个来。" : "Noted. I'll book rooms and order with that in mind.", u2.seq);
noted(zh ? "开会别排在中午 12 点到 1 点" : "No meetings between 12 and 1", u2.seq);
noted(zh ? "不喝咖啡" : "Doesn't drink coffee", u2.seq, { waiting: "k-wait" });
const gone = noted(zh ? "喜欢靠窗的位子" : "Likes a window seat", u2.seq);
await core.settings.undo(gone.seq);
console.log(`[demo] up at http://127.0.0.1:${core.port}/app (data: ${core.dataDir})`);
