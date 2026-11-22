// D479 (hel, 2026-11-22): 「再试试」 replying to smx2jjb3, a task opened before D477 recorded where or
// which repository, which couldn't start in /root/dev/mem (hel has no such folder). task_send sent it
// back to that same folder, it failed again, and the partner then said hel had a Mem repository
// (it has none). Now a task that couldn't start on its place is checked like a new open before it is
// sent; one that still can't is never sent, and the result says the facts and the verb (task_open
// replaces); the open that replaces it says where it opened and sets the old one aside.
import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PlacesPort } from "@ducter/protocol/src/internal.ts";
import type { Place, TaskCard } from "@ducter/protocol";
import { createPartner } from "../src/index.ts";
import { FakeClock, fakeCore, fakeRunner } from "./fakes.ts";

const OLD: Place = { kind: "folder", device: "local", path: "/root/dev/mem" };

function setup(places: PlacesPort, calls: { tool: string; args: Record<string, unknown> }[]) {
  const clock = new FakeClock();
  const fc = fakeCore(clock, mkdtempSync(join(tmpdir(), "ducter-retry-")));
  (fc.core as { places?: PlacesPort }).places = places;
  const card: TaskCard = {
    taskId: "smx2jjb3",
    persona: "p1",
    title: "在 hel 用 agy 审阅 Nowledge Mem 长文案",
    project: "",
    place: OLD,
    harness: "antigravity",
    attention: "failed",
    residency: "archived",
    openedAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    cant: { why: "no_folder", computer: "hel", what: "mem", path: "/root/dev/mem", device: "local" },
  };
  fc.cards.set(card.taskId, card);
  const heard: Record<string, unknown>[] = [];
  const fr = fakeRunner(async (_input, s) => {
    s.say("好，我再试一次。");
    for (const c of calls) heard.push((await fc.callTool(c.tool, c.args)) as Record<string, unknown>);
    s.end();
  });
  fr.bindCards(fc.cards);
  const partner = createPartner(fc.core, fr.runner, { now: clock.now, persistState: false, onError: () => {} });
  return { fc, fr, partner, heard };
}

const noFolder: PlacesPort = {
  preflight: async (a) =>
    a.place.kind === "folder"
      ? { ok: false, error: `Not opened: hel has no folder ${a.place.path}. Never guess another path.` }
      : { ok: true, place: { kind: "repo", device: "local", repoPath: "/root/dev/mem", clone: "nowledge-co/mem" } as Place, how: "clone", computer: "hel", repo: "nowledge-co/mem" },
  quick: () => false,
  cantStart: async () => ({ why: "no_folder", computer: "hel", what: "mem", line: "" }),
  replan: async () => ({ ok: false, message: "" }),
  nameOf: (d) => (d === "local" ? "hel" : d),
};

test("a task that couldn't start on a folder that still isn't there is not sent back to it: the facts and task_open replaces come back", async () => {
  const s = setup(noFolder, [{ tool: "task_send", args: { taskId: "smx2jjb3", text: "再试试" } }]);
  s.partner.onTrigger(s.fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "再试试，只在 hel 上做" } }));
  await s.partner.idle();
  expect(s.fr.sent).toEqual([]);
  const r = s.heard[0] as { ok: boolean; error: string };
  expect(r.ok).toBe(false);
  expect(r.error).toContain("never started");
  expect(r.error).toContain("hel has no folder /root/dev/mem");
  expect(r.error).toContain('replaces "smx2jjb3"');
});

test("once its place holds again (the folder is there now), the task is sent as before", async () => {
  const there: PlacesPort = { ...noFolder, preflight: async (a) => ({ ok: true, place: a.place }) };
  const s = setup(there, [{ tool: "task_send", args: { taskId: "smx2jjb3", text: "再试试" } }]);
  s.partner.onTrigger(s.fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "再试试" } }));
  await s.partner.idle();
  expect(s.fr.sent.map((x) => x.taskId)).toEqual(["smx2jjb3"]);
  expect((s.heard[0] as { backTo?: string }).backTo).toBe("on hel, in /root/dev/mem");
});

test("task_open replaces: recorded on the new task, and its result says where it opened and what is cloned there", async () => {
  const s = setup(noFolder, [
    { tool: "task_open", args: { title: "审阅 Nowledge Mem 长文案", brief: "Review the long copy in Nowledge Mem.", place: { kind: "repo", remote: "nowledge-co/mem", device: "hel" }, where: { on: "hel", only: true }, replaces: "smx2jjb3", harness: "antigravity" } },
    { tool: "task_open", args: { title: "x", brief: "x", replaces: "nope" } },
  ]);
  s.partner.onTrigger(s.fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "再试试，只在 hel 上做" } }));
  await s.partner.idle();
  expect(s.fr.opened).toHaveLength(1);
  expect(s.fr.opened[0]).toMatchObject({ replaces: "smx2jjb3" });
  const r = s.heard[0] as { ok: boolean; opened: string; replaced: string };
  expect(r.ok).toBe(true);
  expect(r.opened).toBe("on hel, in /root/dev/mem, cloning nowledge-co/mem there first");
  expect(r.replaced).toContain("smx2jjb3");
  expect(s.heard[1]).toMatchObject({ ok: false });
  expect(String((s.heard[1] as { error: string }).error)).toContain("no task nope");
});

test("the line before a refused send is the ack of the task opened in its stead: one line, not two", async () => {
  const s = setup(noFolder, [
    { tool: "task_send", args: { taskId: "smx2jjb3", text: "再试试" } },
    { tool: "task_open", args: { title: "审阅 Nowledge Mem 长文案", brief: "Review the long copy.", place: { kind: "repo", remote: "nowledge-co/mem", device: "hel" }, replaces: "smx2jjb3" } },
  ]);
  s.partner.onTrigger(s.fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "再试试，只在 hel 上做" } }));
  await s.partner.idle();
  const acks = s.fc.events.filter((e) => e.kind === "ack").map((e) => (e.body as { text: string }).text);
  expect(acks).toEqual(["好，我再试一次。"]);
  expect(s.fr.opened).toHaveLength(1);
});
