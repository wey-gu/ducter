// D175 (4): what the partner eval judges, as two hashes: the persona's system prompt and the
// partner's tool list as the harness sees it (tools/list over Ducter's MCP endpoint, the same
// setup as tool-budget.test.ts). A full eval run writes them to eval/results/LATEST.json; the
// tool-budget test fails when either changed after the last run, so a persona or tool change
// ships with a fresh eval result.
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCore } from "../../core/src/core.ts";
import { fakeOoCalendar } from "../../core/test/fake-oo-calendar.ts";
import { registerTaskTools } from "../../runner/src/tools.ts";
import { createPartner } from "../src/partner.ts";
import { buildSystemPrompt } from "../src/persona.ts";
import { fakeRunner } from "./fakes.ts";

const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

export interface Fingerprint {
  persona: string;
  tools: string;
}

export const personaFingerprint = () => sha(buildSystemPrompt({ id: "p", name: "Ducter", identity: "" }));

/** The partner's tools as a session lists them, hashed; a scratch core, no network. */
export async function partnerFingerprint(): Promise<Fingerprint> {
  const dir = mkdtempSync(join(tmpdir(), "ducter-fp-"));
  // Autofill's key in the scratch folder, never a keychain (this also runs from the eval).
  process.env.DUCTER_SAVED_KEY = "file";
  // D222: two calendar accounts in a fake oo, so the calendar tool (listed only then) is judged too.
  const oo = fakeOoCalendar({ day: "2026-11-18" });
  const core = startCore({ dataDir: dir, port: 0, push: false, platform: "darwin", ooSource: oo.source });
  await core.connections.addFromOo();
  // D191: saved_list is listed once something is saved: a test card, so it is judged too.
  core.autofill.store.put({ kind: "card", name: "Eval", number: "4242424242424242", expMonth: 12, expYear: 2099 });
  registerTaskTools(core as never, {});
  const partner = createPartner(core as never, fakeRunner(() => {}).runner, { prewarm: false, spine: false, persistState: false, onError: () => {} });
  try {
    const cfg = core.mcp.configFor("partner");
    const req = new Request("http://127.0.0.1/mcp", {
      method: "POST",
      headers: { ...cfg.headers, "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    const j = (await (await core.mcp.handle(req)).json()) as { result: { tools: { name: string }[] } };
    const tools = [...j.result.tools].sort((a, b) => a.name.localeCompare(b.name));
    return { persona: personaFingerprint(), tools: sha(JSON.stringify(tools)) };
  } finally {
    await partner.close();
    await core.stop();
    rmSync(dir, { recursive: true, force: true });
  }
}
