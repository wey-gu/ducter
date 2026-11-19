// D385: a demo core for handing several over (design/handover.md): the heavy developer's pile (557
// open, demo-pile.ts) plus one subject that cuts across it, "memory distillation" in acme/mem (English
// titles, Chinese titles, a label the titles miss, every sort group), two computers (this Mac and
// haswell, a worker, both with acme/mem), a fake cheapest model that sorts with subjects and finds by
// meaning, and a fake runner whose plan-first task reads for a moment and reports a real-looking plan
// and whose parts end with draft PRs. Fake gh, fake model: never the real GitHub, never a real model.
//   DUCTER_PORT=7998 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-handover.ts
// DEMO_STAGE picks where it starts:
//   (none)  the pile, sorted: 讲的是 chips; tap one, or 交给{name}, for the sheet
//   conv    the conversation: "把 memory distill 相关的拉出来我们看看" and its set card
//   plan    the plan card in the conversation and on the group's card
//   review  every part done: 一起过目 on the group's card
// DEMO_PLAN_MS (default 4000) and DEMO_TASK_MS (default 15000): how long the plan and each part take.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCore } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import { fakeGh, type FakeIssue } from "../../packages/core/test/fake-gh-issues.ts";
import type { GhRun } from "../../packages/protocol/src/git-login.ts";
import type { Runner, TaskCard } from "../../packages/protocol/src/index.ts";
import { demoAsk, pileIssues } from "./demo-pile.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const stage = process.env.DEMO_STAGE ?? "";
const scratch = mkdtempSync(join(tmpdir(), "ducter-demo-handover-"));
const dataDir = process.env.DUCTER_DATA_DIR || join(scratch, "data");
const DAY = 86_400_000;
const now = Date.now();

/** The subject: 13 in acme/mem, four of them written in Chinese, three found only by their label. */
const MEM: [number, string, string[], number][] = [
  [412, "Distillation: fall back to a smaller result instead of failing", ["component/distillation"], 2],
  [398, "Automatic distillation: the error says nothing useful", [], 3],
  [377, "Distillation gets slow on very long threads", ["component/distillation", "perf"], 4],
  [351, "Newer facts should replace older ones by when they were said", ["component/distillation"], 6],
  [340, "Distillation's first try often fails on long threads", [], 5],
  [322, "Show when automatic distillation has paused", ["component/distillation"], 8],
  [405, "Retry a failed automatic distillation once?", [], 3],
  [366, "长对话的自动提炼总是失败", [], 9],
  [290, "Distillation as a tool loop", ["component/distillation"], 30],
  [384, "提炼出来的记忆有重复", [], 7],
  [359, "提炼后的标题太长", ["component/distillation"], 12],
  [331, "Packets drop the last message when the thread is cut", ["component/distillation"], 11],
  [318, "手动触发提炼的按钮没有反馈", [], 16],
];

function issues(): FakeIssue[] {
  const out = pileIssues(now);
  for (const [n, title, labels, idle] of MEM) out.push({ repo: "acme/mem", number: n, title, state: "open", assigned: true, labels, updated: new Date(now - idle * DAY).toISOString(), ...(n === 412 ? { body: "When the full distillation fails we lose everything; a smaller structured result would be better than nothing." } : {}) });
  return out;
}

/** What each to-do is about, as the person would name it (the sort's subject). */
function subjectOf(title: string): [string, string] {
  const t = title.replace(/ \(\d+\)$/, "");
  if (/istill|提炼|facts|Packets/.test(t)) return ["记忆提炼", "Distillation"];
  if (/sign-in|login|Login|SSO|Okta/i.test(t)) return ["登录", "Sign-in"];
  if (/[Oo]ffline/.test(t)) return ["离线模式", "Offline mode"];
  if (/^Docs:|install page|runbook/.test(t)) return ["文档", "Docs"];
  if (/alt text|Accessibility|Button label|keyboard/.test(t)) return ["无障碍", "Accessibility"];
  if (/Dark mode|Footer|Settings page|dashboard|date picker|pricing/i.test(t)) return ["网页界面", "Web UI"];
  if (/CI|CDN|Terraform|staging|runners|alert/.test(t)) return ["基础设施", "Infrastructure"];
  if (/[Bb]illing|Postmark|\bSES\b|audit log/.test(t)) return ["计费", "Billing"];
  if (/Android|share action|tablet|mobile|onboarding/i.test(t)) return ["手机应用", "Mobile app"];
  if (/importer|GraphQL|monolith|memory spike/i.test(t)) return ["数据导入", "Data import"];
  return ["其他", "Other"];
}

/** The demo's cheapest model: the pile's sort (with subjects), and a find by meaning. */
function ask(): (prompt: string) => Promise<{ text: string; tokens: number }> {
  const sort = demoAsk(zh, Number(process.env.DEMO_SORT_MS ?? 200));
  return async (prompt) => {
    if (prompt.includes("<query>")) {
      await Bun.sleep(Number(process.env.DEMO_FIND_MS ?? 900));
      const q = /<query>([\s\S]*?)<\/query>/.exec(prompt)![1]!;
      const rows = JSON.parse(/<todos>\n([\s\S]*)\n<\/todos>/.exec(prompt)![1]!) as { id: number; title: string }[];
      const about = /distill|memory|提炼|记忆/i.test(q) ? /istill|提炼|facts|Packets/ : /sign|login|登录/i.test(q) ? /sign-in|login|SSO|Okta/i : /offline|离线/i.test(q) ? /[Oo]ffline/ : null;
      const subject = /distill|memory|提炼|记忆/i.test(q) ? (zh ? "记忆提炼" : "memory distillation") : q;
      return { text: JSON.stringify({ subject, ids: about ? rows.filter((r) => about.test(r.title)).map((r) => r.id) : [] }), tokens: 20000 };
    }
    if (prompt.includes("<diff>")) return sort(prompt);
    const got = await sort(prompt);
    const rows = JSON.parse(/<todos>\n([\s\S]*)\n<\/todos>/.exec(prompt)![1]!) as { id: number; title: string; idleDays?: number }[];
    const out = (JSON.parse(got.text) as { id: number; group: string; why: string; size?: string }[]).map((v) => {
      const r = rows.find((x) => x.id === v.id)!;
      const s = subjectOf(r.title)[zh ? 0 : 1];
      // The subject's own: what a careful sort would say of each.
      const m = MEM.find((x) => x[1] === r.title);
      if (m) {
        const n = m[0];
        if (n === 405) return { id: v.id, group: "decide", why: zh ? "要不要重试是产品上的选择" : "A product choice", ask: zh ? "要不要给失败的自动提炼一次有限的重试？" : "Give a failed automatic distillation one bounded retry?", pick: "hand", subject: s };
        if (n === 366 || n === 290) return { id: v.id, group: "later", why: zh ? (n === 366 ? "改动大，得先查清原因" : "改动大，得先拆开") : n === 366 ? "Big; find the cause first" : "Big; needs breaking down first", size: "large", subject: s };
        if (n === 359 || n === 318) return { id: v.id, group: "decide", why: zh ? "两种做法，要你挑" : "Two ways to go", ask: zh ? (n === 359 ? "标题截短还是让模型重写？" : "按钮是显示进度还是只给一个提示？") : n === 359 ? "Cut the title, or have the model rewrite it?" : "Show progress, or just a notice?", pick: "later", subject: s };
        const why = { 412: ["说得清楚，改一处", "Clear; one place to change"], 398: ["说得清楚，改动小", "Clear, and a small change"], 377: ["说得清楚，要测性能", "Clear; needs a speed test"], 351: ["说得清楚，改动小", "Clear, and a small change"], 340: ["说得清楚，要跑一批对话验证", "Clear; check on a batch of threads"], 322: ["说得清楚，改动小", "Clear, and a small change"], 384: ["说得清楚，改去重", "Clear; fix the dedupe"], 331: ["说得清楚，改一处", "Clear; one place to change"] }[n] ?? ["说得清楚", "Clear"];
        return { id: v.id, group: "do", why: why[zh ? 0 : 1], size: [377, 340, 412].includes(n) ? "medium" : "small", subject: s };
      }
      return { ...v, subject: s };
    });
    return { text: JSON.stringify(out), tokens: got.tokens };
  };
}

const gh = fakeGh(issues(), { login: "lin-dev" });
// GitHub's checks for the parts' PRs: one failed (Windows), the rest passed.
const ghRun: GhRun = async (args, x) => {
  if (args[0] === "pr" && args[1] === "checks") {
    const n = Number(args[2]);
    return { code: 0, out: JSON.stringify(n % 4 === 2 ? [{ bucket: "pass" }, { bucket: "fail" }] : [{ bucket: "pass" }, { bucket: "pass" }]), err: "" };
  }
  if (args.includes("PATCH") || args.includes("POST")) await Bun.sleep(Number(process.env.DEMO_WRITE_MS ?? 160));
  return gh.run(args, x);
};

const core = startCore({
  ooSource: noOo,
  dataDir,
  persona: { id: "default", name: zh ? "小鸭" : "Duckie", identity: "" },
  hostname: process.env.DUCTER_HOST || "127.0.0.1",
  taskSources: { ghRun, ghEnv: {}, home: join(scratch, "home"), quietMs: 0, pollMs: 3_600_000, ask: ask() },
  // Two computers: this Mac and haswell (a worker), each with acme/mem and acme/web checked out.
  newTaskComputers: {
    nameOf: (dev: string) => (dev === "w-haswell" ? "haswell" : undefined),
    homeName: () => "MacBook Pro",
    workers: () => [{ id: "w-haswell", name: "haswell", online: true }],
    folderInfo: async () => "offline",
    repos: async () => ({ folder: "/home/lin/ducter", repos: [{ path: "/home/lin/mem", name: "mem", remote: "github.com/acme/mem", touchedAt: new Date(now - DAY).toISOString() }] }),
  } as never,
  homeRepos: () => ({ folder: join(scratch, "ducter"), repos: [{ path: "/Users/lin/dev/mem", name: "mem", remote: "github.com/acme/mem", touchedAt: new Date(now - DAY).toISOString() }, { path: "/Users/lin/dev/web", name: "web", remote: "github.com/acme/web", touchedAt: new Date(now - 2 * DAY).toISOString() }] }),
} as never);
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en" });

const ts = core.taskSources;
const ho = ts.handover!;

/** The plan a careful lead part would report for the subject set (refs from the set only). */
function planFor(refs: string[]) {
  const has = (n: number) => refs.includes(`acme/mem#${n}`);
  const R = (ns: number[]) => ns.filter(has).map((n) => `acme/mem#${n}`);
  return {
    fixed: has(351) ? [{ ref: "acme/mem#351", where: "PR #360", comment: "This was fixed in #360 (merged): newer facts now replace older ones by when they were said. Closing." }] : [],
    one: R([398, 412, 405]).length ? [{ refs: R([398, 412, 405]), title: zh ? "失败时退一步，并重试一次" : "Step back on failure, and retry once", why: zh ? "都是自动提炼失败时怎么退一步，改的是同一处；加上一次有限的重试（你定的）" : "All about how distillation steps back when it fails, in the same place; plus one bounded retry (your call)" }] : [],
    line: [
      ...(has(377) ? [{ refs: ["acme/mem#377"], title: zh ? "长对话的组包变快" : "Faster packets on long threads", why: zh ? "先做：后面两件都用到它改的组包" : "First: the other two use the packet code it changes" }] : []),
      ...(has(340) ? [{ refs: ["acme/mem#340"], title: zh ? "第一次就能提炼成功" : "Succeed on the first try", why: zh ? "从 #377 的分支接着做" : "From #377's branch" }] : []),
      ...(has(322) ? [{ refs: ["acme/mem#322"], title: zh ? "暂停时在任务记录里说一声" : "Say when it paused, in Task History", why: zh ? "最后：把暂停的样子放进任务记录" : "Last: the pause shown in Task History" }] : []),
    ],
    side: R([384, 331]).map((r) => ({ refs: [r], title: "", why: zh ? "跟其他几件不相干" : "Independent of the rest" })),
    later: [],
    limits: zh ? ["都在 haswell 上验证", "不动数据库迁移"] : ["Every check on haswell", "No database migrations"],
  };
}

/** Tasks open for real on the board; the plan's reads for a moment, then reports; each part ends with a draft PR. */
function runner(): Runner {
  let n = 0;
  const planMs = Number(process.env.DEMO_PLAN_MS ?? 4000);
  const taskMs = Number(process.env.DEMO_TASK_MS ?? 15000);
  return {
    harness: { start: async () => ({}) as never, available: async () => [] },
    async openTask(input: Parameters<Runner["openTask"]>[0]): Promise<TaskCard> {
      const taskId = `th${++n}`;
      const k = n;
      const planning = input.brief.includes("plan_report");
      core.log.append({ stream: `task:${taskId}`, origin: "partner", kind: "task_open", body: { taskId, title: input.title, project: input.project ?? "", place: input.place ?? { kind: "none" }, harness: input.harness ?? "codex", brief: input.brief, language: zh ? "zh" : "en" } });
      core.tasks.setState(taskId, "working", "hot");
      setTimeout(
        () => {
          if (planning) {
            const refs = [...input.brief.matchAll(/^- (acme\/[\w-]+#\d+):/gm)].map((m) => m[1]!);
            ho.planReport(taskId, planFor(refs));
            core.log.append({ stream: `task:${taskId}`, origin: "task", kind: "report", body: { taskId, state: "done", summary: zh ? "看完了：一件已经修好，其余排好了。" : "Read them all: one is already fixed, the rest are planned.", questions: [], evidence: [] } });
            core.tasks.setState(taskId, "done", "cold");
            return;
          }
          const pr = 420 + k;
          core.log.append({ stream: `task:${taskId}`, origin: "task", kind: "report", body: { taskId, state: "done", summary: zh ? `改好了，在 haswell 上跑过测试；草稿 PR #${pr}。` : `Fixed and tested on haswell; draft PR #${pr}.`, questions: [], evidence: [{ kind: "url", label: `PR #${pr}`, ref: `https://github.com/acme/mem/pull/${pr}` }] } });
          core.tasks.setState(taskId, "done_claimed", "cold");
        },
        planning ? planMs : taskMs + n * 900,
      );
      return core.tasks.get(taskId)!;
    },
    send: async () => ({ delivered: "prompted" as const }),
    interrupt: async () => {},
    drop: async () => {},
  } as unknown as Runner;
}
core.setRunner(runner());

const say = (origin: "user" | "partner", text: string) => core.log.append({ stream: "channel", origin, kind: origin === "user" ? "user_msg" : "ai_msg", body: { text } } as never);
const until = async (ok: () => unknown) => {
  while (!ok()) await Bun.sleep(100);
};

await ts.add("github");
await ts.look();
await until(() => ts.view().pile?.sortedAt && !ts.view().pile?.sorting);

const subjectName = zh ? "记忆提炼" : "Distillation";
if (stage === "conv" || stage === "plan" || stage === "review") {
  say("user", zh ? "把 memory distill 相关的拉出来我们看看" : "Pull out everything about memory distill so we can look");
  const s = await ho.set({ query: "memory distill" });
  const decide = s.refs.filter((r) => !s.ticked.includes(r));
  say("partner", zh ? `找到 ${s.found.n} 件讲记忆提炼的。能直接交给我的 ${s.ticked.length} 件先勾上了；#405 要你定一下；两件改动大，先放着。` : `${s.found.n} are about memory distillation. I ticked the ${s.ticked.length} I can take now; #405 needs your call; two are big, so they wait.`);
  void decide;
  if (stage !== "conv") {
    say("user", zh ? "就这几个，#405 也加上，按你的建议。先别动数据库迁移，验证都去 haswell 上跑。" : "Just these, plus #405 your way. Leave the database migrations alone and run every check on haswell.");
    const note = zh ? "先别动数据库迁移，验证都去 haswell 上跑。" : "Leave the database migrations alone and run every check on haswell.";
    const r = await ho.hand({ refs: [...s.ticked, "acme/mem#405"], note, setId: s.setId, bySubject: true, subject: subjectName });
    say("partner", zh ? "好，我先看一遍，出个方案给你，你点头再做。" : "OK. I'll read them first and show you a plan; nothing starts until you say so.");
    await until(() => core.taskGroups.get(r.groupId!)?.hand?.plan?.state === "ready");
    if (stage === "review") {
      await ho.answerPlan(r.groupId!, "go");
      await until(() => core.taskGroups.get(r.groupId!)?.hand?.review === "ready");
    }
  }
}
console.log(`[demo] handover up at http://127.0.0.1:${core.port}/app (stage: ${stage || "pile"}; data: ${core.dataDir}; scratch: ${scratch})`);
