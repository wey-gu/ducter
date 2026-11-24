// D523: signing Antigravity in, with a fake `agy` run for real, the way agy 1.5.16 behaves
// (VERIFIED in a scratch HOME, research/223): `agy acp --login` opens the browser itself through
// `open` (a Mac) or `xdg-open` (Linux) found on PATH, prints the Google link and the paste prompt,
// reads one line, exits 0 on a good code and 1 with "invalid_grant" on a bad one; `agy models`
// answers when signed in and says "Please sign in" when not. Also the Antigravity desktop app's old
// `agy` link (its editor's launcher) ahead of the real agy on PATH, an agy older than the sign-in
// floor, a check that can't reach Google, and GEMINI_HOME.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentSetup, realAgentSetupSys } from "../src/agent-setup.ts";
import { signedInNow } from "../src/harness-probe.ts";

// Placeholder values only: nothing here looks like a real provider's sign-in.
const AGY = `#!/bin/sh
d="$FAKE_AGY_DIR"
v=$(cat "$d/version" 2>/dev/null || echo 1.5.16)
case "$1" in
  --version) echo "$v"; exit 0 ;;
  update) echo 1.5.16 > "$d/version"; echo "Updated to 1.5.16"; exit 0 ;;
  models)
    if [ -f "$d/offline" ]; then echo "dial tcp: lookup example.invalid: i/o timeout" >&2; exit 1; fi
    if [ -f "$d/signed-in" ]; then echo "gemini-fake-flash"; exit 0; fi
    echo "Please sign in with agy first." >&2; exit 1 ;;
  acp)
    echo "$*" > "$d/login-args"
    url="https://accounts.google.com/o/oauth2/auth?client_id=fake&redirect_uri=https%3A%2F%2Fantigravity.google%2Foauth-callback&state=fake"
    "$FAKE_AGY_LAUNCHER" "$url" 2>/dev/null
    echo "Open this link in a browser to log in with Google:"
    echo ""
    echo "  $url"
    echo ""
    printf "Then paste the authorization code, or the full URL of the page you land on, and press Enter: "
    read code || exit 1
    case "$code" in
      good*) [ -f "$d/lie" ] || : > "$d/signed-in"; exit 0 ;;
      *) echo 'couldn'"'"'t log in: token exchange failed: oauth2: "invalid_grant" "Malformed auth code."'; exit 1 ;;
    esac ;;
esac
exit 2
`;
// The desktop app's editor launcher behind ~/.antigravity/antigravity/bin/agy: a VS Code-style
// version (three lines) and, for anything else, it opens the editor and returns at once.
const IDE = `#!/bin/sh
if [ "$1" = "--version" ]; then printf '1.11.2\\nabc123\\narm64\\n'; exit 0; fi
: > "$FAKE_AGY_DIR/editor-opened"; exit 0
`;
const BROWSER = `#!/bin/sh
: > "$FAKE_AGY_DIR/browser-opened"; exit 0
`;

let dir = "";
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "ducter-signin-agy-"));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const put = (p: string, text: string) => (mkdirSync(join(p, ".."), { recursive: true }), writeFileSync(p, text), chmodSync(p, 0o755));

function rig(o: { platform?: "darwin" | "linux"; version?: string; offline?: boolean; lie?: boolean; ide?: boolean; geminiHome?: boolean } = {}) {
  const home = mkdtempSync(join(dir, "home-"));
  const official = join(home, ".local", "bin", "agy");
  put(official, AGY);
  // The person's own browser opener, on their PATH: the sign-in must not reach it.
  const sysBin = join(home, "sysbin");
  put(join(sysBin, "open"), BROWSER);
  put(join(sysBin, "xdg-open"), BROWSER);
  const ideLink = join(home, ".antigravity", "antigravity", "bin", "agy");
  if (o.ide) put(ideLink, IDE);
  if (o.version) writeFileSync(join(home, "version"), `${o.version}\n`);
  if (o.offline) writeFileSync(join(home, "offline"), "");
  if (o.lie) writeFileSync(join(home, "lie"), "");
  const env: Record<string, string> = { PATH: `${o.ide ? join(home, ".antigravity", "antigravity", "bin") + ":" : ""}${sysBin}:/usr/bin:/bin`, HOME: home, FAKE_AGY_DIR: home, FAKE_AGY_LAUNCHER: (o.platform ?? "darwin") === "darwin" ? "open" : "xdg-open", ...(o.geminiHome ? { GEMINI_HOME: join(home, "gem") } : {}) };
  const sys = { ...realAgentSetupSys({ platform: o.platform ?? "darwin", arch: "arm64", which: (c) => (c === "agy" ? (o.ide ? ideLink : null) : null), env: () => env }), home };
  const lines: string[] = [];
  const s = createAgentSetup({
    dataDir: join(home, "data"),
    sys,
    probe: async () => {},
    changed: () => {},
    note: (l) => void lines.push(l),
    // The agent's own check, as the home runs it (core.ts): agy's `agy models`, fresh.
    signedIn: (h) => signedInNow(h, { exec: async (argv, ms) => sys.run(argv, { env, timeoutMs: ms ?? 10_000 }), which: sys.which, env, home }),
  });
  const st = () => s.state("antigravity").login;
  const until = async (pred: () => boolean, ms = 6000) => {
    for (const end = Date.now() + ms; Date.now() < end; ) {
      if (pred()) return;
      await Bun.sleep(10);
    }
    throw new Error(`timed out: ${JSON.stringify(st())}\n${lines.join("\n")}`);
  };
  const has = (f: string) => existsSync(join(home, f));
  return { s, st, until, has, home, lines, read: (f: string) => readFileSync(join(home, f), "utf8"), done: () => (s.stop(), rmSync(home, { recursive: true, force: true })) };
}

test("a Mac with the desktop app's editor link first on PATH: the real agy signs in, no editor and no browser open, 登录好了 once agy itself says so", async () => {
  const r = rig({ platform: "darwin", ide: true });
  r.s.login("antigravity");
  await r.until(() => r.st()?.state === "waiting");
  expect(r.st()).toMatchObject({ state: "waiting", paste: true });
  expect(r.st()!.url!.startsWith("https://accounts.google.com/")).toBe(true);
  r.s.code("antigravity", "good-code-fake");
  await r.until(() => r.st()?.state === "done");
  expect(r.has("signed-in")).toBe(true);
  expect(r.has("editor-opened")).toBe(false);
  expect(r.has("browser-opened")).toBe(false);
  expect(r.read("login-args").trim()).toBe("acp --login");
  // The log says each step and never the code or the link.
  const log = r.lines.join("\n");
  expect(log).toContain("[sign-in] antigravity: started");
  expect(log).toContain("signed in");
  expect(log).not.toContain("good-code-fake");
  expect(log).not.toContain("accounts.google.com");
  r.done();
});

test("Linux: its xdg-open is a no-op too", async () => {
  const r = rig({ platform: "linux" });
  r.s.login("antigravity");
  await r.until(() => r.st()?.state === "waiting");
  r.s.code("antigravity", "good");
  await r.until(() => r.st()?.state === "done");
  expect(r.has("browser-opened")).toBe(false);
  r.done();
});

test("an agy older than the sign-in floor is updated with its own updater first", async () => {
  const r = rig({ version: "1.5.5" });
  r.s.login("antigravity");
  expect(r.st()?.state).toBe("starting");
  await r.until(() => r.st()?.state === "waiting");
  expect(r.read("version").trim()).toBe("1.5.16");
  expect(r.lines.join("\n")).toContain("older than 1.5.9");
  r.s.code("antigravity", "good");
  await r.until(() => r.st()?.state === "done");
  r.done();
});

test("a wrong code ends with why, and 再试一次 starts a fresh one", async () => {
  const r = rig();
  r.s.login("antigravity");
  await r.until(() => r.st()?.state === "waiting");
  r.s.code("antigravity", "nope");
  await r.until(() => r.st()?.state === "failed");
  expect(r.st()).toEqual({ state: "failed", reason: "wrong_code" });
  r.s.login("antigravity");
  await r.until(() => r.st()?.state === "waiting");
  r.s.code("antigravity", "good");
  await r.until(() => r.st()?.state === "done");
  r.done();
});

test("its sign-in ends well but agy's own check can't reach Google: it says so, never 登录好了 or a bare 未登录", async () => {
  const r = rig({ offline: true });
  r.s.login("antigravity");
  await r.until(() => r.st()?.state === "waiting");
  r.s.code("antigravity", "good");
  await r.until(() => r.st()?.state === "failed");
  expect(r.st()).toEqual({ state: "failed", reason: "offline" });
  r.done();
});

test("its sign-in ends well but agy's own check still says signed out: not_seen", async () => {
  const r = rig({ lie: true });
  r.s.login("antigravity");
  await r.until(() => r.st()?.state === "waiting");
  r.s.code("antigravity", "good");
  await r.until(() => r.st()?.state === "failed");
  expect(r.st()).toEqual({ state: "failed", reason: "not_seen" });
  r.done();
});

test("GEMINI_HOME: the sign-in writes where OAR's sessions read (--gemini-dir)", async () => {
  const r = rig({ geminiHome: true });
  r.s.login("antigravity");
  await r.until(() => r.st()?.state === "waiting");
  expect(r.read("login-args").trim()).toBe(`acp --login --gemini-dir ${join(r.home, "gem")}`);
  r.s.cancel("antigravity");
  r.done();
});

test("no agy that answers: it fails at once and the log names where it looked", async () => {
  const r = rig({ ide: true });
  rmSync(join(r.home, ".local", "bin", "agy"));
  r.s.login("antigravity");
  await r.until(() => r.st()?.state === "failed");
  expect(r.st()).toEqual({ state: "failed", reason: "failed" });
  expect(r.lines.join("\n")).toContain("no agy that answers");
  expect(r.has("editor-opened")).toBe(false);
  r.done();
});
