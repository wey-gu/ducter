// D383: 给你做的 / Made for you from the conversation: made_find finds what Ducter made by the person's
// words and time words, and show puts it under the partner's next words as it is (a file the viewer
// opens, a table drawn again, a link); a file gone from its folder, or nothing found, is said plainly.
import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies, MediaRef, TaskCard } from "../../protocol/src/index.ts";
import { createMade } from "../../core/src/made.ts";
import { createPartner, type MadePort } from "../src/partner.ts";
import { FakeClock, fakeCore, fakeRunner, type Script } from "./fakes.ts";

const NOW = Date.parse("2026-11-19T10:00:00Z");
const PDF: MediaRef = { id: "f".repeat(64), type: "application/pdf", bytes: 48_000, name: "japan-visa-application.pdf", k: "fake.key", from: { taskId: "t_visa" } };
const ITIN: MediaRef = { id: "e".repeat(64), type: "text/markdown", bytes: 1_800, name: "kyoto-itinerary.md", k: "fake.key" };

function setup(script: Script, o: { gone?: boolean } = {}) {
  const clock = new FakeClock();
  clock.t = NOW - 9 * 86_400_000;
  const fc = fakeCore(clock, mkdtempSync(join(tmpdir(), "ducter-made-")));
  const log = fc.core.log;
  const card = (taskId: string, title: string) => fc.cards.set(taskId, { taskId, title, project: "", place: { kind: "none" }, harness: "claude-code", attention: "done", residency: "cold", openedAt: new Date(clock.now()).toISOString(), updatedAt: new Date(clock.now()).toISOString() } as TaskCard);
  card("t_kyoto", "排 12 月京都三日行程");
  card("t_visa", "Fill the Japan visa application");
  // Last week: a task wrote the itinerary into its scratch folder and named it in its report.
  log.append({ stream: "task:t_kyoto", origin: "task", kind: "task_event", body: { taskId: "t_kyoto", role: "tool", tool: { name: "Write", input: { file_path: "/fake/.ducter/scratch/t_kyoto/kyoto-itinerary.md" } } } });
  log.append({ stream: "task:t_kyoto", origin: "task", kind: "report", body: { taskId: "t_kyoto", state: "done", summary: "京都三日行程排好了。", questions: [], evidence: [] } });
  clock.t = NOW - 4 * 86_400_000;
  log.append({ stream: "task:t_visa", origin: "task", kind: "report", body: { taskId: "t_visa", state: "done", summary: "The visa application is filled.", questions: [], evidence: [], media: [PDF] } });
  clock.t = NOW - 2 * 86_400_000;
  const q = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "M4 Pro 和 M4 Max 比一下" } });
  log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: "对比：\nM4 Pro / M4 Max", replyTo: q.seq, ui: [{ type: "table", title: "M4 Pro 对 M4 Max", columns: ["", "M4 Pro", "M4 Max"], rows: [["价格", "¥16,999", "¥27,999"]], plain: "M4 Pro / M4 Max" }] } });
  clock.t = NOW;
  (fc.core as unknown as { made: MadePort }).made = createMade({ log, tasks: fc.core.tasks, now: () => clock.now() });
  const fr = fakeRunner(script);
  fr.bindCards(fc.cards);
  const opened: string[] = [];
  fr.runner.fileOpen = async (path) => {
    opened.push(path);
    if (o.gone) throw Object.assign(new Error("missing"), { code: "missing" });
    return ITIN;
  };
  const partner = createPartner(fc.core, fr.runner, { now: clock.now, persistState: false, onError: () => {} });
  const user = (text: string) => partner.onTrigger(fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text } }));
  const said = () => fc.core.log.read({ stream: "channel", kinds: ["ai_msg"], limit: 50 }).map((e) => e.body as Bodies["ai_msg"]).slice(1);
  return { fc, partner, user, opened, said };
}

type R = { ok: boolean; error?: string; items?: { id: string; name: string; for: string; kind: string }[]; note?: string; links?: unknown[]; failed?: { why: string }[] };
const call = async (fc: ReturnType<typeof fakeCore>, name: string, args: object) => (await fc.callTool(name, args)) as R;

test("找一下上周做的那个行程表: found by the time and the task's words, the file read back and put under the line", async () => {
  let found: R | undefined;
  let shown: R | undefined;
  const { fc, partner, user, opened, said } = setup(async (_i, s) => {
    found = await call(fc, "made_find", { words: "上周做的那个行程表" });
    shown = await call(fc, "made_find", { show: [found.items![0]!.id] });
    s.say("这是上周排的京都三日行程。");
    s.end();
  });
  user("找一下上周做的那个行程表");
  await partner.idle();
  expect(found!.items!.map((i) => i.name)).toEqual(["kyoto-itinerary.md"]);
  expect(shown!.ok).toBe(true);
  expect(opened).toEqual(["/fake/.ducter/scratch/t_kyoto/kyoto-itinerary.md"]);
  const [m] = said();
  expect(m!.text).toBe("这是上周排的京都三日行程。");
  expect(m!.media?.map((x) => x.name)).toEqual(["kyoto-itinerary.md"]);
});

test("the PDF you made for the visa: the file the task showed, as it is; a table drawn again with its plain form", async () => {
  let pdf: R | undefined;
  let table: R | undefined;
  const { fc, partner, user, said } = setup(async (_i, s) => {
    pdf = await call(fc, "made_find", { words: "the PDF you made for the visa" });
    table = await call(fc, "made_find", { words: "mac 对比表" });
    await call(fc, "made_find", { show: [pdf.items![0]!.id, table.items![0]!.id] });
    s.say("Here's the visa PDF from Nov 15, and the Mac comparison.");
    s.end();
  });
  user("the PDF you made for the visa, and that mac table");
  await partner.idle();
  expect(pdf!.items!.map((i) => i.kind)).toEqual(["PDF"]);
  expect(table!.items![0]!.for).toBe("your reply in the conversation");
  const [m] = said();
  expect(m!.media?.[0]?.id).toBe(PDF.id);
  expect(m!.ui?.[0]).toMatchObject({ type: "table", title: "M4 Pro 对 M4 Max" });
  expect(m!.text).toBe("Here's the visa PDF from Nov 15, and the Mac comparison.\n\nM4 Pro / M4 Max");
});

test("a thing that doesn't exist: nothing found, and the note says to say so, never a guess", async () => {
  let found: R | undefined;
  const { fc, partner, user } = setup(async (_i, s) => {
    found = await call(fc, "made_find", { words: "wedding seating chart" });
    s.say("I didn't find a wedding seating chart I made.");
    s.end();
  });
  user("where's the wedding seating chart you made?");
  await partner.idle();
  expect(found!.items).toEqual([]);
  expect(found!.note).toContain("offer a guess");
});

test("a file gone from its folder: not shown, said why", async () => {
  let shown: R | undefined;
  const { fc, partner, user, said } = setup(
    async (_i, s) => {
      const f = await call(fc, "made_find", { words: "行程" });
      shown = await call(fc, "made_find", { show: [f.items![0]!.id] });
      s.say("那份行程文件已经不在了，要我再排一份吗？");
      s.end();
    },
    { gone: true },
  );
  user("上次那个行程");
  await partner.idle();
  expect(shown!.ok).toBe(false);
  expect(shown!.failed![0]!.why).toContain("gone");
  expect(said()[0]!.media).toBeUndefined();
});

test("never unasked: a turn woken by no words of the person's can't use it", async () => {
  const clock = new FakeClock();
  const fc = fakeCore(clock, mkdtempSync(join(tmpdir(), "ducter-made-")));
  (fc.core as unknown as { made: MadePort }).made = createMade({ log: fc.core.log, tasks: fc.core.tasks });
  const partner = createPartner(fc.core, fakeRunner(async (_i, s) => s.end()).runner, { now: clock.now, persistState: false, onError: () => {} });
  const r = await call(fc, "made_find", { words: "itinerary" });
  expect(r.ok).toBe(false);
  await partner.close();
});
