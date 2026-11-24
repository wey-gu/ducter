// A demo core for older messages paging in (D509): two days of a developer's conversation, 360
// messages with a read receipt after each answer (as the Log has them), longer than the window a
// fresh open gets, crossing midnight twice. Scroll up: the older ones come a page at a time.
//   DUCTER_PORT=7799 DUCTER_DATA_DIR=/tmp/x bun apps/web/demo-older.ts
// DEMO_SLOW_MS: how long the home takes to answer a page (to see the quiet line); default 600.
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

let shift = 0;
const clock = { now: () => Date.now() + shift, setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>) };
const core = startCore({ ooSource: noOo, clock, persona: { id: "default", name: "Ducter", identity: "" }, hostname: process.env.DUCTER_HOST || "127.0.0.1" });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
const log = core.log;

const asks = [
  "CI 又红了，看一下是哪个测试", "PR #45 的评论都回了吗", "把 nightly 的 e2e 时间降一下",
  "hel 上的 Ducter 升到最新了吗", "帮我看下 Mem 的 Bridge 为什么连不上", "发版说明写一下",
  "iOS 模拟器里看一下手机的设置页", "Android 那个折叠屏布局再检查一次", "把昨天那个任务接着做完",
  "看下 Codex 这周的用量还剩多少", "给 Weizhen 的反馈整理成几条", "把 on-hand 那条横条的高度对齐",
];
const answers = [
  "看了：是一个测试用了真时钟，偶尔超时。我改成了假时钟，连跑 20 次都过了。",
  "都回了，还剩一条要你定：要不要把重试次数调到 3。我建议不调，先找原因。",
  "录屏在 CI 上退回了软件编码。改成只在失败时录，18 分钟降到 9 分钟。",
  "升到了 0.1.30，重启后会话都在，正在跑的两个任务也接上了。",
  "Mem 那边返回 503，是它的服务端忙。我过半小时再试一次，好了告诉你。",
  "草稿写好了，放在 PR 里，最上面两条是这次最显眼的改动。",
  "看了，设置页在大字号下第二行会挤，我把它改成换行了，截图在任务里。",
  "折叠屏展开时左右两栏都对，合上时底部栏遮住了一行，已经修了。",
  "接着做完了：剩下的两个测试补上了，CI 是绿的，等你合并。",
  "这周还剩不到一半，按现在的用法够用到周日。",
  "整理成了七条，按影响从大到小排好了，要我直接发给他吗？",
  "对齐了：横条和卡片的边现在在同一条线上，1000 和 1400 宽都看过。",
];
shift = -(180 * 11.7 * 60_000);
for (let i = 0; i < 180; i++) {
  const k = i % asks.length;
  const round = Math.floor(i / asks.length);
  log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: round ? `${asks[k]}（第 ${round + 1} 次）` : asks[k]! } });
  shift += 40_000;
  const a = log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: answers[k]! } });
  log.append({ stream: "channel", origin: "user", kind: "read_receipt", body: { upToSeq: a.seq } });
  shift += 11 * 60_000;
}
shift = 0;

// The home takes a moment over a tunnel: a page answers after DEMO_SLOW_MS.
const slow = Number(process.env.DEMO_SLOW_MS ?? "600");
if (slow > 0) {
  const read = log.read.bind(log);
  // A page of the conversation is the one read with beforeSeq on the channel (the latency is felt as a pause).
  (log as { read: typeof log.read }).read = (o) => {
    if (o.beforeSeq != null && o.stream === "channel" && !o.kinds) Bun.sleepSync(slow);
    return read(o);
  };
}
console.log(`[demo] up at http://127.0.0.1:${core.port}/app (data: ${core.dataDir})`);
