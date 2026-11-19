// D391 (hel, 2026-11-19): the author's first real hand-off. "10559 帮我用 codex astra 仔细做一下"
// on a to-do of nowledge-co/mem: the partner guessed /root/dev/mem on the server, the task failed
// at once. Now core checks the place before the task exists, a guessed path never wins, careful
// words make it think harder and check its work, and a clone is said in one line by code.
import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PlacesPort } from "@ducter/protocol/src/internal.ts";
import { createPartner } from "../src/index.ts";
import { FakeClock, fakeCore, fakeRunner } from "./fakes.ts";

const GUESS = { kind: "repo", device: "local", repoPath: "/root/dev/mem" };

function setup(places: PlacesPort, args: Record<string, unknown>) {
  const clock = new FakeClock();
  const fc = fakeCore(clock, mkdtempSync(join(tmpdir(), "ducter-first-take-")));
  (fc.core as { places?: PlacesPort }).places = places;
  let heard: { ok?: boolean; error?: string; note?: string } | undefined;
  const fr = fakeRunner(async (_input, s) => {
    s.say("好，我让 Codex 仔细做 10559，做完告诉你。");
    heard = (await fc.callTool("task_open", args)) as typeof heard;
    s.end();
  });
  const partner = createPartner(fc.core, fr.runner, { now: clock.now, persistState: false, onError: () => {} });
  return { fc, fr, partner, heard: () => heard };
}

test("a guessed path is replaced by the copy core found; 仔细 is high effort and a brief that checks its work", async () => {
  const seen: unknown[] = [];
  const places: PlacesPort = {
    async preflight(a) {
      seen.push(a);
      return { ok: true, place: { kind: "repo", device: "dev_mac", repoPath: "/Users/wey/dev/mem" }, how: "found", computer: "MacBook", repo: "mem" };
    },
    quick: () => false,
    cantStart: async () => ({ why: "no_repo", computer: "", what: "", line: "" }),
    replan: async () => ({ ok: false, message: "" }),
  };
  const s = setup(places, { title: "改进通用设置页", harness: "codex", model: "gpt-6.2-astra", place: GUESS, brief: "nowledge-co/mem#10559 Improve general setting page。预计 ~/dev/mem。" });
  s.partner.onTrigger(s.fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "10559 帮我用 codex astra 仔细做一下" } }));
  await s.partner.idle();
  expect(s.heard()?.ok).toBe(true);
  expect(s.fr.opened).toHaveLength(1);
  const o = s.fr.opened[0]!;
  expect(o.place).toEqual({ kind: "repo", device: "dev_mac", repoPath: "/Users/wey/dev/mem" });
  expect(o.effort).toBe("high");
  expect(o.brief).toContain("check the work");
  expect(o.brief).toContain("10559 帮我用 codex astra 仔细做一下");
  expect(seen[0]).toMatchObject({ place: GUESS, userTexts: ["10559 帮我用 codex astra 仔细做一下"] });
});

test("a place that can't be fixed opens no task: the model hears what to do instead", async () => {
  const places: PlacesPort = {
    preflight: async () => ({ ok: false, error: "Not opened: Hetzner Server has no git repository at /root/dev/mem. Never guess a path." }),
    quick: () => false,
    cantStart: async () => ({ why: "no_repo", computer: "", what: "", line: "" }),
    replan: async () => ({ ok: false, message: "" }),
  };
  const s = setup(places, { title: "x", place: GUESS, brief: "fix it" });
  s.partner.onTrigger(s.fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "fix it" } }));
  await s.partner.idle();
  expect(s.heard()).toMatchObject({ ok: false });
  expect(s.heard()?.error).toContain("Never guess a path");
  expect(s.fr.opened).toHaveLength(0);
});

test("no copy anywhere: cloned first, and Ducter says so itself in one line", async () => {
  const places: PlacesPort = {
    preflight: async () => ({ ok: true, place: { kind: "repo", device: "dev_mac", repoPath: "~/ducter/projects/mem", clone: "nowledge-co/mem" }, how: "clone", computer: "MacBook", repo: "mem", said: "mem 的代码还没在哪台电脑上，我先在 MacBook 上拉一份。" }),
    quick: () => false,
    cantStart: async () => ({ why: "no_repo", computer: "", what: "", line: "" }),
    replan: async () => ({ ok: false, message: "" }),
  };
  const s = setup(places, { title: "改进通用设置页", place: { kind: "repo", remote: "nowledge-co/mem" }, brief: "nowledge-co/mem#10559" });
  s.partner.onTrigger(s.fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "10559 做一下" } }));
  await s.partner.idle();
  expect(s.heard()?.ok).toBe(true);
  expect(s.heard()?.note).toContain("already told the user");
  expect(s.fr.opened[0]!.place).toMatchObject({ clone: "nowledge-co/mem" });
  expect(s.fr.opened[0]!.effort).toBeUndefined();
  const said = s.fc.events.filter((e) => e.kind === "ai_msg").map((e) => (e.body as { text: string }).text);
  expect(said.some((t) => t.includes("我先在 MacBook 上拉一份"))).toBe(true);
});
