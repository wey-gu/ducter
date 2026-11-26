// D600: the four new agents' sign-in routes, with fakes only: Kimi's device code is carried to the
// person; Devin, OpenCode and Cursor have no sign-in Ducter can carry in this build. No CLI starts.
import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentSetup, parseLogin, type AgentSetupSys, type LoginProc } from "../src/agent-setup.ts";
import { HARNESS_FACTS } from "@ducter/protocol/src/harness-facts.ts";
import { HARNESSES } from "@ducter/protocol/src/harnesses.ts";

const tick = () => new Promise((r) => setTimeout(r, 5));

function rig() {
  const dir = mkdtempSync(join(tmpdir(), "ducter-four-setup-"));
  const spawned: { argv: string[]; env: Record<string, string>; proc: FakeProc }[] = [];
  const said: string[] = [];
  class FakeProc implements LoginProc {
    onOutput(fn: (t: string) => void) { this.fns.push(fn); }
    write(t: string) { said.push(t); }
    kill() { this.killed = true; }
    exited: Promise<number> = Promise.resolve(0);
    fns: ((t: string) => void)[] = [];
    killed = false;
    say(t: string) { for (const f of this.fns) f(t); }
    finish(code: number) { this.resolve!(code); }
    resolve?: (code: number) => void;
    constructor() { this.exited = new Promise<number>((r) => (this.resolve = r)); }
  }
  const sys: AgentSetupSys = {
    platform: "linux",
    arch: "x64",
    download: async () => new Uint8Array(),
    run: async () => ({ code: 0, out: "" }),
    spawn: (argv, env) => {
      const proc = new FakeProc();
      spawned.push({ argv, env, proc });
      return proc;
    },
    which: (c) => (c === "kimi" ? "/home/w/.kimi-code/bin/kimi" : c === "devin" ? "/home/w/.local/bin/devin" : c === "opencode" ? "/home/w/.opencode/bin/opencode" : null),
    env: () => ({ PATH: "/usr/bin", HOME: "/home/w" }),
    exists: () => false,
  };
  const s = createAgentSetup({ dataDir: join(dir, "d"), sys, probe: async () => {}, changed: () => {}, signedIn: async () => true, waitMs: 60_000, setTimer: () => 0, clearTimer: () => {} });
  return { s, spawned, said, done: () => rmSync(dir, { recursive: true, force: true }) };
}

test("D600: Kimi's device code is opened on any device and entered on the page, not pasted back", async () => {
  const r = rig();
  try {
    r.s.login("kimi");
    const sp = r.spawned[0]!;
    expect(sp.argv).toEqual(["/home/w/.kimi-code/bin/kimi", "login"]);
    sp.proc.say("Opening browser for Kimi device login: https://kimi.com/device?code=1\n");
    sp.proc.say("If the browser did not open, paste the URL above and enter code: K7QM-4XPA\n");
    await tick();
    expect(r.s.state("kimi").login).toMatchObject({ state: "waiting", url: "https://kimi.com/device?code=1", code: "K7QM-4XPA" });
    expect(r.s.state("kimi").login?.paste).toBeUndefined();
    sp.proc.finish(0);
    await tick();
    expect(r.s.state("kimi").login?.state).toBe("done");
  } finally {
    r.done();
  }
  expect(parseLogin("kimi", "Opening browser for Kimi device login: https://kimi.com/device?code=1\nenter code: K7QM-4XPA\n")).toEqual({ url: "https://kimi.com/device?code=1", code: "K7QM-4XPA" });
});

test("D600: Devin, OpenCode and Cursor sign in from a terminal there; Cursor never offers its forbidden OAuth app", async () => {
  const r = rig();
  try {
    for (const [h, command] of [["devin", "devin auth login"], ["opencode", "opencode auth login"], ["cursor", "CURSOR_API_KEY"]] as const) {
      r.s.login(h);
      expect(r.s.state(h).login).toEqual({ state: "terminal", command });
      expect(r.spawned).toHaveLength(0);
      r.s.cancel(h);
    }
    expect(r.s.state("cursor").installable).toBe(false);
    expect(r.s.state("devin").installable).toBe(false);
    expect(r.s.state("kimi").installable).toBe(false);
    expect(r.s.state("opencode").installable).toBe(true);
  } finally {
    r.done();
  }
});

test("D600: the facts say what each sign-in is and where it is checked", () => {
  expect(HARNESSES.kimi.signIn).toContain("kimi login");
  expect(HARNESS_FACTS.opencode.channels.value.npm).toBe("@opencode/cli");
  expect(HARNESS_FACTS.devin.memUpdate?.value).toEqual([["devin", "plugins", "update", "nowledge-mem"]]);
  expect(HARNESS_FACTS.opencode.memUpdate?.value).toEqual([["opencode", "plugin", "update", "opencode-nowledge-mem"]]);
  expect(HARNESS_FACTS.cursor.memSteps?.value.contextApp).toBe("cursor");
});
