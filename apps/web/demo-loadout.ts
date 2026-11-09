// A demo core for what the partner thinks with and who does the tasks (D89): real core (Log,
// settings, rules, candidates, task_switch), stub runner and a scripted partner, seeded with
// the author's kind of work. For screenshots and manual checks of the desktop and phone clients.
//   DUCTER_PORT=7960 DUCTER_DATA_DIR=/tmp/x DEMO_LANG=zh DEMO_ACCOUNTS=multi DEMO_ALLOWANCE=plenty bun apps/web/demo-loadout.ts
// DEMO_ACCOUNTS: one (a fresh user: Claude Code only) | multi (Claude Code, Codex, pi, DeepSeek Harness not installed)
// DEMO_ALLOWANCE: plenty (Claude Code 64% left) | low (5%: only the part kept for Ducter)
import { startCore, stubRunner } from "@ducter/core";
import type { Bodies, DeviceHarness, Place } from "@ducter/protocol";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const multi = (process.env.DEMO_ACCOUNTS ?? "multi") === "multi";
const low = process.env.DEMO_ALLOWANCE === "low";
const resets = new Date(Date.now() + 18 * 3600_000).toISOString();

const harnesses: DeviceHarness[] = [
  {
    harness: "claude-code",
    installed: true,
    loggedIn: true,
    canBePartner: true,
    billing: "plan",
    allowance: { left: low ? 0.05 : 0.64, sharedBy: multi ? 2 : 1, resetsAt: resets },
    models: [
      { id: "opus", label: "Opus" },
      { id: "sonnet", label: "Sonnet" },
    ],
  },
  ...(multi
    ? ([
        { harness: "codex", installed: true, loggedIn: true, canBePartner: true, billing: "plan", allowance: { left: 0.48, resetsAt: new Date(Date.now() + 3 * 86400_000).toISOString() } },
        { harness: "pi", installed: true, loggedIn: false, canBePartner: false },
        { harness: "deepseek-harness", installed: false, loggedIn: false, canBePartner: false },
      ] satisfies DeviceHarness[])
    : []),
];

const core = startCore({
  persona: { id: "default", name: "Ducter", identity: "" },
  hostname: process.env.DUCTER_HOST || "127.0.0.1",
  deviceProbes: { cua: async () => ({ missing: "demo" }), harnesses: async () => harnesses, kind: async () => "laptop" },
});
core.setRunner(stubRunner(core));
const log = core.log;
const tick = () => Bun.sleep(30);

// The scripted partner: when two switches go the same way it asks once whether to make it a
// rule (as the real partner does with ask), and saves the rule on Go.
const asked = new Map<string, { text: string; harness: string; match: string[] }>();
core.setPartner({
  onTrigger(e) {
    if (e.kind === "job_status" && e.origin === "user") {
      const to = (e.body as Bodies["job_status"] & { to?: string }).to ?? "claude-code";
      const name = to === "codex" ? "Codex" : "Claude Code";
      const id = `rule_ask_${e.seq}`;
      asked.set(id, { text: zh ? `后端的事 → ${name}` : `Backend work → ${name}`, harness: to, match: ["后端", "backend", "api", "server", "存储", "storage"] });
      log.append({
        stream: "channel",
        origin: "partner",
        kind: "decision",
        body: {
          decisionId: id,
          question: zh ? `以后后端的事也用 ${name}？这是你第二次把后端的事从 Codex 换到 ${name}。` : `Use ${name} for backend work from now on? This is the second time you moved backend work from Codex to ${name}.`,
          goLabel: zh ? "记成规则" : "Make it the rule",
          defaultOption: "hold",
          reversible: true,
        },
      });
      return;
    }
    if (e.kind === "decision_resolved") {
      const b = e.body as Bodies["decision_resolved"];
      const r = asked.get(b.decisionId);
      if (!r) return;
      if (b.option === "go") {
        const rule = core.rules.add(r);
        log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: zh ? `记下了：${rule.text}。在伙伴页「你的规则」里能看到，也能删。` : `Noted: ${rule.text}. It's under Your rules on the Partner page, where you can remove it.` } });
      }
    }
  },
});

const repo = (repoPath: string, branch: string): Place => ({ kind: "repo", device: "local", repoPath, branch, baseBranch: "main" });
async function task(id: string, title: string, place: Place, brief: string, harness: string, model: string | undefined, why: Bodies["body_selected"]["why"]) {
  log.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", body: { taskId: id, title, project: "HawDB", place, harness, ...(model ? { model } : {}), brief } });
  log.append({ stream: `task:${id}`, origin: "system", kind: "body_selected", body: { taskId: id, harness, ...(model ? { model } : {}), why } });
  core.tasks.setState(id, "working", "hot");
  await tick();
}
const ev = (id: string, b: Omit<Bodies["task_event"], "taskId">) => log.append({ stream: `task:${id}`, origin: "task", kind: "task_event", body: { taskId: id, ...b } });

// Rules said earlier in the conversation (multi only; a fresh user has none).
const backend = multi ? core.rules.add({ text: zh ? "后端的事 → Codex" : "Backend work → Codex", harness: "codex", match: ["后端", "backend", "api", "server", "ci"] }) : undefined;
if (multi) core.rules.add({ text: zh ? "界面和设计 → Claude Code" : "Interface and design → Claude Code", harness: "claude-code", match: ["界面", "设计", "ui", "design", "interface"] });

// 1. Fix CI: on Codex by the rule (or because Claude Code's limit is low).
const ask = zh ? "HawDB 的 CI 又红了，帮我修一下。" : "HawDB's CI is red again, can you fix it?";
const u = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: ask } });
log.append({ stream: "channel", origin: "partner", kind: "ack", body: { jobId: "j1", text: zh ? "我先看是哪个测试挂的，修好了告诉你。" : "I'll find which test broke first and tell you once it's fixed.", replyTo: u.seq } });
const ciTitle = zh ? "修 CI · HawDB #1592" : "Fix CI · HawDB #1592";
if (multi) {
  await task("t_ci", ciTitle, repo("~/dev/hawdb", "ducter/fix-ci"), ask, "codex", undefined, low ? { kind: "limit", from: "claude-code" } : { kind: "rule", ruleId: backend!.id, text: backend!.text });
} else {
  await task("t_ci", ciTitle, repo("~/dev/hawdb", "ducter/fix-ci"), ask, "claude-code", "sonnet", { kind: "default" });
}
log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: "j1", text: zh ? "在做" : "Working", state: "running", taskId: "t_ci" } });
ev("t_ci", { role: "assistant", text: zh ? "先看 CI 日志里是哪个测试挂的。" : "Checking which test failed in the CI log first." });
ev("t_ci", { role: "tool", tool: { name: "Bash", input: { command: "gh run view 1592 --log-failed" }, ok: true, output: "storage::compaction::flush_then_read FAILED" } });
log.append({ stream: "task:t_ci", origin: "task", kind: "checkpoint", body: { taskId: "t_ci", text: zh ? "找到挂的测试：flush_then_read" : "Found the failing test: flush_then_read" } });

// 2. A second backend task already moved once from Codex to Claude Code by the user (multi):
//    the next switch the same way is the second, and the partner offers a rule.
if (multi) {
  const t2 = zh ? "存储层的 API 重构" : "Refactor the storage API";
  await task("t_api", t2, repo("~/dev/hawdb", "ducter/storage-api"), t2, "codex", undefined, { kind: "rule", ruleId: backend!.id, text: backend!.text });
  await core.loadout.switchTask("t_api", "claude-code", "opus", undefined);
  ev("t_api", { role: "assistant", text: zh ? "接着上一个的进度，先跑一遍测试。" : "Picking up from the saved progress; running the tests first." });
}

console.log(`demo-loadout on ${core.url} · ${zh ? "zh" : "en"} · ${multi ? "multi" : "one"} · ${low ? "low" : "plenty"}`);
