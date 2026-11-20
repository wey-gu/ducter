// A demo core for D439, 拿去就能发 / Ready to send: two documents the person will send. A one-page
// weekly PDF for the boss, whose pages were clean (nothing said beyond the file), and a pitch deck
// (.pptx) shown with its PDF, which reads as its slides; the page check sent the task back once and
// one thing is still so (a sixth slide), said under the partner's result. The documents are real:
// HTML drafts printed by a headless Chrome (a throwaway profile), a deck written as Office XML. For
// screenshots and manual checks (the partner itself is a stub: its words are as the real one says).
//   DUCTER_PORT=7975 DUCTER_DATA_DIR=/tmp/x DEMO_LANG=zh bun apps/web/demo-doc-bar.ts
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import { CASES } from "../../packages/core/eval/doc-bar/cases.ts";
import { chromePath, printPdf } from "../../packages/core/eval/doc-bar/make.ts";
import { pairPages } from "../../packages/core/src/doc-check.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
if (!process.env.DUCTER_DATA_DIR) throw new Error("set DUCTER_DATA_DIR to a scratch folder");
const chrome = chromePath();
if (!chrome) throw new Error("no Chrome to print the documents with (DUCTER_TEST_CHROME)");
const core = startCore({ ooSource: noOo, persona: { id: "default", name: "Ducter", identity: "" }, hostname: process.env.DUCTER_HOST || "127.0.0.1" });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
const log = core.log;
const tick = () => Bun.sleep(30);
const work = mkdtempSync(join(tmpdir(), "ducter-demo-docs-"));

/** A case's document, made as the eval makes it, under the name the person sees. */
async function made(id: string, name: string): Promise<string> {
  const c = CASES.find((x) => x.id === id)!;
  const out = join(work, name);
  if ("html" in c.make) await printPdf(chrome!, c.make.html, out);
  else writeFileSync(out, c.make.bytes());
  return out;
}

const w = zh
  ? {
      ask: "帮我把这周的进展做成一页 PDF 发给老板",
      ack: "好，我整理成一页，做好给你看。",
      title: "本周进展一页 PDF",
      weekly: "本周进展.pdf",
      summary: "一页的本周进展做好了：做完的、数字和下周。",
      said: "做好了，一页：做完的三件事、三个数字、下周两件事。可以直接发给老板。",
      ask2: "做个 5 页的融资 deck",
      ack2: "我去做，好了给你看。",
      title2: "Ducter 融资 deck",
      deck: "Ducter 融资",
      summary2: "融资 deck 做好了，加了一页团队，你说要留就留。",
      said2: "融资 deck 做好了：问题、做法、进展、要多少钱，我多加了一页团队。",
      left: ["要的是 5 张，做出来 6 张"],
    }
  : {
      ask: "Make this week's progress into a one-page PDF for my manager",
      ack: "Sure: one page, I'll show you when it's done.",
      title: "This week on one page",
      weekly: "This week.pdf",
      summary: "This week on one page: what's done, the numbers, next week.",
      said: "Done, on one page: three things finished, three numbers, two for next week. Ready to send as it is.",
      ask2: "Make a 5-slide pitch deck",
      ack2: "On it; I'll show you when it's ready.",
      title2: "Ducter pitch deck",
      deck: "Ducter pitch",
      summary2: "The pitch deck is ready, with a team slide added; keep it if you like.",
      said2: "The pitch deck is ready: the problem, what we do, where it stands, the ask, and I added a team slide.",
      left: ["You asked for 5; it has 6 slides"],
    };

// The weekly PDF: clean pages, nothing said but the file.
const t1 = "t_week";
const weekly = core.media.putFile(await made("weekly-onepage", w.weekly), { files: true, name: w.weekly, from: { taskId: t1 } });
const u = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: w.ask } });
log.append({ stream: "channel", origin: "partner", kind: "ack", body: { jobId: "j1", text: w.ack, replyTo: u.seq } });
log.append({ stream: `task:${t1}`, origin: "partner", kind: "task_open", body: { taskId: t1, title: w.title, project: "", place: { kind: "none" }, harness: "claude-code", brief: w.ask, language: zh ? "zh" : "en", workKind: "writing" } });
log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: "j1", text: w.title, state: "running", taskId: t1 } });
core.tasks.setState(t1, "working", "hot");
await tick();
log.append({ stream: `task:${t1}`, origin: "task", kind: "report", body: { taskId: t1, state: "done", summary: w.summary, questions: [], evidence: [], media: [weekly] } });
core.tasks.setState(t1, "done", "warm");
log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: "j1", text: w.title, state: "done", taskId: t1 } });
log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: w.said, replyTo: u.seq, media: [weekly] } });
await tick();

// The deck: a .pptx with its PDF, read as its slides; one thing still so after the fix.
const t2 = "t_deck";
const pptx = core.media.putFile(await made("pptx-seven-for-five", `${w.deck}.pptx`), { files: true, name: `${w.deck}.pptx`, from: { taskId: t2 } });
const pdf = core.media.putFile(await made("pitch-six-slides", `${w.deck}.pdf`), { files: true, name: `${w.deck}.pdf`, from: { taskId: t2 } });
const shown = pairPages([pptx, pdf]).map((m) => (m.pages ? { ...m, pages: { ...m.pages, n: 6 } } : m));
const u2 = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: w.ask2 } });
log.append({ stream: "channel", origin: "partner", kind: "ack", body: { jobId: "j2", text: w.ack2, replyTo: u2.seq } });
log.append({ stream: `task:${t2}`, origin: "partner", kind: "task_open", body: { taskId: t2, title: w.title2, project: "", place: { kind: "none" }, harness: "claude-code", brief: w.ask2, language: zh ? "zh" : "en", workKind: "writing" } });
log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: "j2", text: w.title2, state: "running", taskId: t2 } });
core.tasks.setState(t2, "working", "hot");
await tick();
log.append({ stream: `task:${t2}`, origin: "task", kind: "report", body: { taskId: t2, state: "done", summary: w.summary2, questions: [], evidence: [], media: shown, doc: { pages: 6, found: [{ code: "count", n: 7, asked: 5 }, { code: "count", n: 6, asked: 5 }], left: w.left } } });
core.tasks.setState(t2, "done", "warm");
log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: "j2", text: w.title2, state: "done", taskId: t2 } });
log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: w.said2, replyTo: u2.seq, media: shown } });
console.log(`demo-doc-bar on ${core.url} · ${zh ? "zh" : "en"}`);
