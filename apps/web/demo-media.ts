// A demo core for pictures and files in the conversation (D206, D259, D286): a screenshot asked
// about, trips of 2 to 9 photos, a file of each kind sent, and a task's picture and files coming
// back. DEMO_ASSETS names a folder with the pictures and files (see the list below); a picture
// gets its 720 px tile and ~16 px preview the way a phone would make them (made here with sips).
// DEMO_MANY=50 adds fifty more pictures (a long conversation, to check that it stays smooth).
//   DUCTER_PORT=7797 DUCTER_DATA_DIR=<scratch> DEMO_ASSETS=<folder> DEMO_LANG=zh bun apps/web/demo-media.ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startCore, stubRunner } from "@ducter/core";
import type { MediaRef } from "@ducter/protocol";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const dir = process.env.DEMO_ASSETS ?? "";
const core = startCore({ ooSource: noOo, persona: { id: "default", name: "Ducter", identity: "" }, hostname: process.env.DUCTER_HOST || "127.0.0.1" });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
const log = core.log;
const store = (core as unknown as { media: { put(b: Uint8Array, o?: object): MediaRef } }).media;
const bytes = (name: string) => new Uint8Array(readFileSync(join(dir, name)));

/** A picture as a phone sends it: the picture, its 720 px tile and its ~16 px preview. */
function picture(name: string, o: object = {}): MediaRef {
  const src = join(dir, name);
  const tmp = join(tmpdir(), `demo-media-${process.pid}`);
  Bun.spawnSync(["mkdir", "-p", tmp]);
  const thumb = join(tmp, `${name}.thumb.jpg`);
  const tiny = join(tmp, `${name}.tiny.jpg`);
  Bun.spawnSync(["sips", "-s", "format", "jpeg", "-Z", "720", src, "--out", thumb]);
  Bun.spawnSync(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "50", "-Z", "16", src, "--out", tiny]);
  const preview = existsSync(tiny) ? `data:image/jpeg;base64,${Buffer.from(readFileSync(tiny)).toString("base64")}` : undefined;
  return store.put(bytes(name), { name, ...(existsSync(thumb) ? { thumb: new Uint8Array(readFileSync(thumb)) } : {}), ...(preview ? { preview } : {}), ...o });
}
const file = (name: string, o: object = {}) => store.put(bytes(name), { sent: true, name, ...o });
const has = (name: string) => dir && existsSync(join(dir, name));

const said = (text: string, media?: MediaRef[]) => log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text, ...(media?.length ? { media } : {}) } });
const answer = (to: number, text: string, media?: MediaRef[]) => log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text, replyTo: to, ...(media?.length ? { media } : {}) } });

if (!dir) console.log("[demo] DEMO_ASSETS is not set: only words");
else {
  const trip = (n: number) => Array.from({ length: n }, (_, i) => picture(`trip${(i % 10) + 1}.jpg`));
  if (has("shot-task.png")) {
    const u = said(zh ? "这个页面是不是又对不齐了？" : "Is this page misaligned again?", [picture("shot-task.png")]);
    answer(u.seq, zh ? "对，标题那一行比下面的卡片宽了 8 像素：外框多算了一层内边距。" : "Yes: the title row is 8 px wider than the cards under it; the frame counts its padding twice.");
  }
  const one = said(zh ? "今早的日出" : "This morning's sunrise", [picture("sunrise-tall.jpg")]);
  answer(one.seq, zh ? "好看。山那边的颜色很干净。" : "Lovely. The colour over the hills is very clean.");
  said(zh ? "周末在箱根拍的" : "From the weekend in Hakone", [picture("horizon.jpg"), picture("sonoma-port.jpg")]);
  said(zh ? "海边那天" : "The day at the coast", trip(3));
  said(zh ? "再来五张" : "Five more", trip(5));
  said(zh ? "第二天" : "The second day", trip(7));
  const nine = said(zh ? "这些都放进相册" : "Put these in the album", trip(9));
  answer(nine.seq, zh ? "好，9 张都收好了。要我排一份相册出来吗？" : "Got all 9. Shall I lay out an album?");

  // A file of each kind the person sends.
  const files: [string, string, string][] = [
    ["report.pdf", "调研报告，帮我看看结论站不站得住", "The research report: does the conclusion hold?"],
    ["media.ts", "这段代码有什么问题", "What's wrong with this code?"],
    ["季度计划.docx", "下季度的计划", "Next quarter's plan"],
    ["hawdb-logs.zip", "日志都在这里", "All the logs are in here"],
    ["语音备忘.m4a", "刚录的", "Just recorded this"],
    ["箱根.mp4", "路上拍的一段", "A clip from the road"],
  ];
  for (const [name, z, e] of files) if (has(name)) said(zh ? z : e, [file(name)]);

  // A task's picture and files coming back under the partner's words.
  const ask = said(zh ? "把这周的照片排成一份相册，配一张封面" : "Lay this week's photos out as an album, with a cover");
  const id = "t_album";
  log.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", body: { taskId: id, title: zh ? "排箱根相册" : "Lay out the Hakone album", place: { kind: "none" }, harness: "codex", model: "gpt-5", brief: ask.body.text } });
  core.tasks.setState(id, "done", "cold");
  const back = [picture("sonoma.jpg", { from: { taskId: id } }), ...(has("report.pdf") ? [file("report.pdf", { from: { taskId: id }, name: zh ? "箱根相册.pdf" : "Hakone album.pdf" })] : [])];
  answer(ask.seq, zh ? "排好了：封面用了那张湖边的，9 张照片按时间排进 6 页。" : "Done: the lake one is the cover, and the 9 photos run in order over 6 pages.", back);

  const many = Number(process.env.DEMO_MANY ?? 0);
  for (let i = 0; i < many; i += 2) said(zh ? `第 ${i / 2 + 1} 组` : `Set ${i / 2 + 1}`, trip(2).map((_, k) => picture(`trip${((i + k) % 10) + 1}.jpg`)));
}

console.log(`[demo] up at http://127.0.0.1:${core.port}/app (data: ${core.dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
