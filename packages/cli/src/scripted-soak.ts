// Soak directives for the scripted model (DUCTER_SCRIPTED_MODEL=1, packages/soak). Only text
// that carries "#soak" takes these paths, so demos keep the plain script in scripted.ts.
//
// User message lines (one command per line, every [user] line of a turn is handled):
//   #soak chat <tok>                          -> the partner says "ok <tok>"
//   #soak task <tok> [ask] [block] [fail] [commit] [nodone] [slow=<s>] [dev=<worker>] [/abs/repo]
//                                             -> task_open "soak <tok>" (brief = the line)
//   #soak wait <tok> sec=<n>                  -> wait_until now+n, reason "soak-wait <tok>"
//   #soak ask <tok> min=<m>                   -> ask "soak ask <tok>?" with a reversible Go default
//   #soak send <tok> <taskId>                 -> the partner task_sends "#soak note <tok>" to a task
// A task whose brief has "#soak task" follows its options: commits a file in its worktree,
// works slow seconds (abortable), asks one reversible question (ask) or reports blocked (block)
// and finishes on the next input after it; fail reports failed; nodone never reports.
import type { ScriptedTurn } from "@botiverse/oar/testing";

type Mcp = { url: string; headers: Record<string, string> };
type Call = (m: Mcp, name: string, args: unknown) => Promise<string>;

export const isSoak = (s: string | undefined) => !!s && s.includes("#soak");

export interface SoakTask {
  tok: string;
  ask: boolean;
  block: boolean;
  fail: boolean;
  commit: boolean;
  nodone: boolean;
  slow: number;
  dev?: string;
}

export function parseSoakTask(text: string): SoakTask | undefined {
  const m = text.match(/#soak task (\S+)([^\n<]*)/);
  if (!m) return undefined;
  const rest = m[2] ?? "";
  const has = (w: string) => new RegExp(`(^|\\s)${w}(\\s|$)`).test(rest);
  return {
    tok: m[1]!,
    ask: has("ask"),
    block: has("block"),
    fail: has("fail"),
    commit: has("commit"),
    nodone: has("nodone"),
    slow: Number(rest.match(/slow=(\d+(?:\.\d+)?)/)?.[1] ?? 1),
    dev: rest.match(/dev=(\S+)/)?.[1],
  };
}

async function git(cwd: string, args: string[]) {
  const p = Bun.spawn(["git", "-c", "user.name=soak", "-c", "user.email=soak@example.invalid", "-C", cwd, ...args], { stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  const [out, code] = await Promise.all([new Response(p.stdout).text(), p.exited]);
  return { ok: code === 0, out: out.trim() };
}

const sleep = (t: ScriptedTurn, ms: number) =>
  new Promise<void>((r) => {
    const timer = setTimeout(r, ms);
    t.signal.addEventListener("abort", () => (clearTimeout(timer), r()));
  });

/** One turn of a soak task. */
export async function soakTaskTurn(t: ScriptedTurn, mcp: Mcp | undefined, callTool: Call, brief: string, taskId: string) {
  const s = parseSoakTask(brief)!;
  t.say(`Working on ${s.tok}.`);
  const cwd = String(t.options.cwd ?? "");
  let sha: string | undefined;
  if (s.commit && cwd) {
    const file = `soak-${s.tok}.txt`;
    const have = await git(cwd, ["log", "-1", "--format=%H", "--", file]);
    if (have.ok && have.out) sha = have.out;
    else {
      await Bun.write(`${cwd}/${file}`, `${s.tok}\n`);
      await git(cwd, ["add", file]);
      const c = await git(cwd, ["commit", "-q", "-m", `soak ${s.tok}`]);
      if (c.ok) sha = (await git(cwd, ["rev-parse", "HEAD"])).out;
    }
  }
  await t.tool("Bash", JSON.stringify({ command: `sleep ${s.slow}` }), () => "slept");
  await sleep(t, s.slow * 1000);
  if (t.signal.aborted || !mcp) return;

  // Where this task stands, from its own stream (survives a restart of the main).
  const evs = JSON.parse(await callTool(mcp, "log_read", { stream: `task:${taskId}`, limit: 200 })) as { kind: string; body: any }[];
  const waitState = s.ask ? "needs_input" : s.block ? "blocked" : undefined;
  let waitedAt = -1;
  evs.forEach((e, i) => e.kind === "report" && e.body.state === waitState && (waitedAt = i));
  const answered = waitedAt >= 0 && evs.slice(waitedAt + 1).some((e) => e.kind === "task_event" && e.body.role === "user" && e.body.from !== "runner");
  const steered = t.steered.length ? ` steered: ${t.steered.join(" | ").slice(0, 200)}` : "";
  const report = (args: object) => t.tool("mcp__ducter__report_to_main", JSON.stringify(args), () => callTool(mcp, "report_to_main", args));

  if (waitState && waitedAt < 0) {
    if (waitState === "needs_input")
      return void (await report({
        state: "needs_input",
        summary: `soak ${s.tok} needs a choice`,
        questions: [{ id: "q1", text: `soak question ${s.tok}?`, blocking: true, default: `go-${s.tok}`, reversible: true }],
      }));
    return void (await report({ state: "blocked", summary: `soak ${s.tok} is blocked on the user` }));
  }
  if (waitState && !answered) return t.say(`Still waiting on the answer for ${s.tok}.`);
  if (s.nodone) return t.say(`Not reporting ${s.tok}.`);
  if (s.fail) return void (await report({ state: "failed", summary: `soak ${s.tok} failed on purpose` }));
  await report({
    state: "done",
    summary: `soak ${s.tok} done.${steered}`,
    evidence: sha ? [{ kind: "diff", label: "commit", ref: sha }] : [{ kind: "log", label: "soak", ref: `soak-${s.tok}` }],
  });
}

/** The partner's soak turn: every soak line of the input, chats first and asks last. */
export async function soakPartnerTurn(t: ScriptedTurn, mcp: Mcp | undefined, callTool: Call) {
  const lines = t.input.split("\n").map((l) => l.trim());
  const users = lines.filter((l) => l.startsWith("[user] ") && isSoak(l)).map((l) => l.slice(7));
  const cmd = (c: string) => users.filter((u) => u.startsWith(`#soak ${c} `));
  const call = async (name: string, args: object) => {
    if (!mcp) return "";
    return t.tool(`mcp__ducter__${name}`, JSON.stringify(args), () => callTool(mcp, name, args)) as unknown as Promise<string>;
  };
  const said: string[] = [];
  for (const l of lines) {
    const fired = l.match(/^\[timer fired\] soak-wait (\S+)/);
    if (fired) said.push(`timer ${fired[1]}`);
    const ans = l.match(/^\[your question answered: (\w+)[^\]]*\] "soak ask (\S+)\?"/);
    if (ans) said.push(`answered ${ans[2]} ${ans[1]}`);
  }
  for (const u of cmd("chat")) said.push(`ok ${u.split(" ")[2]}`);
  if (said.length) t.say(said.join("\n") + "\n");
  for (const u of cmd("task")) {
    const s = parseSoakTask(u)!;
    t.say(`On it: soak ${s.tok}\n`);
    await call("task_open", { title: `soak ${s.tok}`, brief: u, ...(s.dev ? { place: { kind: "none", device: s.dev } } : {}) });
  }
  for (const u of cmd("send")) {
    const [, , tok, taskId] = u.split(" ");
    t.say(`Passing ${tok} on.\n`);
    await call("task_send", { taskId, text: `#soak note ${tok}` });
  }
  for (const u of cmd("wait")) {
    const tok = u.split(" ")[2]!;
    const sec = Number(u.match(/sec=(\d+)/)?.[1] ?? 30);
    t.say(`I'll look again at ${tok}.\n`);
    await call("wait_until", { at: new Date(Date.now() + sec * 1000).toISOString(), reason: `soak-wait ${tok}` });
  }
  for (const u of cmd("ask")) {
    const tok = u.split(" ")[2]!;
    const min = Number(u.match(/min=(\d+(?:\.\d+)?)/)?.[1] ?? 0.5);
    await call("ask", { question: `soak ask ${tok}?`, goLabel: `go-${tok}`, default: "go", reversible: true, defaultInMinutes: min });
  }
  if (!said.length && !users.length) t.say("Noted (soak).");
}
