// D383: what Ducter made for the person over the last weeks, for the made_find scenarios: the
// Kyoto itinerary a task showed last week, the visa PDF, a CSV of HawDB load-test numbers, the
// partner's comparison of two Macs, and a Bun research note a task wrote (a file on the home, by
// its path). Logged at their own times through the eval core's clock (`back` sets how far back
// now is), so time words ("上周", "last month") mean what they say. Obviously fake bytes.
import type { Bodies, MediaRef } from "../../protocol/src/index.ts";

type EvalCore = {
  log: { append(e: { stream: string; origin: string; kind: string; body: unknown }): { seq: number } };
  media?: { put(b: Uint8Array, o?: { name?: string; files?: boolean; from?: { taskId: string } }): MediaRef };
};

const DAY = 86_400_000;
const text = (s: string) => new TextEncoder().encode(s);
/** The smallest PDF a viewer opens: one page with one line. */
const PDF = text("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");

export function seedMade(core: EvalCore, back: { ms: number }, zh: boolean) {
  const at = (daysAgo: number) => (back.ms = daysAgo * DAY + 3 * 3600_000);
  const put = (bytes: Uint8Array, name: string, taskId: string) => core.media!.put(bytes, { name, files: true, from: { taskId } });
  const open = (taskId: string, title: string) => core.log.append({ stream: `task:${taskId}`, origin: "partner", kind: "task_open", body: { taskId, title, project: "", place: { kind: "none" }, harness: "claude-code", brief: title } satisfies Bodies["task_open"] });
  const done = (taskId: string, summary: string, media?: MediaRef[]) => core.log.append({ stream: `task:${taskId}`, origin: "task", kind: "report", body: { taskId, state: "done", summary, questions: [], evidence: [], ...(media ? { media } : {}) } satisfies Bodies["report"] });

  at(20);
  open("t_load", "HawDB compaction load test");
  done("t_load", "Ran the load test at 3 write rates; numbers in the CSV. Compaction keeps up to 40k writes/s.", [put(text("rate,p99_ms,stall_s\n10000,4.1,0\n25000,6.8,0\n40000,11.2,1.5\n"), "hawdb-loadtest-oct.csv", "t_load")]);
  at(12);
  open("t_bun", "Bun build --compile pitfalls on Linux");
  core.log.append({ stream: "task:t_bun", origin: "task", kind: "task_event", body: { taskId: "t_bun", role: "tool", tool: { name: "Write", input: { file_path: "/home/fake/.ducter/scratch/t_bun/bun-compile-linux.md", content: "# Bun compile on Linux" } } } satisfies Bodies["task_event"] });
  done("t_bun", "1.4.4 works; watch getSystemErrorMap and the glibc floor. Notes: [bun-compile-linux.md](/home/fake/.ducter/scratch/t_bun/bun-compile-linux.md)");
  at(9);
  open("t_kyoto", zh ? "排 12 月京都三日行程" : "Plan three days in Kyoto in December");
  done("t_kyoto", zh ? "三天的行程排好了：第一天伏见稻荷和东福寺，第二天岚山，第三天清水寺到祇园。" : "Three days planned: Fushimi Inari and Tofuku-ji, then Arashiyama, then Kiyomizu-dera to Gion.", [put(text(zh ? "# 京都三日行程\n\n## 第一天\n- 伏见稻荷大社\n- 东福寺\n" : "# Kyoto, three days\n\n## Day 1\n- Fushimi Inari\n- Tofuku-ji\n"), "kyoto-itinerary.md", "t_kyoto")]);
  at(5);
  open("t_visa", zh ? "填日本签证申请表" : "Fill in the Japan visa application");
  done("t_visa", zh ? "签证申请表填好了，PDF 可以直接打印签字。" : "The visa application form is filled in; the PDF is ready to print and sign.", [put(PDF, "japan-visa-application.pdf", "t_visa")]);
  at(3);
  const q = core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: zh ? "M4 Pro 和 M4 Max 的 MacBook Pro 比一下" : "Compare the M4 Pro and M4 Max MacBook Pro" } });
  const plain = zh ? "M4 Pro 对 M4 Max：CPU，14 核，16 核；价格，¥16,999，¥27,999" : "M4 Pro vs M4 Max: CPU, 14 cores, 16 cores; Price, $1,999, $3,199";
  core.log.append({
    stream: "channel",
    origin: "partner",
    kind: "ai_msg",
    body: {
      text: `${zh ? "日常开发选 M4 Pro 就够。" : "For everyday work the M4 Pro is enough."}\n\n${plain}`,
      replyTo: q.seq,
      ui: [{ type: "table", title: zh ? "M4 Pro 对 M4 Max" : "M4 Pro vs M4 Max", columns: ["", "M4 Pro", "M4 Max"], rows: [["CPU", zh ? "14 核" : "14 cores", zh ? "16 核" : "16 cores"], [zh ? "价格" : "Price", zh ? "¥16,999" : "$1,999", zh ? "¥27,999" : "$3,199"]], plain }],
    } satisfies Bodies["ai_msg"],
  });
  back.ms = 0;
}
