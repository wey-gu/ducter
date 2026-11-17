// A demo core for the partner's first words and a pasted key (D298), on a fresh data folder and a
// scratch home holding fake Claude Code and Codex records (never the person's own).
//   DUCTER_PORT=7898 DUCTER_DATA_DIR=$(mktemp -d) DEMO_STAGE=first bun apps/web/demo-first.ts
// DEMO_STAGE: first = Claude Code signed in, records to look at (D327: read when the person taps the look start); nobrain = nothing signed in, no
// records (the key card). A key ending in 0000 answers "no balance"; any other DeepSeek-shaped key works.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { startCore, stubRunner } from "@ducter/core";
import { fakeAgents } from "../../packages/core/test/fake-agents.ts";
import { noOo } from "./demo-oo.ts";

const stage = process.env.DEMO_STAGE ?? "first";
const data = process.env.DUCTER_DATA_DIR!;
const home = join(data, "scratch-home");
mkdirSync(home, { recursive: true });
const ago = (h: number) => new Date(Date.now() - h * 3_600_000);
if (stage === "first")
  fakeAgents(home, [
    { agent: "codex", cwd: "/Users/ada/dev/website", id: "019a0000-1111-7222-8333-444455556666", title: "Move the blog to the new theme", at: ago(2) },
    { agent: "claude-code", cwd: "/Users/ada/dev/hawdb", id: "c1", title: "Fix the flaky compaction test", ask: "the compaction test fails one run in five", at: ago(26) },
    { agent: "claude-code", cwd: "/Users/ada/notes", id: "c2", ask: "把读书清单按主题分一分", at: ago(50) },
  ]);
let balance = true;
const keyFetch = (async (u: string | URL, init?: RequestInit) => {
  const auth = String((init?.headers as Record<string, string>)?.authorization ?? "");
  const host = new URL(String(u)).host;
  await Bun.sleep(600);
  if (host !== "api.deepseek.com") return new Response("{}", { status: 401 });
  balance = !auth.endsWith("0000");
  return new Response(JSON.stringify({ is_available: balance }), { status: 200 });
}) as typeof fetch;
const signedIn = stage === "first";
const core = startCore({
  ooSource: noOo,
  persona: { id: "default", name: process.env.DEMO_NAME ?? "Ducter", identity: "" },
  hostname: "127.0.0.1",
  firstWords: { home, env: {} },
  // D327: the records are named by the home's name; a fixture's, never this computer's own.
  update: { homeName: process.env.DEMO_HOME_NAME ?? "Ada’s MacBook Air" },
  keyFetch,
  keyCanRun: (h) => h === "pi",
  deviceProbes: { cua: async () => null, kind: async () => "laptop", harnesses: async () => [{ harness: "claude-code", installed: true, loggedIn: signedIn }] },
});
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
console.log(`[demo-first] ${stage} on ${core.url}`);
