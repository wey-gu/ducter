// D206: pictures reach a task as its agent's own image input; what a task shows comes back as
// media, copied into the home's store, only from the task's own folders.
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies, MediaRef } from "@ducter/protocol";
import type { HarnessEvent, HarnessPort, HarnessSession, SendImage, SessionSpec } from "@ducter/protocol/src/internal.ts";
import { createMediaStore } from "../../core/src/media.ts";
import { png } from "../../core/test/fixtures-media.ts";
import { codexCleanArgs } from "../src/oar.ts";
import { createRunner, registerTaskTools } from "../src/index.ts";
import { createFakeCore, waitFor, type FakeCore } from "./fake-core.ts";

class Session implements HarnessSession {
  sent: { text: string; mode: string; images?: SendImage[] }[] = [];
  canSteer = true;
  private done = false;
  private wake?: () => void;
  constructor(readonly id: string) {}
  busy() {
    return false;
  }
  async send(text: string, mode: "turn" | "steer" | "queue" = "turn", images?: SendImage[]) {
    this.sent.push({ text, mode, ...(images ? { images } : {}) });
  }
  async interrupt() {}
  async close() {
    this.done = true;
    this.wake?.();
  }
  events(): AsyncIterable<HarnessEvent> {
    const self = this;
    return {
      async *[Symbol.asyncIterator]() {
        while (!self.done) await new Promise<void>((r) => (self.wake = r));
      },
    };
  }
}

class Port implements HarnessPort {
  sessions: Session[] = [];
  specs: SessionSpec[] = [];
  async start(spec: SessionSpec) {
    this.specs.push(spec);
    const s = new Session(`s${this.sessions.length + 1}`);
    this.sessions.push(s);
    return s;
  }
  async available() {
    return [];
  }
}

let dir: string;
let core: FakeCore;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ducter-media-runner-"));
  core = createFakeCore(join(dir, "data"));
  core.media = createMediaStore(join(dir, "data"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test("a task's brief carries the user's pictures: the first turn hands them to the agent as files", async () => {
  const port = new Port();
  const runner = createRunner(core, { harness: port, newId: () => "tsk1" });
  const shot = core.media!.put(png(1290, 2796));
  const card = await runner.openTask({ persona: "p1", title: "看看这个报错", brief: "User's words: 这个报错怎么修", harness: "claude-code", media: [shot] });
  await runner.whenStarted(card.taskId);
  const first = port.sessions[0]!.sent[0]!;
  expect(first.images).toEqual([{ path: core.media!.path(shot.id)!, mediaType: "image/png" }]);
  expect(first.text).not.toContain("base64");
  const open = core.log.read({ stream: "task:tsk1", kinds: ["task_open"] }).at(-1)!.body as Bodies["task_open"];
  expect(open.media?.map((m) => m.id)).toEqual([shot.id]);
  // A picture sent later rides with the words, and the task's line keeps the ref (not the bytes).
  const later = core.media!.put(png(800, 600, 3));
  await runner.send(card.taskId, "还有这个", undefined, "user", "c1", [later]);
  const again = port.sessions[0]!.sent.at(-1)!;
  expect(again.images?.map((i) => i.path)).toEqual([core.media!.path(later.id)!]);
  const line = core.events.filter((e) => e.kind === "task_event").map((e) => e.body as Bodies["task_event"]).find((b) => b.clientId === "c1")!;
  expect(line.media?.map((m) => m.id)).toEqual([later.id]);
  await runner.dispose();
});

test("an agent that can't see pictures gets the words and a line that says so", async () => {
  const port = new Port();
  const runner = createRunner(core, { harness: port, newId: () => "tsk2" });
  const shot = core.media!.put(png(640, 480));
  const card = await runner.openTask({ persona: "p1", title: "t", brief: "look at this", harness: "deepseek-harness", media: [shot] });
  await runner.whenStarted(card.taskId);
  const first = port.sessions[0]!.sent[0]!;
  expect(first.images).toBeUndefined();
  expect(first.text).toContain("DeepSeek Harness can't see pictures");
  await runner.dispose();
});

test("report_to_main show: files from the task's own folders become media; anything else is refused with a line", async () => {
  const port = new Port();
  const runner = createRunner(core, { harness: port, newId: () => "tsk3" });
  registerTaskTools(core, { shown: (id, paths) => runner.shown(id, paths) });
  const card = await runner.openTask({ persona: "p1", title: "画一只猫", brief: "draw a cat", harness: "codex" });
  await runner.whenStarted(card.taskId);
  const cwd = port.specs[0]!.cwd!;
  mkdirSync(cwd, { recursive: true });
  writeFileSync(join(cwd, "cat.png"), png(1024, 1024, 7));
  writeFileSync(join(cwd, "notes.pdf"), "%PDF-1.7 fake");
  const outside = join(dir, "secret.png");
  writeFileSync(outside, png(10, 10, 8));
  symlinkSync(outside, join(cwd, "link.png"));
  const reply = (await core.call("report_to_main", { state: "done", summary: "画好了", show: ["cat.png", join(cwd, "notes.pdf"), outside, "link.png", "missing.png"] }, card.taskId)) as string;
  const r = core.events.filter((e) => e.kind === "report").at(-1)!.body as Bodies["report"];
  expect(r.media?.map((m: MediaRef) => [m.type, m.name, m.w, m.from?.taskId])).toEqual([
    ["image/png", "cat.png", 1024, card.taskId],
    ["application/pdf", "notes.pdf", undefined, card.taskId],
  ]);
  expect(reply).toContain("Not shown:");
  expect(reply).toContain("only files in your working folder");
  expect(reply).toContain("missing.png: no such file");
  await runner.dispose();
});

test("a task on Codex keeps image generation; the partner's clean setup leaves it off", () => {
  const task = codexCleanArgs(undefined, [], { nativeTools: true }).join(" ");
  const partner = codexCleanArgs(undefined, []).join(" ");
  expect(task).not.toContain("features.image_generation=false");
  expect(partner).toContain("features.image_generation=false");
});
