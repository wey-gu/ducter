// D174 (3), research/48 F8: a one-shot (the judge, the digest writer) runs with no tools at all
// where the agent can say so, mapped by the adapter from the registry. Measured live on Claude Code
// 2.1.322 with haiku: 9,679 input tokens with 12 built-ins denied, 629 with --tools "".
import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HARNESS_IDS } from "@ducter/protocol";
import { HARNESS_FACTS } from "@ducter/protocol/src/harness-facts.ts";
import { adaptSpec, piVariant, PI_CLEAN_FLAGS } from "../src/oar.ts";

const TOOLS_OFF = ["Bash", "Edit", "Read"];

test("Claude Code: --tools \"\" and no denial list; the user's setup stays out (the clean setup)", () => {
  const dir = mkdtempSync(join(tmpdir(), "ducter-notools-"));
  try {
    const a = adaptSpec({ harness: "claude-code", cwd: dir, mcp: [], isolateUserConfig: true, noTools: true, disallowedTools: TOOLS_OFF }, { dataDir: dir, env: {} });
    expect(a.options.launchArgs).toEqual(["--tools", ""]);
    expect(a.options.disallowedTools).toBeUndefined();
    expect(a.options.userConfiguration).toBe("exclude");
    // Without the switch: as before, the named built-ins denied.
    const b = adaptSpec({ harness: "claude-code", cwd: dir, mcp: [], isolateUserConfig: true, disallowedTools: TOOLS_OFF }, { dataDir: dir, env: {} });
    expect(b.options.launchArgs ?? []).not.toContain("--tools");
    expect(b.options.disallowedTools).toEqual(expect.arrayContaining(TOOLS_OFF));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("pi: the clean runtime with --no-tools; agents with no known switch keep the denial list", () => {
  expect(piVariant({ harness: "pi", isolateUserConfig: true, noTools: true })).toEqual({ clean: true, noTools: true });
  expect(HARNESS_FACTS.pi.noTools.value.args).toEqual(["--no-tools"]);
  expect(PI_CLEAN_FLAGS).not.toContain("--no-tools");
  for (const h of HARNESS_IDS) {
    const f = HARNESS_FACTS[h].noTools;
    // A switch the adapter sends is evidenced; an empty one says why there is none.
    if (f.value.args.length) expect(["VERIFIED", "DOCUMENTED"]).toContain(f.evidence.kind);
    else expect(f.evidence.kind).toBe("INFERRED");
  }
});
