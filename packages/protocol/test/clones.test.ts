// D391: which copies of one repository a computer has (only that repository's are sent back),
// whether its git can read it, the effort its words ask for, and a clone planned into the place.
import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { answerClones, canReadRemote, clonesOf, remoteKey } from "../src/clones.ts";
import { cloneTarget } from "../src/clone.ts";
import { effortFromWords } from "../src/effort-words.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
function home() {
  const d = realpathSync(mkdtempSync(join(tmpdir(), "ducter-clones-")));
  dirs.push(d);
  return d;
}
function repo(path: string, origin?: string) {
  mkdirSync(join(path, ".git"), { recursive: true });
  writeFileSync(join(path, ".git", "HEAD"), "ref: refs/heads/main\n");
  if (origin) writeFileSync(join(path, ".git", "config"), `[core]\n\tbare = false\n[remote "origin"]\n\turl = ${origin}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`);
}

test("remoteKey: owner/name is GitHub's; addresses in any form are one key", () => {
  expect(remoteKey("nowledge-co/mem")).toBe("github.com/nowledge-co/mem");
  expect(remoteKey("git@github.com:nowledge-co/mem.git")).toBe("github.com/nowledge-co/mem");
  expect(remoteKey("https://github.com/Nowledge-Co/mem")).toBe("github.com/nowledge-co/mem");
  expect(remoteKey("not a repo")).toBe("");
});

test("clonesOf finds the copies in the usual code folders, two deep, and sends back only that repository's", () => {
  const h = home();
  repo(join(h, "dev", "mem"), "git@github.com:nowledge-co/mem.git");
  repo(join(h, "code", "nowledge-co", "mem"), "https://github.com/nowledge-co/mem");
  repo(join(h, "dev", "secret-project"), "git@github.com:someone/secret-project.git");
  repo(join(h, "dev", "fork-of-mem"), "git@github.com:someone/mem.git");
  repo(join(h, "mem-top"), "https://github.com/nowledge-co/mem.git");
  // Inside a repository nothing is looked into (a vendored copy is not a clone of its own).
  repo(join(h, "dev", "mem", "vendor", "mem"), "https://github.com/nowledge-co/mem.git");
  const found = clonesOf("nowledge-co/mem", h, undefined).map((r) => r.path.slice(h.length + 1)).sort();
  expect(found).toEqual(["code/nowledge-co/mem", "dev/mem", "mem-top"]);
  for (const r of clonesOf("nowledge-co/mem", h, undefined)) expect(r.remote).toBe("github.com/nowledge-co/mem");
});

test("the Ducter folder's projects count; a computer with none answers none", async () => {
  const h = home();
  repo(join(h, "ducter", "projects", "mem"), "https://github.com/nowledge-co/mem.git");
  expect((await answerClones({ remote: "nowledge-co/mem" }, { home: h, ducterProjects: join(h, "ducter", "projects") })).clones.length).toBe(1);
  expect(await answerClones({ remote: "nowledge-co/mem" }, { home: home() })).toEqual({ clones: [] });
  expect(await answerClones({ remote: 42 }, { home: h })).toEqual({ clones: [] });
});

test("canRead: git ls-remote with no prompt, its own sign-in; a failure is no, a stop is unknown", async () => {
  const seen: { args: string[]; env: Record<string, string> }[] = [];
  const ok = await canReadRemote("nowledge-co/mem", { spawn: async (args, o) => (seen.push({ args, env: o.env }), { code: 0, err: "" }) });
  expect(ok).toBe(true);
  expect(seen[0]!.args).toEqual(["ls-remote", "--quiet", "--", "https://github.com/nowledge-co/mem.git", "HEAD"]);
  expect(seen[0]!.env.GIT_TERMINAL_PROMPT).toBe("0");
  expect(await canReadRemote("nowledge-co/mem", { spawn: async () => ({ code: 128, err: "fatal: repository not found" }) })).toBe(false);
  expect(await canReadRemote("nowledge-co/mem", { spawn: async () => ({ code: 1, err: "", timedOut: true }) })).toBeUndefined();
  expect(await canReadRemote("--upload-pack=x", { spawn: async () => ({ code: 0, err: "" }) })).toBe(false);
  // Asked with probe and no copy here: the answer says whether it can read it.
  expect(await answerClones({ remote: "nowledge-co/mem", probe: true }, { home: home(), spawn: async () => ({ code: 0, err: "" }) })).toEqual({ clones: [], canRead: true });
});

test("cloneTarget: the folder cloneRepo would make, or the same origin's copy already there", () => {
  const h = home();
  const data = join(h, "data");
  expect(cloneTarget("nowledge-co/mem", { dataDir: data })).toBe(join(data, "ducter", "projects", "mem"));
  repo(join(data, "ducter", "projects", "mem"), "https://github.com/someone/else.git");
  expect(cloneTarget("nowledge-co/mem", { dataDir: data })).toBe(join(data, "ducter", "projects", "mem-2"));
  repo(join(data, "ducter", "projects", "mem-2"), "https://github.com/nowledge-co/mem.git");
  expect(cloneTarget("nowledge-co/mem", { dataDir: data })).toBe(join(data, "ducter", "projects", "mem-2"));
});

test("effort in the person's words: careful is high, quick is low, both or neither is none", () => {
  expect(effortFromWords(["10559 帮我用 codex astra 仔细做一下"])).toBe("high");
  expect(effortFromWords(["认真看看这个 bug"])).toBe("high");
  expect(effortFromWords(["好好改一下登录页"])).toBe("high");
  expect(effortFromWords(["please do this carefully"])).toBe("high");
  expect(effortFromWords(["review it thoroughly"])).toBe("high");
  expect(effortFromWords(["快速看一下 CI"])).toBe("low");
  expect(effortFromWords(["随便看看就行"])).toBe("low");
  expect(effortFromWords(["just a quick look at the logs"])).toBe("low");
  expect(effortFromWords(["修一下 10559"])).toBeUndefined();
  expect(effortFromWords(["它现在好好的", "the build is quick"])).toBeUndefined();
  expect(effortFromWords(["仔细做，但快速看一下 CI"])).toBeUndefined();
});
