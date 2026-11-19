// A demo core for D383: 给你做的 / Made for you. Three weeks of things the partner and its tasks made
// for one person (a consumer's Kyoto trip and visa, a developer's HawDB load test, a Bun note and a
// PR): files a task showed, files it wrote on the home, a booking page's screenshot, the partner's
// table, chart and pinned list. Logged at their own times (the core's clock set back while seeding).
//   DUCTER_PORT=7983 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh DEMO_ASSETS=<folder> bun apps/web/demo-made.ts
// DEMO_ASSETS holds booking-confirmation.png (and booking.thumb.jpg, its 720 px tile); without it the
// screenshot is left out. DEMO_EMPTY=1: nothing made yet (the empty line).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { realClock, startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import { parseRich, type Bodies, type MediaRef } from "@ducter/protocol";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const assets = process.env.DEMO_ASSETS ?? "";
const back = { ms: 0 };
const core = startCore({
  ooSource: noOo,
  clock: { ...realClock, now: () => Date.now() - back.ms },
  persona: { id: "default", name: "Ducter", identity: "" },
  hostname: process.env.DUCTER_HOST || "127.0.0.1",
  deviceProbes: { cua: async () => ({ missing: "demo" }), harnesses: async () => [{ harness: "claude-code", installed: true, loggedIn: true, canBePartner: true, billing: "plan" }], kind: async () => "laptop" },
});
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
const log = core.log;
const store = (core as unknown as { media: { put(b: Uint8Array, o?: object): MediaRef } }).media;
const text = (s: string) => new TextEncoder().encode(s);
const DAY = 86_400_000;
const at = (days: number, hour = 10) => {
  const d = new Date(Date.now() - days * DAY);
  d.setHours(hour, 20, 0, 0);
  back.ms = Math.max(0, Date.now() - d.getTime());
};
const fence = (o: object) => "```ducter-ui\n" + JSON.stringify(o) + "\n```";
const L = <T>(a: T, b: T) => (zh ? a : b);

const open = (taskId: string, title: string, project = "") =>
  log.append({ stream: `task:${taskId}`, origin: "partner", kind: "task_open", body: { taskId, title, project, place: { kind: "none" }, harness: "claude-code", brief: title } satisfies Bodies["task_open"] });
const report = (taskId: string, summary: string, o: Partial<Bodies["report"]> = {}) =>
  log.append({ stream: `task:${taskId}`, origin: "task", kind: "report", body: { taskId, state: "done", summary, questions: [], evidence: [], ...o } satisfies Bodies["report"] });
const wrote = (taskId: string, path: string) =>
  log.append({ stream: `task:${taskId}`, origin: "task", kind: "task_event", body: { taskId, role: "tool", tool: { name: "Write", input: { file_path: path, content: "…" }, ok: true } } });
const file = (bytes: Uint8Array, name: string, taskId: string, thumb?: Uint8Array) => store.put(bytes, { name, files: true, from: { taskId }, ...(thumb ? { thumb } : {}) });
const asks = (words: string) => log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: words } });
const says = (words: string, replyTo?: number) => {
  const r = parseRich(words, zh ? "zh" : "en");
  return log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: r.text, ...(r.ui.length ? { ui: r.ui } : {}), ...(replyTo !== undefined ? { replyTo } : {}) } });
};
const HOME = "/Users/ada/.ducter/scratch";

if (process.env.DEMO_EMPTY !== "1") {
  // Three weeks ago: the HawDB load test (a developer's): a CSV the task showed, and a chart.
  at(20, 16);
  open("t_load", L("HawDB compaction 压测", "HawDB compaction load test"), "hawdb");
  report("t_load", L("三档写入速率都跑完了，数字在 CSV 里。4 万写/秒以内 compaction 跟得上。", "Ran three write rates; the numbers are in the CSV. Compaction keeps up to 40k writes/s."), {
    media: [file(text("rate,p99_ms,stall_s\n10000,4.1,0\n25000,6.8,0\n40000,11.2,1.5\n"), "hawdb-loadtest-oct.csv", "t_load")],
  });
  const q1 = asks(L("把压测的 p99 画出来看看", "Chart the load test's p99"));
  says(`${L("写入越快 p99 越高，4 万时到 11 ms。", "p99 climbs with the write rate, to 11 ms at 40k.")}\n\n${fence({ type: "chart", kind: "line", title: L("写入速率和 p99", "Write rate and p99"), unit: "ms", summary: L("p99 从 4.1 ms 升到 11.2 ms", "p99 rises from 4.1 ms to 11.2 ms"), points: [{ label: "10k", value: 4.1 }, { label: "25k", value: 6.8 }, { label: "40k", value: 11.2 }] })}`, q1.seq);
  // Twelve days ago: a Bun note a task wrote on the home, and a PR from Ducter.
  at(12, 11);
  open("t_bun", L("查 bun build --compile 在 Linux 上的坑", "Bun build --compile pitfalls on Linux"), "ducter");
  wrote("t_bun", `${HOME}/t_bun/bun-compile-linux.md`);
  report("t_bun", L(`1.4.4 能用；注意 getSystemErrorMap 和 glibc 版本。笔记：[bun-compile-linux.md](${HOME}/t_bun/bun-compile-linux.md)`, `1.4.4 works; watch getSystemErrorMap and the glibc floor. Notes: [bun-compile-linux.md](${HOME}/t_bun/bun-compile-linux.md)`));
  at(12, 15);
  open("t_flaky", L("修 TestRaftSnapshot 偶尔失败", "Fix the flaky TestRaftSnapshot"), "hawdb");
  report("t_flaky", L("原因是快照计时器和 leader 下台抢跑，加了一道栅栏。", "The snapshot timer raced the leader stepping down; fixed with a fence."));
  log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: "j_pr", text: L("修 TestRaftSnapshot 偶尔失败", "Fix the flaky TestRaftSnapshot"), state: "done", taskId: "t_flaky", act: "open_pr", ref: "https://github.com/example/hawdb/pull/412" } });
  // Last week: the Kyoto itinerary, written by a task and named in its report.
  at(9, 21);
  open("t_kyoto", L("排 12 月京都三日行程", "Plan three days in Kyoto in December"));
  wrote("t_kyoto", `${HOME}/t_kyoto/kyoto-itinerary.md`);
  report("t_kyoto", L(`三天排好了：[京都三日行程](${HOME}/t_kyoto/kyoto-itinerary.md)，第一天伏见稻荷和东福寺。`, `Three days planned: [Kyoto itinerary](${HOME}/t_kyoto/kyoto-itinerary.md), starting with Fushimi Inari and Tofuku-ji.`));
  // Five days ago: the visa application, as a PDF the task showed.
  at(5, 14);
  open("t_visa", L("填日本签证申请表", "Fill in the Japan visa application"));
  const pdf = text("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n" + " ".repeat(186_000));
  report("t_visa", L("签证申请表填好了，PDF 可以直接打印签字。", "The visa application is filled in; the PDF is ready to print and sign."), { media: [file(pdf, "japan-visa-application.pdf", "t_visa")] });
  // Three days ago: the partner's comparison of two Macs.
  at(3, 20);
  const q2 = asks(L("M4 Pro 和 M4 Max 的 MacBook Pro 比一下，我主要写代码", "Compare the M4 Pro and M4 Max MacBook Pro; I mostly write code"));
  says(`${L("写代码选 M4 Pro 就够了。", "For coding, the M4 Pro is plenty.")}\n\n${fence({ type: "table", title: L("M4 Pro 对 M4 Max", "M4 Pro vs M4 Max"), columns: ["", "M4 Pro", "M4 Max"], rows: [[L("CPU", "CPU"), L("14 核", "14 cores"), L("16 核", "16 cores")], [L("内存", "Memory"), "24 GB", "36 GB"], [L("价格", "Price"), L("¥16,999", "$1,999"), L("¥27,999", "$3,199")]] })}`, q2.seq);
  // Yesterday: the hotel booked, its confirmation page as a screenshot.
  at(1, 18);
  open("t_hotel", L("订 12 月 6 号京都的酒店", "Book a hotel in Kyoto for Dec 6"));
  const shotPath = assets && join(assets, "booking-confirmation.png");
  const shot = shotPath && existsSync(shotPath) ? [file(new Uint8Array(readFileSync(shotPath)), "booking-confirmation.png", "t_hotel", existsSync(join(assets, "booking.thumb.jpg")) ? new Uint8Array(readFileSync(join(assets, "booking.thumb.jpg"))) : undefined)] : [];
  report("t_hotel", L("订好了：京都站前，两晚，12 月 3 日前可以免费取消。", "Booked: by Kyoto Station, two nights, free to cancel until Dec 3."), { media: shot, evidence: [{ kind: "url", label: L("预订确认页", "Booking confirmation"), ref: "https://hotels.example.com/booking/EX-48213" }] });
  // This morning: a packing list, pinned.
  at(0, 8);
  const q3 = asks(L("帮我列个去大阪要带的东西，置顶", "Make me an Osaka packing list and pin it"));
  const list = says(`${L("给你，收拾的时候勾掉。", "Here: tick them off as you pack.")}\n\n${fence({ type: "checklist", title: L("大阪行李清单", "Osaka packing list"), items: L(["护照", "日元现金", "充电器和转换插头", "ICOCA 卡"], ["Passport", "Yen in cash", "Charger and plug adapter", "ICOCA card"]) })}`, q3.seq);
  core.pins.pin(list.seq, 0);
}
back.ms = 0;
console.log(`demo-made ready on :${process.env.DUCTER_PORT ?? "?"} (${zh ? "zh" : "en"})`);
