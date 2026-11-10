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
import { calleeZones, neverCall, nextAllowed, surcharge, CALLBACK_REPLY } from "../src/phone.ts";
import { argsFor } from "../src/phone-provider.ts";
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
    expect(await core.phone.draft({ to: "+86 138 0013 8000", name: "x", goal: "ask" }, { lang: "en" })).toMatchObject({ ok: false, reason: "region" });
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
