// D602: a finished task an open PR still held (hel, 2026-11-26: 「跟进 Bridge 试用…」 done, its PR #11166
// merged, the duplicate draft #11179 open with a failing check) sat under 在等 for two days, and the
// helper's Keep held 「#11179 … CI 未通过」 for ever. A PR the task lets go (its report's let_go, or
// the person's 结束任务 / End task) holds nothing open: the task is done as it is, its Keep's item
// goes, and while the task is still at work the item says what it is (a duplicate draft, closable).
import { afterEach, describe, expect, test } from "bun:test";
import type { Bodies, OwnedSeen, ServerFrame } from "@ducter/protocol";
import { letGoPr } from "@ducter/protocol/src/owned.ts";
import { prGoesOn } from "@ducter/protocol/src/pr-state.ts";
import { startCore, type Core } from "../src/core.ts";
import { helperItems } from "../src/helpers.ts";
import { openTask, report, tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

function boot(): Core {
  const t = tempDir();
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5 });
  stops.push(t.cleanup, () => core.stop());
  core.setPartner({ onTrigger: () => {} });
  return core;
}

const ID = "5ykh7m6y";
const PR = "nowledge-co/mem#11179";
const seen = (): OwnedSeen => ({
  since: "2026-11-24T16:42:46.855Z",
  from: "integrate",
  ids: [],
  head: "8248c67f1957bfed83a83acce8b6e112402cad5d",
  ciFor: "8248c67f1957bfed83a83acce8b6e112402cad5d",
  state: "open",
  standing: { at: "2026-11-24T16:43:29.460Z", title: "ducter/task 5ykh7m6y", head: "8248c67f1957bfed83a83acce8b6e112402cad5d", draft: true, checks: { total: 3, passed: 2, failed: ["ci/pr-closing-references"], pending: [] } },
});

/** hel's task as it stood: done, its own draft PR open with a failing check. */
function heldTask(core: Core, attention: "done" | "working" = "done") {
  openTask(core.log, ID, "跟进 Bridge 试用指引 PR #11166");
  core.log.append({ stream: `task:${ID}`, origin: "system", kind: "owned_news", body: { taskId: ID, pr: PR, news: ["- CI 在 8248c67f19 上跑完了：3 项里 2 项通过，没过：ci/pr-closing-references"], seen: seen() } });
  if (attention === "done") report(core.log, ID, { state: "done", summary: "#11179 是 #11166 已合并内容的重复草稿。" });
  core.tasks.setState(ID, attention, "warm");
}

const items = (core: Core) => helperItems("nowledge-mem-pr-babysitter", { tasksOf: () => [[ID, "nowledge-mem-pr-babysitter"]], card: (t) => core.tasks.get(t) });

describe("D602: a PR let go holds nothing open", () => {
  test("before: the done task stands in 在等 under its PR, and the Keep holds it as CI failed", () => {
    const core = boot();
    heldTask(core);
    expect(prGoesOn(core.tasks.get(ID)!.prs)?.said.phase).toBe("failing");
    expect(core.tasks.onHand().counts.waiting).toBe(1);
    expect(items(core).map((x) => x.said?.phase)).toEqual(["failing"]);
  });

  test("the task's own let_go (a duplicate): done as it is, out of 在等, the Keep's item released", () => {
    const core = boot();
    heldTask(core);
    expect(letGoPr(core.log, ID, "https://github.com/nowledge-co/mem/pull/11179", "duplicate", "2026-11-26T08:26:50.000Z")).toBe("let go");
    const card = core.tasks.get(ID)!;
    expect(card.prs?.[0]?.letGo).toEqual({ why: "duplicate", at: "2026-11-26T08:26:50.000Z" });
    expect(prGoesOn(card.prs)).toBeUndefined();
    expect(core.tasks.onHand().counts.waiting).toBe(0);
    expect(items(core)).toEqual([]);
    // Once, and only what it owns.
    expect(letGoPr(core.log, ID, PR, "duplicate", "2026-11-26T08:27:00.000Z")).toBe("let go");
    expect(core.log.read({ stream: `task:${ID}`, kinds: ["owned_news"] }).filter((e) => (e.body as Bodies["owned_news"]).seen.letGo)).toHaveLength(1);
    expect(letGoPr(core.log, ID, "nowledge-co/mem#11166", "duplicate", "2026-11-26T08:27:00.000Z")).toBe("not owned");
  });

  test("a duplicate's status line while its task is still at work: 重复草稿, never CI failed", () => {
    const core = boot();
    heldTask(core, "working");
    letGoPr(core.log, ID, PR, "duplicate", "2026-11-26T08:26:50.000Z");
    expect(items(core).map((x) => x.said)).toEqual([{ phase: "duplicate", draft: true }]);
  });

  test("the Keep's item is released when its task is dropped", () => {
    const core = boot();
    heldTask(core, "working");
    expect(items(core)).toHaveLength(1);
    core.tasks.setState(ID, "dropped", "parked", "你说不用做了");
    expect(items(core)).toEqual([]);
  });

  test("结束任务 / End task from a client: every open PR it carries let go (ended), never closed", async () => {
    const core = boot();
    heldTask(core);
    const frames: ServerFrame[] = [];
    const ws = new WebSocket(core.url);
    ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
    await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
    stops.push(() => ws.close());
    ws.send(JSON.stringify({ t: "hello" }));
    ws.send(JSON.stringify({ t: "task_action", taskId: ID, action: "end" }));
    for (let i = 0; i < 200 && !frames.some((f) => f.t === "action_result"); i++) await Bun.sleep(10);
    expect(frames.find((f) => f.t === "action_result")).toMatchObject({ action: "end", ok: true });
    expect(core.tasks.get(ID)!.prs?.[0]).toMatchObject({ state: "open", letGo: { why: "ended" } });
    expect(["done", "done_claimed"]).toContain(core.tasks.get(ID)!.attention);
    expect(items(core)).toEqual([]);
    // 不用跟了 on a Keep item whose task is still at work: ending it puts it down, and its item goes.
    core.tasks.setState(ID, "working", "hot");
    ws.send(JSON.stringify({ t: "task_action", taskId: ID, action: "end" }));
    for (let i = 0; i < 200 && frames.filter((f) => f.t === "action_result").length < 2; i++) await Bun.sleep(10);
    expect(frames.filter((f) => f.t === "action_result")[1]).toMatchObject({ action: "end", ok: true });
    expect(core.tasks.get(ID)!.attention).toBe("dropped");
    expect(items(core)).toEqual([]);
  });
});
