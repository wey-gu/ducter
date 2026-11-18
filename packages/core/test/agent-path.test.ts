// D359: a worker service finds the agents the person installed themselves: the login shell's PATH,
// the usual per-user folders (nvm, npm's prefix, ~/.local/bin, Homebrew on Linux), then Ducter's
// own tools folder; and a cheap fingerprint that moves when one is installed or signed in by hand.
import { expect, test } from "bun:test";
import { agentPath, agentSignature, captureLoginPath, parseLoginPath, userAgentDirs, type AgentPathFs } from "../src/agent-path.ts";

function fakeFs(files: Record<string, string | true>, dirs: Record<string, string[]> = {}): AgentPathFs {
  return {
    exists: (p) => p in files || p in dirs,
    readdir: (p) => dirs[p] ?? [],
    read: (p) => (typeof files[p] === "string" ? (files[p] as string) : undefined),
  };
}

test("the usual places: ~/.local/bin, npm's prefix, every nvm node newest first, Homebrew on Linux; only those there", () => {
  const fs = fakeFs(
    { "/home/w/.npmrc": "prefix=~/.npm-global\n", "/home/w/.npm-global/bin": true, "/home/w/.local/bin": true, "/home/linuxbrew/.linuxbrew/bin": true, "/home/w/.nvm/versions/node/v20.11.1/bin": true, "/home/w/.nvm/versions/node/v22.9.0/bin": true },
    { "/home/w/.nvm/versions/node": ["v20.11.1", "v22.9.0"] },
  );
  expect(userAgentDirs({ home: "/home/w", env: {}, fs })).toEqual(["/home/w/.local/bin", "/home/w/.npm-global/bin", "/home/w/.nvm/versions/node/v22.9.0/bin", "/home/w/.nvm/versions/node/v20.11.1/bin", "/home/linuxbrew/.linuxbrew/bin"]);
});

test("agentPath: the process's own first, then the login shell's, the usual places, Ducter's tools last; each once", () => {
  const fs = fakeFs({ "/home/w/.local/bin": true });
  const p = agentPath({ dataDir: "/home/w/.ducter", env: { PATH: "/usr/bin:/bin" }, home: "/home/w", fs, login: ["/home/w/.nvm/versions/node/v22.9.0/bin", "/usr/bin"] }).split(":");
  expect(p).toEqual(["/usr/bin", "/bin", "/home/w/.nvm/versions/node/v22.9.0/bin", "/home/w/.local/bin", "/home/w/.ducter/tools/node/bin", "/home/w/.ducter/tools/bin"]);
});

test("the login shell's PATH between its markers, whatever an rc file prints around it", async () => {
  expect(parseLoginPath("Welcome!\n__DUCTER_PATH__/a/bin:/usr/bin:relative__DUCTER_END__\nbye")).toEqual(["/a/bin", "/usr/bin"]);
  expect(parseLoginPath("no markers")).toBeUndefined();
  let argv: string[] = [];
  const got = await captureLoginPath({ shell: "/bin/bash", run: async (a) => ((argv = a), { code: 0, out: "nvm says hi\n__DUCTER_PATH__/x/bin__DUCTER_END__" }) });
  expect(argv.slice(0, 2)).toEqual(["/bin/bash", "-lic"]);
  expect(got).toEqual(["/x/bin"]);
  expect(await captureLoginPath({ shell: "/bin/zsh", run: async () => Promise.reject(new Error("no shell")) })).toBeUndefined();
});

test("the fingerprint moves when an agent appears or a sign-in file changes, not otherwise", () => {
  let codex: string | null = null;
  const times: Record<string, number> = {};
  const sig = () => agentSignature({ dataDir: "/d", home: "/home/w", env: {}, which: (c) => (c === "codex" ? codex : null), mtime: (p) => times[p] });
  const a = sig();
  expect(sig()).toBe(a);
  codex = "/home/w/.local/bin/codex";
  times[codex] = 1;
  const b = sig();
  expect(b).not.toBe(a);
  times["/home/w/.codex/auth.json"] = 2; // `codex login` in a terminal
  expect(sig()).not.toBe(b);
});
