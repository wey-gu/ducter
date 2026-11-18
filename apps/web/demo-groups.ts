// A demo core for D360's groups on On hand: eight tasks of the author's day, three of which are one
// piece of work (登录页重做 / Redo the sign-in page) split by the partner and run one after another.
//   DUCTER_PORT=7995 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-groups.ts
// DEMO_STATE: before  the three parts as three separate tasks, all at work at once (before D360)
//             after   the group: part 1 done, part 2 at work, part 3 in line (default)
//             stopped part 2 didn't work out: part 3 waits for the person's word
//             asking  part 2 needs the person: its question inside the group's card
import { startCore, stubRunner } from "./demo-core.ts";
import type { Bodies, Place } from "@ducter/protocol";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const w = (z: string, e: string) => (zh ? z : e);
const dataDir = process.env.DUCTER_DATA_DIR!;
const state = process.env.DEMO_STATE ?? "after";
const persona = { id: "default", name: "Ducter", identity: "" };
const ooSource = { detect: () => ({ installed: false, account: false }), read: () => undefined };

let shift = 0;
const clock = { now: () => Date.now() + shift, setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>) };
const seed = startCore({ dataDir, port: 0, push: false, persona, ooSource, clock });
seed.setRunner(stubRunner(seed));
seed.setPartner({ onTrigger() {} });
const log = seed.log;
const tick = () => Bun.sleep(15);
const now = Date.now();
const iso = (ms: number) => new Date(now + ms).toISOString();
const repo = (name: string, branch: string, device = "local"): Place => ({ kind: "repo", device, repoPath: `/Users/weyl/dev/${name}`, branch: `ducter/${branch}`, baseBranch: "main" });
const ev = (id: string, b: Omit<Bodies["task_event"], "taskId">) => log.append({ stream: `task:${id}`, origin: "task", kind: "task_event", body: { taskId: id, ...b } });
const tool = (id: string, name: string, input: unknown, output = "ok") => ev(id, { role: "tool", tool: { name, input, output, ok: true } });
const report = (id: string, r: Omit<Bodies["report"], "taskId" | "questions"> & { questions?: Bodies["report"]["questions"] }) => log.append({ stream: `task:${id}`, origin: "task", kind: "report", body: { taskId: id, questions: [], ...r } });

async function open(id: string, title: string, project: string, place: Place, harness = "claude-code", model = "opus", agoMin = 0) {
  shift = -agoMin * 60_000;
  log.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", body: { taskId: id, title, project, place, harness, model, brief: title } });
  seed.tasks.setState(id, "working", "hot");
  shift = 0;
  await tick();
}
const done = (id: string, summary: string) => {
  report(id, { state: "done", summary, evidence: [] });
  seed.tasks.setState(id, "done", "parked");
};

// ---- the three parts of one piece of work ----
const parts = [
  { id: "t_form", title: w("登录表单换成新的输入框组件", "Swap the sign-in form for the new input component"), branch: "signin-form" },
  { id: "t_sms", title: w("登录页接上短信验证码", "Hook the SMS code into the sign-in page"), branch: "signin-sms" },
  { id: "t_e2e", title: w("补登录页的端到端测试", "Add end-to-end tests for the sign-in page"), branch: "signin-e2e" },
];
await open(parts[0]!.id, parts[0]!.title, "ducter", repo("ducter", parts[0]!.branch), "claude-code", "opus", 74);
tool(parts[0]!.id, "Edit", { file_path: "apps/web/src/signin.tsx" });
await open(parts[1]!.id, parts[1]!.title, "ducter", repo("ducter", parts[1]!.branch), "codex", "gpt-5.5", 18);
tool(parts[1]!.id, "Bash", { command: "bun test apps/web/test/signin.test.ts" }, "12 pass");
if (state === "before") {
  // Before groups: all three fanned out at once, each its own card.
  await open(parts[2]!.id, parts[2]!.title, "ducter", repo("ducter", parts[2]!.branch), "claude-code", "sonnet", 18);
  tool(parts[2]!.id, "Read", { file_path: "apps/web/test/e2e/signin.spec.ts" });
} else {
  done(parts[0]!.id, w("登录表单换成了新的输入框组件，键盘和读屏都能用。", "The sign-in form uses the new input component; keyboard and screen readers work."));
  seed.taskGroups.join("default", w("登录页重做", "Redo the sign-in page"), [parts[0]!.id, parts[1]!.id], "partner");
  await seed.taskGroups.open("default", w("登录页重做", "Redo the sign-in page"), { persona: "default", title: parts[2]!.title, brief: parts[2]!.title, place: repo("ducter", parts[2]!.branch) });
  if (state === "stopped") {
    report(parts[1]!.id, { state: "failed", summary: w("短信服务的测试账号过期了，验证码发不出去。", "The SMS service's test account has expired; no code goes out."), evidence: [] });
    seed.tasks.setState(parts[1]!.id, "failed", "parked");
    await seed.taskGroups.pump();
  }
  if (state === "asking") {
    report(parts[1]!.id, {
      state: "needs_input",
      evidence: [],
      summary: w("发送和校验都写好了，差一个短信服务。", "Sending and checking are written; it needs an SMS service."),
      questions: [{ id: "q1", text: w("短信用阿里云的测试额度吗？腾讯云的也能用。", "Use Aliyun's test quota for the SMS? Tencent Cloud's works too."), blocking: true, default: w("用阿里云的测试额度。", "Use Aliyun's test quota."), reversible: true }],
    });
    seed.tasks.setState(parts[1]!.id, "needs_you", "hot");
  }
}

// ---- the rest of the day: five tasks of their own ----
await open("t_tokio", w("把 tokio 升到 1.42", "Upgrade tokio to 1.42"), "hawdb", repo("hawdb", "tokio-1.42", "home-server"), "claude-code", "sonnet", 40);
tool("t_tokio", "Bash", { command: "cargo test -p hawdb-storage" }, "test result: ok. 214 passed");
await open("t_bench", w("给 range scan 加基准测试", "Add a benchmark for range scans"), "hawdb", repo("hawdb", "range-bench"), "claude-code", "sonnet", 95);
done("t_bench", w("加了 range scan 的基准测试，比 0.9 快 18%。", "Added a range-scan benchmark; 18% faster than 0.9."));
await open("t_pr", w("PR #1592：修 compaction 测试", "PR #1592: fix the compaction test"), "hawdb", repo("hawdb", "compaction-fix", "home-server"), "claude-code", "opus", 50);
report("t_pr", { state: "blocked", summary: w("修好了，等 CI 跑完。", "Fixed; waiting for CI."), evidence: [] });
seed.work.waiters.arm({ reason: w("PR #1592 的 CI 通过", "PR #1592's CI passes"), taskId: "t_pr", check: { argv: ["gh", "pr", "checks", "1592", "--json", "state"], succeedWhen: { path: "[].state", equals: "SUCCESS" } }, everyMs: 5 * 60_000, until: iso(6 * 3600_000) });
seed.tasks.setState("t_pr", "blocked", "parked");
await open("t_hotel", w("订 12 月 6 号京都的酒店，两晚，岚山附近", "Book a hotel in Kyoto for Dec 6, two nights, near Arashiyama"), "", { kind: "none" }, "claude-code", "sonnet", 30);
tool("t_hotel", "browser_navigate", { url: "https://www.booking.com" });
await open("t_readme", w("Mem 的中文 README", "A Chinese README for Mem"), "mem", repo("mem", "readme-zh"), "codex", "gpt-5.5", 120);
done("t_readme", w("README 的中文版写好了，链接都对过。", "The Chinese README is written; every link checked."));

await Bun.sleep(200);
await seed.stop();

// Serve from a second core over the same Log and the same groups, as after a restart.
const core = startCore({ dataDir, persona, push: false, ooSource, hostname: process.env.DUCTER_HOST || "127.0.0.1" });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
console.log(`[demo] groups demo (${state}, ${zh ? "zh" : "en"}) at http://127.0.0.1:${core.port}/app (data: ${dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
