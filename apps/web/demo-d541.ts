// D541: four partners, each with a long conversation (1500+ messages over six weeks, its task
// cards, its questions and a Keep's receipt), as the author's home on hel holds them, to measure and
// show a partner switch. The work partner talks about this repo's own commit subjects.
//   DUCTER_PORT=7941 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh DEMO_LONG=760 bun apps/web/demo-d541.ts
// DEMO_LONG is the exchanges per partner (each a message and its answer, so 760 is 1520 messages).
import { startCore, stubRunner, realClock } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import type { Place } from "@ducter/protocol";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const w = (z: string, e: string) => (zh ? z : e);
const N = Number(process.env.DEMO_LONG ?? 760);
let skew = 0;
const clock = { ...realClock, now: () => Date.now() + skew };
const core = startCore({ ooSource: noOo, persona: { id: "default", name: "Ducter", identity: "" }, hostname: process.env.DUCTER_HOST || "127.0.0.1", clock, partners: true });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en" });
const log = core.log;

const subjects = (() => {
  const r = Bun.spawnSync(["git", "log", "--no-merges", "--format=%s", "-n", "900"], { cwd: import.meta.dir });
  const out = r.stdout.toString().trim().split("\n").filter((s) => s && !/^\d+\.\d+\.\d+/.test(s));
  return out.length > 20 ? out : ["Fix the flaky compaction test in HawDB", "Partner list: names from 1200 points", "Web: reconnect without a blank page"];
})();

type Talk = { you: (i: number) => string; me: (i: number) => string; task: (i: number) => string; ask: (i: number) => string; keep: [string, string, string] };
const pick = <T,>(xs: T[], i: number) => xs[i % xs.length]!;
const work: Talk = {
  you: (i) => pick([w(`「${pick(subjects, i)}」合进去了吗？要我看什么吗`, `Did "${pick(subjects, i)}" land? Anything I should check?`), w(`把「${pick(subjects, i)}」的截图发我看一下`, `Send me the shots for "${pick(subjects, i)}"`), w(`hel 上「${pick(subjects, i)}」那个 PR 的 CI 怎么样了`, `How's CI on the "${pick(subjects, i)}" PR on hel?`)], i),
  me: (i) =>
    pick(
      [
        w(`合进去了：**${pick(subjects, i)}**。\n\n- 在 \`main\` 上，测试全过（0 fail）\n- \`bun scripts/check-links.ts\` 也过了\n- 手机上要看一眼的是卡片的第二行`, `Landed: **${pick(subjects, i)}**.\n\n- on \`main\`, tests green (0 fail)\n- \`bun scripts/check-links.ts\` passes\n- one thing to look at on your phone: the card's second line`),
        w(`${pick(subjects, i)}：发布了，没有要你做的。`, `${pick(subjects, i)}: it's in and released; nothing needs you.`),
        w(`看了一下：${pick(subjects, i)}。测试过了，截图在 gallery 里。要我开个任务把文案理一理吗？`, `I looked at it: ${pick(subjects, i)}. The tests pass; the shots are in the gallery. Want me to open a task to tidy the copy?`),
      ],
      i,
    ),
  task: (i) => pick(subjects, i * 7),
  ask: (i) => w(`「${pick(subjects, i * 3)}」可以合了，现在合吗？`, `"${pick(subjects, i * 3)}" can merge. Merge it now?`),
  keep: [w("Nowledge Mem 的 PR，一直跟到能合并", "Nowledge Mem PRs, each until it can merge"), w("每 45 分钟", "Every 45 minutes"), w("有能合并的", "One can merge")],
};
const home: Talk = {
  you: (i) => pick([w("周六上午带小米去看牙，帮我约一下社区那家诊所", "Book Mia a dentist appointment at the clinic down the road, Saturday morning"), w("这周的菜帮我列个单子，周四之前要买好", "Make this week's grocery list, everything bought by Thursday"), w("小米的家长会是哪天来着？", "When is Mia's parent-teacher evening again?"), w("物业说下周三停水，提醒我前一天晚上接点水", "The building's water is off next Wednesday; remind me the night before to fill some up"), w("妈妈的降压药快吃完了，帮我看看哪天去开", "Mum's blood pressure pills are nearly out; when can I get the prescription?"), w("周日游泳课改到几点了？", "What time did Sunday's swimming lesson move to?")], i),
  me: (i) => pick([w("诊所周六上午还有 9:30 和 10:45 两个号。9:30 那个离游泳课近一点。", "The clinic has 9:30 and 10:45 open on Saturday morning. 9:30 sits closer to her swimming lesson."), w("列好了：牛奶两盒、鸡蛋一板、青菜、豆腐、小米爱吃的蓝莓。放在购物清单里了，周三晚上提醒你。", "Done: two cartons of milk, a tray of eggs, greens, tofu, and the blueberries Mia likes. It's on the shopping list; I'll remind you Wednesday evening."), w("家长会是 11 月 28 日周五晚上 6 点半，在三楼的教室。", "Parent-teacher evening is Friday 28 November at 6:30, in the classroom on the third floor."), w("记下了，下周二晚上 9 点提醒你接水。", "Noted. I'll remind you at 9 on Tuesday evening to fill some up."), w("社区医院周一到周五上午都能开，带上医保卡和上次的病历。", "The community clinic writes them weekday mornings; bring the insurance card and last visit's notes."), w("改到下午 3 点了，教练在群里说的，地点不变。", "It moved to 3 in the afternoon; the coach said so in the group. Same pool.")], i),
  task: (i) => pick([w("查社区游泳馆周日的课", "Sunday swimming lessons at the pool"), w("比一比三家儿童牙科的价格", "Compare three children's dentists' prices"), w("找一个周末能去的亲子农场", "A family farm to visit at the weekend")], i),
  ask: (i) => pick([w("约周六 9:30 吗？", "Book Saturday at 9:30?"), w("把家长会加到日历里吗？", "Add the parent-teacher evening to the calendar?")], i),
  keep: [w("小米的疫苗提醒", "Mia's vaccine reminders"), w("每月 1 号", "The 1st of each month"), w("快到日子了", "When one is due")],
};
const reading: Talk = {
  you: (i) => pick([w("这周跑了多少公里？", "How far did I run this week?"), w("《置身事内》读到哪儿了，帮我记一下第六章的笔记", "Where am I in the economics book? Note chapter six for me"), w("周末天气怎么样，适合去爬山吗", "What's the weekend weather like? Good for a hike?"), w("下个月的半马报名截止是哪天", "When does next month's half marathon close?"), w("推荐两本像《人类简史》那样的书", "Recommend two books like Sapiens")], i),
  me: (i) => pick([w("这周跑了 23.6 公里，四次，最长一次 8.2 公里，配速比上周快了 12 秒。", "23.6 km this week over four runs; the longest 8.2 km, pace 12 seconds faster than last week."), w("记下了第六章：地方债的来路和城投。下次你打开笔记就在最上面。", "Chapter six noted: where local debt comes from, and the city investment companies. It's at the top of your notes."), w("周六晴，16 到 22 度，风小，适合爬山；周日下午有雨。", "Saturday is clear, 16 to 22 degrees with little wind: good for a hike. Rain Sunday afternoon."), w("报名 11 月 30 日晚上 10 点截止，还剩 400 个名额。", "Entries close at 10 pm on 30 November; 400 places left."), w("《枪炮、病菌与钢铁》和《万历十五年》。第一本更像，第二本更好读。", "Guns, Germs and Steel, and 1587, a Year of No Significance. The first is closer; the second reads easier.")], i),
  task: (i) => pick([w("整理这个月的跑步记录", "This month's runs in one table"), w("找周末爬山的路线", "A hiking route for the weekend")], i),
  ask: (i) => pick([w("帮你报名半马吗？", "Enter you for the half marathon?"), w("把这两本加到想读的书里吗？", "Add both to your want-to-read list?")], i),
  keep: [w("半马报名", "Half marathon entries"), w("每天早上 8:00", "Every day at 8:00"), w("开放报名时", "When entries open")],
};
const money: Talk = {
  you: (i) => pick([w("这个月的报销帮我整理一下，发票都在邮箱里", "Sort out this month's expenses, the receipts are all in my mail"), w("信用卡这期账单多少，哪天还", "How much is this card statement, and when is it due?"), w("车险快到期了，比一比今年的价格", "The car insurance is nearly up; compare this year's prices"), w("上个月外卖花了多少", "How much went on takeaway last month?"), w("房租这个月转了吗", "Did this month's rent go out?")], i),
  me: (i) => pick([w("找到 7 张发票，合计 2,318 元。打车那张抬头写错了，要重开吗？", "I found 7 receipts, 2,318 in all. The taxi one has the wrong company name on it."), w("这期 6,742.18 元，12 月 5 日到期，自动还款开着。", "This statement is 6,742.18, due 5 December; autopay is on."), w("三家报价：平安 3,860、人保 3,720、太保 3,905。人保的含玻璃险。", "Three quotes: 3,860, 3,720 and 3,905. The 3,720 one includes glass cover."), w("上个月外卖 1,126 元，32 单，比前一个月少了 180。", "Takeaway last month was 1,126 over 32 orders, 180 less than the month before."), w("转了，11 月 1 日早上 9 点，6,500 元，房东回了收到。", "Yes, 6,500 on 1 November at 9 am; the landlord said it arrived.")], i),
  task: (i) => pick([w("整理 11 月的报销", "November's expenses"), w("比一比车险报价", "Compare car insurance quotes")], i),
  ask: (i) => pick([w("让司机重开那张打车发票吗？", "Ask for the taxi receipt to be reissued?"), w("续保人保那家吗？", "Renew with the 3,720 one?")], i),
  keep: [w("信用卡还款日", "Card due dates"), w("每月 1 号", "The 1st of each month"), w("还款前三天", "Three days before one is due")],
};

const repo = (repoPath: string, branch: string): Place => ({ kind: "repo", device: "MacBook", repoPath, branch, baseBranch: "main" });
const DAY = 86_400_000;
let task = 0;
async function seedTalk(stream: string, talk: Talk, tag: string) {
  for (let i = 0; i < N; i++) {
    // Six weeks, oldest first, about 18 exchanges a day.
    skew = -Math.round(((N - i) / N) * 42 * DAY);
    const u = log.append({ stream, origin: "user", kind: "user_msg", body: { text: talk.you(i) } });
    if (i % 25 === 7) {
      // A task card: the partner opens it, it works, it comes back done.
      const id = `t_${tag}${++task}`;
      const title = talk.task(i);
      log.append({ stream, origin: "partner", kind: "ack", body: { jobId: `j_${id}`, text: w("好，我开一个任务去做，好了告诉你。", "On it. I'm opening a task; I'll tell you when it's done."), replyTo: u.seq } });
      log.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", ...(stream === "channel" ? {} : { persona: stream.slice(8) }), body: { taskId: id, title, project: tag === "w" ? "ducter" : "", place: tag === "w" ? repo("~/dev/ducter", `ducter/${id}`) : { kind: "none" }, harness: "claude-code", model: "opus", brief: title } });
      log.append({ stream, origin: "partner", kind: "job_status", body: { jobId: `j_${id}`, text: w("在做", "Working"), state: "running", taskId: id } });
      const last = i > N - 30;
      log.append({ stream: `task:${id}`, origin: "task", kind: "report", body: { taskId: id, state: last ? "progress" : "done", summary: last ? w("在做，过半了", "Under way, past halfway") : talk.me(i).split("\n")[0]!.slice(0, 120), questions: [], evidence: [] } });
      core.tasks.setState(id, last ? "working" : "done", last ? "hot" : "parked");
      if (!last) log.append({ stream, origin: "partner", kind: "job_status", body: { jobId: `j_${id}`, text: w("做好了", "Done"), state: "done", taskId: id } });
      continue;
    }
    log.append({ stream, origin: "partner", kind: "ai_msg", body: { text: talk.me(i), replyTo: u.seq } });
    if (i % 60 === 31 || i === N - 2) {
      const id = `d_${tag}${i}`;
      log.append({ stream, origin: "partner", kind: "decision", body: { decisionId: id, question: talk.ask(i), goLabel: w("好", "Yes"), defaultOption: "hold", reversible: true } });
      if (i !== N - 2) core.decisions.decide(id, "go");
    }
    if (i % 250 === 120) {
      const [title, when, speaks] = talk.keep;
      log.append({ stream, origin: "partner", kind: "ai_msg", body: { text: w(`好，我来照看：${when}看一次，${speaks}就告诉你。`, `Done, I'll look after it: ${when.toLowerCase()}, a word when ${speaks.toLowerCase()}.`), keep: { id: `k_${tag}${i}`, title, when, speaks, until: w("你说停", "You say stop"), first: w("现在还没有", "Nothing yet") } } });
    }
  }
  skew = 0;
}

const t0 = Date.now();
core.partners.set("default", { about: w("工作、代码和发布", "work, code and releases") });
await seedTalk("channel", work, "w");
for (const [name, look, about, talk, tag] of [
  [w("小家", "Home"), "sage", w("家里的事、看病、孩子", "home, the doctor, the kids"), home, "h"],
  [w("多比", "Dobby"), "sky", w("读书、跑步和周末的安排", "reading, running and weekend plans"), reading, "r"],
  [w("小新", "Sunny"), "plum", w("账单、报销和保险", "bills, expenses and insurance"), money, "m"],
] as const) {
  const p = core.partners.add({ name, look, about });
  if (p.ok) await seedTalk(`channel:${p.partner.id}`, talk, tag);
}
const sizes = core.partners.list().map((p) => `${p.name}=${log.read({ stream: p.id === "default" ? "channel" : `channel:${p.id}`, limit: 100_000 }).length}`);
console.log(`[demo] D541 seeded in ${Date.now() - t0} ms: ${sizes.join(" ")}`);
console.log(`[demo] Ducter demo is up at http://127.0.0.1:${core.port}/app (data: ${core.dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
