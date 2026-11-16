// The cases behind fixtures/rich.json (D303): rich answers as the partner writes them, from the
// author's own work. `bun packages/protocol/fixtures/rich-cases.ts` rewrites the JSON from the
// model (review the diff: it is the expected output both ports must match). The web demo and the
// Mac's shots seed the same messages.
import { writeFileSync } from "node:fs";
import { fmtNum, parseRich, richModel, splitRich, type RichUi } from "../src/rich.ts";

const fence = (o: unknown) => "```ducter-ui\n" + JSON.stringify(o) + "\n```";

/** Rich replies, each with the user's message it answers. */
export const RICH_REPLIES: { name: string; lang: "zh" | "en"; user: string; src: string }[] = [
  {
    name: "compare-zh",
    lang: "zh",
    user: "Mac mini 和 MacBook Air 哪个更适合放家里当 Ducter 的家？帮我比一下",
    src: `放家里一直开着，Mac mini 更合适：便宜，插着电不用管电池。\n\n${fence({ type: "table", title: "当 Ducter 的家", columns: ["", "Mac mini M4", "MacBook Air M4"], rows: [["起售价", "¥4,499", "¥7,999"], ["内存", "16 GB", "16 GB"], ["一直开着", "很适合", "要一直插电"], ["带出门", "不行", "可以"]] })}\n\n要是你也想带着它出门，再选 Air。`,
  },
  {
    name: "week-en",
    lang: "en",
    user: "How many tasks did you finish for me each day this week?",
    src: `Thirty-four this week; Friday was the busiest.\n\n${fence({ type: "chart", kind: "bar", title: "Tasks finished", summary: "Friday was the busiest with 9; the weekend was quiet.", points: [{ label: "Mon", value: 5 }, { label: "Tue", value: 8 }, { label: "Wed", value: 3 }, { label: "Thu", value: 6 }, { label: "Fri", value: 9 }, { label: "Sat", value: 2 }, { label: "Sun", value: 1 }] })}`,
  },
  {
    name: "ci-zh",
    lang: "zh",
    user: "HawDB 的 CI 这周每天要跑多久？",
    src: `周四最慢，26 分钟多，是那天加了集成测试；之后回到 22 分钟左右。\n\n${fence({ type: "chart", kind: "line", title: "HawDB CI 每天平均时长", unit: "分钟", summary: "周一 18.5 分钟，周四最慢 26.4 分钟，周五回到 22.1 分钟。", points: [{ label: "周一", value: 18.5 }, { label: "周二", value: 21 }, { label: "周三", value: 19.2 }, { label: "周四", value: 26.4 }, { label: "周五", value: 22.1 }] })}`,
  },
  {
    name: "release-en",
    lang: "en",
    user: "What's left before 0.0.62 goes out? Give me a list I can tick off",
    src: `Four things, and tell me when they're done:\n\n${fence({ type: "checklist", title: "Before 0.0.62", items: ["Rerun the full partner eval", "Check the iPhone build in TestFlight", "Tag v0.0.62", "Update the release notes page"], tell: true })}`,
  },
  {
    name: "compare-en",
    lang: "en",
    user: "Put the Mac mini and the MacBook Air side by side as an always-on home for you",
    src: `The Mac mini: it's cheaper and made to stay plugged in.\n\n${fence({ type: "table", title: "An always-on home", columns: ["", "Mac mini M4", "MacBook Air M4"], rows: [["From", "$599", "$999"], ["Memory", "16 GB", "16 GB"], ["Always on", "Made for it", "Needs to stay plugged in"], ["Comes with you", "No", "Yes"]] })}`,
  },
  {
    name: "release-zh",
    lang: "zh",
    user: "发 0.0.62 之前我还得自己做几件事：重跑整套伙伴测评、在 TestFlight 里看一眼 iPhone 版、打 tag、更新发布说明。给我列个能勾的单子",
    src: `好，四件，做完了跟我说一声：\n\n${fence({ type: "checklist", title: "发 0.0.62 之前", items: ["重跑整套伙伴测评", "在 TestFlight 里看一眼 iPhone 版", "打 v0.0.62 的 tag", "更新发布说明"], tell: true })}`,
  },
  {
    name: "which-repo-zh",
    lang: "zh",
    user: "帮我把那个时好时坏的测试修一下",
    src: `哪个仓库里的？\n\n${fence({ type: "choices", options: ["ducter", "hawdb", "foo"] })}`,
  },
  {
    name: "which-meeting-en",
    lang: "en",
    user: "I can't make both at 10, move one",
    src: `Which one should move?\n\n${fence({ type: "choices", options: ["The dentist", "HawDB weekly"] })}`,
  },
];

/** Edge cases: what fails, what an old or a newer client meets. */
const EDGES: { name: string; lang: string; src: string }[] = [
  { name: "bad-json", lang: "en", src: "Here it is:\n\n```ducter-ui\n{\"type\": \"table\", \"columns\": [\"a\"\n```\n\nThat's all." },
  { name: "only-bad", lang: "en", src: '```ducter-ui\n{"type":"chart","kind":"pie","summary":"x","points":[]}\n```' },
  { name: "too-many-rows", lang: "en", src: fence({ type: "table", columns: ["n", "v"], rows: Array.from({ length: 13 }, (_, i) => [`r${i}`, String(i)]) }) },
  { name: "unclosed", lang: "zh", src: `选一个：\n${fence({ type: "choices", options: ["好", "先不"] }).replace(/\n```$/, "")}` },
  { name: "negatives", lang: "en", src: fence({ type: "chart", kind: "line", title: "Tokyo lows", unit: "°C", summary: "From -3 °C on Monday up to 7 °C by Friday.", points: [{ label: "Mon", value: -3 }, { label: "Tue", value: -1.5 }, { label: "Wed", value: 2 }, { label: "Thu", value: 4.25 }, { label: "Fri", value: 7 }] }) },
  { name: "numbers-table", lang: "en", src: fence({ type: "table", columns: ["Plan", "Price", "Window", "Note"], rows: [["Pro", "$20", "200K", "for most days"], ["Max", "$100", "1M", ""], ["Team", 30, "200K", "per seat"]] }) },
  // research/108 step 4: a cell's own end punctuation is never doubled by the separator after it.
  { name: "sentence-cells-en", lang: "en", src: fence({ type: "table", title: "SQLite or Postgres", columns: ["", "Setup", "Concurrency", "Backups"], rows: [["SQLite", "Zero setup. It's a file inside your app.", "Single writer at a time.", "Copy the file"], ["Postgres", "A server to run!", "Many writers, \"row locks.\"", "pg_dump, or a managed service."]] }) },
  { name: "sentence-cells-zh", lang: "zh", src: fence({ type: "table", columns: ["", "装起来", "并发"], rows: [["SQLite：", "不用装，就是一个文件。", "同一时间只能一个人写！"], ["Postgres", "要跑一个服务器", "可以很多人一起写。"]] }) },
  { name: "sentence-cells-ja", lang: "ja", src: fence({ type: "table", columns: ["", "準備", "同時書き込み"], rows: [["SQLite", "ファイルひとつ。", "一度にひとつだけ。"], ["Postgres", "サーバーが要る", "たくさん書ける。"]] }) },
  { name: "big", lang: "en", src: fence({ type: "chart", kind: "bar", unit: "USD", summary: "Spend rose each month.", points: [{ label: "Sep", value: 1240 }, { label: "Oct", value: 2310.5 }, { label: "Nov", value: 3875 }] }) },
];

const SPLITS: { name: string; text: string; ui: RichUi[] }[] = [
  { name: "plain missing goes last", text: "Words only.", ui: [{ type: "choices", options: ["a", "b"], plain: "- a\n- b" }] },
  { name: "unknown kind is skipped", text: "Before.\n\n- x\n\nAfter.", ui: [{ type: "map", plain: "- x" } as unknown as RichUi] },
  { name: "two blocks", text: "One.\n\n- a\n- b\n\nTwo.\n\n- c\n\nEnd.", ui: [{ type: "checklist", items: ["a", "b"], plain: "- a\n- b" }, { type: "checklist", items: ["c"], plain: "- c" }] },
];

export function build() {
  const parse = [...RICH_REPLIES, ...EDGES].map((r) => ({ name: r.name, lang: r.lang, ...("user" in r ? { user: r.user } : {}), src: r.src, ...parseRich(r.src, r.lang) }));
  const split = [
    ...parse.filter((p) => p.ui.length).map((p) => ({ name: p.name, text: p.text, ui: p.ui, parts: splitRich(p.text, p.ui).map((x) => ("words" in x ? { words: x.words } : { block: x.index })) })),
    ...SPLITS.map((s) => ({ ...s, parts: splitRich(s.text, s.ui).map((x) => ("words" in x ? { words: x.words } : { block: x.index })) })),
  ];
  const model = parse.flatMap((p) => p.ui.map((b, i) => ({ name: `${p.name}#${i}`, block: b, model: richModel(b) })));
  const nums = [0, 1, -1, 0.5, 1.005, 2.999, 12.3456, 1000, 1234567.891, -2500.5, 0.004, -0.004].map((v) => [v, fmtNum(v)]);
  return { parse, split, model, nums };
}

if (import.meta.main) {
  writeFileSync(new URL("./rich.json", import.meta.url), JSON.stringify(build(), null, 1) + "\n");
  console.log("wrote fixtures/rich.json");
}
