// D661 (research/245 §3.3 rule 4): one cheap-model line per report, with B9's bounded retry;
// the newest report's line wins and an older report's late line never replaces it.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies } from "@ducter/protocol";
import { openLog, type LogStore } from "../src/log.ts";
import { createGists, gistOf, taskGistAsk } from "../src/gists.ts";

let dir = "";
let log: LogStore | undefined;
afterEach(() => {
  log?.close?.();
  log = undefined;
  if (dir) rmSync(dir, { recursive: true, force: true });
});

function boot() {
  dir = mkdtempSync(join(tmpdir(), "ducter-gist-"));
  log = openLog({ path: join(dir, "ducter.db"), persona: "default" });
  log.append({ stream: "task:t1", origin: "partner", kind: "task_open", body: { taskId: "t1", title: "修一下登录页", brief: "", place: { kind: "none" }, harness: "codex" } });
  return log;
}
const report = (l: LogStore, summary: string) =>
  l.append({ stream: "task:t1", origin: "task", kind: "report", body: { taskId: "t1", state: "progress", summary, questions: [], evidence: [] } });

describe("D661: a task's own words, one line per report", () => {
  test("a report gets one person-language line on the task's stream", async () => {
    const l = boot();
    const g = createGists({ log: l, ask: async () => ({ line: "登录页的测试修好了。" }) });
    const ev = report(l, "Fixed the flaky login test. Changed three files.");
    g.onEvent(ev);
    await g.whenIdle();
    expect(gistOf(l, "t1")).toMatchObject({ text: "登录页的测试修好了。", reportSeq: ev.seq });
    g.stop();
  });

  test("a failed ask is retried, then gives up: the raw text stays behind 它说", async () => {
    const l = boot();
    let calls = 0;
    const g = createGists({ log: l, retryMs: [0, 0], ask: async () => (++calls < 2 ? Promise.reject(new Error("no answer")) : Promise.resolve({ line: "第二次读到了。" })) });
    g.onEvent(report(l, "progress"));
    await g.whenIdle();
    expect(calls).toBe(2);
    expect(gistOf(l, "t1")?.text).toBe("第二次读到了。");
    g.stop();
  });

  test("an older report's late line never replaces a newer report's", async () => {
    const l = boot();
    let release!: (v: { line: string }) => void;
    const g = createGists({ log: l, ask: () => new Promise((r) => (release = r)) });
    const first = report(l, "first");
    g.onEvent(first);
    // The second report lands before the first's line is read (the ask is still in flight).
    const second = report(l, "second");
    g.onEvent(second);
    release({ line: "第一份的线" });
    await Bun.sleep(5);
    // The queue then asks the second; the fake resolves it after the first's event is written.
    release({ line: "第二份的线" });
    await g.whenIdle();
    const got = gistOf(l, "t1")!;
    expect(got.reportSeq).toBe(second.seq);
    expect(got.text).toBe("第二份的线");
    g.stop();
  });

  test("the parse keeps one line and never more", async () => {
    const ask = taskGistAsk(async () => ({ text: '{"line":"  a   b  "}' }));
    expect(await ask({ title: "t", report: "r", lang: "zh" })).toEqual({ line: "a b" });
  });
});
