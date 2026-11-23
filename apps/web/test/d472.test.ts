// D472 (hel, 2026-11-22): an Antigravity task in /root/dev/mem, which Hetzner Server didn't have,
// showed 没成 with 再试一次 only, each attempt "没能开始", the reason nowhere: an on_hand snapshot
// rebuilt the task's state without its cant. The page, each attempt and the brief now say the real
// reason with the real fix first. The Mac's d472_test.go checks the same.
import { afterAll, describe, expect, test } from "bun:test";
import type { CantStart } from "@ducter/protocol";
import { noteOf } from "@ducter/protocol/src/transcript.ts";
import { strings } from "../src/i18n.ts";

const NO_FOLDER: CantStart = { why: "no_folder", computer: "Hetzner Server", what: "mem", path: "/root/dev/mem", device: "local", harness: "antigravity", cloneHere: true, pickHere: true };
const card = (cant: CantStart) => ({ taskId: "smx2jjb3", persona: "default", title: "在 hel 用 Gemini 审改 Mem 长文案并开 PR", project: "", place: { kind: "folder", device: "local", path: "/root/dev/mem" }, harness: "antigravity", attention: "failed", residency: "archived", openedAt: "2026-11-22T02:59:30.000Z", updatedAt: "2026-11-22T02:59:31.000Z", reason: "x", cant });

// The page is one module-wide app: leave no computers behind for the next file (D488: d467, run
// after this file in another order, read them).
afterAll(async () => {
  const { A } = await import("../src/app.ts");
  A.devices = [];
  A.S.tasks.clear();
});

async function app(lang: "zh" | "en" = "zh") {
  const { A } = await import("../src/app.ts");
  const sent: any[] = [];
  A.L = strings(lang);
  A.send = (f: unknown) => void sent.push(f);
  A.S.tasks.clear();
  A.devices = [{ id: "home_hel", name: "Hetzner Server", home: true, state: "awake", harnesses: [] } as any, { id: "dev_mac", name: "Macbook Pro M3", state: "awake", harnesses: [] } as any];
  return { A, sent };
}

describe("D472: a task that couldn't start says why, with the real fix", () => {
  test("an on_hand snapshot keeps the cant (the page no longer falls back to 没成 / 再试一次)", async () => {
    const { A } = await app();
    const { cantOf } = await import("../src/store.ts");
    A.receive({ t: "events", events: [{ seq: 3, ts: "2026-11-22T02:59:31.000Z", persona: "default", stream: "task:smx2jjb3", origin: "system", kind: "task_state", body: { taskId: "smx2jjb3", attention: "failed", residency: "archived", cant: NO_FOLDER } }] } as any);
    A.receive({ t: "on_hand", onHand: { tasks: [card(NO_FOLDER)], counts: { needs_you: 0, working: 0, waiting: 0, done_today: 0 }, waiters: [], missed: [] } } as any);
    expect(cantOf(A.S.tasks.get("smx2jjb3")!)).toMatchObject({ why: "no_folder", cloneHere: true, pickHere: true });
  });

  test("no folder there: clone it onto that computer first, or choose a folder on it; never 再试一次 alone", async () => {
    await app();
    const { cantFixes, cantLine, cantHint } = await import("../src/cant.tsx");
    expect(cantLine(NO_FOLDER)).toBe("没能开始：Hetzner Server 上没有 mem 这个文件夹");
    const f = cantFixes(NO_FOLDER);
    expect(f.map((x) => [x.act, x.label, x.kind])).toEqual([
      ["clone_here", "拉一份到 Hetzner Server 上", "primary"],
      ["pick", "选 Hetzner Server 上的文件夹", "secondary"],
    ]);
    expect(cantHint(NO_FOLDER)).toContain("Hetzner Server 上的 Ducter 文件夹");
  });

  test("the others: install or sign in there, another computer the words named, what is known for 'other'", async () => {
    await app("en");
    const { cantFixes, cantLine } = await import("../src/cant.tsx");
    const so: CantStart = { why: "signed_out", computer: "Macbook Pro M3", what: "Antigravity", device: "dev_mac", harness: "antigravity" };
    expect(cantLine(so)).toBe("Couldn't start: Antigravity isn't signed in on Macbook Pro M3");
    expect(cantFixes(so).map((x) => x.label)).toEqual(["Sign in to Antigravity on Macbook Pro M3", "Try again"]);
    const moved: CantStart = { why: "not_installed", computer: "Macbook Pro M3", what: "Antigravity", device: "dev_mac", harness: "antigravity", elsewhere: { device: "local", name: "Hetzner Server" } };
    expect(cantFixes(moved).map((x) => x.label)).toEqual(["Install Antigravity on Macbook Pro M3", "Do it on Hetzner Server instead", "Try again"]);
    const other: CantStart = { why: "other", computer: "Macbook Pro M3", what: "Antigravity", detail: "git worktree add failed: fatal: invalid reference: release/0.9", more: "two\nlines" };
    expect(cantLine(other)).toBe("Couldn't start: Antigravity hit an error as it started on Macbook Pro M3");
    expect(cantFixes(other).map((x) => [x.act, x.kind])).toEqual([["reopen", "primary"], ["why", "text"]]);
    expect(cantLine({ why: "other", computer: "", what: "" })).toBe("Couldn't start: something went wrong as it started");
  });

  test("each attempt in the steps carries its cant", () => {
    expect(noteOf("failed to start: folder does not exist: /root/dev/mem", { cant: NO_FOLDER })).toMatchObject({ say: "error_start", bad: true, cant: { why: "no_folder" } });
    expect(noteOf("failed to start: boom", {})).toEqual({ say: "error_start", bad: true });
  });

  test("choose a folder: D455's sheet on that computer, and the folder chosen starts it there; one tap is one start", async () => {
    const { A, sent } = await app();
    A.receive({ t: "on_hand", onHand: { tasks: [card(NO_FOLDER)], counts: { needs_you: 0, working: 0, waiting: 0, done_today: 0 }, waiters: [], missed: [] } } as any);
    A.openFolderFor("smx2jjb3", "local");
    expect(A.addf).toMatchObject({ device: "home_hel", way: "choose", forTask: "smx2jjb3" });
    A.afPlaced({ name: "nowledge-mem", place: { kind: "repo", device: "local", repoPath: "/root/code/nowledge-mem" } });
    const go = sent.filter((f) => f.t === "task_action");
    expect(go).toEqual([{ t: "task_action", taskId: "smx2jjb3", action: "start_in", place: { kind: "repo", device: "local", repoPath: "/root/code/nowledge-mem" } }]);
    A.cantAction("smx2jjb3", "reopen");
    expect(sent.filter((f) => f.t === "task_action").length).toBe(1);
  });

  test("zh and en together", () => {
    const zh = strings("zh"), en = strings("en");
    for (const k of ["cant.other", "cant.other_bare", "cant.not_installed", "cant.signed_out", "cant.old", "cant.move", "cant.clone_to", "cant.pick", "cant.pick.title", "cant.pick.sub", "cant.place.hint", "cant.pick.hint", "cant.install", "cant.login", "cant.update", "cant.not_installed.hint", "cant.signed_out.hint", "cant.old.hint", "cant.why", "cant.why.close"]) {
      expect(zh.t(k)).not.toBe(k);
      expect(en.t(k)).not.toBe(k);
    }
  });
});
