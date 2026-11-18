// research/127 (live): "Run uname -a on Lab box", a lent server with no agent signed in. The
// home refused the task with a line for the partner ("… Tell the user in one line: …"), and the
// conversation's failed status line showed that instruction to the person as it was.
import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPartner, forPerson } from "../src/index.ts";
import { FakeClock, fakeCore, fakeRunner } from "./fakes.ts";

const LINE =
  "Lab box can't take this task: no AI agent is signed in there yet. No task was opened. Tell the user in one line: sign in an AI agent on Lab box (for example run claude or codex in a terminal there) and ask again, or say to do it on another computer.";

test("forPerson leaves out the partner's instruction, and keeps a line without one", () => {
  expect(forPerson(LINE)).toBe("Lab box can't take this task: no AI agent is signed in there yet. No task was opened.");
  expect(forPerson("can't reach hel")).toBe("can't reach hel");
});

test("a refused task_open: the partner hears the whole line; the person's status line has no instruction in it", async () => {
  const clock = new FakeClock();
  const fc = fakeCore(clock, mkdtempSync(join(tmpdir(), "ducter-refused-")));
  let heard: { ok?: boolean; error?: string } | undefined;
  const fr = fakeRunner(async (_input, s) => {
    heard = (await fc.callTool("task_open", { title: "Run uname -a on Lab box", place: { kind: "none", device: "Lab box" }, brief: "uname -a" })) as typeof heard;
    s.end();
  });
  fr.runner.openTask = async () => {
    throw new Error(LINE);
  };
  const partner = createPartner(fc.core, fr.runner, { now: clock.now, persistState: false, onError: () => {} });
  partner.onTrigger(fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "Run uname -a on Lab box" } }));
  await partner.idle();
  expect(heard?.ok).toBe(false);
  expect(heard?.error).toContain("Tell the user in one line");
  const failed = fc.events.filter((e) => e.kind === "job_status" && (e.body as { state?: string }).state === "failed");
  expect(failed).toHaveLength(1);
  expect((failed[0]!.body as { text: string }).text).toBe("Run uname -a on Lab box: Lab box can't take this task: no AI agent is signed in there yet. No task was opened.");
});
