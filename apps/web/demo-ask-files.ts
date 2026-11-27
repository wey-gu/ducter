// A demo core for #254: a task's question (needs_input) that showed one picture, one PDF and
// three files. The files are on the question's card, before the person answers.
//   DUCTER_PORT=7796 DUCTER_DATA_DIR=<scratch> DEMO_ASSETS=<folder> DEMO_LANG=zh bun apps/web/demo-ask-files.ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startCore, stubRunner } from "./demo-core.ts";
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
const has = (name: string) => dir && existsSync(join(dir, name));

function picture(name: string): MediaRef {
  const src = join(dir, name);
  const tmp = join(tmpdir(), `demo-ask-files-${process.pid}`);
  Bun.spawnSync(["mkdir", "-p", tmp]);
  const thumb = join(tmp, `${name}.thumb.jpg`);
  const tiny = join(tmp, `${name}.tiny.jpg`);
  Bun.spawnSync(["sips", "-s", "format", "jpeg", "-Z", "720", src, "--out", thumb]);
  Bun.spawnSync(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "50", "-Z", "16", src, "--out", tiny]);
  const preview = existsSync(tiny) ? `data:image/jpeg;base64,${Buffer.from(readFileSync(tiny)).toString("base64")}` : undefined;
  return store.put(bytes(name), { name, ...(existsSync(thumb) ? { thumb: new Uint8Array(readFileSync(thumb)) } : {}), ...(preview ? { preview } : {}) });
}
const file = (name: string) => store.put(bytes(name), { sent: true, name });
const said = (text: string) => log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text } });
const answer = (to: number, text: string) => log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text, replyTo: to } });

if (has("shot.png") && has("report.pdf")) {
  const u = said(zh ? "帮我看下这份季度报告和截图，能发出去吗？" : "Check this quarterly report and the screenshot: can I send it?");
  const id = "t_report";
  const media = [picture("shot.png"), file("report.pdf"), file("README.md"), file("数据.csv"), file("交付.zip")];
  log.append({
    stream: `task:${id}`,
    origin: "partner",
    kind: "task_open",
    body: { taskId: id, title: zh ? "看这份季度报告" : "Read the quarterly report", place: { kind: "none" }, harness: "claude-code", brief: zh ? "看季度报告和截图，能发就发。" : "Read the report and screenshot; send if it holds." },
  });
  // The real path: core's decisions module turns this report into the card, with its files.
  log.append({
    stream: `task:${id}`,
    origin: "task",
    kind: "report",
    body: {
      taskId: id,
      state: "needs_input",
      summary: zh ? "第三页和表格里的数字对不上。" : "Page 3 and the table disagree.",
      media,
      questions: [{ id: "q", text: zh ? "先按表格的数字改一版，再发出去？" : "Correct it to the table's numbers first, then send?", blocking: true, default: zh ? "改一版再发" : "Fix and send", reversible: true }],
      evidence: [],
    },
  });
  await Bun.sleep(80);
  const d = log.read({ stream: "channel", kinds: ["decision"], limit: 10 }).find((e) => (e.body as { taskId?: string }).taskId === id)?.body as { decisionId: string } | undefined;
  if (d) {
    log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: zh ? "看了下，表格和第三页对不上。我在截图里标了那一处，报告第 3 页也圈了。" : "The table and page 3 disagree. I marked it in the screenshot and on page 3 of the report.", decisionId: d.decisionId } });
    await Bun.sleep(60);
  }
}

console.log(`[demo] up at http://127.0.0.1:${core.port}/app (data: ${core.dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
