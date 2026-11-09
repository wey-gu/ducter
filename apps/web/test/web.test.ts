import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { LogEvent } from "@ducter/protocol";
import { buildWeb } from "../build.ts";
import { baseUrl, codeFromHash, deviceName, wsUrl } from "../src/conn.ts";
import { format, joinHan, langOfText, strings, TABLES } from "../src/i18n.ts";
import { sameWords, splitOutcome } from "../src/format.ts";
import { autospace, unspace } from "../src/autospace.ts";
import { markdown } from "../src/markdown.ts";
import { canIntegrate, countsChanges, headlineEvidence, isOutside, Store, title } from "../src/store.ts";

let seq = 0;
const ev = (kind: string, body: unknown, o: Partial<LogEvent> = {}): LogEvent =>
  ({ seq: ++seq, ts: new Date().toISOString(), persona: "default", stream: "channel", origin: "system", kind, body, ...o }) as LogEvent;

describe("pairing link", () => {
  test("the code comes from the fragment; the base is the page's directory", () => {
    expect(codeFromHash("#c=k7qm-4xpa")).toBe("K7QM-4XPA");
    expect(codeFromHash("#x=1&c=AB2C-DE3F")).toBe("AB2C-DE3F");
    expect(codeFromHash("")).toBe("");
    expect(baseUrl("https://d.example.com/pair#c=K7QM-4XPA").href).toBe("https://d.example.com/");
    expect(baseUrl("https://example.com/ducter/app").href).toBe("https://example.com/ducter/");
    expect(wsUrl(new URL("https://example.com/ducter/"))).toBe("wss://example.com/ducter/ws");
    expect(wsUrl(new URL("http://127.0.0.1:7797/"))).toBe("ws://127.0.0.1:7797/ws");
  });
  test("a phone names itself for `ducter devices`", () => {
    expect(deviceName("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")).toEqual({ name: "iPhone · Safari", platform: "ios" });
    expect(deviceName("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36")).toEqual({ name: "Android phone · Chrome", platform: "android" });
  });
});

describe("copy", () => {
  test("zh and en have the same keys", () => {
    expect(Object.keys(TABLES.zh).sort()).toEqual(Object.keys(TABLES.en).sort());
  });
  test("zh puts a space between Han and Latin letters or digits (D78)", () => {
    // Printf verbs are left out: what fills them decides. ALLOWED: keys that run them together on purpose.
    const ALLOWED = new Set<string>([]);
    const verb = /%(\d+\$)?[-+# 0]*\d*(\.\d+)?[sdfv]/g;
    const hits = Object.entries(TABLES.zh)
      .filter(([k, v]) => !ALLOWED.has(k) && /\p{Script=Han}[A-Za-z0-9]|[A-Za-z0-9]\p{Script=Han}/u.test(v.replace(verb, "\u0000")))
      .map(([k, v]) => `${k}: ${v}`);
    expect(hits).toEqual([]);
  });
  test("printf verbs, positional args, and Han joining around a name", () => {
    expect(format("If you don't answer, I'll %[2]s in %[1]s.", ["30 min", "rebase"])).toBe("If you don't answer, I'll rebase in 30 min.");
    expect(strings("zh").t("face.working", "小鸭")).toBe("小鸭正在做事");
    expect(strings("zh").t("face.working", "Ducter")).toBe("Ducter 正在做事");
    expect(joinHan("你 好")).toBe("你好");
    expect(strings("en").t("decision.default.go", "30 min", "rebase")).toBe("If you don't answer, I'll rebase in 30 min. It can be undone.");
  });
  test("retired vocabulary never appears", () => {
    const all = JSON.stringify(TABLES);
    for (const w of ["奏章", "朱批", "授权", "绑定", "token", "seal"]) expect(all).not.toContain(w);
  });
  test("the language follows what the user writes", () => {
    expect(langOfText("修一下这个测试")).toBe("zh");
    expect(langOfText("fix the test")).toBe("en");
    expect(langOfText("ok")).toBe("");
  });
});

describe("markdown-lite", () => {
  test("escapes first, then formats", () => {
    expect(markdown("<img src=x onerror=alert(1)>")).toBe("<p>&lt;img src=x onerror=alert(1)&gt;</p>");
    expect(markdown("**粗** and `a<b>` and *it*")).toBe("<p><strong>粗</strong> and <code>a&lt;b&gt;</code> and <em>it</em></p>");
    expect(markdown("- one\n- two\n\nnext")).toBe("<ul><li>one</li><li>two</li></ul><p>next</p>");
    expect(markdown("```\nx < y\n```")).toBe("<pre><code>x &lt; y</code></pre>");
    expect(markdown("[pr](javascript:alert(1)) https://github.com/x")).toContain('<a href="https://github.com/x"');
    expect(markdown("[pr](javascript:alert(1))")).not.toContain("href");
  });
  test("a NUL in a message doesn't break the conversation view", () => {
    expect(markdown("see \u00000\u0000 here and `x`")).toBe("<p>see 0 here and <code>x</code></p>");
  });
});

describe("store (parity with the desktop store)", () => {
  test("a folder task's result has no change count beside its sentence (D142)", () => {
    const s = new Store();
    const place = (id: string, p: unknown) => ev("task_open", { taskId: id, title: "x", harness: "claude-code", place: p }, { stream: `task:${id}`, origin: "partner" });
    s.apply({ t: "welcome", persona: "default", personaName: "Ducter", headSeq: 0 });
    s.apply({ t: "events", events: [place("f1", { kind: "folder", device: "local", path: "/tmp/发票" }), place("r1", { kind: "repo", device: "local", repoPath: "/r", branch: "ducter/x", baseBranch: "main" })] });
    expect(countsChanges(s.tasks.get("f1")!)).toBe(false);
    expect(countsChanges(s.tasks.get("r1")!)).toBe(true);
  });
  test("a wait that ended unmet stays in the finished area today; re-armed, it leaves it (D145)", () => {
    const s = new Store();
    const w = { waiterId: "w1", reason: "PR #9950 的 CI 通过", kind: "check", check: { argv: ["gh"], succeedWhen: { exitCode: 0 } } };
    s.apply({ t: "welcome", persona: "default", personaName: "Ducter", headSeq: 0 });
    s.apply({ t: "events", events: [ev("waiter", { ...w, state: "armed" }, { origin: "waiter" }), ev("waiter", { ...w, state: "cancelled", unmet: "有一项检查挂了" }, { origin: "waiter" }), ev("waiter", { waiterId: "w2", reason: "x", state: "cancelled" }, { origin: "user" })] });
    expect(s.armedWaiters()).toEqual([]);
    expect(s.missedToday().map((x) => [x.waiterId, x.unmet])).toEqual([["w1", "有一项检查挂了"]]);
    expect(s.missedToday(Date.now() + 2 * 86_400_000)).toEqual([]);
    s.apply({ t: "events", events: [ev("waiter", { ...w, state: "armed" }, { origin: "user" })] });
    expect(s.missedToday()).toEqual([]);
    expect(s.armedWaiters().map((x) => x.waiterId)).toEqual(["w1"]);
  });
  test("a living message is revised in place; jobs fold into their acks; decisions resolve", () => {
    const s = new Store();
    const u = ev("user_msg", { text: "修测试", clientId: "c1" }, { origin: "user" });
    const l1 = ev("living_msg", { items: [{ taskId: "t1", kind: "progress", title: "修", text: "在跑" }] });
    const ack = ev("ack", { jobId: "j1", text: "好", replyTo: u.seq });
    const st1 = ev("job_status", { jobId: "j1", text: "在做", state: "running", taskId: "t1" });
    const st2 = ev("job_status", { jobId: "j1", text: "做完了", state: "done", taskId: "t1" });
    const d = ev("decision", { decisionId: "d1", taskId: "t1", question: "rebase?", goLabel: "rebase", defaultOption: "go", reversible: true });
    const l2 = ev("living_msg", { items: [{ taskId: "t1", kind: "decision", title: "修", text: "rebase?", decisionId: "d1" }] }, { supersedes: l1.seq });
    s.apply({ t: "welcome", persona: "default", personaName: "Ducter", headSeq: 0 });
    s.apply({ t: "events", events: [u, l1, ack, st1, st2, d, l2] });
    expect(s.channel.map((e) => (e.user ? "user" : e.living ? "living" : e.job ? "job" : e.decision ? "decision" : "?"))).toEqual(["user", "living", "job", "decision"]);
    const living = s.channel[1]!;
    expect(living.revision).toBe(1);
    expect(living.living!.items[0]!.kind).toBe("decision");
    expect(s.jobs.get("j1")!.status!.state).toBe("done");
    expect(s.decisionShownInLiving("d1")).toBe(true);
    expect(s.openDecisions().map((x) => x.decisionId)).toEqual(["d1"]);
    s.apply({ t: "events", events: [ev("decision_resolved", { decisionId: "d1", option: "go", by: "user" })] });
    expect(s.openDecisions()).toEqual([]);
    expect(s.tasksOfReply(u.seq)).toEqual(["t1"]);
  });

  test("a retitle (a later task_open) renames the task and keeps when it was opened, in any order", () => {
    const open = { taskId: "t1", project: "", place: { kind: "none" }, harness: "claude-code", brief: "b" };
    const first = ev("task_open", { ...open, title: "修好分账测试" }, { stream: "task:t1", ts: "2026-11-09T10:00:00.000Z" });
    const second = ev("task_open", { ...open, title: "修好分账测试和退款取整" }, { stream: "task:t1", ts: "2026-11-09T11:00:00.000Z" });
    for (const order of [[first, second], [second, first]]) {
      const s = new Store();
      s.apply({ t: "welcome", persona: "default", personaName: "Ducter", headSeq: 0 });
      for (const e of order) s.apply({ t: "events", events: [e] });
      expect(title(s.task("t1"))).toBe("修好分账测试和退款取整");
      expect(s.task("t1").openedAt).toBe("2026-11-09T10:00:00.000Z");
    }
  });

  test("a welcome from a Log that started over is stale", () => {
    const s = new Store();
    s.apply({ t: "events", events: [ev("user_msg", { text: "hi" })] });
    expect(s.stale({ t: "welcome", persona: "p", personaName: "D", headSeq: 0 })).toBe(true);
  });

  test("a merge replayed before on_hand still counts (no second Merge after a reconnect)", () => {
    const s = new Store();
    s.apply({ t: "welcome", persona: "default", personaName: "Ducter", headSeq: 0 });
    s.apply({ t: "events", events: [ev("job_status", { jobId: "act_t1_merge", taskId: "t1", state: "done", text: "merged" }, { origin: "user" })] });
    s.apply({ t: "on_hand", onHand: { tasks: [{ taskId: "t1", title: "fix", attention: "done" }] } as never });
    expect(s.tasks.get("t1")!.acted).toEqual({ action: "merge", ok: true });
  });

  test("Merge / Open draft PR only when the task's branch holds something (core's check at report time)", () => {
    const s = new Store();
    const place = { kind: "repo", device: "local", repoPath: "/r", worktree: "/w", branch: "ducter/look", baseBranch: "main" };
    const stream = "task:tm";
    s.apply({ t: "events", events: [ev("task_open", { taskId: "tm", title: "look", project: "", place, harness: "claude-code", brief: "b" }, { stream })] });
    const report = (branch?: unknown) => ev("report", { taskId: "tm", state: "done", summary: "没改任何文件", questions: [], evidence: [], ...(branch ? { branch } : {}) }, { stream, origin: "task" });
    const state = ev("task_state", { taskId: "tm", attention: "done", residency: "warm" }, { stream });
    s.apply({ t: "events", events: [report({ commits: 0, uncommitted: false }), state] });
    expect(canIntegrate(s.task("tm"))).toBe(false);
    s.apply({ t: "events", events: [report({ commits: 2, uncommitted: false })] });
    expect(canIntegrate(s.task("tm"))).toBe(true);
    s.apply({ t: "events", events: [report()] }); // an older core: unknown keeps the actions
    expect(canIntegrate(s.task("tm"))).toBe(true);
  });

  test("a Done row names the latest check of the best kind, as the desktop does", () => {
    const evs = [
      { kind: "diff", label: "commit", ref: "0210823" },
      { kind: "test", label: "bun test before", ref: "2 pass, 1 fail" },
      { kind: "test", label: "bun test after", ref: "3 pass" },
    ];
    expect(headlineEvidence(evs)?.label).toBe("bun test after");
    expect(headlineEvidence([{ kind: "note", label: "x", ref: "" }])).toBeUndefined();
  });

  test("a follow-up done after a merge is not merged (Merge comes back)", () => {
    const s = new Store();
    const done = () => ev("living_msg", { items: [{ taskId: "t1", kind: "done", title: "fix", text: "ok" }] });
    const first = done();
    s.apply({ t: "events", events: [first, ev("job_status", { jobId: "act_t1_merge", taskId: "t1", state: "done", text: "merged" }, { origin: "user" })] });
    expect(s.tasks.get("t1")!.acted?.action).toBe("merge");
    const rev = ev("living_msg", { items: [{ taskId: "t1", kind: "done", title: "fix", text: "ok" }, { taskId: "t2", kind: "progress", title: "x", text: "" }] }, { supersedes: first.seq });
    s.apply({ t: "events", events: [rev] });
    expect(s.tasks.get("t1")!.acted?.action).toBe("merge");
    s.apply({ t: "events", events: [done()] });
    expect(s.tasks.get("t1")!.acted).toBeUndefined();
  });

  test("what counts as outside", () => {
    expect(isOutside("git push origin main")).toBe(true);
    expect(isOutside("gh pr create --draft")).toBe(true);
    expect(isOutside("git commit -m x")).toBe(false);
  });
});

describe("after a reconnect (soak design calls 2 and 3)", () => {
  test("unechoed messages and unacked task sends go again, in order; echoed ones don't", () => {
    const s = new Store();
    const pending = [
      { clientId: "p1", text: "first" },
      { clientId: "p2", text: "second" },
    ];
    s.apply({ t: "events", events: [ev("user_msg", { text: "first", clientId: "p1" }, { origin: "user" })] });
    s.addSend("t1", "also the docs", 1, "k1");
    const acked = s.addSend("t1", "and the tests", 2, "k2");
    acked.delivered = "steered";
    expect(s.resends(pending)).toEqual([
      { t: "send", text: "second", clientId: "p2" },
      { t: "task_send", taskId: "t1", text: "also the docs", clientId: "k1" },
    ]);
    // Core re-sends the original echo for a duplicate: the store keeps one bubble.
    const echo = ev("user_msg", { text: "second", clientId: "p2" }, { origin: "user" });
    s.apply({ t: "events", events: [echo] });
    s.apply({ t: "events", events: [echo] });
    expect(s.channel.filter((e) => e.user?.clientId === "p2")).toHaveLength(1);
    expect(s.resends(pending).filter((f) => f.t === "send")).toEqual([]);
  });

  test("a task echo with a clientId marks its own send", () => {
    const s = new Store();
    const a = s.addSend("t1", "go on", 1, "k1");
    const b = s.addSend("t1", "go on", 2, "k2");
    s.apply({ t: "events", events: [ev("task_event", { taskId: "t1", role: "user", from: "user", text: "go on", clientId: "k2" }, { stream: "task:t1" })] });
    expect([a.seq, b.seq !== undefined]).toEqual([undefined, true]);
  });

  test("a lost action_result resolves from the Log, or is unsure, never failed", () => {
    const s = new Store();
    s.task("t1").acting = "merge";
    s.task("t2").acting = "open_pr";
    // Replay: the merge is in the Log, the PR isn't.
    s.apply({ t: "events", events: [ev("job_status", { jobId: "act_t1_merge", taskId: "t1", state: "done", text: "merged" }, { origin: "user" })] });
    s.settleInDoubt(new Map([["t1", "merge"], ["t2", "open_pr"]]));
    const [t1, t2] = [s.tasks.get("t1")!, s.tasks.get("t2")!];
    expect([t1.acting, t1.unsure, t1.acted]).toEqual([undefined, undefined, { action: "merge", ok: true }]);
    expect([t2.acting, t2.unsure, t2.acted]).toEqual([undefined, "open_pr", undefined]);
    expect(s.actionResults).toEqual([]);
    // A late Log line settles it too.
    s.apply({ t: "events", events: [ev("job_status", { jobId: "act_t2_open_pr", taskId: "t2", state: "done", text: "pr" }, { origin: "user" })] });
    expect([t2.unsure, t2.acted]).toEqual([undefined, { action: "open_pr", ok: true }]);
  });

  test("the unsure line has zh and en copy", () => {
    expect(strings("zh").t("result.unsure")).toBe("不确定成没成，你看一眼");
    expect(strings("en").t("result.unsure")).toBe("Not sure it went through — check");
  });
});

describe("the committed bundle", () => {
  // The bundle is built with the pinned Bun (scripts/build-web.sh); another Bun minifies a few
  // bytes differently, so the byte-for-byte check only runs on the pinned one (CI pins it too).
  const PINNED = "1.4.4";
  test.skipIf(Bun.version !== PINNED)("is what src builds to (run `bun run build:web` after changing src)", async () => {
    const built = await buildWeb();
    for (const [name, text] of Object.entries(built)) expect(await Bun.file(join(import.meta.dir, "..", "static", name)).text()).toBe(text);
  });
});

describe("task chip", () => {
  test("a status line that only repeats the title falls back to the state", () => {
    expect(sameWords("slow cleanup of the downloads list", "slow cleanup of the downloads list")).toBe(true);
    expect(sameWords("Slow cleanup of the downloads list.", "slow cleanup of the  downloads list")).toBe(true);
    expect(sameWords("Working", "slow cleanup of the downloads list")).toBe(false);
    expect(sameWords(undefined, "x")).toBe(false);
  });
});

describe("settings (D71)", () => {
  const frame = (over: Record<string, unknown> = {}) =>
    ({
      t: "settings",
      settings: { name: "小鸭", language: "auto", memory: true, notify: true, quiet: { start: "23:00", end: "08:00", tz: "Asia/Shanghai" }, defaultAfterMin: 30 },
      mem: { state: "connected", noted: [{ seq: 7, title: "测试统一用假时钟", at: "2026-11-09T10:00:00Z", memoryId: "m_1" }] },
      ...over,
    }) as any;

  test("a settings frame sets the settings, what it remembers, and the partner's name", async () => {
    const { A } = await import("../src/app.ts");
    A.receive(frame());
    expect(A.settings?.defaultAfterMin).toBe(30);
    expect(A.mem?.noted.map((n) => n.title)).toEqual(["测试统一用假时钟"]);
    expect(A.S.personaName).toBe("小鸭");
  });

  test("forgetting says how: in Mem, or only hidden here", async () => {
    const { A } = await import("../src/app.ts");
    A.L = strings("zh");
    const sent: unknown[] = [];
    A.send = (f) => void sent.push(f);
    A.receive(frame());
    A.forget(7);
    expect(sent[0]).toEqual({ t: "memory_forget", seq: 7 });
    expect(A.mem?.noted).toEqual([]); // gone at once
    A.receive(frame({ mem: { state: "connected", noted: [] }, forgot: { seq: 7, how: "mem" } }));
    expect(A.toasts.at(-1)?.text).toBe("忘掉了：测试统一用假时钟");
    A.receive(frame({ mem: { state: "connected", noted: [{ seq: 8, title: "回复要短", at: "2026-11-09T10:00:00Z" }] } }));
    A.forget(8);
    A.receive(frame({ mem: { state: "connected", noted: [] }, forgot: { seq: 8, how: "hidden" } }));
    expect(A.toasts.at(-1)?.text).toBe("这里不再显示「回复要短」；Nowledge Mem 里那条还在。");
  });

  test("a change shows at once and goes to the server", async () => {
    const { A } = await import("../src/app.ts");
    const sent: unknown[] = [];
    A.send = (f) => void sent.push(f);
    A.receive(frame());
    A.setSettings({ language: "zh", defaultAfterMin: 60 });
    expect(A.settings).toMatchObject({ language: "zh", defaultAfterMin: 60 });
    expect(sent).toEqual([{ t: "settings_set", patch: { language: "zh", defaultAfterMin: 60 } }]);
  });
});

describe("brand pass (D74, D78)", () => {
  test("the outcome's first sentence is its headline; the rest is said under it", () => {
    expect(splitOutcome("改成等 flush 完成的信号，不再写死 200ms。连跑 50 遍全过。")).toEqual(["改成等 flush 完成的信号，不再写死 200ms。", "连跑 50 遍全过。"]);
    expect(splitOutcome("1.41 removed TcpStream::into_std; 4 places don't build. main is untouched.")).toEqual(["1.41 removed TcpStream::into_std; 4 places don't build.", "main is untouched."]);
    expect(splitOutcome("Done")).toEqual(["Done", ""]);
    expect(splitOutcome("x".repeat(120))).toEqual(["", "x".repeat(120)]);
  });
  test("CJK and Latin get a display-only quarter-em gap that copying takes back out", () => {
    const shown = autospace("在MacBook上跑了50遍，已有 space 的不动。");
    expect(shown).toBe("在\u2005MacBook\u2005上跑了\u200550\u2005遍，已有 space 的不动。");
    expect(unspace(shown)).toBe("在MacBook上跑了50遍，已有 space 的不动。");
    expect(autospace("plain English 1.41")).toBe("plain English 1.41");
  });
});

describe("the quiet conversation (D104)", () => {
  test("activity frames keep the step and when this client first saw it; null ends the turn at the channel head", () => {
    const S = new Store();
    S.apply({ t: "events", events: [ev("user_msg", { text: "hi" })] });
    const at = new Date().toISOString();
    S.apply({ t: "activity", activity: { step: "thinking", since: at, stepSince: at } });
    const first = S.activity!;
    expect(first.step).toBe("thinking");
    S.apply({ t: "activity", activity: { step: "thinking", since: at, stepSince: at } });
    expect(S.activity).toBe(first); // the same step keeps its clock
    S.apply({ t: "activity", activity: { step: "recalling", since: at, stepSince: at } });
    expect(S.activity!.step).toBe("recalling");
    S.apply({ t: "events", events: [ev("ack", { jobId: "j1", text: "On it.", replyTo: seq - 1 })] });
    S.apply({ t: "activity", activity: null });
    expect(S.activity).toBeUndefined();
    expect(S.activityEndedAt).toBe(S.channelSeq);
  });
  test("noted lines are kept for Details, not as channel rows", () => {
    const S = new Store();
    const u = ev("user_msg", { text: "fix it" });
    S.apply({ t: "events", events: [u, ev("ai_msg", { text: "Fixed.", replyTo: u.seq }), ev("memory_noted", { title: "Tests use a fake clock", replyTo: u.seq })] });
    expect(S.channel.length).toBe(2);
    expect(S.noted.map((n) => [n.title, n.replyTo])).toEqual([["Tests use a fake clock", u.seq]]);
  });
});

describe("New task (D128)", () => {
  const options = {
    t: "task_new_options",
    places: [
      { place: { kind: "repo", device: "local", repoPath: "/r/ducter" }, name: "ducter", defaultBranch: "main", branches: ["main", "release/0.0.1"] },
      { place: { kind: "none" }, name: "" },
    ],
    candidates: [
      { harness: "claude-code", model: "opus", reason: { kind: "fit" } },
      { harness: "codex", reason: { kind: "fast" } },
      { harness: "pi", reason: { kind: "fit" }, blocked: "signed_out" },
    ],
  } as any;

  test("the sheet asks what it offers, starts with the user's pick, and says a refusal in place", async () => {
    const { A } = await import("../src/app.ts");
    A.L = strings("zh");
    const sent: any[] = [];
    A.send = (f) => void sent.push(f);
    A.S.welcomed = true;
    A.status = "connected";
    A.openNewTask();
    expect(A.sheet).toEqual({ kind: "newtask" });
    expect(sent.at(-1)).toEqual({ t: "task_new_options" });
    A.receive(options);
    expect(A.chosenPlace().name).toBe("ducter");
    expect(A.chosenCandidate()).toMatchObject({ c: { harness: "claude-code" }, picked: false });
    expect(A.startNewTask()).toBe(false);
    expect(A.newTaskError()).toBe("先写一句要它做什么。");
    A.nt.words = "  把结算按钮藏起来  ";
    // The empty-words line goes once there are words, and a reopened sheet starts with none.
    expect(A.newTaskError()).toBe("");
    A.nt.words = "";
    A.startNewTask();
    A.openNewTask();
    expect(A.newTaskError()).toBe("");
    A.receive(options);
    A.nt.words = "  把结算按钮藏起来  ";
    A.nt.pick = "codex/";
    A.nt.branch = "release/0.0.1";
    expect(A.startNewTask()).toBe(true);
    const f = sent.at(-1);
    expect(f).toMatchObject({ t: "task_new", words: "把结算按钮藏起来", place: { kind: "repo", repoPath: "/r/ducter", baseBranch: "release/0.0.1" }, harness: "codex" });
    A.receive({ t: "task_new_result", ok: false, clientId: f.clientId, reason: "offline", message: "MacBook is offline" } as any);
    expect(A.nt.err).toBe("那台设备现在连不上。");
    expect(A.nt.words).toContain("结算");
    expect(A.sheet).toEqual({ kind: "newtask" });
  });

  test("the top candidate is never sent as a pick; no particular place sends no place", async () => {
    const { A } = await import("../src/app.ts");
    const sent: any[] = [];
    A.send = (f) => void sent.push(f);
    A.S.welcomed = true;
    A.status = "connected";
    A.openNewTask({ kind: "none" });
    A.receive(options);
    A.nt.words = "查下周五去上海最早的高铁";
    A.startNewTask();
    const f = sent.at(-1);
    expect(f.place).toBeUndefined();
    expect(f.harness).toBeUndefined();
  });

  test("an opened task and `ducter open` show the task", async () => {
    const g = globalThis as any;
    const had = { location: g.location, history: g.history, scrollTo: g.scrollTo };
    g.location = { hash: "", pathname: "/" };
    g.history = { pushState: (_: unknown, __: string, h: string) => void (g.location.hash = h) };
    g.scrollTo = () => {};
    try {
      const { A } = await import("../src/app.ts");
      const sent: any[] = [];
      A.send = (f) => void sent.push(f);
      A.S.welcomed = true;
      A.status = "connected";
      A.openNewTask();
      A.receive(options);
      A.nt.words = "修一下 CI";
      A.startNewTask();
      A.receive({ t: "task_new_result", ok: true, clientId: sent.at(-1).clientId, taskId: "t9" } as any);
      expect(A.route).toEqual({ name: "task", id: "t9" });
      expect(A.sheet).toBeNull();
      A.receive({ t: "open_task", taskId: "t3" } as any);
      expect(A.route).toEqual({ name: "task", id: "t3" });
    } finally {
      Object.assign(g, had);
    }
  });
});

describe("D150: zh copy spaces a filled-in name (D78)", () => {
  test("Han against Latin gets a space; Han against Han stays flush", () => {
    const zh = strings("zh");
    expect(zh.t("partner.header", "hel", "Codex")).toBe("住在 hel 上 · 用 Codex 想事情");
    expect(zh.t("partner.header", "这台 Mac", "Codex")).toBe("住在这台 Mac 上 · 用 Codex 想事情");
  });
});
