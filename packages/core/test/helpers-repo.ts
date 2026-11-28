// D670: a plugin repository fixture. Tests copy real plugin folders into `plugins/<id>`,
// patch their manifests, and write the index the host reads; the hash is the same content hash
// the repository's own `scripts/index.ts` computes. A local folder source needs no git: the
// install path checks out a copy and checks the hash.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { contentHash } from "../src/imports/plugins.ts";

export interface RepoPluginIn {
  /** The plugin folder to copy. */
  from: string;
  /** Manifest fields to patch before hashing. */
  id?: string;
  version?: string;
  app?: string;
  reads?: string[];
  uses?: { command: string; online: boolean; why: { en: string; zh?: string } }[];
  detect?: string[];
  icon?: string;
}

export interface MadeRepo {
  root: string;
  index: {
    format: "ducter-plugins/1";
    plugins: {
      id: string;
      path: string;
      version: string;
      commit: string;
      hash: string;
      app: string;
      icon?: string;
    }[];
  };
}

/** Writes `root/index.json` and `root/plugins/<id>`; `commit` is a stable fake pin. */
export function makePluginRepo(root: string, plugins: RepoPluginIn[], commit = "aaaa1111"): MadeRepo {
  rmSync(root, { recursive: true, force: true });
  mkdirSync(join(root, "plugins"), { recursive: true });
  const entries: MadeRepo["index"]["plugins"] = [];
  for (const p of plugins) {
    const m = JSON.parse(readFileSync(join(p.from, "ducter-plugin.json"), "utf8")) as Record<string, unknown>;
    const id = p.id ?? String(m.id ?? "");
    const dir = join(root, "plugins", id);
    cpSync(p.from, dir, { recursive: true });
    // Only rewrite when a field changes: the index's hash is of the bytes on disk, and an
    // unchanged plugin must hash exactly as its author shipped it.
    const changed = p.id !== undefined || p.version !== undefined || p.app !== undefined || p.reads !== undefined || p.uses !== undefined || p.detect !== undefined || p.icon !== undefined;
    if (p.id) m.id = p.id;
    if (p.version) m.version = p.version;
    if (p.app) m.app = { ...(m.app as Record<string, unknown>), name: p.app };
    if (p.reads) m.reads = p.reads;
    if (p.uses) m.uses = p.uses;
    if (p.detect) m.detect = p.detect;
    if (p.icon) m.app = { ...(m.app as Record<string, unknown>), icon: p.icon };
    if (changed) writeFileSync(join(dir, "ducter-plugin.json"), `${JSON.stringify(m, null, 2)}\n`);
    const app = p.app ?? String((m.app as { name?: string }).name ?? "");
    entries.push({
      id,
      path: `plugins/${id}`,
      version: String(m.version),
      commit,
      hash: contentHash(dir),
      app,
      ...(p.icon ? { icon: p.icon } : {}),
    });
  }
  const index: MadeRepo["index"] = { format: "ducter-plugins/1", plugins: entries };
  writeFileSync(join(root, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
  return { root, index };
}
