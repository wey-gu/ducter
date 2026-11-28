// research/248 phase 1 (D673): the `ducter-plugin/2` loader. v1 (`ducter-plugin/1`,
// D668/D670's importer) is read forever and mapped in memory to `kind: importer`; a v2 manifest
// has one `kind` and only that kind's object. Phase 1 reads `importer` and `theme`; `ui`,
// `connector` and `source` are reserved and refused with a clear message.
//
// A v2 importer is re-expressed as the v1 importer manifest, so the sandbox, the run and the
// consent are D668/D670's, unchanged (an online reader keeps the v1 `uses`/`online` shape). A v2
// theme points at its one token file; it carries no permission.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ACTIVE_KINDS,
  PLUGIN_FILE,
  PLUGIN_FORMAT_V1,
  PLUGIN_FORMAT_V2,
  RESERVED_KINDS,
  type ImporterObject,
  type PluginAuthor,
  type PluginManifestV2,
  type PluginName,
  type PluginPermissions,
} from "@ducter/protocol/src/plugins.ts";
import { isVersion } from "@ducter/protocol/src/version.ts";
import { hostRangeOk, parseManifest as parseManifestV1, type PluginManifest } from "../imports/plugins.ts";

const ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;
const SUMMARY_MAX = 140;

export class ManifestError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function name(v: unknown, what: string): PluginName {
  const o = isObj(v) ? v : {};
  const en = str(o.en);
  if (!en) throw new ManifestError("bad_manifest", `${what}.en is needed`);
  const zh = str(o.zh);
  const out: PluginName = { en };
  if (zh) out.zh = zh;
  return out;
}

function author(v: unknown): PluginAuthor {
  const o = isObj(v) ? v : {};
  const name = str(o.name);
  if (!name) throw new ManifestError("bad_manifest", "author.name says who made it");
  const url = str(o.url);
  return { name, ...(url ? { url } : {}) };
}

function strings(v: unknown, what: string, max: number, required = false): string[] {
  const arr = Array.isArray(v) ? v : undefined;
  if (arr === undefined) {
    if (required) throw new ManifestError("bad_manifest", `${what} is a list`);
    return [];
  }
  const out = arr.map((x) => str(x)).filter(Boolean);
  if (arr.some((x) => typeof x !== "string" || !x.trim())) throw new ManifestError("bad_manifest", `${what} is a list of strings`);
  if (out.length > max) throw new ManifestError("bad_manifest", `${what} is too long`);
  return out;
}

function relFile(v: unknown, what: string): string {
  const p = str(v);
  if (!p) throw new ManifestError("bad_manifest", `${what} is a file path`);
  if (p.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(p) || p.split(/[\\/]/).includes("..")) throw new ManifestError("bad_manifest", `${what} must be inside the folder`);
  return p;
}

/** The top-level keys a v2 manifest may carry. A typo is a refusal, never silence. */
const TOP_KEYS = new Set(["format", "id", "kind", "version", "name", "summary", "icon", "author", "license", "repo", "ducter", "importer", "theme", "ui", "connector", "source", "permissions"]);
const PERM_KEYS = new Set(["files", "exec", "network"]);
const IMPORTER_KEYS = new Set(["run", "emits", "starts", "detect"]);
const THEME_KEYS = new Set(["file"]);

function checkUnknown(o: Record<string, unknown>, keys: Set<string>, what: string): void {
  for (const k of Object.keys(o)) {
    if (!keys.has(k)) throw new ManifestError("bad_manifest", `unknown ${what} key "${k}"`);
  }
}

function permissions(v: unknown): PluginPermissions {
  const o = isObj(v) ? v : {};
  checkUnknown(o, PERM_KEYS, "permissions");
  const out: PluginPermissions = {};
  if (o.files !== undefined) {
    if (!isObj(o.files)) throw new ManifestError("bad_manifest", "permissions.files must be an object");
    checkUnknown(o.files, new Set(["read"]), "permissions.files");
    out.files = { read: strings(o.files.read, "permissions.files.read", 64) };
  }
  if (o.exec !== undefined) out.exec = strings(o.exec, "permissions.exec", 16);
  if (o.network !== undefined) out.network = strings(o.network, "permissions.network", 16);
  return out;
}

/** Refuses a reserved kind with a clear message (it is owed a later phase, not ignored). */
function reservedKind(kind: string): ManifestError {
  const which = { ui: "a page or panel", connector: "an MCP server", source: "a to-do source" }[kind as "ui" | "connector" | "source"];
  return new ManifestError("reserved_kind", `kind "${kind}" (${which}) is not read yet; only importer and theme plugins install in this version`);
}

/** Checks one `ducter-plugin/2` manifest and returns only the fields Ducter keeps. */
export function parseManifestV2(raw: unknown): PluginManifestV2 {
  if (!isObj(raw)) throw new ManifestError("bad_manifest", "the manifest must be a JSON object");
  checkUnknown(raw, TOP_KEYS, "manifest");
  if (raw.format !== PLUGIN_FORMAT_V2) throw new ManifestError("bad_manifest", `format must be ${PLUGIN_FORMAT_V2}`);
  const kind = str(raw.kind);
  if (!kind) throw new ManifestError("bad_manifest", "kind names what the plugin is");
  if (RESERVED_KINDS.includes(kind as never)) throw reservedKind(kind);
  if (!ACTIVE_KINDS.includes(kind as never)) throw new ManifestError("bad_manifest", `kind must be ${ACTIVE_KINDS.join(" or ")} (others are reserved)`);

  const id = str(raw.id);
  if (!ID_RE.test(id)) throw new ManifestError("bad_manifest", "id must be lower-case letters, digits and -");
  const version = str(raw.version);
  if (!isVersion(version)) throw new ManifestError("bad_manifest", "version must be a version");
  const ducter = str(raw.ducter);
  if (!ducter) throw new ManifestError("bad_manifest", "ducter is the Ducter range it needs");

  const m: PluginManifestV2 = {
    format: PLUGIN_FORMAT_V2,
    id,
    kind: kind as PluginManifestV2["kind"],
    version,
    name: name(raw.name, "name"),
    author: author(raw.author),
    ducter,
    permissions: permissions(raw.permissions),
  };

  // summary: one line, at most 140 characters, both languages for the curated list.
  if (raw.summary !== undefined) {
    const s = name(raw.summary, "summary");
    for (const k of ["en", "zh"] as const) {
      const v = s[k];
      if (v && v.length > SUMMARY_MAX) throw new ManifestError("bad_manifest", `summary.${k} is longer than ${SUMMARY_MAX}`);
    }
    m.summary = s;
  }
  const icon = str(raw.icon);
  if (icon) m.icon = relFile(icon, "icon");
  const license = str(raw.license);
  if (license) m.license = license;
  const repo = str(raw.repo);
  if (repo) m.repo = repo;

  // Exactly one kind object, named for the kind.
  const others = (["importer", "theme", "ui", "connector", "source"] as const).filter((k) => k !== kind && raw[k] !== undefined);
  if (others.length) throw new ManifestError("bad_manifest", `a ${kind} plugin may not carry a ${others.join(" / ")} object`);

  if (kind === "theme") {
    if (!isObj(raw.theme)) throw new ManifestError("bad_manifest", "a theme plugin has a theme object");
    checkUnknown(raw.theme, THEME_KEYS, "theme");
    m.theme = { file: relFile(raw.theme.file, "theme.file") };
    const p = m.permissions;
    const empty = (a: unknown[]) => !a || a.length === 0;
    if (!empty(p.files?.read ?? []) || !empty(p.exec ?? []) || !empty(p.network ?? [])) {
      throw new ManifestError("bad_manifest", "a theme may not read files, run programs or go online");
    }
    return m;
  }

  // importer
  if (!isObj(raw.importer)) throw new ManifestError("bad_manifest", "an importer plugin has an importer object");
  checkUnknown(raw.importer, IMPORTER_KEYS, "importer");
  const imp: ImporterObject = {
    run: strings(raw.importer.run, "importer.run", 16, true),
    emits: str(raw.importer.emits),
    starts: strings(raw.importer.starts, "importer.starts", 16),
    detect: strings(raw.importer.detect, "importer.detect", 16),
  };
  if (imp.emits !== "ducter-import/1") throw new ManifestError("bad_manifest", "importer.emits must be ducter-import/1");
  m.importer = { ...imp, emits: imp.emits as "ducter-import/1" };
  const net = m.permissions.network ?? [];
  if (net.length) throw new ManifestError("bad_manifest", "an importer that goes online keeps the v1 uses shape (D670)");
  if (!(m.permissions.files?.read ?? []).length) throw new ManifestError("bad_manifest", "an importer declares at least one read path in permissions.files.read");
  return m;
}

/** A v2 importer, re-expressed as the v1 manifest the importer runtime runs (D668/D670). */
export function importerAsV1(m: PluginManifestV2): PluginManifest {
  return {
    format: PLUGIN_FORMAT_V1,
    id: m.id,
    kind: "importer",
    version: m.version,
    name: m.name,
    app: { name: m.name.en },
    author: m.author,
    emits: "ducter-import/1",
    run: [...(m.importer?.run ?? [])],
    reads: [...(m.permissions.files?.read ?? [])],
    starts: [...(m.permissions.exec ?? m.importer?.starts ?? [])],
    uses: [],
    online: false,
    network: false,
    detect: [...(m.importer?.detect ?? [])],
    ducter: m.ducter,
  };
}

/** Reads and checks one manifest, returning a v2 manifest or the v1 importer shape. */
export function readManifest(dir: string): { v1?: PluginManifest; v2?: PluginManifestV2 } {
  const file = join(dir, PLUGIN_FILE);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new ManifestError("bad_manifest", `no readable ${PLUGIN_FILE}`);
  }
  if (!isObj(raw)) throw new ManifestError("bad_manifest", "the manifest must be a JSON object");
  if (raw.format === PLUGIN_FORMAT_V2) return { v2: parseManifestV2(raw) };
  if (raw.format === PLUGIN_FORMAT_V1) {
    // v1 is the importer, read by the importer runtime's own parser (unchanged).
    return { v1: parseManifestV1(raw) };
  }
  throw new ManifestError("bad_manifest", `format must be ${PLUGIN_FORMAT_V1} or ${PLUGIN_FORMAT_V2}`);
}

/** Whether the host range covers this build (same check as the importer). */
export { hostRangeOk };
