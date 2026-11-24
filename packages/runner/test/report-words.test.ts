// D349: a report is written for the person, a checkpoint is the task's own note. Seen live on a
// Codex watcher (a PR-review loop on nowledge-co): its checkpoints became a ledger
// ("Round58完成…16checks15success1preuninstallrunning…") and its reports repeated the whole state
// every round. Nothing in Ducter stripped spaces; the words were the model's.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies } from "@ducter/protocol";
import type { HarnessEvent, HarnessPort, HarnessSession, SessionSpec } from "@ducter/protocol/src/internal.ts";
import { blocksOf } from "@ducter/protocol/src/transcript.ts";
import { createRunner, registerTaskTools, taskBrief } from "../src/index.ts";
import { crammed, gluedRuns, normalizeReport } from "../src/tools.ts";
import { createFakeCore, waitFor, type FakeCore } from "./fake-core.ts";

const LIVE_CHECKPOINT =
  "Round58完成，round58/queue58/ledger与资格专项保存。末扫5requests4mentions去重7，10419newf098其余稳定。root+agent关闭依赖资格P2：fingerprint与httparse集合同步，Root13447477393437/1307exec1304pass3skip。16checks15success1preuninstallrunning。";

describe("glued runs (D349)", () => {
  test("the live notes are found", () => {
    expect(gluedRuns(LIVE_CHECKPOINT)).toEqual(["5requests4mentions", "10419newf098", "16checks15success1preuninstallrunning"]); // "Root…/1307exec…" has a slash: left as a path might be
    expect(crammed(LIVE_CHECKPOINT)).toBe(true);
  });

  test("ordinary words are not: names, hashes, versions, paths, URLs, numbers with their units", () => {
    for (const s of [
      "16 项检查，15 项通过，1 项还在跑。",
      "16 checks: 15 passed, 1 still running.",
      "Round58 is done; P2 closed. H264 and iPhone15Pro are fine on gpt-5.5.",
      "Commit f09837991e3afcee8f9bb67c411288a19f4a6106 is on ducter/review-10419.",
      "See https://github.com/nowledge-co/mem/pull/10419 and ~/dev/mem/src-tauri/Cargo.toml.",
      "v1.2.3-rc4 builds; x86_64 and arm64 both pass.",
      "nowledge-co 没有新的待审 PR。",
    ])
      expect(crammed(s)).toBe(false);
  });

  test("a summary keeps its spaces: nothing in the report path takes them out", () => {
    const r = normalizeReport("t1", { state: "progress", summary: "  16 checks, 15 passed, 1 still running.  " });
    expect(r.summary).toBe("16 checks, 15 passed, 1 still running.");
  });
});

describe("the brief and the tools say the bar (D349)", () => {
  const b = taskBrief({ partnerName: "Ducter", taskId: "x", title: "t", brief: "b", place: { kind: "none" }, cwd: "/w", mcpServerName: "ducter", language: "zh-CN" });

  test("a summary is for the person: result first, plain spacing, no bookkeeping, only what changed", () => {
    expect(b).toContain("`summary` is written for the user, not for you");
    expect(b).toContain("Open with the result in one plain sentence");
    expect(b).toContain("at most a few short lines");
    expect(b).toContain('"16 项检查，15 项通过"');
    expect(b).toContain('never glued into notes like "16checks15success"');
    expect(b).toContain("round numbers, counters, ledger or note file names, ids, hashes");
    expect(b).toContain("Say what changed since your last report");
    expect(b).not.toContain('"nowledge-co 没有新的待审 PR"');
  });

  test("D394: a repeating round that found nothing new is silent; what reaches people waits for Go", () => {
    expect(b).toContain("a round that found nothing new for the user doesn't report at all");
    expect(b).toContain('never "nothing new" alone while things wait on them');
    expect(b).toContain("one `needs_input` report per round for all of them");
    expect(b).toContain("Post after Go, once.");
  });

  test("a checkpoint is the task's own note, never copied into a report", () => {
    expect(b).toContain("It is your own note, not a report: the user doesn't read it, so never copy it into `summary`.");
  });
});

// ---------- a fake run: a watcher with nothing new ----------

class FakeSession implements HarnessSession {
  sent: { text: string; mode: string }[] = [];
  canSteer = true;
  closed = false;
  private buf: HarnessEvent[] = [];
  private wake?: () => void;
  private done = false;
  constructor(readonly id: string) {}
  busy() {
    return false;
  }
  async send(text: string, mode: "turn" | "steer" | "queue" = "turn") {
    this.sent.push({ text, mode });
  }
  async interrupt() {}
  async close() {
    this.closed = true;
    this.done = true;
    this.wake?.();
  }
  emit(e: HarnessEvent) {
    this.buf.push(e);
    this.wake?.();
  }
  events(): AsyncIterable<HarnessEvent> {
    const self = this;
    return {
      async *[Symbol.asyncIterator]() {
        for (;;) {
          while (self.buf.length === 0 && !self.done) await new Promise<void>((r) => (self.wake = r));
          const v = self.buf.shift();
          if (!v) return;
          yield v;
        }
      },
    };
  }
}
class FakePort implements HarnessPort {
  sessions: FakeSession[] = [];
  specs: SessionSpec[] = [];
  async start(spec: SessionSpec) {
    this.specs.push(spec);
    const s = new FakeSession(`fake-${this.sessions.length + 1}`);
    this.sessions.push(s);
    return s;
  }
  async available(): Promise<never> {
    throw new Error("forbidden");
  }
}

let dir: string;
let core: FakeCore;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ducter-report-words-"));
  core = createFakeCore(join(dir, "data"));
  registerTaskTools(core);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("a watcher's report (D349; D394: a round with nothing new is silent)", () => {
  test("its notes go back once, it says one line, and the transcript shows that line and a quiet saved mark", async () => {
    const fake = new FakePort();
    const ids = ["tskwatch1"];
    const runner = createRunner(core, { harness: fake, newId: () => ids.shift()! });
    const card = await runner.openTask({ persona: "p1", title: "盯着 nowledge-co 的待审 PR", brief: "每 45 分钟看一次 nowledge-co 里请我 review 和提到我的 PR，有新的就告诉我。", language: "zh-CN" } as never);
    await runner.whenStarted(card.taskId);
    // The task's brief carries the rule for a round that found nothing.
    expect(fake.specs[0]!.appendSystemPrompt).toContain("a round that found nothing new for the user doesn't report at all");

    // Its own note: kept for it, whatever it looks like.
    expect(await core.call("checkpoint", { text: LIVE_CHECKPOINT }, card.taskId)).toBe("Checkpoint saved.");
    // The same notes as a report: sent back once to be written for the person, nothing logged.
    const back = String(await core.call("report_to_main", { state: "progress", summary: LIVE_CHECKPOINT }, card.taskId));
    expect(back).toStartWith("Not sent yet: this summary reads as your own notes (5requests4mentions, 10419newf098, 16checks15success1preuninstallrunning)");
    const reports = () => core.log.read({ stream: `task:${card.taskId}`, kinds: ["report"] }).map((e) => e.body as Bodies["report"]);
    expect(reports()).toEqual([]);
    // Written again for the person: one line.
    expect(String(await core.call("report_to_main", { state: "progress", summary: "nowledge-co 没有新的待审 PR。" }, card.taskId))).toStartWith("Reported.");
    expect(reports().map((r) => r.summary)).toEqual(["nowledge-co 没有新的待审 PR。"]);

    // The transcript: the note is one quiet 保存了进度, never its words; the report is its one line.
    const evs = core.log.read({ stream: `task:${card.taskId}` });
    const blocks = blocksOf("codex", evs, false, { lastReport: undefined });
    expect(blocks.filter((b) => b.k === "saved")).toHaveLength(1);
    expect(JSON.stringify(blocks)).not.toContain("16checks");
    expect(blocks.filter((b) => b.k === "report").map((b) => (b as { text: string }).text)).toEqual(["nowledge-co 没有新的待审 PR。"]);
    await runner.dispose();
  });

  test("asked once: a second crammed summary goes as it is (never a loop)", async () => {
    const fake = new FakePort();
    const runner = createRunner(core, { harness: fake, newId: () => "tskwatch2" });
    const card = await runner.openTask({ persona: "p1", title: "t", brief: "b" });
    await runner.whenStarted(card.taskId);
    expect(String(await core.call("report_to_main", { state: "progress", summary: LIVE_CHECKPOINT }, card.taskId))).toStartWith("Not sent yet");
    expect(String(await core.call("report_to_main", { state: "progress", summary: LIVE_CHECKPOINT }, card.taskId))).toStartWith("Reported.");
    await waitFor(() => core.log.read({ stream: `task:${card.taskId}`, kinds: ["report"] }).length === 1, "the second one logged");
    await runner.dispose();
  });
});

// D528: hel's review rounds wrote 「下一轮将在 07:13 UTC 进行」: the brief names the person's zone.
test("the brief says times in the person's zone, never UTC", () => {
  const b = taskBrief({ partnerName: "Ducter", taskId: "x", title: "t", brief: "b", place: { kind: "none" } as never, cwd: "/w", mcpServerName: "ducter", zone: "Asia/Shanghai" });
  expect(b).toContain("is in the user's time zone, Asia/Shanghai");
  expect(b).toContain('never "UTC"');
});
