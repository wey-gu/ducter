// D298: `ducter key add` reads the key from stdin, checks it, keeps it, and says so in the
// partner's words; --json is what the Mac app's first run reads.
import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "../src/args.ts";
import { brainFromKeyFile, cmdKey } from "../src/key-cmd.ts";

const DS = "sk-00112233445566778899aabbccddeeff";
const ok = (async () => new Response(JSON.stringify({ is_available: true }), { status: 200 })) as unknown as typeof fetch;

test("parses as a machine command with words after it", () => {
  const r = parseArgs(["key", "add", "--json"]);
  expect(r.ok && r.args).toMatchObject({ command: "key", rest: ["add"], json: true });
});

test("--json: the result and its words, never the key; the brain set when nothing could think", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ducter-key-"));
  try {
    const out: string[] = [];
    const code = await cmdKey({ dataDir: dir, lang: "zh", json: true, rest: ["add"], stdin: async () => `${DS}\n`, fetch: ok, canRun: (h) => h === "pi", signedIn: async () => false, print: (s) => out.push(s) });
    expect(code).toBe(0);
    const j = JSON.parse(out[0]!);
    expect(j).toMatchObject({ ok: true, provider: "deepseek", harness: "pi", say: { zh: expect.stringContaining("DeepSeek") } });
    expect(out.join("")).not.toContain(DS);
    expect(JSON.parse(readFileSync(join(dir, "settings.json"), "utf8")).brain).toEqual({ harness: "pi", model: "deepseek/deepseek-flash" });
    // A choice already made stays.
    writeFileSync(join(dir, "settings.json"), JSON.stringify({ brain: { harness: "codex" } }));
    expect(brainFromKeyFile(dir, "pi", "deepseek/deepseek-flash")).toBe(false);
    // Empty stdin, or the wrong words: a shape line, exit 1.
    const out2: string[] = [];
    expect(await cmdKey({ dataDir: dir, lang: "en", json: false, rest: ["add"], stdin: async () => "", print: (s) => out2.push(s) })).toBe(1);
    expect(out2[0]).toContain("doesn't look like an API key");
    expect(await cmdKey({ dataDir: dir, lang: "en", json: false, rest: [], print: () => {} })).toBe(2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
