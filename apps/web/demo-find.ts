// A demo core for D203 (找一个文件夹… / Find a folder…, and the repos a worker reports): hel is
// the home (a server, Codex only) with one repo a task used; the Mac does tasks for it (Claude
// Code), connected as a real worker whose answers are faked: the repos it reports, its folders one
// level at a time, a folder read there. Real core and real web client; nothing is read from this
// computer's own home folder.
//   DUCTER_PORT=7972 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-find.ts
// DEMO_MAC_REPOS=0: the Mac reports no repos (the empty list).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { startCore } from "@ducter/core";
import { noOo } from "./demo-oo.ts";
import type { TaskCard } from "@ducter/protocol";
import type { Runner } from "@ducter/protocol/src/internal.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const dataDir = process.env.DUCTER_DATA_DIR;
if (!dataDir) throw new Error("set DUCTER_DATA_DIR to a scratch folder");
const macRepos = process.env.DEMO_MAC_REPOS !== "0";

// hel's ducter: a scratch repo whose origin is the real one's.
const git = (cwd: string, ...args: string[]) => {
  const r = Bun.spawnSync(["git", ...args], { cwd, env: { ...process.env, GIT_AUTHOR_NAME: "demo", GIT_AUTHOR_EMAIL: "d@x", GIT_COMMITTER_NAME: "demo", GIT_COMMITTER_EMAIL: "d@x" } });
  if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
};
const hel = join(dataDir, "root", "ducter");
mkdirSync(hel, { recursive: true });
git(hel, "init", "-q", "-b", "main");
writeFileSync(join(hel, "README.md"), "# ducter\n");
git(hel, "add", ".");
git(hel, "commit", "-q", "-m", "init");
git(hel, "branch", "next");
git(hel, "remote", "add", "origin", "git@github.com:wey-gu/ducter.git");

const core = startCore({ ooSource: noOo,
  persona: { id: "default", name: "Ducter", identity: "" },
  hostname: process.env.DUCTER_HOST || "127.0.0.1",
  deviceProbes: { cua: async () => ({ missing: "demo" }), native: async () => undefined, harnesses: async () => [{ harness: "codex", installed: true, loggedIn: true }], kind: async () => "server" },
  update: { homeName: "hel", autoEveryMs: 0 },
  browseHome: (p) => {
    const home = "/root";
    const path = p && p !== "~" ? p : home;
    if (path === home) return { ok: true, path, home, folders: [{ name: "ducter", path: hel, repo: true }, { name: "backups", path: "/root/backups" }] };
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
core.log.append({ stream: "task:t_card", origin: "system", kind: "task_open", body: { taskId: "t_card", title: zh ? "开一件事的卡片" : "The New task card", project: "ducter", place: { kind: "repo", device: "local", repoPath: hel, branch: "ducter/t_card", baseBranch: "main" }, harness: "codex", brief: "x", origin: "you" } });
core.tasks.setState("t_card", "done", "warm");

// The Mac, as hel's worker: what it says when the home asks.
const U = "/Users/weyl";
const reported = macRepos
  ? [
      { name: "ducter", path: `${U}/dev/ducter`, touchedAt: new Date(Date.now() - 600_000).toISOString(), remote: "github.com/wey-gu/ducter", defaultBranch: "main" },
      { name: "mem", path: `${U}/dev/mem`, touchedAt: new Date(Date.now() - 3 * 3600_000).toISOString(), remote: "github.com/nowledge-co/mem", defaultBranch: "main" },
      { name: "hawdb", path: `${U}/code/hawdb`, touchedAt: new Date(Date.now() - 26 * 3600_000).toISOString(), remote: "github.com/wey-gu/hawdb", defaultBranch: "main" },
      { name: "tinycart", path: `${U}/code/tinycart`, touchedAt: new Date(Date.now() - 4 * 86400_000).toISOString(), defaultBranch: "master" },
    ]
  : [];
const tree: Record<string, { name: string; repo?: boolean }[]> = {
  [U]: [{ name: "code" }, { name: "dev" }, { name: "Documents" }, { name: "Downloads" }, { name: "Sites" }],
  [`${U}/Sites`]: [{ name: "blog", repo: true }, { name: "portfolio", repo: true }, { name: "drafts" }, { name: "old-themes" }],
  [`${U}/dev`]: macRepos ? [{ name: "ducter", repo: true }, { name: "mem", repo: true }, { name: "scratch" }] : [{ name: "scratch" }],
};
const ops: Record<string, (a: any) => unknown> = {
  repos: () => reported,
  browse: (a) => {
    const path = a.path || U;
    const folders = (tree[path] ?? []).map((f) => ({ name: f.name, path: `${path}/${f.name}`, ...(f.repo ? { repo: true } : {}) }));
    return { ok: true, path, home: U, ...(path !== U ? { parent: path.slice(0, path.lastIndexOf("/")) } : {}), folders: folders.sort((x, y) => Number(!!y.repo) - Number(!!x.repo)) };
  },
  folderInfo: (a) => {
    const p = String(a.path);
    const name = p.split("/").pop();
    const repo = Object.values(tree).flat().some((f) => f.repo && p.endsWith("/" + f.name)) || reported.some((r) => r.path === p);
    return repo ? { exists: true, kind: "repo", root: p, name, defaultBranch: "main", branches: ["main", "next"], ...(name === "ducter" ? { remote: "github.com/wey-gu/ducter" } : {}) } : { exists: true, kind: "folder", root: p, name };
  },
  models: () => null,
};
const w = core.devices.redeem(core.devices.createCode({ kind: "worker" }).code, { name: "Macbook Pro M3", platform: "darwin-arm64", computer: "Macbook Pro M3" } as any) as { token: string };
const ws = new WebSocket(`ws://127.0.0.1:${core.port}/worker`, { headers: { authorization: `Bearer ${w.token}` } } as any);
await new Promise<void>((r) => (ws.onopen = () => r()));
ws.onmessage = (m) => {
  const f = JSON.parse(String(m.data));
  if (f.t !== "req") return;
  const op = ops[f.op];
  ws.send(JSON.stringify(op ? { t: "res", id: f.id, ok: true, result: op(f.args ?? {}) ?? null } : { t: "res", id: f.id, ok: false, error: `unknown op ${f.op}` }));
};
ws.send(JSON.stringify({ t: "hello", os: "darwin", arch: "arm64", kind: "laptop", version: "0.0.17", how: "app", abilities: [], harnesses: [{ id: "claude-code", installed: true, loggedIn: true, version: "2.1.400" }] }));
console.log(`demo-find on ${core.url} · ${zh ? "zh" : "en"}${macRepos ? "" : " · the Mac reports no repos"}`);
