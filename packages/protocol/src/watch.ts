// D245: "when something changes": a routine's watch, looked at without a model. Pure: validation,
// what one look saw (a baseline), and what changed between two looks (new, updated, gone). Doing
// the look (files, a command, a URL, an app's reading tool) is in core/src/work.ts.
import { jsonAt, validateCheck, type CheckContext } from "./checks.ts";
import type { WatchBaseline, WatchSpec } from "./index.ts";

/** Items kept per baseline; past it the rest count only in the whole hash. */
export const WATCH_MAX_ITEMS = 200;
const MAX_FILES = 20;

type Verdict = { ok: true } | { ok: false; error: string };

/** A URL watch is one GET through the check rules' curl. */
export const urlArgv = (url: string): string[] => ["curl", "-sL", "--max-time", "15", url];

export function validateWatch(spec: WatchSpec | undefined, ctx: CheckContext = {}): Verdict {
  if (!spec || typeof spec !== "object") return { ok: false, error: "watch must be an object" };
  const sources = [spec.files, spec.argv, spec.url, spec.tool].filter((x) => x !== undefined);
  if (sources.length !== 1) return { ok: false, error: "a watch looks at exactly one thing: files, argv, url or tool" };
  for (const [name, v] of [["key", spec.key], ["fields", spec.fields]] as const)
    if (v !== undefined && (!Array.isArray(v) || !v.length || v.some((x) => typeof x !== "string" || !x))) return { ok: false, error: `watch.${name} must be a list of field names` };
  if (spec.path !== undefined && typeof spec.path !== "string") return { ok: false, error: "watch.path must be a JSON path like items or [].id" };
  if (spec.files) {
    if (!Array.isArray(spec.files) || !spec.files.length || spec.files.length > MAX_FILES || spec.files.some((f) => typeof f !== "string" || !f.trim()))
      return { ok: false, error: `watch.files must be 1 to ${MAX_FILES} paths` };
    if (spec.device && spec.device !== "local") return { ok: false, error: "watching files works on this computer only for now" };
    // The same path rules as a check that reads them (never keys, never Ducter's data folder).
    const v = validateCheck({ argv: ["stat", ...spec.files], succeedWhen: {} }, ctx);
    return v.ok ? v : { ok: false, error: v.error.replace("a check", "a watch") };
  }
  if (spec.argv) return validateCheck({ argv: spec.argv, ...(spec.cwd ? { cwd: spec.cwd } : {}), succeedWhen: {} }, ctx);
  if (spec.url !== undefined) {
    if (typeof spec.url !== "string" || !/^https?:\/\/[^\s]+$/i.test(spec.url)) return { ok: false, error: "watch.url must be an http:// or https:// address" };
    return validateCheck({ argv: urlArgv(spec.url), succeedWhen: {} }, ctx);
  }
  const t = spec.tool!;
  if (!t || typeof t.connection !== "string" || !t.connection || typeof t.action !== "string" || !t.action)
    return { ok: false, error: "watch.tool needs a connection and a reading action (connection_search finds one)" };
  return { ok: true };
}

/** A watch in a few words, for Details and the partner ("files ~/notes", "https://…"). */
export function describeWatch(spec: WatchSpec): string {
  if (spec.files) return `files ${spec.files.join(", ")}`;
  if (spec.argv) return spec.argv.join(" ");
  if (spec.url) return spec.url;
  return spec.tool ? `${spec.tool.connection} ${spec.tool.action}` : "nothing";
}

const hashOf = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
};
/** JSON with its keys sorted, so the same answer always hashes the same. */
export function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v) ?? "null";
}
const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1) + "…");
const show = (v: unknown) => (typeof v === "string" ? v : stable(v));

/** What one look saw. `text`: the answer as text when it isn't a list (for the run's brief). */
export interface WatchSeen {
  baseline: WatchBaseline;
  list: boolean;
  text?: string;
}

/** What one look saw, as a baseline: one hash per item when the answer (at `path`) is a list. */
export function snapshot(data: unknown, spec: Pick<WatchSpec, "path" | "key" | "fields" | "files">): WatchSeen {
  let root: unknown = data;
  if (typeof root === "string") {
    const t = root.trim();
    if (/^[[{]/.test(t)) {
      try {
        root = JSON.parse(t);
      } catch {
        root = t;
      }
    } else root = t;
  }
  if (spec.path && root && typeof root === "object") {
    const { values, mapped } = jsonAt(root, spec.path);
    root = mapped || values.length !== 1 ? values : values[0];
  }
  if (!Array.isArray(root)) {
    const text = show(root ?? "");
    return { baseline: { hash: hashOf(text) }, list: false, text: clip(text, 1500) };
  }
  const key = spec.key ?? (spec.files ? ["path"] : undefined);
  const items: Record<string, string> = {};
  for (const item of root.slice(0, WATCH_MAX_ITEMS)) {
    const obj = item && typeof item === "object" ? (item as Record<string, unknown>) : undefined;
    const id = key && obj ? key.map((k) => show(jsonAt(obj, k).values[0] ?? "")).join(" / ") : clip(show(item), 120);
    const counted = spec.fields && obj ? Object.fromEntries(spec.fields.map((f) => [f, jsonAt(obj, f).values[0]])) : item;
    items[clip(id, 120)] = hashOf(stable(counted));
  }
  const whole = hashOf(
    Object.keys(items)
      .sort()
      .map((k) => `${k}=${items[k]}`)
      .join("\n") + (root.length > WATCH_MAX_ITEMS ? `|${root.length}` : ""),
  );
  return { baseline: { hash: whole, items }, list: true };
}

export interface WatchDiff {
  changed: boolean;
  added: string[];
  updated: string[];
  gone: string[];
  /** Not to be trusted as a change: everything it saw is gone at once, or the answer changed
   *  shape (a list became text). The routine asks before it runs (D245). */
  unsure: boolean;
}

export function diffWatch(prev: WatchBaseline, next: WatchSeen): WatchDiff {
  const none: WatchDiff = { changed: false, added: [], updated: [], gone: [], unsure: false };
  if (prev.hash === next.baseline.hash) return none;
  const a = prev.items;
  const b = next.baseline.items;
  if (!a || !b) return { ...none, changed: true, unsure: Boolean(a && Object.keys(a).length && !b) };
  const added = Object.keys(b).filter((k) => !(k in a));
  const gone = Object.keys(a).filter((k) => !(k in b));
  const updated = Object.keys(b).filter((k) => k in a && a[k] !== b[k]);
  const before = Object.keys(a).length;
  return { changed: true, added, updated, gone, unsure: before >= 3 && Object.keys(b).length === 0 };
}

/** What changed, in one short line for the card (observed) and a longer one for the run's brief. */
export function describeChange(d: WatchDiff, next: WatchSeen): { observed: string; detail: string } {
  if (!d.added.length && !d.updated.length && !d.gone.length) {
    const now = next.text ? `\nNow it reads:\n${next.text}` : "";
    return { observed: "it changed", detail: `It changed since the last look.${now}` };
  }
  const parts = [d.added.length ? `${d.added.length} new` : "", d.updated.length ? `${d.updated.length} updated` : "", d.gone.length ? `${d.gone.length} gone` : ""].filter(Boolean);
  const names = [...d.added, ...d.updated, ...d.gone].slice(0, 3).join(", ");
  const list = (label: string, xs: string[]) => (xs.length ? `${label}: ${xs.slice(0, 40).join("; ")}${xs.length > 40 ? ` (and ${xs.length - 40} more)` : ""}` : "");
  return {
    observed: clip(`${parts.join(" · ")} · ${names}`, 200),
    detail: clip([list("New", d.added), list("Updated", d.updated), list("Gone", d.gone)].filter(Boolean).join("\n"), 2000),
  };
}
