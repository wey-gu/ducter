// D585: the person talking to a task in its own box, as a conductor does, on a demo core with the
// real runner and a scripted agent (OAR's scriptedRuntime: no model, no harness). Three tasks, each the
// shape a real one took on hel:
//   t_done  finished; asked 「这个改动会影响手机上的登录页吗？」 afterwards, answered in words
//   t_ask   waiting on its question (which Space); asked 「都有哪些 space?」 in its own box (ws's path)
//   t_steer working; 「我们的 PR 是什么？」 steered in mid-turn, answered, then it carried on to done
// The agent answers the person in words; before D585 the runner nudged it for a report (NUDGE), which
// it answered as real agents did: a report_to_main and "I reported it to Ducter". Every partner wake
// is printed ([demo] partner woken …), so the double answer shows on the old code.
//   DUCTER_PORT=7585 DEMO_LANG=zh bun apps/web/demo-d585.ts
// then http://127.0.0.1:7585/app#task=t_done (t_ask, t_steer).
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scriptedRuntime, type ScriptedTurn } from "@botiverse/oar/testing";
import { startCore } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import { createOarHarnessPort, createRunner, NUDGE, registerTaskTools } from "../../packages/runner/src/index.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const w = (z: string, e: string) => (zh ? z : e);
const dataDir = process.env.DUCTER_DATA_DIR || join(mkdtempSync(join(tmpdir(), "ducter-demo-d585-")), "data");
const core = startCore({ dataDir, push: false, persona: { id: "default", name: zh ? "小鸭" : "Duckie", identity: "" }, ooSource: noOo });
core.setPartner({ onTrigger: (e) => console.log(`[demo] partner woken by ${e.kind} #${e.seq} ${JSON.stringify(e.body).slice(0, 120)}`) });
core.settings.set({ language: zh ? "zh" : "en" });

registerTaskTools(core as never);
const call = (name: string, args: unknown, taskId: string) => core.mcp.call({ role: "task", taskId }, name, args);
const report = (taskId: string, state: string, summary: string, extra: Record<string, unknown> = {}) => call("report_to_main", { state, summary, ...extra }, taskId);
const idOf = (t: ScriptedTurn) => /t_(done|ask|steer)/.exec(String((t.options as { cwd?: string }).cwd ?? ""))?.[0] ?? "";
const pause = (ms: number) => Bun.sleep(ms);
let releaseSteer!: () => void;
const steerGate = new Promise<void>((r) => (releaseSteer = r));

async function work(t: ScriptedTurn, steps: [string, unknown, string?][]) {
  for (const [name, input, out] of steps) {
    await t.tool(name, JSON.stringify(input), async () => out ?? "");
    await pause(40);
  }
}

const rt = scriptedRuntime({
  id: "claude",
  turn: async (t) => {
    const id = idOf(t);
    const input = t.input;
    // Before D585: the nudge after the person's answer, answered as real agents did.
    if (input === NUDGE) {
      await t.tool("mcp__ducter__report_to_main", "{}", () => report(id, "progress", w("已经在任务里回答了：会影响，手机上的登录按钮要再调。", "Answered in the task: yes, the phone's sign-in button needs another look.")));
      t.say(w("我已经通过 report_to_main 把这个回答报告给了小鸭。", "I reported this answer to Duckie via report_to_main."));
      return;
    }
    if (input.startsWith("Start the task")) {
      if (id === "t_done") {
        await work(t, [
          ["Read", { file_path: "apps/web/src/login.tsx" }],
          ["Read", { file_path: "apps/web/src/login.css" }],
          ["Grep", { pattern: "min-height: 44px", path: "apps/web/src" }, "login.css:88"],
          ["Edit", { file_path: "apps/web/src/login.css", old_string: "  padding: 6px 12px;", new_string: "  padding: 10px 16px;\n  min-height: 44px;" }],
          ["Bash", { command: "bun test apps/web/test/login.test.ts", description: w("跑登录页的测试", "Run the sign-in page's tests") }, "12 pass\n0 fail"],
        ]);
        t.say(w("登录按钮的内边距改大了，高度至少 44，12 项测试都过了。", "The sign-in button has more padding and is at least 44 tall; all 12 tests pass."));
        await t.tool("mcp__ducter__report_to_main", "{}", () => report(id, "done", w("登录按钮改好了：至少 44 高，12 项测试都通过。", "The sign-in button is fixed: at least 44 tall, all 12 tests pass."), { evidence: [{ kind: "test", label: "bun test", ref: "12 pass" }] }));
        return;
      }
      if (id === "t_ask") {
        await work(t, [
          ["Bash", { command: "nmem doctor", description: w("检查 Nowledge Mem 的连接", "Check the Nowledge Mem connection") }, "all checks passed"],
          ["Bash", { command: "nmem bridge setup", description: w("被动设置信箱", "Set up the mailbox passively") }, "selection_needed"],
        ]);
        await t.tool("mcp__ducter__report_to_main", "{}", () =>
          report(id, "needs_input", w("信箱还没打开：Mem 要先知道信箱放在哪个 Space，这个我不能替你选。", "The mailbox isn't open yet: Mem needs to know which Space it goes in, and that's your call."), {
            questions: [{ id: "space", text: w("信箱放在哪个 Space？", "Which Space should the mailbox go in?"), blocking: true, default: "dev-team", reversible: true }],
          }),
        );
        return;
      }
      if (id === "t_steer") {
        await work(t, [
          ["Bash", { command: "git fetch origin && git merge-base --is-ancestor origin/main HEAD", description: w("确认能干净合进 main", "Check it merges cleanly into main") }],
          ["Read", { file_path: "src/thread/detail.tsx" }],
          ["Read", { file_path: "src/thread/row-menu.tsx" }],
          ["Read", { file_path: "src/thread/tools.ts" }],
        ]);
        await steerGate;
        if (t.steered.length) {
          t.say(w("PR 还没开。最后一轮检查发现工具解析有几处边界情况（here-string、引号里的 <<、CRLF），我先补上再推分支、开 PR。", "The PR isn't open yet. The last check found a few edge cases in the tool parser (here-strings, << in quotes, CRLF); I'm fixing them, then I push the branch and open the PR."));
          await pause(60);
        }
        await work(t, [
          ["Edit", { file_path: "src/thread/tools.ts", old_string: "const HERE = /<<(\\w+)/;", new_string: "const HERE = /<<(?!<)-?\\s*['\"]?(\\w+)/;" }],
          ["Edit", { file_path: "src/thread/tools.ts", old_string: "line.split('\\n')", new_string: "line.split(/\\r?\\n/)" }],
          ["Bash", { command: "bun test src/thread", description: w("跑线程的测试", "Run the thread tests") }, "41 pass\n0 fail"],
          ["Bash", { command: "git push -u origin fix/11105-thread-detail && gh pr create --fill", description: w("推分支并开 PR", "Push the branch and open the PR") }, "https://github.com/acme/mem/pull/11112"],
        ]);
        t.say(w("开好了：#11112，41 项测试都过了，截图也贴上了。", "Opened #11112: all 41 tests pass, and the screenshots are attached."));
        await t.tool("mcp__ducter__report_to_main", "{}", () => report(id, "done", w("#11112 开好了，41 项测试通过。", "#11112 is open; 41 tests pass."), { evidence: [{ kind: "url", label: "PR", ref: "https://github.com/acme/mem/pull/11112" }] }));
        return;
      }
    }
    // The person's own words.
    if (id === "t_done") {
      await work(t, [
        ["Grep", { pattern: "LoginButton", path: "apps/mobile" }, "apps/mobile/src/Login.tsx:14"],
        ["Read", { file_path: "apps/mobile/src/Login.tsx" }],
      ]);
      t.say(
        w(
          "会影响一点。手机上的登录页用的是同一个按钮组件，所以也会变成至少 44 高。\n\n- 好处：手指更好点中，符合触控的最小尺寸。\n- 要留意：小屏（宽 320）上，按钮和“忘记密码”之间只剩 8 的间距，看起来有点挤。\n\n要不要我顺手把小屏上的间距也调一下？",
          "A little. The phone's sign-in page uses the same button, so it becomes at least 44 tall too.\n\n- Good: easier to hit, and it meets the touch minimum.\n- Watch: on a small screen (320 wide) only 8 points are left between the button and \"Forgot password\", which looks tight.\n\nShall I fix the spacing on small screens too?",
        ),
      );
      return;
    }
    if (id === "t_ask") {
      t.say(
        w(
          "Claude Code 这边能选这 8 个 Space：\n\n- dev-team（团队，7 人能读）\n- codex\n- nowledge-mem\n- nowledge-co/mem\n- userfiles\n- default\n- all（所有人）\n- Only me（只有你）\n\n已有的那个 Claude 测试信箱放在 dev-team。",
          "Claude Code can use these 8 Spaces:\n\n- dev-team (team, 7 can read)\n- codex\n- nowledge-mem\n- nowledge-co/mem\n- userfiles\n- default\n- all (everyone)\n- Only me\n\nThe existing Claude test mailbox is in dev-team.",
        ),
      );
      return;
    }
  },
});

const ids = ["t_done", "t_ask", "t_steer"];
const runner = createRunner(core as never, { harness: createOarHarnessPort({ loadRuntime: async () => rt }), newId: () => ids.shift()! });
core.setRunner(runner as never);
const until = async (ok: () => unknown, what: string) => {
  for (let i = 0; i < 200 && !ok(); i++) await Bun.sleep(50);
  if (!ok()) console.log(`[demo] timed out waiting for ${what}`);
};
const ended = (id: string) => core.log.read({ stream: `task:${id}`, kinds: ["task_event"], limit: 5000 }).filter((e) => (e.body as { raw?: { kind?: string } }).raw?.kind === "turn_ended").length;
const att = (id: string) => core.tasks.get(id)?.attention;
/** What the composer does (ws.ts task_send): the card answered by these words, then the runner. */
const typed = async (id: string, text: string, mode?: "steer" | "queue") => {
  core.decisions.answeredByMessage(id, text, "user");
  const r = await runner.send(id, text, mode, "user", `c${Date.now()}`);
  console.log(`[demo] typed in ${id}: ${JSON.stringify(text)} -> ${r.delivered}`);
};

const project = w("网页端", "Web app");
await runner.openTask({ persona: "default", title: w("登录按钮在手机上太小", "Sign-in button too small on phones"), project, brief: w("登录按钮在手机上太小，点不中。改到至少 44 高，跑测试。", "The sign-in button is too small to hit on phones. Make it at least 44 tall and run the tests."), origin: "you" } as never);
await until(() => ended("t_done") >= 1, "t_done's first turn");
await runner.openTask({ persona: "default", title: w("打开 Claude Code 在 Mem 的信箱", "Open Claude Code's mailbox in Mem"), project: "Mem", brief: w("把 Claude Code 在 Nowledge Mem 的信箱打开。", "Open Claude Code's mailbox in Nowledge Mem."), origin: "you" } as never);
await until(() => att("t_ask") === "needs_you", "t_ask's question");
await runner.openTask({ persona: "default", title: w("修好 #11105：线程详情的工具和行菜单", "Fix #11105: thread details' tools and row menu"), project: "Mem", brief: w("修好 #11105，开 PR，贴前后截图。", "Fix #11105, open a PR, attach before and after shots."), origin: "you" } as never);
await until(() => core.log.read({ stream: "task:t_steer", kinds: ["task_event"], limit: 5000 }).filter((e) => (e.body as { role?: string }).role === "tool").length >= 4, "t_steer at work");
await Bun.sleep(200);

// The conductor's moments.
await typed("t_steer", w("这个工作，我们的 PR 是什么？", "For this work, what's our PR?"), "steer");
await Bun.sleep(300);
releaseSteer();
await until(() => ended("t_steer") >= 1, "t_steer's turn");
await typed("t_done", w("这个改动会影响手机上的登录页吗？", "Will this change affect the sign-in page on phones?"));
await until(() => ended("t_done") >= 2, "t_done's answer");
await typed("t_ask", w("都有哪些 space?", "Which Spaces are there?"));
await until(() => ended("t_ask") >= 2, "t_ask's answer");
await Bun.sleep(1500);
for (const id of ["t_done", "t_ask", "t_steer"]) {
  const inputs = core.log.read({ stream: `task:${id}`, kinds: ["task_event"], limit: 5000 }).map((e) => e.body as { role?: string; from?: string; text?: string; raw?: { delivered?: string } }).filter((b) => b.role === "user");
  console.log(`[demo] ${id}: ${att(id)}; inputs: ${inputs.map((b) => `${b.from}/${b.raw?.delivered}:${JSON.stringify((b.text ?? "").slice(0, 40))}`).join(" | ")}`);
}
console.log(`[demo] d585 up at http://127.0.0.1:${core.port}/app#task=t_done (t_ask, t_steer); data: ${core.dataDir}`);
