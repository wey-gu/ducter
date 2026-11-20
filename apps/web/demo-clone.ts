// A demo core for D204 (从 Git 地址加… / Add from a Git address…, and New task with no dead end),
// built on demo-find.ts: home-server is the home (a server, Codex only); the Mac does tasks for it (Claude
// Code), connected as a real worker whose answers are faked: the projects in its Ducter folder
// (~/ducter-work: its ~/ducter was someone else's), its folders, and a clone that takes a few
// seconds. Real core and real web client; nothing is cloned and no real ~/ducter is touched.
//   DUCTER_PORT=7973 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-clone.ts
// DEMO_MAC_OLD=1: the Mac runs a Ducter from before D203 (it knows none of the new ops).
// DEMO_EMPTY=1: a first run: no task, no project anywhere.
// A clone of anything with "private" in it fails with no access; "slow" takes 60 s.
// D272: DEMO_HOME_NAME names the home (e.g. "Hetzner Server"); 新建一个文件夹 makes a real folder in
// the scratch home's Ducter folder (the Mac's is faked). GitHub: the home and the Mac start signed
// out (DEMO_GH=in: signed in as wey-gu; DEMO_GH=none: no gh); a sign-in shows a made-up code and
// is approved after DEMO_GH_APPROVE_MS (default 20 s). gh never runs; nothing signs in.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { startCore } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import type { GitLoginState, TaskCard } from "@ducter/protocol";
import type { Runner } from "@ducter/protocol/src/internal.ts";
import { parseGitAddress } from "@ducter/protocol/src/clone.ts";
import { createGitLogin, type GhRun } from "@ducter/protocol/src/git-login.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const dataDir = process.env.DUCTER_DATA_DIR;
if (!dataDir) throw new Error("set DUCTER_DATA_DIR to a scratch folder");
const old = process.env.DEMO_MAC_OLD === "1";
const empty = process.env.DEMO_EMPTY === "1";
const homeName = process.env.DEMO_HOME_NAME || "home-server";
const approveMs = Number(process.env.DEMO_GH_APPROVE_MS || 20_000);

/** A made-up gh for one computer: signed out (or in, or missing) until a sign-in is approved. */
function fakeGh(): GhRun {
  let account = process.env.DEMO_GH === "in" ? "wey-gu" : undefined;
  return async (args, o) => {
    if (process.env.DEMO_GH === "none") return { code: 127, out: "", err: "", missing: true };
    if (args[1] === "status") return account ? { code: 0, out: JSON.stringify({ hosts: { "github.com": [{ state: "success", active: true, login: account }] } }), err: "" } : { code: 1, out: "", err: "" };
    if (args[1] === "login" && args.includes("--web")) {
      o.onErr?.("! First copy your one-time code: 7F3K-QW2M\nOpen this URL to continue in your web browser: https://github.com/login/device\n");
      const stopped = await Promise.race([Bun.sleep(approveMs).then(() => false), new Promise<boolean>((r) => o.signal?.addEventListener("abort", () => r(true)))]);
      if (stopped) return { code: 1, out: "", err: "" };
      account = "wey-gu";
    }
    if (args[1] === "login" && args.includes("--with-token")) account = "wey-gu";
    return { code: 0, out: "", err: "" };
  };
}
const macGh = createGitLogin({ run: fakeGh() });

const git = (cwd: string, ...args: string[]) => {
  const r = Bun.spawnSync(["git", ...args], { cwd, env: { ...process.env, GIT_AUTHOR_NAME: "demo", GIT_AUTHOR_EMAIL: "d@x", GIT_COMMITTER_NAME: "demo", GIT_COMMITTER_EMAIL: "d@x" } });
  if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
};
// home-server's ducter: a scratch repo whose origin is the real one's, in home-server's own Ducter folder.
const srvFolder = join(dataDir, "root", "ducter");
const srv = join(srvFolder, "projects", "ducter");
mkdirSync(srv, { recursive: true });
git(srv, "init", "-q", "-b", "main");
writeFileSync(join(srv, "README.md"), "# ducter\n");
git(srv, "add", ".");
git(srv, "commit", "-q", "-m", "init");
git(srv, "remote", "add", "origin", "git@github.com:wey-gu/ducter.git");

const core = startCore({ ooSource: noOo,
  persona: { id: "default", name: "Ducter", identity: "" },
  hostname: process.env.DUCTER_HOST || "127.0.0.1",
  deviceProbes: { cua: async () => ({ missing: "demo" }), native: async () => undefined, harnesses: async () => [{ harness: "codex", installed: true, loggedIn: true }], kind: async () => "server" },
  update: { homeName, autoEveryMs: 0 },
  gitLoginHome: createGitLogin({ run: fakeGh() }),
  newFolderHome: (name) => {
    const n = String(name).trim();
    if (!n || n.includes("/") || n.startsWith(".")) return { ok: false, reason: "invalid", message: "bad name" };
    const path = join(srvFolder, "projects", n);
    mkdirSync(path, { recursive: true });
    return { ok: true, path, name: n };
  },
  homeRepos: () => ({ folder: "/root/ducter", repos: [] }),
  cloneHome: async (address) => {
    const a = parseGitAddress(address);
    if (!a.ok) return { ok: false, reason: "invalid", message: a.message };
    return { ok: false, reason: "network", message: "Could not resolve host: github.com" };
  },
  browseHome: (p) => {
    const home = "/root";
    const path = p && p !== "~" ? p : home;
    if (path === home) return { ok: true, path, home, folders: [{ name: "ducter", path: "/root/ducter" }, { name: "backups", path: "/root/backups" }] };
    return { ok: true, path, home, parent: home, folders: [] };
  },
});
core.setPartner({ onTrigger() {} });
let n = 0;
core.setRunner({
  harness: { start: async () => ({}) as never, available: async () => [] },
  async openTask(input: Parameters<Runner["openTask"]>[0]): Promise<TaskCard> {
    const taskId = `t_you${++n}`;
    core.log.append({ stream: `task:${taskId}`, origin: "system", kind: "task_open", body: { taskId, title: input.title, project: input.project ?? "", place: input.place ?? { kind: "none" }, harness: input.harness ?? "codex", brief: input.brief, origin: "you" } });
    core.tasks.setState(taskId, "working", "hot");
    return core.tasks.get(taskId)!;
  },
  send: async () => ({ delivered: "prompted" as const }),
  interrupt: async () => {},
  drop: async () => {},
  branchChanges: async () => undefined,
} as unknown as Runner);
if (!empty) {
  core.log.append({ stream: "task:t_card", origin: "system", kind: "task_open", body: { taskId: "t_card", title: zh ? "开一个任务的卡片" : "The New task card", project: "ducter", place: { kind: "repo", device: "local", repoPath: srv, branch: "ducter/t_card", baseBranch: "main" }, harness: "codex", brief: "x", origin: "you" } });
  core.tasks.setState("t_card", "done", "warm");
}

// The Mac, as home-server's worker. Its Ducter folder is ~/ducter-work: its ~/ducter is a clone of the ducter repo.
const U = "/Users/weyl";
const F = `${U}/ducter-work`;
const projects: { name: string; path: string; touchedAt: string; remote?: string; defaultBranch?: string }[] = empty ? [] : [{ name: "mem", path: `${F}/projects/mem`, touchedAt: new Date(Date.now() - 3 * 3600_000).toISOString(), remote: "github.com/nowledge-co/mem", defaultBranch: "main" }];
const ops: Record<string, (a: any) => unknown> = {
  repos: () => ({ folder: F, repos: projects }),
  browse: (a) => ({ ok: true, path: a.path || U, home: U, folders: [{ name: "Sites", path: `${U}/Sites` }] }),
  folderInfo: (a) => {
    const p = String(a.path);
    const name = p.split("/").pop();
    const hit = projects.find((r) => r.path === p);
    if (!hit && p.startsWith(`${F}/projects/`)) return { exists: true, kind: "folder", root: p, name }; // D272: a new folder, no git
    return { exists: true, kind: "repo", root: p, name, defaultBranch: "main", branches: ["main"], ...(hit?.remote ? { remote: hit.remote } : {}) };
  },
  clone: async (a) => {
    const g = parseGitAddress(a.address);
    if (!g.ok) return { ok: false, reason: "invalid", message: g.message };
    await Bun.sleep(String(a.address).includes("slow") ? 60_000 : 3_000);
    if (String(a.address).includes("private")) return { ok: false, reason: "no_access", message: "could not read Username for 'https://github.com': terminal prompts disabled" };
    const path = `${F}/projects/${g.name}`;
    projects.unshift({ name: g.name, path, touchedAt: new Date().toISOString(), remote: g.remote, defaultBranch: "main" });
    return { ok: true, path, name: g.name, remote: g.remote, defaultBranch: "main" };
  },
  models: () => null,
  newFolder: (a) => {
    const n = String(a.name ?? "").trim();
    if (!n || n.includes("/") || n.startsWith(".")) return { ok: false, reason: "invalid", message: "bad name" };
    return { ok: true, path: `${F}/projects/${n}`, name: n };
  },
  gitLogin: (a): Promise<GitLoginState> => (a.action === "start" ? macGh.start() : a.action === "wait" ? macGh.wait() : a.action === "cancel" ? macGh.cancel() : a.action === "token" ? macGh.token(String(a.token ?? "")) : macGh.status()),
};
const w = core.devices.redeem(core.devices.createCode({ kind: "worker" }).code, { name: "Macbook Pro M3", platform: "darwin-arm64", computer: "Macbook Pro M3" } as any) as { token: string };
const ws = new WebSocket(`ws://127.0.0.1:${core.port}/worker`, { headers: { authorization: `Bearer ${w.token}` } } as any);
await new Promise<void>((r) => (ws.onopen = () => r()));
ws.onmessage = async (m) => {
  const f = JSON.parse(String(m.data));
  if (f.t !== "req") return;
  const op = old && f.op !== "models" ? undefined : ops[f.op];
  ws.send(JSON.stringify(op ? { t: "res", id: f.id, ok: true, result: (await op(f.args ?? {})) ?? null } : { t: "res", id: f.id, ok: false, error: `unknown op ${f.op}` }));
};
ws.send(JSON.stringify({ t: "hello", os: "darwin", arch: "arm64", kind: "laptop", version: old ? "0.0.15" : "0.0.18", how: "app", abilities: [], harnesses: [{ id: "claude-code", installed: true, loggedIn: true, version: "2.1.400" }] }));
console.log(`demo-clone on ${core.url} · ${zh ? "zh" : "en"}${old ? " · an older Mac" : ""}${empty ? " · first run" : ""}`);
