// D638: Go is answered at once, so the sheet leaves the screen the moment it is pressed: the
// existing toast says it went, the Go waits in the device's outbox until its answer comes (a phone
// that lost the link sends it after the next welcome, and core answers one clientId once), and a
// failure that arrives later is a toast, never a frozen sheet. The sheet never reopens itself.
import { beforeEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { A } from "../src/app.ts";
import { go, HS, onHandFrame } from "../src/handover.tsx";
import { memoryStore, Outbox } from "../src/outbox.ts";
import { strings } from "../src/i18n.ts";
import { boardGroups, finishedGroup } from "../src/groups-view.ts";
import { handState } from "../src/handover-view.ts";

const src = readFileSync(join(import.meta.dir, "..", "src", "handover.tsx"), "utf8");

beforeEach(() => {
  A.L = strings("zh");
  A.S.personaName = "小鸭";
  A.outbox = new Outbox(memoryStore());
  A.sheet = null;
  A.toasts = [];
  Object.assign(HS, { cid: "hand-t1", findCid: "", howCid: "", ticked: new Set(["acme/mem#412"]), note: "", notes: {}, noteOpen: new Set(), how: undefined, shape: undefined, device: undefined, harness: undefined, subject: undefined, bySubject: false, setId: undefined, sending: false, said: undefined, make: undefined, door: "do" });
});

test("Go closes the sheet at once, says it went, and keeps the Go until its answer", () => {
  A.sheet = { kind: "hand" };
  go();
  expect(A.sheet).toBeNull(); // nothing waits on the slow part
  expect(A.toasts.map((t) => t.text)).toContain("交给小鸭了");
  expect(HS.sending).toBe(true);
  // The Go itself is in the outbox, marked as the sheet's (so core answers it at once even for one).
  const kept = A.outbox.items.find((i) => i.kind === "hand");
  expect(kept && kept.kind === "hand" ? kept.clientId : "").toBe("hand-t1");
  expect(kept && kept.kind === "hand" ? kept.frame.sheet : false).toBe(true);
  // The answer settles it; the sheet stays shut and says nothing twice.
  expect(onHandFrame({ t: "pile_result", clientId: "hand-t1", op: "hand", ok: true, done: 1 } as never)).toBe(true);
  expect(HS.sending).toBe(false);
  expect(A.outbox.items.length).toBe(0);
  expect(A.sheet).toBeNull();
  expect(A.toasts.map((t) => t.text)).toEqual(["交给小鸭了"]);
});

test("a failure after Go is said in a toast, and nothing opens again by itself", () => {
  A.sheet = { kind: "hand" };
  go();
  onHandFrame({ t: "pile_result", clientId: "hand-t1", op: "hand", ok: false, error: "Those are taken already, or closed." } as never);
  expect(A.sheet).toBeNull();
  expect(HS.sending).toBe(false);
  expect(A.toasts.at(-1)!.text).toBe("没交出去：Those are taken already, or closed.");
  expect(A.outbox.items.length).toBe(0);
});

test("the phone that hears nothing is told it is still going, and a plan's Go says a plan first", () => {
  // The line after a few seconds is the sheet's own timer (never a spinner that could hang).
  expect(src).toMatch(/slowHandTimer = setTimeout\(\(\) => \{\n\s+if \(HS\.sending\) A\.toast\(t\("ho\.handed\.slow"/);
  // A plan's Go says what it makes (the sheet has already closed: the toast carries the shape).
  A.sheet = { kind: "hand" };
  HS.ticked = new Set(["acme/mem#412", "acme/mem#398"]);
  HS.how = { shape: "plan", shapes: ["plan"], where: { device: "local", name: "Mac", why: "home" }, wheres: [], who: { why: "usual" }, whos: [], cap: 3 };
  go();
  expect(A.toasts.at(-1)!.text).toBe("交给小鸭了：先出个方案，你点头再做");
});

test("a failure after Go stands on its card in 等你, even when nothing opened, and can be taken off", () => {
  const g = { id: "g1", name: "记忆提炼", order: "one_by_one" as const, by: "you" as const, persona: "p1", members: [], createdAt: "2026-11-27T00:00:00Z", hand: { shape: "plan" as const, items: [], error: "现在没有 AI agent 能接这个任务。" } };
  expect(handState(g.hand)).toBe("failed");
  const board = boardGroups([g], () => -1, () => undefined);
  expect(board.length).toBe(1);
  expect(board[0]!.lane).toBe(0); // 等你, where the person looks
  expect(board[0]!.rows).toEqual([]);
  expect(finishedGroup(board[0]!)).toMatchObject({ name: "记忆提炼", groupId: "g1", taskIds: [] });
});

test("a Go from a page before this one settles its outbox, and its failure is still said", () => {
  A.sheet = null;
  A.outbox.put({ kind: "hand", device: "local", clientId: "old-hand", frame: { t: "pile_hand", refs: ["acme/mem#1"], clientId: "old-hand", sheet: true }, at: 1 });
  expect(onHandFrame({ t: "pile_result", clientId: "old-hand", op: "hand", ok: false, error: "Those are taken already, or closed." } as never)).toBe(true);
  expect(A.outbox.items.length).toBe(0);
  expect(A.toasts.at(-1)!.text).toBe("没交出去：Those are taken already, or closed.");
  expect(A.sheet).toBeNull();
});
