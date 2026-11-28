// D670: a demo core for Settings › 导入 / Import's plugin-repository shots. The official
// repository is built from this worktree's real plugin folders in a temporary folder; a person's
// repository carries one online reader so the unreviewed second tick can be seen. Nothing is run.
// States: before (nothing installed), installed (Lody installed, consent owed), after (Lody's
// conversations already in the Past tasks), update (the official index moved), person (the
// person's own unreviewed online reader installed).
//   DUCTER_PORT=7541 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh DEMO_STATE=after bun apps/web/demo-plughost.ts
// Then http://127.0.0.1:7541/app#settings=import.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { contentHash, type GitExec } from "@ducter/core/src/imports/plugins.ts";
import { importInto } from "@ducter/core/src/imports/service.ts";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const state = process.env.DEMO_STATE ?? "before";
const dataDir = process.env.DUCTER_DATA_DIR || `${process.env.TMPDIR ?? "/tmp"}/ducter-demo-plugrepo-${Date.now()}`;
const now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const at = (days: number) => iso(now - days * 86_400_000);
const pluginRepo = resolve(new URL("../../.plugins-repo/repo/plugins", import.meta.url).pathname);
const fixtureOnline = resolve(new URL("../../packages/core/test/fixtures/plugin-online", import.meta.url).pathname);
const fixture = resolve(new URL("../../packages/core/test/fixtures/plugin", import.meta.url).pathname);

interface RepoIn {
  from: string;
  id?: string;
  app?: string;
  name?: string;
  version?: string;
  detect?: string[];
  reads?: string[];
  uses?: { command: string; online: boolean; why: { en: string; zh?: string } }[];
  author?: string;
}

/** A repository folder Ducter can read: `index.json` plus `plugins/<id>` at a fake pinned commit. */
function makeRepo(root: string, plugins: RepoIn[], commit = "a1b2c3d4e5f6a7b8"): string {
  rmSync(root, { recursive: true, force: true });
  mkdirSync(join(root, "plugins"), { recursive: true });
  const entries: Record<string, unknown>[] = [];
  for (const p of plugins) {
    const m = JSON.parse(readFileSync(join(p.from, "ducter-plugin.json"), "utf8")) as Record<string, unknown>;
    const id = p.id ?? String(m.id);
    const dir = join(root, "plugins", id);
    cpSync(p.from, dir, { recursive: true });
    m.id = id;
    if (p.app) m.app = { ...(m.app as Record<string, unknown>), name: p.app };
    if (p.name) m.name = { ...(m.name as Record<string, unknown>), en: p.name };
    if (p.version) m.version = p.version;
    if (p.detect) m.detect = p.detect;
    if (p.reads) m.reads = p.reads;
    if (p.uses) m.uses = p.uses;
    if (p.author) m.author = { name: p.author };
    writeFileSync(join(dir, "ducter-plugin.json"), `${JSON.stringify(m, null, 2)}\n`);
    const app = p.app ?? String((m.app as { name?: string }).name ?? "");
    const icon = (m.app as { icon?: string }).icon;
    entries.push({ id, path: `plugins/${id}`, version: String(m.version), commit, hash: contentHash(dir), app, ...(icon ? { icon } : {}) });
  }
  entries.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  writeFileSync(join(root, "index.json"), `${JSON.stringify({ format: "ducter-plugins/1", plugins: entries }, null, 2)}\n`);
  return root;
}

const OFFICIAL_URL = "https://github.com/wey-gu/ducter-plugins";
const PERSON_URL = "https://github.com/lin/ducter-plugins";
const officialDir = makeRepo(join(dataDir, "official-repo"), [
  { from: join(pluginRepo, "lody"), detect: ["./main.ts"], version: state === "update" ? "0.2.0" : "0.1.0" },
  { from: fixture, id: "fixture-notes", app: "Fixture Notes", name: "Fixture Notes", detect: ["./threads.json"] },
]);
const personDir = makeRepo(join(dataDir, "person-repo"), [
  {
    from: fixtureOnline,
    id: "acme-notes",
    app: "Acme Notes",
    name: "Acme Notes",
    author: "Lin",
    detect: ["./threads.json"],
    uses: [
      {
        command: "lody",
        online: true,
        why: {
          en: "It reads your notes with the lody command already signed in on this computer, and goes online.",
          zh: "它会用你电脑上已经登录的 lody 命令读你的笔记，会联网。",
        },
      },
    ],
  },
]);

// The demo has no network: a clone of either clean URL copies its local repository folder.
const remotes: Record<string, string> = { [OFFICIAL_URL]: officialDir, [PERSON_URL]: personDir };
const git: GitExec = async (args) => {
  if (args[0] === "clone") {
    const url = args.find((a) => remotes[a]);
    const dest = args[args.length - 1]!;
    if (url) {
      cpSync(remotes[url]!, dest, { recursive: true });
      return { code: 0, stdout: "", stderr: "" };
    }
    return { code: 1, stdout: "", stderr: `demo git: no ${url}` };
  }
  if (args[0] === "checkout") return { code: 0, stdout: "", stderr: "" };
  if (args[0] === "rev-parse" || args[0] === "ls-remote") return { code: 0, stdout: "a1b2c3d4e5f6a7b8\n", stderr: "" };
  return { code: 1, stdout: "", stderr: `demo git: ${args.join(" ")}` };
};

const core = startCore({
  dataDir,
  push: false,
  persona: { id: "default", name: "Ducter", identity: "" },
  ooSource: noOo,
  importsOfficialUrl: OFFICIAL_URL,
  importsGit: git,
  importsPlugins: { git },
});
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en" });
const imp = core.importSources();
imp.addSource(PERSON_URL);

if (state !== "before") {
  const a = await imp.install("official", "lody");
  if (!a.ok) throw new Error(a.error ?? "install failed");
}
if (state === "after" || state === "update") {
  imp.consent("lody", true);
  const threads = [
    {
      id: "S-8f2a",
      title: zh ? "WAL 尾部损坏时怎么回放" : "Replaying the WAL with a torn tail",
      repo: "acme/hawdb",
      createdAt: at(4),
      updatedAt: at(2),
      messages: [
        { id: "m1", role: "user", text: zh ? "WAL 尾部的最后一页只写了一半，回放时应该跳过去吗？" : "The last WAL page was only half written. Should replay skip it?", at: at(4) },
        { id: "m2", role: "assistant", text: zh ? "先校验页的 checksum，再决定从哪一页开始重放。" : "Check the page checksum first, then decide where replay starts.", at: at(4) },
      ],
    },
    {
      id: "S-91c0",
      title: zh ? "京都酒店和机票一起看" : "Kyoto hotel and flights together",
      repo: "acme/travel",
      createdAt: at(7),
      updatedAt: at(4),
      messages: [
        { id: "m1", role: "user", text: zh ? "十一月初去京都，酒店和机票一起看。" : "Kyoto in early November; look at the hotel and flights together.", at: at(7) },
        { id: "m2", role: "assistant", text: zh ? "我先按 11 月 3 日到 8 日排一版。" : "I'll start with November 3 to 8.", at: at(7) },
      ],
    },
  ];
  const lines = [JSON.stringify({ t: "source", format: "ducter-import/1", app: "Lody", account: "lody", reader: "lody", readerVersion: "0.1.0" })];
  let messages = 0;
  for (const th of threads) {
    lines.push(JSON.stringify({ t: "thread", id: th.id, title: th.title, repo: th.repo, createdAt: th.createdAt, updatedAt: th.updatedAt }));
    for (const m of th.messages) {
      lines.push(JSON.stringify({ t: "msg", thread: th.id, id: m.id, role: m.role, text: m.text, at: m.at }));
      messages++;
    }
  }
  lines.push(JSON.stringify({ t: "end", threads: threads.length, messages }));
  await importInto({ log: core.log, tasks: core.tasks, persona: core.persona.id, now: Date.now }, `${lines.join("\n")}\n`);
}
if (state === "person") {
  // The repository id is a hash of its URL: read it back rather than guess.
  const src = imp.view().repositories?.find((r) => !r.official)?.id;
  if (src) await imp.install(src, "acme-notes");
}
if (state === "update") {
  makeRepo(officialDir, [
    { from: join(pluginRepo, "lody"), detect: ["./main.ts"], version: "0.2.0", reads: ["~/.lody/**", "~/.lody-oss/**", "~/.config/lody/**"] },
    { from: fixture, id: "fixture-notes", app: "Fixture Notes", name: "Fixture Notes", detect: ["./threads.json"] },
  ]);
}
await imp.look(true);

console.log(`[demo] plugin imports at http://127.0.0.1:${core.port}/app (state: ${state}, data: ${core.dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
