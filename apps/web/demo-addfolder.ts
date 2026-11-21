// A demo core for D455 (添加文件夹 / Add a folder on any computer, from On hand): the home is a
// server ("Hetzner Server"), a Mac mini and a MacBook Pro do tasks for it, connected as real
// workers whose answers are faked: each one's folders (repos with their origin, a folder inside a
// repo), and the projects in its Ducter folder. HawDB runs on the server, ducter on the server and
// on the MacBook (one origin: one project). Real core and real web client; nothing is cloned and no
// real ~/ducter, ~/.claude or account is touched.
//   DUCTER_PORT=7975 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-addfolder.ts
import { startCore } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import type { TaskCard } from "@ducter/protocol";
import type { Runner } from "@ducter/protocol/src/internal.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
if (!process.env.DUCTER_DATA_DIR) throw new Error("set DUCTER_DATA_DIR to a scratch folder");

type Dir = { name: string; repo?: true; remote?: string; sub?: Dir[] };
/** A pretend disk: folders only, the way a computer's browse op answers. */
function browser(home: string, tree: Dir[]) {
  const find = (path: string): { dirs: Dir[]; repo?: { root: string; name: string; remote?: string } } | undefined => {
    if (path === home) return { dirs: tree };
    let dirs = tree;
    let repo: { root: string; name: string; remote?: string } | undefined;
    let at = home;
    for (const part of path.slice(home.length + 1).split("/")) {
      const d = dirs.find((x) => x.name === part);
      if (!d) return undefined;
      at += "/" + part;
      if (d.repo) repo = { root: at, name: d.name, ...(d.remote ? { remote: d.remote } : {}) };
      dirs = d.sub ?? [];
    }
    return { dirs, ...(repo ? { repo } : {}) };
  };
  return (p?: string) => {
    const path = !p || p === "~" ? home : p.startsWith("~/") ? home + p.slice(1) : p.replace(/\/+$/, "");
    if (!path.startsWith(home)) return { ok: false as const, reason: "outside" as const, message: "Only folders inside the home folder can be listed." };
    const f = find(path);
    if (!f) return { ok: false as const, reason: "not_found" as const, message: `There's no folder at ${p}.` };
    const folders = [...f.dirs].sort((a, b) => Number(!!b.repo) - Number(!!a.repo)).map((d) => ({ name: d.name, path: `${path}/${d.name}`, ...(d.repo ? { repo: true as const } : {}), ...(d.remote ? { remote: d.remote } : {}) }));
    const up = path.slice(0, path.lastIndexOf("/"));
    return { ok: true as const, path, home, ...(path !== home ? { parent: up } : {}), folders, ...(f.repo ? { inRepo: f.repo } : {}) };
  };
}
const src = (n: string) => ({ name: n, sub: [{ name: "cmd" }, { name: "docs" }, { name: "pkg", sub: [{ name: "store" }, { name: "wal" }] }] });
const server = browser("/root", [
  { name: "code", sub: [{ name: "hawdb", repo: true, remote: "github.com/acme/hawdb", ...src("hawdb") }, { name: "ducter", repo: true, remote: "github.com/wey-gu/ducter", ...src("ducter") }, { name: "hawdb-bench", sub: [{ name: "results" }] }, { name: "site", repo: true, remote: "github.com/wey-gu/wey-gu.github.io" }, { name: "infra", repo: true, remote: "github.com/acme/infra" }] },
  { name: "ducter", sub: [{ name: "projects", sub: [{ name: "mem", repo: true, remote: "github.com/nowledge-co/mem" }] }] },
  { name: "backups" },
  { name: "notes" },
]);
const mini = browser("/Users/ana", [
  { name: "dev", sub: [{ name: "hawdb", repo: true, remote: "github.com/acme/hawdb", ...src("hawdb") }, { name: "tinycart", repo: true, remote: "github.com/ana/tinycart" }] },
  { name: "Documents", sub: [{ name: "Invoices" }] },
  { name: "Sites" },
]);
const mbp = browser("/Users/weyl", [{ name: "dev", sub: [{ name: "ducter", repo: true, remote: "github.com/wey-gu/ducter", ...src("ducter") }, { name: "mem", repo: true, remote: "github.com/nowledge-co/mem" }] }, { name: "Documents" }]);

const core = startCore({
  ooSource: noOo,
  persona: { id: "default", name: "Ducter", identity: "" },
  hostname: process.env.DUCTER_HOST || "127.0.0.1",
  deviceProbes: { cua: async () => ({ missing: "demo" }), native: async () => undefined, harnesses: async () => [{ harness: "codex", installed: true, loggedIn: true }], kind: async () => "server" },
  update: { homeName: "Hetzner Server", autoEveryMs: 0 },
  homeRepos: () => ({ folder: "/root/ducter", repos: [{ name: "mem", path: "/root/ducter/projects/mem", touchedAt: new Date(Date.now() - 86400_000).toISOString(), remote: "github.com/nowledge-co/mem", defaultBranch: "main" }] }),
  homeFolderInfo: async (p) => ({ exists: true, kind: "repo", root: p, name: p.split("/").pop(), defaultBranch: "main", branches: ["main"] }),
  browseHome: server,
});
core.setPartner({ onTrigger() {} });
core.setRunner({
  harness: { start: async () => ({}) as never, available: async () => [] },
  async openTask(): Promise<TaskCard> {
    throw new Error("not in this demo");
  },
  send: async () => ({ delivered: "prompted" as const }),
  interrupt: async () => {},
  drop: async () => {},
  branchChanges: async () => undefined,
} as unknown as Runner);

async function worker(name: string, kind: string, browse: ReturnType<typeof browser>, folder: string) {
  const ops: Record<string, (a: any) => unknown> = {
    repos: () => ({ folder, repos: [] }),
    browse: (a) => browse(a.path),
    folderInfo: (a) => ({ exists: true, kind: "repo", root: String(a.path), name: String(a.path).split("/").pop(), defaultBranch: "main", branches: ["main"] }),
    models: () => null,
    gitLogin: () => ({ state: "signed_in", account: "wey-gu" }),
  };
  const w = core.devices.redeem(core.devices.createCode({ kind: "worker" }).code, { name, platform: "darwin-arm64", computer: name } as any) as { token: string; id?: string };
  const ws = new WebSocket(`ws://127.0.0.1:${core.port}/worker`, { headers: { authorization: `Bearer ${w.token}` } } as any);
  await new Promise<void>((r) => (ws.onopen = () => r()));
  ws.onmessage = async (m) => {
    const f = JSON.parse(String(m.data));
    if (f.t !== "req") return;
    const op = ops[f.op];
    ws.send(JSON.stringify(op ? { t: "res", id: f.id, ok: true, result: (await op(f.args ?? {})) ?? null } : { t: "res", id: f.id, ok: false, error: `unknown op ${f.op}` }));
  };
  ws.send(JSON.stringify({ t: "hello", os: "darwin", arch: "arm64", kind, version: "0.1.9", how: "app", abilities: [], harnesses: [{ id: "claude-code", installed: true, loggedIn: true, version: "2.1.400" }] }));
}
await worker("Mac mini", "mini", mini, "/Users/ana/ducter");
await worker("MacBook Pro", "laptop", mbp, "/Users/weyl/ducter");
const macId = core.devices.list().find((d: { name: string }) => d.name === "MacBook Pro")?.id ?? "MacBook Pro";

const task = (id: string, title: string, project: string, device: string, repoPath: string, state: "working" | "done" | "needs_you") => {
  core.log.append({ stream: `task:${id}`, origin: "system", kind: "task_open", body: { taskId: id, title, project, place: { kind: "repo", device, repoPath, branch: `ducter/${id}`, baseBranch: "main" }, harness: "codex", brief: "x", origin: "you" } });
  core.tasks.setState(id, state as never, "hot");
};
task("t_wal", zh ? "WAL 回放的基准测试" : "Benchmark WAL replay", "hawdb", "local", "/root/code/hawdb", "working");
task("t_flaky", zh ? "修 compaction 偶发失败的测试" : "Fix the flaky compaction test", "hawdb", "local", "/root/code/hawdb", "done");
task("t_lens", zh ? "On hand 的项目栏显示每个项目在哪台电脑上" : "Show where each project lives in On hand", "ducter", macId, "/Users/weyl/dev/ducter", "working");
task("t_rel", zh ? "发布 0.1.9" : "Release 0.1.9", "ducter", "local", "/root/code/ducter", "done");
console.log(`demo-addfolder on ${core.url} · ${zh ? "zh" : "en"}`);
