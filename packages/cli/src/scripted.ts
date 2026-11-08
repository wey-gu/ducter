// DUCTER_SCRIPTED_MODEL=1: every harness session (partner and tasks) runs on OAR's scripted
// runtime instead of a real model. For demos and end-to-end checks on a box with no AI login.
// The script still uses Ducter's real MCP tools over HTTP (task_open, report_to_main), so the
// partner → runner → task → report path is the real one; only the model's words are canned.
import { scriptedRuntime, type ScriptedTurn } from "@botiverse/oar/testing";

type Mcp = { url: string; headers: Record<string, string> };

function ducterMcp(t: ScriptedTurn): Mcp | undefined {
  const m = (t.options.mcpServers ?? []).find((s: any) => s.name === "ducter" && s.url) as any;
  return m ? { url: m.url, headers: m.headers ?? {} } : undefined;
}

/** "partner" or "task:<id>", read from the role token's payload (dtk.<b64url payload>.<sig>). */
function roleOf(m: Mcp | undefined): string {
  const auth = Object.entries(m?.headers ?? {}).find(([k]) => k.toLowerCase() === "authorization")?.[1] ?? "";
  const enc = auth.replace(/^Bearer\s+/, "").split(".")[1] ?? "";
  try {
    return Buffer.from(enc, "base64url").toString();
  } catch {
    return "";
  }
}

let rpcId = 0;
async function callTool(m: Mcp, name: string, args: unknown): Promise<string> {
  const res = await fetch(m.url, {
    method: "POST",
    headers: { ...m.headers, "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method: "tools/call", params: { name, arguments: args } }),
  });
  const j: any = await res.json();
  const text = j?.result?.content?.map((c: any) => c.text).join("\n") ?? JSON.stringify(j?.error ?? j);
  if (j?.result?.isError || j?.error) throw new Error(text);
  return text;
}

/** The newest trigger line the partner was given: "[user] …" or "[task … report: done] …" (partner/src/render.ts). */
function lastTrigger(input: string): { kind: "user" | "report" | "other"; text: string } {
  const lines = input.split("\n").map((l) => l.trim()).filter((l) => /^\[(user|task )/.test(l));
  const l = lines.pop() ?? "";
  if (l.startsWith("[user] ")) return { kind: "user", text: l.slice(7).slice(0, 160) };
  if (/^\[task [^\]]*report:/.test(l)) return { kind: "report", text: l };
  return { kind: "other", text: input.slice(-160) };
}
const zh = (s: string) => /[\u4e00-\u9fff]/.test(s);

async function turn(t: ScriptedTurn) {
  const mcp = ducterMcp(t);
  const role = roleOf(mcp);
  if (role.startsWith("task:")) {
    const cn = zh(t.input);
    t.say(cn ? "开始做。" : "Starting.");
    await Bun.sleep(1500);
    const summary = cn ? "做完了（演示模式：没有真实模型，这是脚本写的结果）。" : "Done (scripted demo: no real model; this result is canned).";
    if (mcp) await t.tool("mcp__ducter__report_to_main", JSON.stringify({ state: "done" }), () => callTool(mcp, "report_to_main", { state: "done", summary }));
    return;
  }
  const trig = lastTrigger(t.input);
  const cn = zh(trig.text);
  if (trig.kind === "report") {
    t.say(cn ? "那件事做完了。（演示模式）" : "That task is done. (Scripted demo.)");
    return;
  }
  const said = trig.text;
  if (/task|任务/i.test(said) && mcp) {
    const title = said.replace(/^.*?(task|任务)\s*[:：]?\s*/i, "").slice(0, 60) || said.slice(0, 60);
    t.say(cn ? `好，我去做：${title}` : `On it: ${title}`);
    await t.tool("mcp__ducter__task_open", JSON.stringify({ title }), () => callTool(mcp, "task_open", { title, brief: said }));
    return;
  }
  t.say(cn ? `收到：「${said}」。（演示模式：没有接真实模型）` : `Got it: "${said}". (Scripted demo: no real model is connected.)`);
}

/** Wraps @ducter/runner so createRunner uses the scripted runtime for every harness. */
export function scriptedRunnerModule(runnerMod: Record<string, any>): Record<string, any> {
  const rt = scriptedRuntime({ id: "claude", model: "scripted-demo", turn });
  return {
    ...runnerMod,
    createRunner: (core: unknown, opts: Record<string, unknown> = {}) =>
      runnerMod.createRunner(core, { ...opts, harness: runnerMod.createOarHarnessPort({ loadRuntime: async () => rt }) }),
  };
}
