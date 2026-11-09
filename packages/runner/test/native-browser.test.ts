// Claude in Chrome's connection check (D130, protocol native-browser.ts): fakes only, never the
// machine's own Chrome, extension or claude binary.
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLAUDE_CHROME_NOT_CONNECTED, claudeInChromeConnected, resetClaudeInChromeCache, type ChromeMcpProbe } from "@ducter/protocol/src/native-browser.ts";

let home: string;
beforeEach(() => {
  resetClaudeInChromeCache();
  home = mkdtempSync(join(tmpdir(), "ducter-native-test-"));
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

function installHost() {
  const dir = join(home, "Library", "Application Support", "Google/Chrome", "NativeMessagingHosts");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "com.anthropic.claude_code_browser_extension.json"), "{}");
}

test("not installed: no socket look, no probe", async () => {
  let asked = 0;
  const probe: ChromeMcpProbe = async () => (asked++, [{}]);
  expect(await claudeInChromeConnected({ env: { HOME: home }, platform: "darwin", which: () => "/bin/claude", probe, sockets: () => ["/tmp/x/1.sock"] })).toBe(false);
  expect(asked).toBe(0);
});

test("a live bridge socket is enough: no MCP probe", async () => {
  installHost();
  let asked = 0;
  const probe: ChromeMcpProbe = async () => (asked++, []);
  expect(await claudeInChromeConnected({ env: { HOME: home }, platform: "darwin", which: () => "/bin/claude", probe, sockets: () => ["/tmp/x/1.sock"] })).toBe(true);
  expect(asked).toBe(0);
});

test("no socket: the MCP server's list of connected browsers decides; the answer is reused for 30 s", async () => {
  installHost();
  let t = 0;
  const seen: { env?: Record<string, string> }[] = [];
  let list: unknown[] | undefined = [];
  const probe: ChromeMcpProbe = async (_bin, env) => (seen.push({ env }), list);
  const o = { env: { HOME: home, PATH: "/usr/bin", ANTHROPIC_API_KEY: "sk-x" }, platform: "darwin" as const, which: () => "/bin/claude", probe, sockets: () => [], now: () => t };
  expect(await claudeInChromeConnected(o)).toBe(false);
  expect(seen[0]!.env).toEqual({ HOME: home, PATH: "/usr/bin" }); // no keys reach the probe
  list = [{ id: "b1", name: "Chrome" }];
  t = 10_000;
  expect(await claudeInChromeConnected(o)).toBe(false); // cached
  t = 40_000;
  expect(await claudeInChromeConnected(o)).toBe(true);
  expect(seen.length).toBe(2);
});

test("no claude on PATH or a probe that fails: not connected", async () => {
  installHost();
  expect(await claudeInChromeConnected({ env: { HOME: home }, platform: "darwin", which: () => null, sockets: () => [] })).toBe(false);
  resetClaudeInChromeCache();
  const probe: ChromeMcpProbe = async () => {
    throw new Error("spawn failed");
  };
  expect(await claudeInChromeConnected({ env: { HOME: home }, platform: "darwin", which: () => "/bin/claude", probe, sockets: () => [] })).toBe(false);
});

test("every 'not connected' wording Claude Code uses is caught", () => {
  for (const s of [
    "Browser extension is not connected. Please ensure the Claude browser extension is installed and running",
    "Browser extension is not connected: the OAuth token Claude Code is using belongs to a different claude.ai account",
    "Browser extension is not connected. Chrome on the user's computer could not be reached from this session",
  ])
    expect(CLAUDE_CHROME_NOT_CONNECTED.test(s)).toBe(true);
  expect(CLAUDE_CHROME_NOT_CONNECTED.test("Navigated to https://example.com")).toBe(false);
});
