// The scripted model (DUCTER_SCRIPTED_MODEL=1) against a stub Ducter MCP server.
import { afterAll, expect, test } from "bun:test";
import * as runnerMod from "@ducter/runner";
import { scriptedHarness } from "../src/scripted.ts";
import { parseSoakTask } from "../src/scripted-soak.ts";

const calls: { name: string; args: any }[] = [];
const server = Bun.serve({
  port: 0,
  async fetch(req) {
    const j: any = await req.json();
    calls.push({ name: j.params.name, args: j.params.arguments });
    return Response.json({ jsonrpc: "2.0", id: j.id, result: { content: [{ type: "text", text: "{}" }] } });
  },
});
afterAll(() => server.stop(true));

const partnerToken = `dtk.${Buffer.from("partner").toString("base64url")}.sig`;

async function partnerTurn(input: string) {
  const port = scriptedHarness(runnerMod);
  const s = await port.start({
    harness: "claude-code",
    cwd: "/tmp",
    mcp: [{ name: "ducter", url: `http://127.0.0.1:${server.port}/mcp`, headers: { authorization: `Bearer ${partnerToken}` } }],
    permissionMode: "bypass",
  } as any);
  const it = s.events()[Symbol.asyncIterator]();
  await s.send(input, "turn");
  for (;;) {
    const r = await it.next();
    if (r.done || r.value.turnEnd) break;
  }
  await s.close();
}

test("only a user line opens a task; a resolution that mentions a task does not (soak regression)", async () => {
  calls.length = 0;
  await partnerTurn('[decision resolved: go by default] (task abc: "ship it?") (already forwarded to the task)\n[time] 2026-11-09 04:00 Mon');
  expect(calls.filter((c) => c.name === "task_open")).toEqual([]);
  await partnerTurn("[user] task: tidy the notes");
  expect(calls.filter((c) => c.name === "task_open").map((c) => c.args.title)).toEqual(["tidy the notes"]);
});

test("soak task directives parse", () => {
  expect(parseSoakTask("#soak task t1 commit ask slow=3 dev=w /r")).toMatchObject({ tok: "t1", commit: true, ask: true, slow: 3, dev: "w", fail: false });
  expect(parseSoakTask("hello")).toBeUndefined();
});
