import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { LogEvent } from "@ducter/protocol";
import { buildWeb } from "../build.ts";
import { baseUrl, codeFromHash, deviceName, wsUrl } from "../src/conn.ts";
import { format, joinHan, langOfText, strings, TABLES } from "../src/i18n.ts";
import { markdown } from "../src/markdown.ts";
import { isOutside, Store } from "../src/store.ts";

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
});

describe("store (parity with the desktop store)", () => {
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

  test("a welcome from a Log that started over is stale", () => {
    const s = new Store();
    s.apply({ t: "events", events: [ev("user_msg", { text: "hi" })] });
    expect(s.stale({ t: "welcome", persona: "p", personaName: "D", headSeq: 0 })).toBe(true);
  });

  test("what counts as outside", () => {
    expect(isOutside("git push origin main")).toBe(true);
    expect(isOutside("gh pr create --draft")).toBe(true);
    expect(isOutside("git commit -m x")).toBe(false);
  });
});

describe("the committed bundle", () => {
  test("is what src builds to (run `bun run apps/web/build.ts` after changing src)", async () => {
    const built = await buildWeb();
    for (const [name, text] of Object.entries(built)) expect(await Bun.file(join(import.meta.dir, "..", "static", name)).text()).toBe(text);
  });
});
