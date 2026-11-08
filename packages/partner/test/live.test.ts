// One cheap live smoke of the persona prompt on Claude Code + haiku. Off by default.
//   DUCTER_LIVE=1 bun test packages/partner/test/live.test.ts
// No Ducter MCP tools here (that needs core + runner); it checks only the persona's language and
// ack discipline. Uses --no-session-persistence and removes any ~/.claude/projects folder it made.
import { expect, test } from "bun:test";
import { mkdtempSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { buildSystemPrompt } from "../src/persona.ts";

const live = process.env.DUCTER_LIVE === "1";

async function ask(cwd: string, prompt: string): Promise<string> {
  const proc = Bun.spawn(
    [
      "claude", "-p", prompt,
      "--model", "haiku",
      "--system-prompt", buildSystemPrompt({ id: "p", name: "Ducter", identity: "You are Ducter, a personal AI partner." }),
      "--strict-mcp-config", "--setting-sources", "", "--tools", "",
      "--no-session-persistence", "--output-format", "json",
    ],
    { cwd, stdout: "pipe", stderr: "pipe" },
  );
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return (JSON.parse(out) as { result: string }).result;
}

test.skipIf(!live)("live: persona replies in Chinese and acks a place-bound job without inventing a result", async () => {
  const projects = join(homedir(), ".claude", "projects");
  const before = new Set(readdirSync(projects));
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), "ducter-partner-live-")));
  try {
    const a = await ask(cwd, "[user] 一句话：TCP 和 UDP 最大的区别？\n[time] 2026-11-08 14:00 Sun");
    expect(a).toMatch(/[一-鿿]/);
    expect(a.length).toBeLessThan(400);
    const b = await ask(cwd, "[user] 修一下 ~/dev/foo 里那个 flaky test，修好告诉我\n[time] 2026-11-08 14:00 Sun");
    console.log("ack-ish reply:", b);
    expect(b).toMatch(/[一-鿿]/);
    expect(b).not.toMatch(/修好了|已修复|已经修/);
  } finally {
    for (const d of readdirSync(projects)) if (!before.has(d) && d.includes("ducter-partner-live")) rmSync(join(projects, d), { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  }
}, 120_000);
