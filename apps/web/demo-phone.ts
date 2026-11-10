// A demo core for phone calls (D193) on the phone and the Mac: the real core and broker against the
// fake Tuwa (packages/core/test/fake-tuwa.ts, never the real one), with a silent partner.
//   DUCTER_PORT=7971 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh DEMO_PHONE=calls bun apps/web/demo-phone.ts
// DEMO_PHONE: offer (no calling connection yet) | signin (the device sign-in, waiting) |
// calls (connected: a Go card, a live call with a question, a call waiting for the morning, two ended).
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

const core = startCore({ dataDir, persona, push: false, ooSource, hostname: process.env.DUCTER_HOST || "127.0.0.1" });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
if (mode === "signin") {
  const r = await core.connections.add({ url: tuwa.url });
  console.log("signin:", JSON.stringify(r));
}
console.log(`demo-phone (${mode}, ${zh ? "zh" : "en"}) on :${core.port}; fake Tuwa at ${tuwa.origin}`);
