// D206: the partner sees the user's pictures as its runtime's own image input, hands them on to a
// task by id, and relays what a task showed under its own words.
import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies, MediaRef } from "../../protocol/src/index.ts";
import { shortId } from "../../protocol/src/media.ts";
import { createMediaStore } from "../../core/src/media.ts";
import { png } from "../../core/test/fixtures-media.ts";
import { createPartner } from "../src/index.ts";
import { FakeClock, fakeCore, fakeRunner, type Script } from "./fakes.ts";

function setup(script: Script, opts: { harness?: "deepseek-harness" } = {}) {
  const clock = new FakeClock();
  const dir = mkdtempSync(join(tmpdir(), "ducter-partner-media-"));
  const fc = fakeCore(clock, dir);
  const media = createMediaStore(dir);
  fc.core.media = media;
  const fr = fakeRunner(script);
  fr.bindCards(fc.cards);
  const partner = createPartner(fc.core, fr.runner, { now: clock.now, persistState: false, settleMs: 0, onError: () => {}, memory: undefined, ...(opts.harness ? { harness: opts.harness } : {}) });
  const user = (text: string, refs: MediaRef[] = []) =>
    partner.onTrigger(fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text, ...(refs.length ? { media: refs } : {}) } }));
  return { fc, fr, partner, user, media };
}

const aiMsgs = (events: { kind: string; body: unknown }[]) => events.filter((e) => e.kind === "ai_msg").map((e) => e.body as Bodies["ai_msg"]);

test("the user's screenshot reaches the partner as an image of its turn, named in its words", async () => {
  const { fr, partner, user, media } = setup((_i, s) => {
    s.say("这是说端口 7777 被占了，关掉另一个 Ducter 就好。");
    s.end();
  });
  const shot = media.put(png(1290, 2796));
  user("这个报错什么意思？", [shot]);
  await partner.idle();
  const s = fr.sessions[0]!;
  expect(s.images.at(-1)).toEqual([{ path: media.path(shot.id)!, mediaType: "image/png" }]);
  expect(s.inputs.at(-1)).toContain(`[with a picture: picture ${shortId(shot.id)} (1290×2796); you see them with this message]`);
  expect(s.inputs.at(-1)).not.toContain("base64");
});

// D259: a file the user sends is named with its kind, size and where it is under its own name; a
// short text comes along whole; a PDF or a long one is read there with the partner's own read
// tool. It is never an image input, and a task gets it by its id.
test("a file the user sends: named with where it is; a short text whole; a task gets it by id", async () => {
  let opened: any;
  const { fc, fr, partner, user, media } = setup(async (_i, s) => {
    s.say("好，我交给一个任务去按清单发版。");
    opened = await fc.callTool("task_open", { title: "按清单发版", place: { kind: "none" }, brief: "User's words: 按这个发版", media: [shortId(pdf.id)] });
    s.end();
  });
  const notes = media.put(new TextEncoder().encode("# 发版清单\n- 打 tag\n- 发公告\n"), { sent: true, name: "release.md" });
  const pdf = media.put(new TextEncoder().encode(`%PDF-1.7 ${"x".repeat(40_000)}`), { sent: true, name: "季度报告.pdf" });
  const shot = media.put(png(640, 480));
  user("按这个发版", [notes, pdf, shot]);
  await partner.idle();
  const s = fr.sessions[0]!;
  const input = s.inputs.at(-1)!;
  // The picture keeps its own line and its image input; the files are not images.
  expect(input).toContain(`[with a picture: picture ${shortId(shot.id)} (640×480); you see them with this message]`);
  expect(s.images.at(-1)).toEqual([{ path: media.path(shot.id)!, mediaType: "image/png" }]);
  expect(input).toContain(`file ${shortId(notes.id)} "release.md" (Markdown, 37 B) at ${media.named(notes.id)}, its whole text:\n<<<\n# 发版清单\n- 打 tag\n- 发公告\n>>>`);
  expect(input).toContain(`file ${shortId(pdf.id)} "季度报告.pdf" (PDF, 39 KB) at ${media.named(pdf.id)}`);
  expect(input).not.toContain("xxxxxxxx");
  expect(input).toContain("Read the others with your file tools");
  expect(input).toContain("Never say a path to the user");
  expect(media.named(pdf.id)!.endsWith("/季度报告.pdf")).toBe(true);
  expect(opened.ok).toBe(true);
  expect(fr.opened[0]!.media?.map((m) => m.name)).toEqual(["季度报告.pdf"]);
});

test("an AI that can't see pictures gets none, and its line says so", async () => {
  const { fr, partner, user, media } = setup(
    (_i, s) => {
      s.say("这个 AI 看不了图片，我可以交给能看的去做。");
      s.end();
    },
    { harness: "deepseek-harness" },
  );
  user("看看这张", [media.put(png(800, 600))]);
  await partner.idle();
  expect(fr.sessions[0]!.images.at(-1)).toBeUndefined();
  expect(fr.sessions[0]!.inputs.at(-1)).toContain("you can't see pictures on this AI");
});

test("task_open hands the pictures on: by id, or the user's latest when it names none", async () => {
  let byId: any;
  let implicit: any;
  let wrong: any;
  const { fc, fr, partner, user, media } = setup(async (_i, s) => {
    s.say("好，我去照着这张图改，改好了告诉你。");
    byId = await fc.callTool("task_open", { title: "照图改按钮", place: { kind: "none" }, brief: "User's words: 照这个改", media: [shortId(b.id)] });
    implicit = await fc.callTool("task_open", { title: "再看一遍", place: { kind: "none" }, brief: "User's words: 照这个改" });
    wrong = await fc.callTool("task_open", { title: "x", place: { kind: "none" }, brief: "x", media: ["deadbeefdeadbeef"] });
    s.end();
  });
  const a = media.put(png(400, 300, 1));
  const b = media.put(png(500, 300, 2));
  user("照这个改", [a, b]);
  await partner.idle();
  expect(byId.ok).toBe(true);
  expect(fr.opened[0]!.media?.map((m) => m.id)).toEqual([b.id]);
  expect(fr.opened[1]!.media?.map((m) => m.id)).toEqual([a.id, b.id]);
  expect(wrong.ok).toBe(false);
  expect(implicit.ok).toBe(true);
});

test("what a task showed goes under the partner's first words about it, once", async () => {
  const { fc, partner, media } = setup((_i, s) => {
    s.say("画好了：窗边打盹的橘猫。");
    s.say("要再画一张不同姿势的也行。");
    s.end();
  });
  fc.cards.set("t9", { taskId: "t9", persona: "p1", title: "画一只猫", project: "", place: { kind: "none" }, harness: "codex", attention: "done", residency: "hot", openedAt: "", updatedAt: "" });
  const cat = media.put(png(1024, 1024, 5), { name: "cat.png", from: { taskId: "t9" } });
  partner.onTrigger(fc.core.log.append({ stream: "task:t9", origin: "task", kind: "report", body: { taskId: "t9", state: "done", summary: "Drew the cat.", questions: [], evidence: [], media: [cat] } }));
  await partner.idle();
  const msgs = aiMsgs(fc.events);
  expect(msgs[0]!.text).toContain("橘猫");
  expect(msgs[0]!.media?.map((m) => m.id)).toEqual([cat.id]);
  expect(msgs[1]!.media).toBeUndefined();
});
