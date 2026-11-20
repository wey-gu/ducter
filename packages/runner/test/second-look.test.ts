// D437: report_to_main hands a result to another AI's look first (core's second-look.ts, a fake
// here): the task is told it was reported and to end its turn, nothing is logged yet, the turn that
// ends on it owes no nudge, and Ducter's words with what was found reach it as a new turn.
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies } from "@ducter/protocol";
import type { HarnessEvent, HarnessPort, HarnessSession, SessionSpec } from "@ducter/protocol/src/internal.ts";
import { createRunner, NUDGE, registerTaskTools } from "../src/index.ts";
import { createFakeCore, waitFor, type FakeCore } from "./fake-core.ts";

let dir: string;
let core: FakeCore;
const taken: Bodies["report"][] = [];
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ducter-look-test-"));
  core = createFakeCore(join(dir, "data"));
  taken.length = 0;
  registerTaskTools(core, {
    secondLook: {
      heldWords: "Reported. Before the user sees it, another AI reads it once. End your turn now.",
      take(taskId, body) {
        if (body.state !== "done") return false;
        taken.push(body);
        // What core's look logs as it begins (the runner hears it as reported).
        core.log.append({ stream: `task:${taskId}`, origin: "task", kind: "task_event", body: { taskId, role: "system", from: "runner", raw: { secondLook: { phase: "looking", by: "claude-code", held: body, what: "code" } } } });
        return true;
      },
    },
  });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const turnEnd: HarnessEvent = { role: "system", text: "turn completed", turnEnd: true, raw: { kind: "turn_ended", outcome: "completed" } };

test("a done report taken by the look: held words back, nothing logged, no nudge after the turn; the fix ask arrives as Ducter's words", async () => {
  const fake = new FakePort();
  const runner = createRunner(core, { harness: fake, newId: () => "tsk00001", parkIdleMs: 10_000 });
  const card = await runner.openTask({ persona: "p1", title: "安装目录可配置", brief: "三个平台都要改" });
  await runner.whenStarted(card.taskId);
  const s = fake.sessions[0]!;
  const said = await core.call("report_to_main", { state: "done", summary: "改好了。", evidence: [{ kind: "log", label: "tests", ref: "bun test" }] }, card.taskId);
  expect(String(said)).toContain("another AI reads it once");
  expect(taken.length).toBe(1);
  expect(core.log.read({ stream: `task:${card.taskId}`, kinds: ["report"] }).length).toBe(0);
  s.emit(turnEnd);
  await Bun.sleep(80);
  expect(s.sent.map((x) => x.text)).not.toContain(NUDGE);
  // The look found something: Ducter tells the task (from "ducter", queued after the turn).
  await runner.send(card.taskId, "Before your result goes to the user, another AI (Claude Code) read it once against what they asked, with a clean context. It found:\n1. Windows 的 install.ps1 没改", "queue", "ducter");
  await waitFor(() => s.sent.some((x) => x.text.startsWith("Before your result goes to the user")), "the fix ask");
  const told = core.log.read({ stream: `task:${card.taskId}`, kinds: ["task_event"] }).map((e) => e.body as Bodies["task_event"]).find((b) => b.text?.startsWith("Before your result"));
  expect(told?.from).toBe("ducter");
  // A progress report goes straight on (the look lets it).
  await core.call("report_to_main", { state: "progress", summary: "在改 Windows 的脚本" }, card.taskId);
  expect(core.log.read({ stream: `task:${card.taskId}`, kinds: ["report"] }).length).toBe(1);
  await runner.dispose();
});

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
  async start(_spec: SessionSpec) {
    const s = new FakeSession(`fake-${this.sessions.length + 1}`);
    this.sessions.push(s);
    return s;
  }
  async available(): Promise<never> {
    throw new Error("forbidden");
  }
}
