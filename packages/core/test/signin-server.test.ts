// D518: signing Claude Code in on a server home, with a fake `claude` command line run for real
// (its own `auth login` that reads a pasted code, its own `auth status`): the sign-in says 登录好了
// only when the agent's own check says signed in, a wrong code asks again, a code with no answer
// and a sign-in left waiting each stop and say so, 不登录了 stops it. And the hel bug itself: a
// command put on the PATH after Ducter started (its tools folder) answers the card's probe.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentSetup, realAgentSetupSys } from "../src/agent-setup.ts";

// Placeholder values only: nothing here looks like a real provider's sign-in.
const FAKE = `#!/bin/sh
state="$FAKE_CLAUDE_DIR/signed-in"
if [ "$1 $2" = "auth status" ]; then
  if [ -f "$state" ]; then echo '{"loggedIn": true, "email": "someone@example.invalid", "orgId": "org-fake"}'; else echo '{"loggedIn": false}'; fi
  exit 0
fi
if [ "$1 $2" = "auth login" ]; then
  echo "Opening browser to sign in..."
  echo "If the browser didn't open, visit: https://claude.com/cai/oauth/authorize?code=true&client_id=fake&state=fake"
  while true; do
    printf "Paste code here if prompted > "
    read code || exit 1
    case "$code" in
      good*) [ "$FAKE_CLAUDE_MODE" = "lie" ] || : > "$state"; echo "Login successful."; exit 0 ;;
      silent*) sleep 30; exit 1 ;;
      *) echo "Invalid code. Please make sure the full code was copied." ;;
    esac
  done
fi
exit 2
`;

let dir = "";
let bin = "";
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "ducter-signin-server-"));
  bin = join(dir, "bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "claude"), FAKE);
  chmodSync(join(bin, "claude"), 0o755);
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function rig(o: { mode?: "lie"; waitMs?: number; checkMs?: number } = {}) {
  const home = mkdtempSync(join(dir, "home-"));
  const env = { PATH: `${bin}:/usr/bin:/bin`, HOME: home, FAKE_CLAUDE_DIR: home, ...(o.mode ? { FAKE_CLAUDE_MODE: o.mode } : {}) };
  const sys = realAgentSetupSys({ platform: "linux", arch: "x64", which: (c) => (c === "claude" ? join(bin, "claude") : null), env: () => env });
  let probes = 0;
  const s = createAgentSetup({
    dataDir: home,
    sys,
    probe: async () => void probes++,
    changed: () => {},
    // The agent's own check, as the home runs it: `claude auth status`, fresh.
    signedIn: async () => {
      const r = await sys.run([join(bin, "claude"), "auth", "status"], { env, timeoutMs: 5000 });
      return /"loggedIn": true/.test(r.out);
    },
    ...(o.waitMs ? { waitMs: o.waitMs } : {}),
    ...(o.checkMs ? { checkMs: o.checkMs } : {}),
  });
  const until = async (pred: () => boolean, ms = 4000) => {
    for (const end = Date.now() + ms; Date.now() < end; ) {
      if (pred()) return;
      await Bun.sleep(10);
    }
    throw new Error(`timed out: ${JSON.stringify(s.state("claude-code").login)}`);
  };
  return { s, home, until, probes: () => probes, signedIn: () => existsSync(join(home, "signed-in")), done: () => (s.stop(), rmSync(home, { recursive: true, force: true })) };
}
const st = (r: ReturnType<typeof rig>) => r.s.state("claude-code").login;

test("the link, then a good code: checking, then 登录好了 only once claude itself says signed in; the row is ready at once", async () => {
  const r = rig();
  r.s.login("claude-code");
  await r.until(() => st(r)?.state === "waiting");
  expect(st(r)).toMatchObject({ state: "waiting", url: "https://claude.com/cai/oauth/authorize?code=true&client_id=fake&state=fake", paste: true });
  expect(st(r)!.until! - Date.now()).toBeGreaterThan(14 * 60_000);
  r.s.code("claude-code", "  good-code#fake  ");
  expect(st(r)?.state).toBe("checking");
  await r.until(() => st(r)?.state === "done");
  expect(r.signedIn()).toBe(true);
  expect(r.probes()).toBe(1);
  // An older card reading (signed out) never wins over the agent's own check.
  expect(r.s.decorate([{ harness: "claude-code", installed: true, loggedIn: false }])[0]).toMatchObject({ loggedIn: true, login: { state: "done" } });
  r.done();
});

test("a wrong code asks again with why; the next good one signs in", async () => {
  const r = rig();
  r.s.login("claude-code");
  await r.until(() => st(r)?.state === "waiting");
  r.s.code("claude-code", "nope");
  await r.until(() => st(r)?.reason === "wrong_code");
  expect(st(r)).toMatchObject({ state: "waiting", reason: "wrong_code", paste: true });
  r.s.code("claude-code", "good");
  await r.until(() => st(r)?.state === "done");
  r.done();
});

test("its sign-in says it finished but claude's own check says signed out: not 登录好了, and says so", async () => {
  const r = rig({ mode: "lie" });
  r.s.login("claude-code");
  await r.until(() => st(r)?.state === "waiting");
  r.s.code("claude-code", "good");
  await r.until(() => st(r)?.state === "failed");
  expect(st(r)).toEqual({ state: "failed", reason: "not_seen" });
  expect(r.s.decorate([{ harness: "claude-code", installed: true, loggedIn: false }])[0]!.loggedIn).toBe(false);
  r.done();
});

test("a pasted code with no answer stops and says so; a sign-in left waiting stops by itself", async () => {
  const a = rig({ checkMs: 300 });
  a.s.login("claude-code");
  await a.until(() => st(a)?.state === "waiting");
  a.s.code("claude-code", "silent");
  await a.until(() => st(a)?.state === "failed");
  expect(st(a)).toEqual({ state: "failed", reason: "no_answer" });
  a.done();
  const b = rig({ waitMs: 400 });
  b.s.login("claude-code");
  await b.until(() => st(b)?.state === "waiting");
  await b.until(() => st(b)?.state === "expired");
  expect(b.s.busy()).toBe(false);
  b.done();
});

test("不登录了 stops it: nothing left waiting, nothing signed in", async () => {
  const r = rig();
  r.s.login("claude-code");
  await r.until(() => st(r)?.state === "waiting");
  r.s.cancel("claude-code");
  expect(st(r)).toBeUndefined();
  expect(r.s.busy()).toBe(false);
  r.s.code("claude-code", "good"); // too late: goes nowhere
  await Bun.sleep(50);
  expect(r.signedIn()).toBe(false);
  r.done();
});

test("hel: a command put on the PATH after Ducter started answers the card's probe (it read 未登录 forever)", async () => {
  // A Ducter started with a PATH that has no claude on it (a service's), which then widens its
  // PATH to its tools folder (widenAgentPath), as hel's did. Run apart, so the PATH it started
  // with is truly without claude (Bun looks a bare command up on that one, research/132).
  const home = mkdtempSync(join(dir, "home-"));
  writeFileSync(join(home, "signed-in"), "");
  const script = join(dir, "probe.ts");
  writeFileSync(
    script,
    `import { defaultExec } from ${JSON.stringify(join(import.meta.dir, "../src/devices.ts"))};
import { probeHarnesses } from ${JSON.stringify(join(import.meta.dir, "../src/harness-probe.ts"))};
import { whichNow } from ${JSON.stringify(join(import.meta.dir, "../../protocol/src/which.ts"))};
process.env.PATH = ${JSON.stringify(bin)} + ":" + process.env.PATH;
const found = await probeHarnesses({ exec: defaultExec, which: (c) => whichNow(c), env: process.env, home: ${JSON.stringify(home)}, dataDir: ${JSON.stringify(home)}, only: ["claude-code"] });
console.log(JSON.stringify(found[0]));
`,
  );
  const p = Bun.spawn([process.execPath, script], { cwd: import.meta.dir, env: { PATH: "/usr/bin:/bin", HOME: home, FAKE_CLAUDE_DIR: home }, stdout: "pipe", stderr: "pipe" });
  const out = await new Response(p.stdout).text();
  await p.exited;
  const err = await new Response(p.stderr).text();
  expect(err.includes("error:") ? err : "").toBe("");
  expect(JSON.parse(out.trim().split("\n").pop()!)).toMatchObject({ harness: "claude-code", installed: true, loggedIn: true });
});
