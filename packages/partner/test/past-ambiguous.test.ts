// D391: when task_find's first two fit the user's words alike and the words name neither, a
// task_send or task_fork to either in that turn is refused with a short error (ask which first);
// words that name one (a word only its title has, or its day) let it through.
import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PastItem, TaskCard } from "../../protocol/src/index.ts";
import { createPartner } from "../src/partner.ts";
import { FakeClock, fakeCore, fakeRunner, type Script } from "./fakes.ts";

const NOW = Date.parse("2026-11-19T10:00:00Z");
const item = (taskId: string, title: string, project: string, daysAgo: number): PastItem => ({ taskId, title, project, harness: "claude-code", openedAt: new Date(NOW - daysAgo * 86_400_000).toISOString(), updatedAt: new Date(NOW - daysAgo * 86_400_000).toISOString(), attention: "done", kind: "fix" });
const A = item("t_bh", "hawdb's bloom filter has too many false positives", "hawdb", 6);
const B = item("t_bm", "mem search's bloom filter uses too much memory", "nowledge-mem", 5);

function setup(script: Script, scores = [10, 9.4]) {
  const clock = new FakeClock();
  clock.t = NOW;
  const fc = fakeCore(clock, mkdtempSync(join(tmpdir(), "ducter-ambig-")));
  for (const it of [A, B]) fc.cards.set(it.taskId, { taskId: it.taskId, persona: fc.core.persona.id, title: it.title, project: it.project, place: { kind: "none" }, harness: "claude-code", attention: "done", residency: "cold", openedAt: it.openedAt, updatedAt: it.updatedAt } as TaskCard);
  (fc.core as unknown as { past: unknown; redo: unknown }).past = { query: () => ({ items: [A, B], total: 2, scores }) };
  (fc.core as unknown as { past: unknown; redo: unknown }).redo = { steps: async () => ({ steps: [], repo: false }), fork: async () => ({ ok: false, step: 1, message: "not in this test" }) };
  const fr = fakeRunner(script);
  fr.bindCards(fc.cards);
  const partner = createPartner(fc.core, fr.runner, { now: clock.now, persistState: false, onError: () => {} });
  const user = (text: string) => partner.onTrigger(fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text } }));
  return { fc, partner, user, fr };
}

type R = { ok: boolean; error?: string };

test("two alike, named by neither: a send and a redo to either are refused, with both named", async () => {
  let send: R | undefined;
  let fork: R | undefined;
  const { fc, partner, user } = setup(async (_i, s) => {
    await fc.callTool("task_find", { words: "bloom filter last week" });
    send = (await fc.callTool("task_send", { taskId: "t_bh", text: "pick it back up" })) as R;
    fork = (await fc.callTool("task_fork", { taskId: "t_bm" })) as R;
    s.say("Which one: the hawdb false positives (Nov 13) or the mem memory one (Nov 14)?");
    s.end();
  });
  user("pick the bloom filter one from last week back up");
  await partner.idle();
  expect(send!.ok).toBe(false);
  expect(send!.error).toMatch(/Ask which first/);
  expect(send!.error).toContain("hawdb's bloom filter");
  expect(fork!.ok).toBe(false);
});

test("the user's words name one (its repo, or its day): the send goes through", async () => {
  for (const words of ["pick the hawdb bloom filter one back up", "the bloom filter one from Nov 14, carry on"]) {
    let send: R | undefined;
    const { fc, partner, user } = setup(async (_i, s) => {
      await fc.callTool("task_find", { words: "bloom filter" });
      send = (await fc.callTool("task_send", { taskId: words.includes("hawdb") ? "t_bh" : "t_bm", text: "carry on" })) as R;
      s.end();
    });
    user(words);
    await partner.idle();
    expect(send!.error ?? "").not.toMatch(/Ask which first/);
  }
});

test("one clearly ahead: no refusal", async () => {
  let send: R | undefined;
  const { fc, partner, user } = setup(async (_i, s) => {
    await fc.callTool("task_find", { words: "bloom filter" });
    send = (await fc.callTool("task_send", { taskId: "t_bh", text: "carry on" })) as R;
    s.end();
  }, [10, 6]);
  user("pick the bloom filter one back up");
  await partner.idle();
  expect(send!.error ?? "").not.toMatch(/Ask which first/);
});
