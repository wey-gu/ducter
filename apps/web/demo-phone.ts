// A demo core for phone calls (D193) on the phone and the Mac: the real core and broker against the
// fake Tuwa (packages/core/test/fake-tuwa.ts, never the real one), with a silent partner.
//   DUCTER_PORT=7971 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh DEMO_PHONE=calls bun apps/web/demo-phone.ts
// DEMO_PHONE: offer (no calling connection yet) | signin (the device sign-in, waiting) |
// calls (connected: a Go card, a live call with a question, a call waiting for the morning, two ended) |
// sheet (D215: a call sheet for a number no line calls, and one the owner already called).
import { startCore, stubRunner } from "@ducter/core";
import type { Bodies, CallBody } from "@ducter/protocol";
import { fakeTuwa } from "../../packages/core/test/fake-tuwa.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const mode = process.env.DEMO_PHONE ?? "calls";
const dataDir = process.env.DUCTER_DATA_DIR!;
const tuwa = fakeTuwa();
const persona = { id: "default", name: "Ducter", identity: "" };
// Never this machine's own oo (its accounts are the user's): no oo at all in the demo.
const ooSource = { detect: () => ({ installed: false, account: false }), read: () => undefined };

if (mode === "calls") {
  // Seed with a first core, then serve with a second (the phone module rebuilds its calls from the Log).
  const seed = startCore({ dataDir, port: 0, push: false, persona, ooSource });
  seed.setPartner({ onTrigger() {} });
  const r = await seed.connections.add({ url: tuwa.url, token: JSON.stringify({ accessToken: tuwa.access(), refreshToken: tuwa.refresh(), expires_in: 3600 }) });
  if (!r.ok) throw new Error(`connect: ${JSON.stringify(r)}`);
  await Bun.sleep(300);
  const log = seed.log;
  const ask = zh ? "帮我打给 Sushi Saito，订明晚 7 点两位，吧台最好" : "Call Sushi Saito and book two for tomorrow at 7, counter seats if they can";
  log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: ask } });
  const d = await seed.phone.draft(
    { to: "+81 3-1234-5678", name: "Sushi Saito", goal: zh ? "订明晚 7 点两位，吧台最好" : "Book two for tomorrow at 7, counter seats if possible", say: ["Weyl", "+81 90-1234-5678"], keep: zh ? "每人不超过 3 万日元" : "No more than ¥30,000 a person", forName: "Weyl", calleeZone: "Asia/Tokyo" },
    { lang: zh ? "zh" : "en" },
  );
  if (!d.ok || d.needsInput) throw new Error(`draft: ${JSON.stringify(d)}`);
  log.append({ stream: "channel", origin: "partner", kind: "decision", body: d.card as Bodies["decision"] });

  const conn = seed.connections.view()[0]!.id;
  const now = Date.now();
  const iso = (ms: number) => new Date(now + ms).toISOString();
  const plan = (name: string, to: string, goal: string, extra: Partial<CallBody["plan"]> = {}): CallBody["plan"] => ({ to, name, goal, say: ["Weyl"], mustNot: [], voice: "ducter", from: "provider", provider: "Tuwa", minutes: 4, costUsd: 1.6, perMinUsd: 0.4, calleeZone: "Asia/Tokyo", ...extra });
  const call = (b: CallBody & { ref?: unknown }) => log.append({ stream: "channel", origin: "system", kind: "phone_call", body: b as CallBody });
  // On the line, and they ask something.
  tuwa.tasks.set("T90", { taskId: "T90", args: {}, status: "executing", questions: [], replies: [], durationSec: 74, pending: { question: zh ? "牙医问：周四下午 3 点可以吗？" : "The clinic asks: is Thursday at 3 pm all right?", token: "QABCDE", kind: "yes_no" } });
  const qd = "d_question01";
  call({ callId: "call_live", connectionId: conn, state: "question", plan: plan(zh ? "青山牙科" : "Aoyama Dental", "+81352345678", zh ? "把下周的洗牙改到周四以后" : "Move next week's cleaning to Thursday or later"), placedAt: iso(-90_000), talkingSince: iso(-74_000), question: { text: zh ? "牙医问：周四下午 3 点可以吗？" : "The clinic asks: is Thursday at 3 pm all right?", choices: [], yesNo: true, askedAt: iso(-8_000), decisionId: qd }, ref: { call: "T90", token: "QABCDE", yesNo: true } });
  log.append({ stream: "channel", origin: "system", kind: "decision", body: { decisionId: qd, question: zh ? "牙医问：周四下午 3 点可以吗？" : "The clinic asks: is Thursday at 3 pm all right?", goLabel: "yes", defaultOption: "hold", reversible: false, call: { callId: "call_live", kind: "question", choices: [], yesNo: true } } });
  // Waiting for the morning (asked at night: the callee's 9:00).
  tuwa.tasks.set("T91", { taskId: "T91", args: {}, status: "scheduled", questions: [], replies: [] });
  call({ callId: "call_wait", connectionId: conn, state: "waiting", plan: plan(zh ? "顺丰快递" : "SF Express", "+85223456789", zh ? "问那个箱子到哪了" : "Ask where the parcel is", { at: iso(9 * 3600_000), calleeZone: "Asia/Hong_Kong" }), ref: { call: "T91", scheduled: true } });
  // Ended: one done, as reported; one that didn't go through.
  call({
    callId: "call_done",
    connectionId: conn,
    state: "done",
    plan: plan("Le Petit Bistro", "+14155550123", zh ? "问周六能不能带狗坐外面" : "Ask if dogs are fine on the patio on Saturday", { calleeZone: "America/Los_Angeles", costUsd: 0.9, perMinUsd: 0.3, minutes: 3 }),
    placedAt: iso(-40 * 60_000),
    endedAt: iso(-40 * 60_000 + 200_000),
    outcome: zh ? "可以，周六外面的座位能带狗，不用预约。" : "Yes: dogs are welcome on the patio on Saturday, no booking needed.",
    summary: zh ? "接电话的是 Anna。外面有 6 张桌，先到先坐；会给狗准备水碗。" : "Anna answered. Six patio tables, first come first served; they put out water bowls.",
    transcript: [
      { who: "agent", text: zh ? "您好，我是 Ducter，替 Weyl 打电话的 AI 助手。" : "Hi, this is Ducter, an AI assistant calling for Weyl." },
      { who: "them", text: "Hi! How can I help?" },
    ],
    durationSec: 172,
    costUsd: 0.9,
  });
  call({ callId: "call_fail", connectionId: conn, state: "failed", plan: plan(zh ? "东京巴士" : "Tokyo Bus", "+81312340000", zh ? "问失物" : "Ask about a lost umbrella"), reason: "payment", error: "a card needs saving first", payUrl: "https://checkout.stripe.com/fake", endedAt: iso(-60 * 60_000) });
  await Bun.sleep(100);
  await seed.stop();
}

if (mode === "sheet") {
  // D215: a number no line calls: the call sheet (no calling connection needed), and one the owner already called.
  const seed = startCore({ dataDir, port: 0, push: false, persona, ooSource });
  seed.setPartner({ onTrigger() {} });
  const log = seed.log;
  log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: zh ? "帮我打给胡志明市的金玉楼订明晚 7 点两位，他们说中文，用王先生的名字" : "Can you call the Alila Seminyak in Bali and ask about an airport pickup Friday at 3 pm? Name's Alex." } });
  log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: zh ? "越南的号码我还打不过去，做了张通话单，你照着打就行。" : "I can't call numbers in Indonesia for you yet, so here's a call sheet to ring them yourself." } });
  const d = await seed.phone.draft(
    zh
      ? { to: "+84 28 3829 1234", name: "金玉楼", goal: "订明晚 7 点，两位，姓王", say: ["王先生", "+86 138 0013 8000"], mustNot: ["银行卡号"], open: "您好，我想订明天晚上 7 点的位子，两位，姓王。", ask: ["明晚 7 点两位还有位子吗？", "要不要付定金？"], note: ["订位的名字和时间", "要不要提前到"] }
      : { to: "+62 361 302 1888", name: "Alila Seminyak", goal: "An airport pickup on Friday at 3 pm, and what it costs", say: ["Alex", "Flight QZ 7510"], mustNot: ["Card details over the phone"], open: "Hi, this is Alex. I'm staying with you from Friday, and I'd like an airport pickup at 3 pm.", ask: ["Can you do 3 pm on Friday?", "How much is it, and do I pay at the hotel?"], note: ["The price", "Where the driver will wait"] },
    { lang: zh ? "zh" : "en" },
  );
  if (!d.ok || d.needsInput) throw new Error(`sheet: ${JSON.stringify(d)}`);
  log.append({ stream: "channel", origin: "partner", kind: "decision", body: d.card as Bodies["decision"] });
  const s2 = await seed.phone.draft({ to: "+7 495 123 4567", name: zh ? "普希金咖啡馆" : "Café Pushkin", goal: zh ? "问周六中午有没有位子" : "Ask about a table for Saturday lunch", open: zh ? "您好，请问周六中午还有位子吗？" : "Hello, do you have a table for Saturday lunch?" }, { lang: zh ? "zh" : "en" });
  if (s2.ok && !s2.needsInput) {
    seed.phone.result(s2.callId, zh ? "订上了：周六 12:30，两位，靠窗" : "Booked: Saturday 12:30, two, by the window");
  }
  await Bun.sleep(100);
  await seed.stop();
}

const core = startCore({ dataDir, persona, push: false, ooSource, hostname: process.env.DUCTER_HOST || "127.0.0.1" });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
if (mode === "signin") {
  const r = await core.connections.add({ url: tuwa.url });
  console.log("signin:", JSON.stringify(r));
}
console.log(`demo-phone (${mode}, ${zh ? "zh" : "en"}) on :${core.port}; fake Tuwa at ${tuwa.origin}`);
if (process.env.DEMO_PAIR) console.log(`pair: http://127.0.0.1:${core.port}/pair#c=${(await core.devicesView.pairCode()).code}`); // the iPhone Simulator: simctl launch booted co.nowledge.ducter.ios -pairLink <it>
