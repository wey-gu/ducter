// The author's 2026-11-27 web polish pass, as one demo core (0.1.97, desktop Chrome ~1900 wide):
// the to-do sources rows with their buttons, a done card whose title came from the user's own long
// sentence, an opened task beside the rail (a blocked row with diff counts and a time), a command
// whose output redraws itself with carriage returns and ANSI, the locator's marks at the transcript's
// right edge, a 「Ducter 提醒了它一句」 divider at 18:32, the whole-screen header with a pager, a
// branch, the workbench, Share and ⋯, and one app the partner keeps filling (its card should stand
// once, not after every turn). Never this machine's gh, oo, Mem, agent CLI or port 7777.
//   DUCTER_PORT=7701 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-web-polish.ts
// then open http://127.0.0.1:7701/app (On hand: #onhand, #onhand/full; the task: #task=5ypolish/full).
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies, HarnessEvent, HarnessPort, HarnessSession, Place, Runner, TaskCard } from "@ducter/protocol";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import { fakeGh } from "../../packages/core/test/fake-gh-issues.ts";
import { createPartner } from "../../packages/partner/src/partner.ts";
import { pileIssues } from "./demo-pile.ts";
import { demoAsk } from "./demo-pile.ts";
import { titleFromWords } from "../../packages/core/src/newtask.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const w = (z: string, e: string) => (zh ? z : e);
const scratch = mkdtempSync(join(tmpdir(), "ducter-demo-web-polish-"));
const dataDir = process.env.DUCTER_DATA_DIR || join(scratch, "data");
mkdirSync(dataDir, { recursive: true });
const persona = { id: "default", name: zh ? "小鸭" : "Duckie", identity: "" };
const MIN = 60_000;
const HOUR = 60 * MIN;

// A fake gh with a heavy developer's pile (557 assigned + two PRs asking for review), sorted by the
// demo's cheapest model: the 你的待办 card with its 挑几个交给我 / 去看看 buttons.
const gh = fakeGh(pileIssues(), { login: "lin-dev" });
const taskSources = { ghRun: gh.run, ghEnv: {}, home: join(scratch, "home"), quietMs: 0, pollMs: 3_600_000, ask: demoAsk(zh, 10) };
const clock = { now: () => Date.now(), setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>) };
const core = startCore({ dataDir, port: Number(process.env.DUCTER_PORT ?? 0), push: false, persona, ooSource: noOo, clock, taskSources });
core.setRunner(stubRunner(core));
core.settings.set({ language: zh ? "zh" : "en" });
const log = core.log;
const tick = () => Bun.sleep(12);
const iso = (ms: number) => new Date(Date.now() + ms).toISOString();
const at = async (ms: number) => {
  await Bun.sleep(8);
  shift = ms;
};
let shift = -12 * HOUR;
const now = () => Date.now() + shift;
const ev = (id: string, b: Omit<Bodies["task_event"], "taskId">) => log.append({ stream: `task:${id}`, origin: "task", kind: "task_event", body: { taskId: id, ...b } });
const tool = (id: string, name: string, input: unknown, output = "", ok = true) => ev(id, { role: "tool", tool: { name, input, output, ok } });
const say = (id: string, text: string) => ev(id, { role: "assistant", text });
const report = (id: string, r: Omit<Bodies["report"], "taskId" | "questions">) => log.append({ stream: `task:${id}`, origin: "task", kind: "report", body: { taskId: id, questions: [], ...r } });
const repo = (name: string, branch: string): Place => ({ kind: "repo", device: "local", repoPath: `/Users/lin/code/${name}`, branch, baseBranch: "main", hasRemote: true } as Place);
let openN = 0;
async function open(id: string, title: string, project: string, place: Place, harness = "codex", model = "gpt-6-luna") {
  log.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", body: { taskId: id, title, project, place, harness, model, brief: title, origin: "partner" } });
  core.tasks.setState(id, "working", "hot");
  await tick();
}

// ---------- the opened task: a long title, a working copy, a transcript with a redrawing command ----------
const ID = "5ypolish";
const LONG = w(
  "修复设置页的 OpenAI 自定义 Base URL 与模型切换后保存不生效，以及服务端返回的错误没有显示在界面上",
  "Fix the Settings page: a custom OpenAI Base URL and model do not stay after a switch, and the server's error never shows",
);
await at(-(3 * HOUR + 20 * MIN));
await open(ID, LONG, "ducter", repo("ducter", "ducter/settings-base-url"));
log.append({ stream: `task:${ID}`, origin: "you", kind: "task_open", body: { taskId: ID, title: LONG, project: "ducter", place: repo("ducter", "ducter/settings-base-url"), harness: "codex", brief: w("设置页换 Base URL 和模型之后没保存住，报错也看不到。", "The Base URL and model don't stay after a switch, and the error is invisible.") } });
await tick();
say(ID, w("先看设置页怎么保存这两个字段。", "First, how the Settings page saves these two fields."));
tool(ID, "commandExecution", { command: "git add -A && git status --short" }, "Updating files:  21% (6521/31050)\rUpdating files:  42% (13041/31050)\rUpdating files:  67% (20803/31050)\rUpdating files:  91% (28255/31050)\rUpdating files: 100% (31050/31050)\rDone\n\x1b[32mM\x1b[0m src/settings/openai.tsx\n\x1b[32mM\x1b[0m src/settings/store.ts");
await at(-(3 * HOUR + 12 * MIN));
log.append({ stream: `task:${ID}`, origin: "task", kind: "task_event", body: { taskId: ID, role: "user", from: "ducter", text: w("设置页那个 Base URL 的输入框，切模型时会被重置；服务端的 400 也没显示出来。", "The Base URL field resets when the model changes, and the server's 400 never shows.") } });
await at(-(3 * HOUR + 10 * MIN));
say(ID, w("找到了：切模型时把整份 draft 重置了；错误提示只 console.error。", "Found it: switching the model resets the whole draft; the error only goes to console.error."));
tool(ID, "fileChange", { path: "src/settings/openai.tsx" }, "", true);
await at(-(3 * HOUR + 4 * MIN));
say(ID, w("把 Base URL 和模型各自保存，400 的错误原文放到输入框下面；跑一下相关测试。", "Saving Base URL and model separately, putting the server's 400 under the field; running the tests."));
tool(ID, "commandExecution", { command: "bun test apps/web/test/settings.test.ts" }, "bun test v1.4.4\n\nsettings > keeps a custom base URL across a model switch\n✓ 1 pass\n\n 1 pass, 0 fail");
await at(-(3 * HOUR + 1 * MIN));
report(ID, {
  state: "done",
  summary: w("改好了：Base URL 和模型分开保存，切模型不再重置；服务端 400 的原文显示在输入框下面；补了 2 个回归测试。", "Fixed: Base URL and model save separately, a model switch no longer resets; the server's 400 text shows under the field; 2 regression tests."),
  evidence: [{ kind: "url", label: "PR #11188", ref: "https://github.com/acme/ducter/pull/11188" }],
  branch: { commits: 3, uncommitted: false, files: 6, adds: 142, dels: 37 },
});
core.tasks.setState(ID, "done", "warm");
// A second report is the newest result, so the locator has a report ring and the page opens on it.
await at(-(2 * HOUR + 50 * MIN));
say(ID, w("补上了服务端 400 的原文，测试也过了。", "The server's 400 text is in, and the tests pass."));
await at(-(2 * HOUR + 40 * MIN));
tool(ID, "commandExecution", { command: "git diff --stat" }, " 6 files changed, 142 insertions(+), 37 deletions(-)");
// A third turn, so the locator has a session to draw; and the reminder divider at 18:32.
const eight = new Date();
eight.setHours(18, 32, 0, 0);
await at(eight.getTime() - Date.now());
log.append({ stream: `task:${ID}`, origin: "task", kind: "task_event", body: { taskId: ID, role: "user", from: "ducter", text: w("提醒一句：设置页的 400 原文要显示在输入框下面，不要只写进日志。", "One reminder: the server's 400 text goes under the field, not only into the log.") } });
await at(-(2 * HOUR + 20 * MIN));
log.append({ stream: `task:${ID}`, origin: "you", kind: "task_event", body: { taskId: ID, role: "user", text: w("顺便把服务端返回的字段名也显示出来。", "Also show the field name the server returns.") } });
say(ID, w("好，字段名也放在错误原文前面了。", "Done; the field name is in front of the server's text too."));

// A blocked row in the rail, with diff counts and a time, whose title must keep its room.
await at(-(2 * HOUR + 30 * MIN));
await open("t_blocked", w("跟进 PR #11166 的评审意见，把 CI 和两处类型错误一起修掉", "Follow PR #11166's review, fixing CI and two type errors"), "mem", repo("mem", "ducter/task-t_blocked"), "claude-code", "opus");
await at(-(2 * HOUR + 20 * MIN));
tool("t_blocked", "commandExecution", { command: "gh pr checks 11166" }, "mem-bazel\tpending\ntide\tpending");
report("t_blocked", {
  state: "blocked",
  summary: w("CI 还在跑，等它绿了再改类型错误。", "CI is still running; the type errors wait for it."),
  evidence: [{ kind: "url", label: "PR #11166", ref: "https://github.com/nowledge-co/mem/pull/11166" }],
  branch: { commits: 2, uncommitted: true, files: 4, adds: 88, dels: 21 },
});
core.tasks.setState("t_blocked", "blocked", "parked");
core.work.waiters.arm({ reason: w("PR #11166 的 CI 跑完", "PR #11166's CI is through"), taskId: "t_blocked", at: iso(37 * MIN), wakes: "task" } as never);

// ---------- the tasks around it: a done card from the user's own long sentence, and the pager's 14 ----------
const WORDS = w(
  "设置页为 OpenAI 配置自定义 Base URL 与模型后，切换模型时请求还是发到旧地址，麻烦把这个修好",
  "After setting a custom OpenAI Base URL and model on the Settings page, switching the model still sends requests to the old address; please fix it",
);
const FROM_WORDS = process.env.DEMO_BEFORE === "1" ? w("设置页为 OpenAI 配置自定义 Base URL 与模型后，切…", "After setting a custom OpenAI Base URL and model on the Settings page, switching…") : titleFromWords(WORDS);
await at(-(5 * HOUR + 10 * MIN));
await open("t_words", FROM_WORDS, "ducter", repo("ducter", "ducter/openai-base-url"), "claude-code", "sonnet");
await at(-(5 * HOUR));
report("t_words", {
  state: "done",
  summary: w("切模型后不再重置 Base URL；开了 PR #11186。", "A model switch no longer resets the Base URL; opened PR #11186."),
  evidence: [{ kind: "url", label: "PR #11186", ref: "https://github.com/acme/ducter/pull/11186" }],
  branch: { commits: 2, uncommitted: false, files: 3, adds: 61, dels: 18 },
});
core.tasks.setState("t_words", "done", "cold");

const around: [string, string, string, "working" | "done" | "blocked" | "needs_you", number][] = [
  ["t_1", w("把 OAuth 登录的回调地址改成新的域名", "Move the OAuth callback to the new domain"), "site", "done", 1],
  ["t_2", w("修 CI 里偶发失败的 thread cursor 测试", "Fix the flaky thread cursor test in CI"), "mem", "working", 2],
  ["t_3", w("给发布说明补上这一版的截图", "Add this release's screenshots to the notes"), "site", "working", 3],
  ["t_4", w("清理 11 月的旧 worktree", "Tidy November's old worktrees"), "ducter", "done", 4],
  ["t_5", w("把 invoices 导出为 CSV 的时区修掉", "Fix the time zone in the CSV invoice export"), "api", "done", 5],
  ["t_6", w("检查 GraphQL 的 N+1 查询", "Check the GraphQL N+1 queries"), "api", "working", 6],
  ["t_7", w("更新 macOS 的签名证书", "Renew the macOS signing certificate"), "ducter", "blocked", 7],
  ["t_8", w("给新用户写第一封欢迎邮件", "Write the first welcome mail for new users"), "site", "done", 8],
  ["t_9", w("把设置页的深色模式对齐 token", "Align Settings dark mode with the tokens"), "ducter", "working", 9],
  ["t_10", w("重跑 0.1.97 的发布流水线", "Re-run the 0.1.97 release pipeline"), "ducter", "working", 10],
  ["t_11", w("整理客户反馈里的三个高频问题", "Group the three most common customer reports"), "site", "done", 11],
  ["t_12", w("把缓存层的 TTL 调回 5 分钟", "Set the cache TTL back to 5 minutes"), "api", "working", 12],
];
for (const [id, title, project, state, i] of around) {
  await at(-(9 * HOUR) + i * MIN);
  await open(id, title, project, repo(project, `ducter/${id}`), i % 2 ? "claude-code" : "codex", i % 2 ? "opus" : "gpt-6-luna");
  if (state !== "working") core.tasks.setState(id, state, state === "done" ? "cold" : "parked");
}

// ---------- the conversation: messages and the app card the partner keeps posting ----------
const chan = (origin: "user" | "partner", text: string) => log.append({ stream: "channel", origin, kind: origin === "user" ? "user_msg" : "ai_msg", body: { text } } as never);
await at(-(80 * MIN));
chan("user", w("GitHub 上标给我的，先挑几个小事先做掉。", "Pick a few small things from what's assigned to me on GitHub."));
await at(-(79 * MIN));
chan("partner", w("有 4 个说得清楚的，挑几个交给我。", "Four are clear; pick a few for me."));

// The partner runs on a scripted session: it makes the app, fills it, then fills it again in later
// turns (the person never asks for the card, only for the work).
let sessionN = 0;
let turnN = 0;
class Session implements HarnessSession {
  id = `sess-polish-${++sessionN}`;
  canSteer = true;
  private q: HarnessEvent[] = [];
  private waiters: ((r: IteratorResult<HarnessEvent>) => void)[] = [];
  private ended = false;
  constructor(private script: (n: number, s: Session) => Promise<void>) {}
  busy() {
    return false;
  }
  emit(e: HarnessEvent) {
    const w = this.waiters.shift();
    if (w) w({ value: e, done: false });
    else this.q.push(e);
  }
  say(text: string) {
    this.emit({ role: "assistant", text });
  }
  end() {
    this.emit({ role: "system", turnEnd: true });
  }
  async send(_text: string) {
    await this.script(turnN++, this);
  }
  async interrupt() {}
  async close() {
    this.ended = true;
    for (const w of this.waiters.splice(0)) w({ value: undefined as never, done: true });
  }
  events(): AsyncIterable<HarnessEvent> {
    const self = this;
    return {
      [Symbol.asyncIterator]() {
        return {
          next(): Promise<IteratorResult<HarnessEvent>> {
            if (self.q.length) return Promise.resolve({ value: self.q.shift()!, done: false });
            if (self.ended) return Promise.resolve({ value: undefined as never, done: true });
            return new Promise((res) => self.waiters.push(res));
          },
        };
      },
    };
  }
}
const mcp = core.mcp as unknown as { call(ctx: { role: string }, name: string, args: unknown): Promise<unknown> };
const apps = core.apps!;
const appName = "PR Babysitter 看板";
const appHtml = `<main class="k-app"><section class="k-sum"><span class="k-sum-label">开着</span><span class="k-sum-value" id="n"></span><span class="k-sum-sub">两条在看</span></section><ul class="k-list" id="rows"></ul></main><script>const xs=ducter.get("prs")||[];document.getElementById("n").textContent=xs.length;document.getElementById("rows").innerHTML=xs.map(x=>'<li class="k-row">'+x+"</li>").join("");ducter.summary(xs.length+" 条 PR")</script>`;
async function appTurn(n: number, s: Session) {
  if (n === 0) {
    await mcp.call({ role: "partner" }, "app", { name: appName, html: appHtml, icon: "list", summary: w("两条在看", "Two watched"), note: w("两条 PR 先放进去了", "The two PRs are in"), data: { prs: ["#11166 mem-bazel", "#11188 6 files"] } });
    s.say(w("做好了，两条 PR 先放进去了。", "Done; the two PRs are in."));
  } else if (n === 1) {
    const id = apps.list(persona.id)[0]?.id;
    await mcp.call({ role: "partner" }, "app", { id, data: { prs: ["#11166 mem-bazel ✓", "#11188 6 files ✓", "#11190 docs"] } });
    s.say(w("填好了。", "Filled in."));
  } else {
    const id = apps.list(persona.id)[0]?.id;
    await mcp.call({ role: "partner" }, "app", { id, data: { prs: [`#11166 checked ${n}`, "#11188 still green"] } });
    s.say(n === 2 ? w("看板更新了。", "The board is updated.") : w("又看了一眼，还是绿的。", "Looked again; still green."));
  }
  s.end();
}
const harness: HarnessPort = {
  async start() {
    return new Session(appTurn);
  },
  available: async () => [{ harness: "codex", installed: true, loggedIn: true }],
};
const scripted: Runner = {
  harness,
  async openTask(input): Promise<TaskCard> {
    const card = core.tasks.get(`t_app_${++openN}`) ?? ({ taskId: `t_app_${openN}`, title: input.title, attention: "working", residency: "hot", place: input.place ?? { kind: "none" }, project: input.project ?? "", persona: input.persona, openedAt: iso(0), updatedAt: iso(0) } as TaskCard);
    return card;
  },
  async send() {
    return { delivered: "steered" as const };
  },
  async interrupt() {},
  async drop() {},
};
const partner = createPartner(core, scripted, { now: clock.now, persistState: false, onError: (e) => console.warn("[demo] partner:", e) });
core.setPartner(partner);
const userTurn = async (text: string) => {
  partner.onTrigger(log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text } }));
  await partner.idle();
};
await at(-(70 * MIN));
await userTurn(w("给我做个看 PR 的小应用，叫「PR Babysitter 看板」，先放两条。", "Make me a small PR board called “PR Babysitter 看板”, with the two PRs in it."));
await at(-(65 * MIN));
await userTurn(w("把这两条 PR 填进看板，空的不好看。", "Fill the two PRs into the board; an empty one looks bad."));
await at(-(60 * MIN));
await userTurn(w("继续盯着这两个 PR，CI 绿了告诉我。", "Keep watching these two PRs; tell me when CI is green."));
await at(-(55 * MIN));
await userTurn(w("再看一眼，有没有新的评审。", "Take another look; any new review?"));
await at(-(50 * MIN));
chan("partner", w("都看过了：一条 CI 在跑，一条等评审。", "Both looked at: one CI running, one waiting for review."));

// ---------- go ----------
if (process.env.DEMO_ADD !== "0") await core.taskSources.add("github");
await core.taskSources.look();
for (let i = 0; i < 300 && !core.taskSources.view().pile?.sortedAt; i++) await Bun.sleep(100);
shift = 0;

console.log(`[demo] up at http://127.0.0.1:${core.port}/app (data: ${dataDir}; scratch: ${scratch})`);
console.log(`[demo] opened task http://127.0.0.1:${core.port}/app#task=${ID}/full`);
console.log(`[demo] done card  http://127.0.0.1:${core.port}/app#onhand  (title: ${FROM_WORDS})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
