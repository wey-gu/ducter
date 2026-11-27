// #254: a task that shows files with a question (show + state needs_input) must carry them on
// the decision itself, so every client draws them with the question and before the person
// answers. A done report keeps D206: its files ride the report and the partner's relay.
import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import type { Bodies, MediaRef } from "@ducter/protocol";
import { FakeClock } from "../src/clock.ts";
import { createDecisions } from "../src/decisions.ts";
import { openLog } from "../src/log.ts";
import { createRegistry } from "../src/registry.ts";
import { openTask, report, tempDir, tick } from "./helpers.ts";

let cleanup = () => {};
afterEach(() => cleanup());

function setup() {
  const t = tempDir();
  cleanup = t.cleanup;
  const clock = new FakeClock();
  const log = openLog({ path: join(t.dir, "ducter.db"), persona: "default", clock });
  const tasks = createRegistry(log, clock);
  createDecisions({ log, tasks, clock });
  return { log, tasks, clock };
}

const ref = (name: string, type = "image/png"): MediaRef => ({ id: name.padEnd(64, "0").slice(0, 64), type, bytes: 1234, k: "k" });
const decisions = (log: ReturnType<typeof openLog>) => log.read({}).filter((e) => e.kind === "decision").map((e) => e.body as Bodies["decision"]);

test("a needs_input report with show puts its files on the decision", async () => {
  const { log } = setup();
  openTask(log, "t1");
  const shot = ref("shot");
  const pdf = ref("pdf", "application/pdf");
  report(log, "t1", {
    state: "needs_input",
    summary: "看一下截图和报告，结论站得住吗？",
    media: [shot, pdf],
    questions: [{ id: "q", text: "按这个结论发出去吗？", blocking: true, reversible: false }],
  });
  await tick();
  const [d] = decisions(log);
  expect(d!.media).toEqual([shot, pdf]);
  // The report keeps its own media: the partner's render and the copy in the Log are unchanged.
  const r = log.read({ kinds: ["report"] })[0]!.body as Bodies["report"];
  expect(r.media).toEqual([shot, pdf]);
});

test("every question a report makes carries the same files; a done report makes no card", async () => {
  const { log } = setup();
  openTask(log, "t1");
  const a = ref("a");
  const b = ref("b", "text/markdown");
  report(log, "t1", {
    state: "needs_input",
    summary: "Two things.",
    media: [a, b],
    questions: [
      { id: "q1", text: "First?", blocking: true, reversible: false },
      { id: "q2", text: "Second?", blocking: true, reversible: false },
    ],
  });
  // A done report with files still rides D206: no card, its media stays on the report.
  report(log, "t1", { state: "done", summary: "Finished.", media: [a] });
  await tick();
  expect(decisions(log).map((d) => d.media)).toEqual([
    [a, b],
    [a, b],
  ]);
});

test("a report whose blocking question comes with done state still carries its files on the card", async () => {
  const { log } = setup();
  openTask(log, "t1");
  const a = ref("done-ask");
  report(log, "t1", {
    state: "done",
    summary: "One thing left.",
    media: [a],
    questions: [{ id: "q", text: "Merge it?", blocking: true, reversible: false }],
  });
  await tick();
  expect(decisions(log)[0]!.media).toEqual([a]);
});
