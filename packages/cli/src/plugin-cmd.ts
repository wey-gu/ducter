// D668 (research/246 §3.5, §3.6): `ducter plugin add|list|remove|update`.
//
// The CLI is where the word "plugin" lives (the person sees imports). It installs a reader at a
// pinned commit and content hash, never runs it, and leaves the Log to the import service. The
// row it appears on is Settings › 导入 / Import; `add` only says that consent is owed there.
// `remove` removes the folder and ledger, hides what it brought in (the same import_removed the
// pane writes), and forgets the consent so adding it again asks once more.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openLog } from "@ducter/core/src/log.ts";
import { createRegistry } from "@ducter/core/src/registry.ts";
import { createPluginRuntime, type PluginAnswer, type PluginEntry, type PluginRuntime } from "@ducter/core/src/imports/plugins.ts";
import { createRepositories, type RepositoryRuntime } from "@ducter/core/src/imports/repos.ts";
import { IMPORTS_FILE } from "@ducter/core/src/imports/sources.ts";
import type { T } from "./i18n.ts";

export interface PluginCmdCtx {
  t: T;
  dataDir: string;
  json: boolean;
  /** The words after `plugin`: `add <url>`, `list`, `remove <id>`, `update <id>`. */
  rest: string[];
  print?: (s: string) => void;
  /** Injected in tests: the runtime (git, sandbox, curated list). */
  runtime?: PluginRuntime;
  /** Injected in tests: the repositories (official URL, git, the person's ledger). */
  repositories?: RepositoryRuntime;
}

const short = (s: string | undefined, n = 8) => (s ? s.slice(0, n) : "");

function makeRuntime(c: PluginCmdCtx): PluginRuntime {
  return c.runtime ?? createPluginRuntime({ dataDir: c.dataDir });
}

function makeRepositories(c: PluginCmdCtx, runtime: PluginRuntime): RepositoryRuntime {
  return c.repositories ?? createRepositories({ dataDir: c.dataDir, plugins: runtime });
}

function state(t: T, e: PluginEntry): string {
  if (e.problem === "needs_newer") return t("plugin.state.needsNewer");
  if (e.problem === "broken") return t("plugin.state.broken");
  if (e.problem === "hash_mismatch") return t("plugin.state.hashMismatch");
  if (e.update) return t("plugin.state.update", { version: e.update.version ?? short(e.update.commit) });
  return e.reviewed ? t("plugin.state.reviewed") : t("plugin.state.unreviewed");
}

function answerLine(t: T, a: PluginAnswer): string {
  if (!a.ok) return t("plugin.error", { code: a.error ?? "failed", detail: a.detail ?? "" });
  const facts = [a.app ?? a.id ?? "", a.version ?? ""].filter(Boolean).join(" ");
  return t("plugin.added", { facts, commit: short(a.commit) || "-", hash: short(a.hash) || "-" });
}

function forgetSource(dataDir: string, id: string): void {
  const file = join(dataDir, IMPORTS_FILE);
  if (!existsSync(file)) return;
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as { sources?: Record<string, unknown> };
    if (!raw?.sources || !(id in raw.sources)) return;
    delete raw.sources[id];
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(raw, null, 2)}\n`, { mode: 0o600 });
    renameSync(tmp, file);
  } catch {
    /* the pane's own state is small; a missing consent just asks again */
  }
}

/** Hides what the source brought in, the same event the pane's 删掉这个来源 writes. */
function hideImported(dataDir: string, app: string, account: string): number {
  const db = join(dataDir, "ducter.db");
  if (!existsSync(db)) return 0;
  const log = openLog({ path: db, persona: "default" });
  try {
    const tasks = createRegistry(log);
    const n = tasks.list().filter((c) => c.imported?.app === app && c.imported?.account === account).length;
    log.append({ stream: "system", origin: "import", kind: "import_removed", body: { app, at: new Date().toISOString(), threads: n } });
    return n;
  } finally {
    log.close();
  }
}

export async function cmdPlugin(c: PluginCmdCtx): Promise<number> {
  const print = c.print ?? ((s: string) => console.log(s));
  const t = c.t;
  const [what, value, third] = c.rest;
  const runtime = makeRuntime(c);

  if (!what || what === "help") {
    print(t("plugin.usage"));
    return what ? 0 : 2;
  }

  // D670: a plugin repository is a source. `source add|list|remove`; the official repository
  // is always there and can't be removed. Nothing is installed or run here.
  if (what === "source") {
    const repos = makeRepositories(c, runtime);
    const sub = value ?? "list";
    if (sub === "list") {
      const all = repos.list();
      if (c.json) {
        print(JSON.stringify({ ok: true, repositories: all }, null, 2));
        return 0;
      }
      for (const r of all) print(t("plugin.source.row", { id: r.id, url: r.url, official: r.official ? t("plugin.source.official") : "" }));
      return 0;
    }
    if (sub === "add") {
      if (!third) {
        print(t("plugin.source.usage"));
        return 2;
      }
      const r = repos.add(third);
      if (c.json) print(JSON.stringify(r, null, 2));
      else if (r.ok) print(t("plugin.source.added", { url: r.url ?? third }));
      else print(t("plugin.error", { code: r.error ?? "failed", detail: r.detail ?? "" }));
      return r.ok ? 0 : 1;
    }
    if (sub === "remove") {
      if (!third) {
        print(t("plugin.source.usage"));
        return 2;
      }
      const all = repos.list();
      const id = all.find((r) => r.id === third || r.url === third)?.id ?? third;
      const r = repos.remove(id);
      if (c.json) print(JSON.stringify(r, null, 2));
      else if (r.ok) print(t("plugin.source.removed", { id }));
      else print(t("plugin.error", { code: r.error ?? "failed", detail: "" }));
      return r.ok ? 0 : 1;
    }
    print(t("plugin.source.usage"));
    return 2;
  }

  if (what === "list") {
    const entries = runtime.list();
    if (c.json) {
      print(
        JSON.stringify(
          {
            ok: true,
            plugins: entries.map((e) => ({
              id: e.record.id,
              app: e.manifest?.app.name ?? e.record.app,
              version: e.record.version,
              source: e.record.source,
              folder: e.record.kind === "folder" ? e.record.dir : undefined,
              commit: e.record.commit,
              hash: e.record.hash,
              reads: e.manifest?.reads ?? [],
              reviewed: e.reviewed,
              unreviewed: !e.reviewed,
              update: e.update,
              problem: e.problem,
            })),
          },
          null,
          2,
        ),
      );
      return 0;
    }
    if (!entries.length) {
      print(t("plugin.list.empty"));
      return 0;
    }
    for (const e of entries) {
      print(t("plugin.list.row", { id: e.record.id, app: e.manifest?.app.name ?? e.record.app, version: e.record.version, state: state(t, e) }));
      if (e.record.source) print(t("plugin.list.source", { source: e.record.source }));
      if (e.record.kind === "folder") print(t("plugin.list.folder", { folder: e.record.dir }));
      print(t("plugin.list.pin", { commit: short(e.record.commit) || "-", hash: short(e.record.hash) }));
      if (e.manifest?.reads.length) print(t("plugin.list.reads", { reads: e.manifest.reads.join("\n  ") }));
    }
    return 0;
  }

  if (what === "add") {
    if (!value) {
      print(t("plugin.usage"));
      return 2;
    }
    const a = await runtime.install(value);
    if (c.json) print(JSON.stringify(a, null, 2));
    else {
      print(answerLine(t, a));
      if (a.ok) {
        print(a.reviewed ? t("plugin.added.reviewed") : t("plugin.added.unreviewed"));
        if (a.needsConsent) print(t("plugin.added.consent"));
      }
    }
    return a.ok ? 0 : 1;
  }

  if (what === "remove") {
    if (!value) {
      print(t("plugin.usage"));
      return 2;
    }
    const e = runtime.get(value);
    if (!e) {
      print(t("plugin.error", { code: "not_found", detail: value }));
      return 1;
    }
    const app = e.manifest?.app.name ?? e.record.app;
    const n = hideImported(c.dataDir, app, e.record.id);
    const r = runtime.remove(value);
    forgetSource(c.dataDir, value);
    if (c.json) print(JSON.stringify({ ...r, hidden: n }, null, 2));
    else if (r.ok) {
      print(t("plugin.removed", { id: value }));
      print(t("plugin.removed.hidden", { n: String(n) }));
      if (e.record.kind === "folder") print(t("plugin.removed.folder", { folder: e.record.dir }));
    } else print(t("plugin.error", { code: r.error ?? "remove_failed", detail: "" }));
    return r.ok ? 0 : 1;
  }

  if (what === "update") {
    if (!value) {
      print(t("plugin.usage"));
      return 2;
    }
    const installed = runtime.get(value);
    const a = installed?.record.kind === "repo" ? await makeRepositories(c, runtime).update(value) : await runtime.update(value);
    if (c.json) print(JSON.stringify(a, null, 2));
    else if (!a.ok) print(t("plugin.error", { code: a.error ?? "update_failed", detail: a.detail ?? "" }));
    else if (a.upToDate) print(t("plugin.updated.upToDate", { id: value }));
    else {
      print(t("plugin.updated", { id: value, version: a.version ?? "" }));
      print(a.needsConsent ? t("plugin.updated.consent") : t("plugin.updated.same"));
    }
    return a.ok ? 0 : 1;
  }

  print(t("plugin.usage"));
  return 2;
}
