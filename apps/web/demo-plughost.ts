// D668 (research/246 §3.6, §3.10): a demo core for Settings › 导入 / Import's plugin shots.
// The fixture reader is our own test fixture (never code from the internet), installed from a
// pretend git URL into a temporary data folder; nothing is run. States: phase2 (no plugin),
// before (installed, no consent), after (consented and its conversations already in the Log),
// update (the upstream ref moved after the pin).
//   DUCTER_PORT=7541 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh DEMO_STATE=before bun apps/web/demo-plughost.ts
// Then http://127.0.0.1:7541/app#settings=import.
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createPluginRuntime, type GitExec } from "@ducter/core/src/imports/plugins.ts";
import { importInto } from "@ducter/core/src/imports/service.ts";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const state = process.env.DEMO_STATE ?? "before";
const dataDir = process.env.DUCTER_DATA_DIR || `${process.env.TMPDIR ?? "/tmp"}/ducter-demo-plughost-${Date.now()}`;
const now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const at = (days: number) => iso(now - days * 86_400_000);
const fixture = resolve(new URL("../../packages/core/test/fixtures/plugin", import.meta.url).pathname);
const repo = "https://github.com/acme/fixture-reader";
const pinned = "a1b2c3d4e5f6a7b8";
const moving = { commit: pinned, remote: pinned };
const git: GitExec = async (args) => {
  if (args[0] === "clone") {
    const dest = args[args.length - 1]!;
    cpSync(fixture, dest, { recursive: true });
    return { code: 0, stdout: "", stderr: "" };
  }
  if (args[0] === "rev-parse") return { code: 0, stdout: `${moving.commit}\n`, stderr: "" };
  if (args[0] === "ls-remote") return { code: 0, stdout: `${moving.remote}\tHEAD\n`, stderr: "" };
  if (args[0] === "checkout") return { code: 0, stdout: "", stderr: "" };
  return { code: 1, stdout: "", stderr: `demo git: ${args.join(" ")}` };
};

const rt = createPluginRuntime({ dataDir, git });
if (state !== "phase2") {
  const a = await rt.install(repo);
  if (!a.ok) throw new Error(a.error);
  const file = join(dataDir, "plugins", "fixture-reader", "ducter-plugin.json");
  const m = JSON.parse(readFileSync(file, "utf8")) as { reads: string[]; version: string };
  m.reads = [...m.reads, "~/Library/Notes/**/*.sqlite*"];
  if (state === "update") {
    m.version = "0.2.0";
    moving.remote = "b2c3d4e5f6a7b8c9";
  }
  writeFileSync(file, `${JSON.stringify(m, null, 2)}\n`);
  const manifest = m;
  if (state === "after" || state === "update") {
    rt.consent("fixture-reader", manifest.reads);
    writeFileSync(join(dataDir, "imports.json"), `${JSON.stringify({ sources: { "fixture-reader": { consented: true, consentedAt: new Date(now).toISOString(), reads: manifest.reads } } }, null, 2)}\n`);
  }
}

// A pretend Lody on this computer, so the pane also shows the built-in source (its index only).
const sessions = [
  { id: "S-8f2a", title: zh ? "WAL 尾部损坏时怎么回放" : "Replaying the WAL with a torn tail", repoFullName: "acme/hawdb", createdAt: at(4), lastMessageAt: now - 2 * 86_400_000 },
  { id: "S-91c0", title: zh ? "京都酒店和机票一起看" : "Kyoto hotel and flights together", repoFullName: "acme/travel", createdAt: at(7), lastMessageAt: now - 4 * 86_400_000 },
  { id: "S-77aa", title: zh ? "试一下旧的 parser" : "Try the old parser", repoFullName: "acme/old-thing", createdAt: at(9), lastMessageAt: now - 9 * 86_400_000 },
];
const run = async (args: string[]) => {
  const out = (o: unknown) => ({ code: 0, stdout: `${JSON.stringify(o)}\n`, stderr: "" });
  if (args[0] === "workspace" && args[1] === "list") return out({ ok: true, workspaces: [{ id: "w1", name: "Acme", slug: "acme" }] });
  if (args[0] === "session" && args[1] === "list") return out({ ok: true, workspaceId: "w1", items: sessions, hasMore: false });
  return out({ ok: true, items: [] });
};

const core = startCore({ dataDir, push: false, persona: { id: "default", name: "Ducter", identity: "" }, ooSource: noOo, importsRun: run, importsPlugins: { git } });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en" });

if (state === "after") {
  const threads = (JSON.parse(readFileSync(join(dataDir, "plugins", "fixture-reader", "threads.json"), "utf8")) as { threads: { id: string; title: string; repo?: string; createdAt: string; updatedAt: string; messages: { id: string; role: string; text: string; at: string }[] }[] }).threads;
  const lines = [JSON.stringify({ t: "source", format: "ducter-import/1", app: "Fixture Notes", account: "fixture-reader", reader: "fixture-reader", readerVersion: "0.1.0" })];
  let messages = 0;
  for (const th of threads) {
    lines.push(JSON.stringify({ t: "thread", id: th.id, title: th.title, ...(th.repo ? { repo: th.repo } : {}), createdAt: th.createdAt, updatedAt: th.updatedAt, archived: false }));
    for (const m of th.messages) {
      lines.push(JSON.stringify({ t: "msg", thread: th.id, id: m.id, role: m.role, text: m.text, at: m.at }));
      messages++;
    }
  }
  lines.push(JSON.stringify({ t: "end", threads: threads.length, messages }));
  await importInto({ log: core.log, tasks: core.tasks, persona: core.persona.id, now: Date.now }, `${lines.join("\n")}\n`);
}

console.log(`[demo] plugin imports at http://127.0.0.1:${core.port}/app (state: ${state}, data: ${core.dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
