// D189/D193: phone calls against a fake Tuwa over real HTTP (fake-tuwa.ts): the device sign-in,
// the token refresh and import, the rails set at connect, and one call end to end with its Go,
// a question from the line, the outcome; plus every rail that refuses or waits. Never the real Tuwa.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Bodies, LogEvent } from "@ducter/protocol";
import { e164 } from "@ducter/protocol";
import { FakeClock } from "../src/clock.ts";
import { startCore, triggersPartner, type Core } from "../src/core.ts";
import { renderCallEnded } from "@ducter/protocol";
import { calleeZones, neverCall, nextAllowed, surcharge, whyWaits, CALLBACK_REPLY } from "../src/phone.ts";
import { argsFor, tuwa as tuwaProvider } from "../src/phone-provider.ts";
import { fakeTuwa, type FakeTuwa } from "./fake-tuwa.ts";
import { tempDir } from "./helpers.ts";

const until = async (cond: () => boolean, ms = 15_000) => {
  // Real time, not the fake clock: polling slows under the full suite's load (a 4 s window failed there
  // once, 2026-11-11), and the preload gives each test 20 s.
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 10));
  }
};

// Tokyo 12:00 on a Wednesday; the owner's quiet hours 23:00–08:00 in Tokyo.
const NOON_TOKYO = Date.parse("2026-11-11T03:00:00Z");

describe("the rails, as pure functions", () => {
  test("numbers: E.164 only; emergency and short numbers are never called", () => {
    expect(e164("+81 3-1234-5678")).toBe("+81312345678");
    expect(e164("03-1234-5678")).toBeUndefined();
    expect(e164("+1 911")).toBeUndefined();
    expect(neverCall("+44999000")).toBe(false);
    expect(neverCall("+8611000")).toBe(true); // too short to be a real line
    expect(neverCall("+81312345678")).toBe(false);
  });
  test("price zones (research/53 §4)", () => {
    expect(surcharge("+14155550100")).toBe(0);
    expect(surcharge("+81312345678")).toBe(0.1);
    expect(surcharge("+819012345678")).toBe(0.3);
    expect(surcharge("+8613800000000")).toBeUndefined();
  });
  test("callee hours: 9:00–20:00 in every zone of the country, outside quiet hours", () => {
    const q = { start: "23:00", end: "08:00", tz: "Asia/Tokyo" };
    expect(nextAllowed(NOON_TOKYO, q, calleeZones("+81312345678")!)).toBe(NOON_TOKYO);
    // 2:00 in Tokyo: the owner's quiet hours, and before 9 in Tokyo: the next start is 9:00 Tokyo.
    const night = Date.parse("2026-11-11T17:00:00Z");
    expect(new Date(nextAllowed(night, q, calleeZones("+81312345678")!)!).toISOString()).toBe("2026-11-12T00:00:00.000Z");
    // The US: noon Eastern is 9:00 Pacific, the first moment every continental zone is in hours.
    expect(new Date(nextAllowed(Date.parse("2026-11-11T14:00:00Z"), null, calleeZones("+14155550100")!)!).toISOString()).toBe("2026-11-11T17:00:00.000Z");
    expect(calleeZones("+14155550100", "America/Los_Angeles")).toEqual(["America/Los_Angeles"]);
  });
  test("D208: a +1 number's area code is its zone (a DC number isn't held for California's morning)", () => {
    expect(calleeZones("+12025550147")).toEqual(["America/New_York"]);
    expect(calleeZones("+14155550100")).toEqual(["America/Los_Angeles"]);
    expect(calleeZones("+13125550100")).toEqual(["America/Chicago"]);
    expect(calleeZones("+16025550100")).toEqual(["America/Phoenix"]);
    expect(calleeZones("+14165550100")).toEqual(["America/Toronto"]);
    expect(calleeZones("+18505550100")).toEqual(["America/New_York", "America/Chicago"]); // the panhandle: both
    expect(calleeZones("+18005550100")).toHaveLength(4); // toll-free: every continental zone
    // Where they are now beats the number (the user's own US number, carried at an expo in Japan).
    expect(calleeZones("+12025550147", "Asia/Tokyo")).toEqual(["Asia/Tokyo"]);
  });
  test("D208: the owner's quiet hours don't hold a call they ask for now; a later time Ducter picks still respects them", () => {
    const q = { start: "23:00", end: "08:00", tz: "Asia/Tokyo" };
    const midnightTokyo = Date.parse("2026-11-11T15:00:00Z"); // 10:00 in Washington
    const dc = calleeZones("+12025550147")!;
    // The partner (or a task) starts it: it waits for the owner's 08:00 (18:00 in Washington).
    expect(new Date(nextAllowed(midnightTokyo, q, dc)!).toISOString()).toBe("2026-11-11T23:00:00.000Z");
    expect(whyWaits(midnightTokyo, Date.parse("2026-11-11T23:00:00Z"), q, dc)).toEqual({ why: "quiet", zone: "America/New_York", their: "10:00", then: "18:00" });
    // The owner asked just now: they're awake, it's 10:00 there: now.
    expect(nextAllowed(midnightTokyo, q, dc, { present: true })).toBe(midnightTokyo);
  });
  test("D208: the callee's 9:00–20:00 is a courtesy the owner's Call now may pass; 8:00–21:00 is not", () => {
    const tokyo = ["Asia/Tokyo"];
    const at2003 = Date.parse("2026-11-11T11:03:00Z"); // 20:03 in Tokyo
    expect(new Date(nextAllowed(at2003, null, tokyo, { present: true })!).toISOString()).toBe("2026-11-12T00:00:00.000Z");
    expect(whyWaits(at2003, Date.parse("2026-11-12T00:00:00Z"), null, tokyo, { present: true })).toEqual({ why: "callee", zone: "Asia/Tokyo", their: "20:03", then: "9:00" });
    expect(nextAllowed(at2003, null, tokyo, { present: true, courtesy: false })).toBe(at2003);
    const at2130 = Date.parse("2026-11-11T12:30:00Z"); // 21:30: too late even on Call now
    expect(new Date(nextAllowed(at2130, null, tokyo, { present: true, courtesy: false })!).toISOString()).toBe("2026-11-11T23:00:00.000Z");
    expect(whyWaits(at2130, Date.parse("2026-11-12T00:00:00Z"), null, tokyo, { present: true }).why).toBe("late");
    // The owner's own number: no callee hours at all.
    const at3amDc = Date.parse("2026-11-11T08:00:00Z");
    expect(nextAllowed(at3amDc, null, calleeZones("+12025550147")!, { present: true, own: true })).toBe(at3amDc);
  });
  test("D208: outcomes from realistic tuwa_call_result answers: a machine that answered is not a refusal", async () => {
    const io = (data: unknown, isError = false) => ({ call: async () => ({ isError, data }), schema: () => undefined });
    const gv = await tuwaProvider.result(io({ taskId: "T1", status: "failed", outcome: "not_reached", outcomeSummary: "The call connected, but an automated Google Voice message said the subscriber you have called is not available. No conversation took place.", durationSec: 24, costUsd: 0.3, transcript: [{ speaker: "agent", text: "Hi, this is Ducter, Weyl's AI assistant." }, { speaker: "callee", text: "The Google subscriber you have called is not available." }] }), "T1");
    expect(gv).toMatchObject({ state: "automated", hint: "screening", durationSec: 24, costUsd: 0.3 });
    expect(gv.outcome).toContain("Google Voice");
    expect(await tuwaProvider.result(io({ status: "partial", outcomeSummary: "Left a voicemail asking them to call back on Weyl's number." }), "T1")).toMatchObject({ state: "automated" });
    expect((await tuwaProvider.result(io({ status: "partial", outcomeSummary: "Left a voicemail asking them to call back." }), "T1")).hint).toBeUndefined();
    expect(await tuwaProvider.result(io({ status: "failed", outcome: "no_answer", outcomeSummary: "Nobody answered; the call rang out after 30 seconds." }), "T1")).toMatchObject({ state: "no_answer" });
    expect(await tuwaProvider.result(io({ status: "failed", error: { code: "carrier_rejected", message: "The carrier rejected the call (403)." } }), "T1")).toMatchObject({ state: "failed", detail: "The carrier rejected the call (403)." });
    expect((await tuwaProvider.result(io({ status: "failed" }), "T1")).detail).toBeUndefined();
    expect(await tuwaProvider.result(io({ status: "succeeded", outcome: "succeeded", outcomeSummary: "Two counter seats tomorrow at 19:30, under Weyl." }), "T1")).toMatchObject({ state: "done" });
    // A real conversation where someone "is not available" is still a conversation.
    expect(await tuwaProvider.result(io({ status: "partial", outcomeSummary: "They can do Friday, but the manager is not available to confirm the price." }), "T1")).toMatchObject({ state: "done" });
    expect(await tuwaProvider.result(io({ status: "canceled" }), "T1")).toMatchObject({ state: "failed", detail: "cancelled at the provider" });
    expect(await tuwaProvider.result(io("upstream error", true), "T1")).toMatchObject({ state: "uncertain" });
  });
  test("D208: the partner's line says what happened: got through to a machine, or a line that failed; never 'refused' unless it was", () => {
    const plan = { to: "+12025550147", name: "Google Voice", goal: "test", say: [], mustNot: [], voice: "ducter" as const, from: "provider" as const, provider: "Tuwa", minutes: 2, costUsd: 0.6, perMinUsd: 0.3, calleeZone: "America/New_York" };
    const auto = renderCallEnded({ callId: "c", connectionId: "x", plan, state: "automated", hint: "screening", outcome: "An automated Google Voice message said the subscriber is not available." });
    expect(auto).toContain("got through");
    expect(auto).toContain("press 1");
    expect(auto).not.toMatch(/refused it/);
    const line = renderCallEnded({ callId: "c", connectionId: "x", plan, state: "failed", reason: "call_failed", error: "the provider gave no reason" });
    expect(line).toContain("dialed but didn't connect");
    expect(line).not.toMatch(/refused/);
    expect(renderCallEnded({ callId: "c", connectionId: "x", plan, state: "failed", reason: "provider", error: "number not allowed" })).toContain("the provider refused it: number not allowed");
  });
  test("arguments follow the tool's own schema", () => {
    const schema = { properties: { taskId: {}, decision: {} } };
    expect(argsFor(schema, { id: { names: ["callId", "taskId"], value: "T1" }, d: { names: ["decision"], value: "accept" } })).toEqual({ taskId: "T1", decision: "accept" });
  });
});

describe("a calling connection, through a fake Tuwa", () => {
  let t: ReturnType<typeof tempDir>;
  let tuwa: FakeTuwa;
  let clock: FakeClock;
  let core: Core;
  beforeEach(() => {
    t = tempDir();
    tuwa = fakeTuwa();
    clock = new FakeClock(NOON_TOKYO);
    core = startCore({ dataDir: t.dir, port: 0, push: false, clock, signInMsPerSec: 5, persona: { id: "default", name: "Ducter", identity: "x" } });
    core.push.setSettings({ quiet: { start: "23:00", end: "08:00", tz: "Asia/Tokyo" } });
  });
  afterEach(async () => {
    await core.stop();
    tuwa.stop();
    t.cleanup();
  });

  async function connect() {
    const r = await core.connections.add({ url: tuwa.url });
    expect(r).toEqual({ ok: false, reason: "signing_in" });
    const v = core.connections.signInView()!;
    expect(v.state).toBe("waiting");
    expect(v.userCode).toBe("WXYZ-2345");
    expect(v.verifyUrlComplete).toContain("user_code=WXYZ-2345");
    expect(v.name).toBe("Tuwa");
    const seen: string[] = [];
    core.connections.onSignIn((x) => seen.push(x.state));
    tuwa.approve();
    await until(() => seen.includes("done"));
    const c = core.connections.view().find((x) => x.url === tuwa.url)!;
    expect(c.name).toBe("Tuwa");
    expect(c.signIn).toBe(true);
    await until(() => !!core.phone.view(c.id)?.rails);
    return c.id;
  }

  test("device sign-in: registers with a redirect uri, sends resource, polls through slow_down, keeps the token private", async () => {
    const id = await connect();
    const dev = tuwa.calls.find((x) => x.name === "device_authorization")!;
    expect(dev.args.client_id).toBe("cli_registered");
    expect(dev.args.resource).toBe(tuwa.url);
    expect(dev.args.scope).toBe("tuwa.calls");
    expect(tuwa.calls.filter((x) => x.name === "token").length).toBeGreaterThanOrEqual(1);
    const file = join(t.dir, "connection-tokens.json");
    expect(statSync(file).mode & 0o777).toBe(0o600);
    const tok = JSON.parse(readFileSync(file, "utf8"))[id];
    expect(tok.kind).toBe("oauth");
    expect(tok.refresh).toBe("rt_1");
    // Every request said who it is (Cloudflare refuses default agents).
    expect(tuwa.userAgents.every((u) => /^Ducter\//.test(u))).toBe(true);
    // The token never reaches a client frame.
    expect(JSON.stringify(core.connections.view())).not.toContain("at_1");
  });

  test("D199: the home's 打电话 is off before Tuwa and on once it is connected; a call ability request is refused", async () => {
    const call = async () => (await core.devicesView.frame()).devices.find((d) => d.home)!.abilities.find((a) => a.id === "call");
    expect(await call()).toEqual({ id: "call", state: "off" });
    await connect();
    expect(await call()).toEqual({ id: "call", state: "on" });
    expect(await core.devicesView.setAbility("local", "call", true)).toMatchObject({ ok: false, reason: "failed" }); // added in Accounts
  });

  test("the rails at connect: $10 a day, voice sampling paused, Friends sync off, the phone agent named", async () => {
    const id = await connect();
    expect(tuwa.settings.dailyLimitCents).toBe(1000);
    expect(tuwa.settings.voiceSampling).toBe("paused");
    expect(tuwa.settings.agentName).toBe("Ducter");
    expect(tuwa.settings.sharedSync).toEqual({ on: false });
    expect(core.phone.view(id)).toMatchObject({ provider: "Tuwa", capUsd: 10, rails: { cap: true, sampling: true, shared: true } });
  });

  test("a sign-in the owner declines says so", async () => {
    await core.connections.add({ url: tuwa.url });
    const seen: string[] = [];
    core.connections.onSignIn((x) => seen.push(x.state));
    tuwa.deny();
    await until(() => seen.includes("denied"));
    expect(core.connections.view()).toHaveLength(0);
  });

  test("a refused access token is refreshed once and the call goes on", async () => {
    const id = await connect();
    tuwa.expireAccess();
    const r = await core.connections.invoke(id, "tuwa_balance", {});
    expect(r.isError).toBe(false);
    expect(tuwa.calls.some((x) => x.name === "token" && x.args.grant_type === "refresh_token")).toBe(true);
  });

  test("an existing token can be imported instead of a new sign-in (a bridge's credentials file)", async () => {
    const r = await core.connections.add({ url: tuwa.url, token: JSON.stringify({ clientId: "cli_x", accessToken: "stale", refreshToken: tuwa.refresh(), accessExpiresAt: 1 }) });
    expect(r.ok).toBe(true);
    const c = core.connections.view()[0]!;
    expect(c.name).toBe("Tuwa");
    expect(c.signIn).toBe(true);
  });

  test("the call tools are Ducter's own: connection_call can't run them", async () => {
    const id = await connect();
    const r = await core.connections.read({ role: "partner" }, id, "tuwa_call_draft", {});
    expect(r.ok).toBe(false);
    expect(String((r as { error: string }).error)).toContain("phone_call");
  });

  test("D215: a number no line calls is a call sheet: no connection asked, nothing dialed, 打完了 then the user's words", async () => {
    // No calling connection at all: the sheet needs none.
    const r = await core.phone.draft({ to: "+84 24 3826 5556", name: "Hanoi Social Club", goal: "订明晚 7 点，两位", say: ["姓王", "13800138000"], keep: "人均 500 以内", mustNot: ["别答应最低消费"], open: "您好，我想订明天晚上 7 点，两位，姓王。", ask: ["有包间吗？", "要付定金吗？"], note: ["订位名字和时间", "要不要提前到"] }, { lang: "zh" });
    if (!r.ok || r.needsInput) throw new Error(JSON.stringify(r));
    expect(r.card).toMatchObject({ question: "打给 Hanoi Social Club 的通话单", goLabel: "打完了", defaultOption: "hold", reversible: false, call: { kind: "sheet" } });
    expect(r.plan).toMatchObject({ to: "+842438265556", from: "self", costUsd: 0, sheet: { why: "uncovered", open: "您好，我想订明天晚上 7 点，两位，姓王。", ask: ["有包间吗？", "要付定金吗？"], dont: ["别答应最低消费", "人均 500 以内"], note: ["订位名字和时间", "要不要提前到"] } });
    core.log.append({ stream: "channel", origin: "partner", kind: "decision", body: r.card as Bodies["decision"] });
    expect(core.phone.calls()[0]).toMatchObject({ callId: r.callId, state: "needs_go" });
    // 打完了: the call is the owner's; the snapshot wakes nothing, the answered card does.
    const seen: LogEvent[] = [];
    const off = core.log.subscribe((e) => seen.push(e));
    core.decisions.decide(r.card.decisionId, "go");
    await until(() => core.phone.get(r.callId)?.state === "done");
    off();
    expect(seen.filter((e) => e.kind === "phone_call").some((e) => triggersPartner(e))).toBe(false);
    expect(seen.some((e) => e.kind === "decision_resolved" && triggersPartner(e))).toBe(true);
    expect(renderCallEnded(core.phone.get(r.callId)!)).toContain("do=result");
    // The partner records how it went, in the user's words.
    expect(core.phone.result(r.callId, "订上了，明晚 7 点两位，靠窗")).toEqual({ ok: true });
    expect(core.phone.get(r.callId)).toMatchObject({ state: "done", outcome: "订上了，明晚 7 点两位，靠窗" });
    expect(core.phone.result("call_nope", "x")).toMatchObject({ ok: false });
    // Said in the conversation before the card was tapped: the card is answered too, by the partner (no second wake).
    const s2 = (await core.phone.draft({ to: "+62 361 849 6000", name: "李师傅", goal: "问周六能不能来修空调", open: "李师傅您好，我是王先生。" }, { lang: "zh" })) as { ok: true; callId: string; card: Bodies["decision"] };
    core.log.append({ stream: "channel", origin: "partner", kind: "decision", body: s2.card });
    expect(core.phone.result(s2.callId, "没人接", false)).toEqual({ ok: true });
    expect(core.phone.get(s2.callId)!.state).toBe("no_answer");
    const res = core.log.read({ stream: "channel", kinds: ["decision_resolved"], limit: 50 }).find((e) => (e.body as Bodies["decision_resolved"]).decisionId === s2.card.decisionId)!;
    expect(res.origin).toBe("partner"); // the partner never wakes on its own events
    // Not now sets a sheet aside; nothing to record.
    const s3 = (await core.phone.draft({ to: "+234 1 271 0000", name: "张姐", goal: "问孩子周末补课", open: "张姐好。" }, { lang: "en" })) as { ok: true; callId: string; card: Bodies["decision"] };
    expect(s3.card).toMatchObject({ question: "Call sheet: 张姐", goLabel: "Done calling" });
    core.log.append({ stream: "channel", origin: "partner", kind: "decision", body: s3.card });
    core.decisions.decide(s3.card.decisionId, "hold");
    await until(() => core.phone.get(s3.callId)?.state === "held");
    // An emergency number is still refused as one; a country Tuwa calls is not a sheet (here: connect first).
    expect(await core.phone.draft({ to: "+84 113", name: "x", goal: "help" }, { lang: "zh" })).toMatchObject({ ok: false });
    expect(await core.phone.draft({ to: "+852 2123 4567", name: "Tim Ho Wan", goal: "book", open: "x" }, { lang: "en" })).toMatchObject({ ok: false, reason: "no_phone" });
  });

  test("D215: with Tuwa connected, a country it calls is a Tuwa call; one it doesn't is still a sheet", async () => {
    await connect();
    const hk = await core.phone.draft({ to: "+852 2123 4567", name: "Tim Ho Wan", goal: "book a table for two" }, { lang: "en" });
    expect(hk).toMatchObject({ ok: true, plan: { from: "provider", provider: "Tuwa" } });
    const n = tuwa.calls.length;
    const cn = await core.phone.draft({ to: "+7 495 123 4567", name: "Pushkin", goal: "book a table for two", open: "Hello, a table for two tonight, please." }, { lang: "en" });
    expect(cn).toMatchObject({ ok: true, plan: { from: "self" } });
    expect(tuwa.calls.length).toBe(n); // Tuwa never heard of it
  });

  async function draftAndGo(extra: Partial<Parameters<Core["phone"]["draft"]>[0]> = {}) {
    const r = await core.phone.draft({ to: "+81 3-1234-5678", name: "Sushi Saito", goal: "明天晚上 7 点订两位", say: ["Weyl"], keep: "每人不超过 3 万日元", forName: "Weyl", ...extra }, { lang: "zh" });
    if (!r.ok || r.needsInput) throw new Error(JSON.stringify(r));
    core.log.append({ stream: "channel", origin: "partner", kind: "decision", body: r.card as Bodies["decision"] });
    return r;
  }

  test("one call end to end: the card, Go with the owner's words, a question from the line, the outcome as reported", async () => {
    await connect();
    const r = await draftAndGo();
    expect(r.card).toMatchObject({ question: "打给 Sushi Saito？", goLabel: "打过去", defaultOption: "hold", reversible: false });
    expect(r.plan).toMatchObject({ to: "+81312345678", minutes: 4, perMinUsd: 0.4, costUsd: 1.6, voice: "ducter", provider: "Tuwa" });
    expect(r.plan.summary).toContain("Sushi Saito");
    const draft = tuwa.last()!;
    // Ducter's rails ride on every call: the AI disclosure, never the owner, 15 minutes, a Tuwa number.
    expect(JSON.stringify(draft.args.context)).toContain("Ducter, Weyl's AI assistant");
    expect((draft.args.mustNot as string[]).join(" ")).toContain("Never say or suggest you are Weyl");
    expect((draft.args.mustNot as string[]).join(" ")).toContain("15 minutes");
    expect(draft.args).toMatchObject({ dialer: "tuwa", voice: "built_in", privateGuidance: "每人不超过 3 万日元", shareable: ["Weyl"] });
    expect(core.phone.calls()[0]!.state).toBe("needs_go");
    // Nothing dialed before Go.
    expect(tuwa.calls.some((x) => x.name === "tuwa_confirm")).toBe(false);

    core.decisions.decide(r.card.decisionId, "go");
    await until(() => draft.status === "executing");
    expect(draft.personReply).toBe("打过去");
    await until(() => core.phone.calls()[0]!.state === "calling");

    tuwa.set(draft.taskId, { durationSec: 20, pending: { question: "7 点半可以吗？", token: "QABCDE", kind: "yes_no" } });
    clock.advance(16_000);
    await until(() => core.phone.calls()[0]!.state === "question");
    const q = core.log.read({ stream: "channel", kinds: ["decision"], limit: 50 }).map((e) => e.body as Bodies["decision"]).find((d) => d.call?.kind === "question")!;
    expect(q.question).toBe("7 点半可以吗？");
    expect(q.call?.yesNo).toBe(true);
    core.decisions.decide(q.decisionId, "reply", "可以");
    await until(() => draft.replies.length === 1);
    expect(draft.replies[0]).toMatchObject({ taskId: draft.taskId, token: "QABCDE", decision: "accept" });

    tuwa.set(draft.taskId, { status: "succeeded", result: { outcome: "succeeded", outcomeSummary: "Two counter seats tomorrow at 19:30, under Weyl.", durationSec: 190, costUsd: 1.6 } });
    const ended: LogEvent[] = [];
    core.log.subscribe((e) => e.kind === "phone_call" && ended.push(e));
    clock.advance(6_000);
    await until(() => ["done"].includes(core.phone.calls()[0]!.state));
    const done = core.phone.calls()[0]!;
    expect(done.outcome).toBe("Two counter seats tomorrow at 19:30, under Weyl.");
    expect(done.costUsd).toBe(1.6);
    // The partner hears about it once, from the ended snapshot.
    expect(ended.filter((e) => triggersPartner(e))).toHaveLength(1);
  });

  test("a question nobody answers in 90 s: the agent says it will call back (no guess)", async () => {
    await connect();
    const r = await draftAndGo();
    core.decisions.decide(r.card.decisionId, "go");
    const task = tuwa.last()!;
    await until(() => core.phone.calls()[0]!.state === "calling");
    tuwa.set(task.taskId, { pending: { question: "Which name?", token: "QFGHJK" } });
    clock.advance(16_000);
    await until(() => core.phone.calls()[0]!.state === "question");
    clock.advance(91_000);
    await until(() => task.replies.length === 1);
    expect(task.replies[0]).toMatchObject({ decision: "text", text: CALLBACK_REPLY });
  });

  test("uncertain is said as such; Not now dials nothing", async () => {
    await connect();
    const a = await draftAndGo();
    core.decisions.decide(a.card.decisionId, "hold");
    await until(() => core.phone.calls().some((c) => c.state === "held"));
    expect(tuwa.calls.some((x) => x.name === "tuwa_confirm")).toBe(false);
    await until(() => tuwa.last()!.status === "canceled");

    const b = await draftAndGo({ name: "Clinic" });
    core.decisions.decide(b.card.decisionId, "go");
    const task = tuwa.last()!;
    await until(() => task.status === "executing");
    // The poll is armed once Ducter has the confirm's answer (it lands after Tuwa's own state).
    await until(() => core.phone.calls().some((c) => c.plan.name === "Clinic" && c.state === "calling"));
    tuwa.set(task.taskId, { status: "uncertain", result: { outcome: "uncertain", outcomeSummary: "The line dropped before they confirmed." } });
    clock.advance(16_000);
    await until(() => core.phone.calls()[0]!.state === "uncertain");
  });

  test("quiet hours: the card says when, Tuwa holds the time, nothing dials now", async () => {
    await connect();
    clock.advance(14 * 3600_000); // 02:00 Tokyo
    const r = await draftAndGo();
    expect(r.plan.at).toBe("2026-11-12T00:00:00.000Z");
    expect(tuwa.last()!.args.scheduledAt).toBe("2026-11-12T00:00:00.000+00:00");
    core.decisions.decide(r.card.decisionId, "go");
    await until(() => tuwa.last()!.status === "scheduled");
    expect(core.phone.calls()[0]!.state).toBe("waiting");
  });

  test("refusals: emergency, do-not-call, the daily cap, a payment gate", async () => {
    await connect();
    expect(await core.phone.draft({ to: "+1 911", name: "x", goal: "help" }, { lang: "en" })).toMatchObject({ ok: false, reason: "emergency" });
    expect(await core.phone.draft({ to: "+84 90 123 4567", name: "x", goal: "ask" }, { lang: "en" })).toMatchObject({ ok: false, reason: "sheet" }); // D215: a call sheet needs its first words
    core.phone.block("+81312345678", "asked not to be called");
    expect(await core.phone.draft({ to: "+81312345678", name: "Saito", goal: "book" }, { lang: "en" })).toMatchObject({ ok: false, reason: "dnc" });
    expect(await core.phone.draft({ to: "+819012345678", name: "Ken", goal: "ask", minutes: 15 }, { lang: "en" })).toMatchObject({ ok: true });
    // 15 min × $0.60 = $9 is under $10; a second one is over.
    const first = (await core.phone.draft({ to: "+819012345679", name: "Ken", goal: "ask", minutes: 15 }, { lang: "en" })) as { ok: true; card: Bodies["decision"] };
    core.log.append({ stream: "channel", origin: "partner", kind: "decision", body: first.card });
    core.decisions.decide(first.card.decisionId, "go");
    await until(() => core.phone.calls().some((c) => c.state === "calling"));
    expect(await core.phone.draft({ to: "+819012345670", name: "Ken", goal: "ask again", minutes: 4 }, { lang: "en" })).toMatchObject({ ok: false, reason: "cap" });
  });

  test("a payment gate: nothing dialed, the provider's own page is the way on", async () => {
    await connect();
    tuwa.gate("payment_method_required");
    const g = await draftAndGo({ to: "+14155550100", name: "Zuni Cafe", calleeZone: "Asia/Tokyo" });
    core.decisions.decide(g.card.decisionId, "go");
    await until(() => core.phone.calls().some((c) => c.state === "failed"));
    expect(core.phone.calls().find((c) => c.state === "failed")).toMatchObject({ reason: "payment", payUrl: "https://checkout.stripe.com/fake" });
  });

  test("the owner's voice: off until it exists; the recording page is Tuwa's own", async () => {
    await connect();
    expect(await core.phone.draft({ to: "+81312345678", name: "Saito", goal: "book", voice: "owner" }, { lang: "en" })).toMatchObject({ ok: false, reason: "voice" });
    expect(await core.phone.voice("on", "yes")).toMatchObject({ ok: false, reason: "no_voice" });
    expect(await core.phone.voice("record", "yes")).toMatchObject({ ok: true, url: "https://tuwa.ai/record/fake" });
  });

  test("D208: asked for now at 20:03 where they are: the card says why and offers Call now; Call now dials at once", async () => {
    await connect();
    clock.advance(8 * 3600_000 + 3 * 60_000); // 20:03 in Tokyo, the owner awake and asking
    const r = await draftAndGo({ present: true });
    expect(r.plan).toMatchObject({ at: "2026-11-12T00:00:00.000Z", canNow: true, wait: { why: "callee", zone: "Asia/Tokyo", their: "20:03", then: "9:00" } });
    expect(r.card.goLabel).toBe("到点再打");
    // Ducter holds the time (so Call now can dial now): no scheduledAt at the provider.
    const draft = tuwa.last()!;
    expect(draft.args.scheduledAt).toBeUndefined();
    expect(core.phone.callNow(r.callId)).toEqual({ ok: true });
    await until(() => draft.status === "executing");
    expect(draft.personReply).toBe("现在就打");
    await until(() => core.phone.calls()[0]!.state === "calling");
    expect(core.phone.calls()[0]!.callNow).toBe(true);
  });

  test("D208: Go on that card waits in Ducter for 9:00 there, then dials", async () => {
    await connect();
    clock.advance(8 * 3600_000 + 3 * 60_000);
    const r = await draftAndGo({ present: true });
    core.decisions.decide(r.card.decisionId, "go");
    await until(() => core.phone.calls()[0]!.state === "waiting");
    expect(tuwa.calls.some((x) => x.name === "tuwa_confirm")).toBe(false);
    clock.advance(13 * 3600_000); // 09:03 the next morning in Tokyo
    await until(() => tuwa.last()!.status === "executing");
    expect(tuwa.last()!.personReply).toBe("到点再打");
  });

  test("D208: at 21:30 there it is too late even on Call now; a call the partner starts waits for the owner's quiet hours to end", async () => {
    await connect();
    clock.advance(9 * 3600_000 + 30 * 60_000); // 21:30 in Tokyo
    const late = await draftAndGo({ present: true });
    expect(late.plan.canNow).toBeUndefined();
    expect(late.plan.wait?.why).toBe("late");
    expect(tuwa.last()!.args.scheduledAt).toBe("2026-11-12T00:00:00.000+00:00");
    expect(core.phone.callNow(late.callId)).toMatchObject({ ok: false });
    // 00:00 in Tokyo, 10:00 in Washington: the owner asking now calls now; a task's call waits for 08:00.
    clock.advance(2 * 3600_000 + 30 * 60_000);
    const asked = await draftAndGo({ to: "+1 202 555 0147", name: "Google Voice", present: true });
    expect(asked.plan.at).toBeUndefined();
    const later = await draftAndGo({ to: "+1 202 555 0148", name: "Front desk" });
    expect(later.plan).toMatchObject({ at: "2026-11-11T23:00:00.000Z", wait: { why: "quiet" } });
  });

  test("D208: the owner's own number (said so, or their saved phone) has no callee hours", async () => {
    await connect();
    clock.advance(8 * 3600_000 + 3 * 60_000); // 20:03 Tokyo, 06:03 in Washington
    expect((await draftAndGo({ to: "+1 202 555 0147", name: "Google Voice", present: true, own: true })).plan).toMatchObject({ own: true });
    expect((await draftAndGo({ to: "+1 202 555 0147", name: "Google Voice", present: true, own: true })).plan.at).toBeUndefined();
    core.autofill.store.put({ kind: "detail", values: { phone: "+1 202 555 0199" } });
    const saved = await draftAndGo({ to: "+12025550199", name: "My phone", present: true });
    expect(saved.plan).toMatchObject({ own: true });
    expect(saved.plan.at).toBeUndefined();
  });

  test("D208: a confirm that errors after placing the call: its status says so, and it is never confirmed twice", async () => {
    await connect();
    const r = await draftAndGo();
    tuwa.failConfirm("placed");
    core.decisions.decide(r.card.decisionId, "go");
    await until(() => core.phone.calls()[0]!.state === "calling");
    expect(tuwa.calls.filter((x) => x.name === "tuwa_confirm")).toHaveLength(1);
    expect(tuwa.calls.filter((x) => x.name === "tuwa_call_request_approval")).toHaveLength(1);
  });

  test("D208: a confirm that errors and didn't place it (expired): asked again, confirmed once more; status unreadable: failed as lost, never re-confirmed", async () => {
    await connect();
    const a = await draftAndGo();
    tuwa.failConfirm("stale");
    core.decisions.decide(a.card.decisionId, "go");
    await until(() => tuwa.last()!.status === "executing");
    expect(tuwa.calls.filter((x) => x.name === "tuwa_confirm")).toHaveLength(2);

    const b = await draftAndGo({ name: "Clinic", to: "+81 3-1234-5679" });
    tuwa.failConfirm("blind");
    core.decisions.decide(b.card.decisionId, "go");
    await until(() => core.phone.calls().some((c) => c.state === "failed"));
    expect(core.phone.calls().find((c) => c.state === "failed")).toMatchObject({ reason: "lost" });
    expect(tuwa.calls.filter((x) => x.name === "tuwa_confirm")).toHaveLength(3);
  });

  test("D208: Google Voice's screening answered: got an automated message, with the fix; a line that failed says the provider's words", async () => {
    await connect();
    const r = await draftAndGo({ to: "+1 202 555 0147", name: "Google Voice", calleeZone: "Asia/Tokyo" });
    core.decisions.decide(r.card.decisionId, "go");
    const task = tuwa.last()!;
    await until(() => task.status === "executing");
    await until(() => core.phone.calls().some((c) => c.plan.name === "Google Voice" && c.state === "calling"));
    tuwa.set(task.taskId, { status: "failed", result: { outcome: "not_reached", outcomeSummary: "The call connected, but an automated Google Voice message said the subscriber you have called is not available.", durationSec: 24, costUsd: 0.3 } });
    clock.advance(16_000);
    await until(() => core.phone.calls()[0]!.state === "automated");
    expect(core.phone.calls()[0]).toMatchObject({ hint: "screening", costUsd: 0.3 });

    const b = await draftAndGo({ name: "Clinic", to: "+81 3-1234-5679" });
    core.decisions.decide(b.card.decisionId, "go");
    const t2 = tuwa.last()!;
    await until(() => t2.status === "executing");
    await until(() => core.phone.calls().some((c) => c.plan.name === "Clinic" && c.state === "calling"));
    tuwa.set(t2.taskId, { status: "failed" });
    clock.advance(16_000);
    await until(() => core.phone.calls().some((c) => c.state === "failed"));
    expect(core.phone.calls().find((c) => c.state === "failed")).toMatchObject({ reason: "call_failed", error: "the provider gave no reason" });
  });

  test("needs_input: the provider's questions go to the owner; their answers continue the same draft", async () => {
    await connect();
    tuwa.askOnDraft(["How many people?"]);
    const r = await core.phone.draft({ to: "+81312345678", name: "Saito", goal: "book a table" }, { lang: "en" });
    expect(r).toMatchObject({ ok: true, needsInput: true, questions: ["How many people?"] });
    const again = await core.phone.draft({ to: "", name: "", goal: "" }, { lang: "en", callId: (r as { callId: string }).callId, answers: "Two" });
    expect(again).toMatchObject({ ok: true, needsInput: false });
    expect(JSON.stringify(tuwa.last()!.args.answers)).toContain("Two");
  });
});
