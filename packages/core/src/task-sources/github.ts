// D340: GitHub issues and pull requests assigned to the person, through the home's own GitHub
// command line (gh, signed in by D272). No public address is needed: the home asks, with the last
// answer's ETag, so a look that finds nothing new costs nothing against the hourly limit
// (research/126 §1). Writes are one comment or one close, each with the gate's say (index.ts).
import type { SourceItem, SourceOp } from "@ducter/protocol";
import { ghRunEnv, realGhRun, type GhRun } from "@ducter/protocol/src/git-login.ts";
import { SIGNATURE, type AdapterStatus, type SourceAdapter, type WriteResult } from "./adapter.ts";

export interface GitHubOpts {
  source: string;
  run?: GhRun;
  env?: Record<string, string | undefined>;
  /** Only these repositories ("owner/repo", any case); absent = every repository. */
  repos?: () => string[] | undefined;
  /** Only issues with this label. */
  label?: () => string | undefined;
  timeoutMs?: number;
}

const BODY_MAX = 1200;
const REF = /^([\w.-]+\/[\w.-]+)#(\d+)$/;

interface Raw {
  number: number;
  title: string;
  body?: string | null;
  state: string;
  html_url: string;
  updated_at?: string;
  labels?: ({ name?: string } | string)[];
  pull_request?: unknown;
  repository?: { full_name?: string };
  repository_url?: string;
}

const repoOf = (r: Raw): string => r.repository?.full_name ?? r.repository_url?.replace(/^.*\/repos\//, "") ?? "";

export function itemOf(source: string, r: Raw): SourceItem {
  const repo = repoOf(r);
  const body = (r.body ?? "").trim();
  const labels = (r.labels ?? []).map((l) => (typeof l === "string" ? l : (l.name ?? ""))).filter(Boolean);
  return {
    source,
    kind: "github",
    ref: `${repo}#${r.number}`,
    label: `#${r.number}`,
    where: repo,
    title: r.title,
    url: r.html_url,
    ...(r.pull_request ? { pr: true } : {}),
    state: r.state === "closed" ? "closed" : "open",
    ...(body ? { body: body.length > BODY_MAX ? `${body.slice(0, BODY_MAX - 1)}…` : body } : {}),
    ...(r.updated_at ? { updatedAt: r.updated_at } : {}),
    ...(labels.length ? { labels } : {}),
  };
}

/** gh api -i prints the status line and headers, a blank line, then the body. */
export function splitResponse(out: string): { status: number; etag?: string; body: string } {
  const norm = out.replace(/\r\n/g, "\n");
  const cut = norm.indexOf("\n\n");
  const head = cut >= 0 ? norm.slice(0, cut) : norm;
  const body = cut >= 0 ? norm.slice(cut + 2) : "";
  const status = Number(/^HTTP\/[\d.]+\s+(\d{3})/m.exec(head)?.[1] ?? 0);
  const etag = /^etag:\s*(.+)$/im.exec(head)?.[1]?.trim();
  return { status, ...(etag ? { etag } : {}), body };
}

export function createGitHub(o: GitHubOpts): SourceAdapter & { login(): string | undefined } {
  const run = o.run ?? realGhRun;
  const env = ghRunEnv(o.env ?? process.env);
  const timeoutMs = o.timeoutMs ?? 30_000;
  let login: string | undefined;
  let cache: { etag?: string; items: SourceItem[] } | undefined;

  const gh = (args: string[], stdin?: string) => run(args, { env, timeoutMs, ...(stdin !== undefined ? { stdin } : {}) });

  const inScope = (it: SourceItem) => {
    const repos = o.repos?.()?.map((r) => r.toLowerCase());
    if (repos?.length && !repos.includes((it.where ?? "").toLowerCase())) return false;
    const label = o.label?.()?.trim().toLowerCase();
    if (label && !(it.labels ?? []).some((l) => l.toLowerCase() === label)) return false;
    return true;
  };

  return {
    kind: "github",
    ops: ["comment", "close"] as const,
    login: () => login,
    async status(): Promise<AdapterStatus> {
      const r = await gh(["api", "user", "--jq", ".login"]);
      if (r.missing) return { state: "no_tool" };
      if (r.code !== 0) {
        if (/auth login|not logged|401|Bad credentials|authentication/i.test(r.err + r.out)) return { state: "signed_out" };
        return { state: "error", error: (r.err || r.out).trim().slice(0, 200) || `gh exited ${r.code}` };
      }
      login = r.out.trim() || login;
      return { state: "ok", ...(login ? { account: login } : {}) };
    },
    async list() {
      const args = ["api", "-i", "-X", "GET", "/issues", "-f", "filter=assigned", "-f", "state=open", "-f", "sort=updated", "-f", "per_page=50"];
      if (cache?.etag) args.push("-H", `If-None-Match: ${cache.etag}`);
      const r = await gh(args);
      if (r.missing) throw new Error("gh isn't on this computer");
      const res = splitResponse(r.out);
      if (res.status === 304 && cache) return cache.items.filter(inScope);
      if (r.code !== 0 || res.status >= 400) throw new Error((r.err || res.body).trim().slice(0, 200) || `gh exited ${r.code}`);
      const raw = JSON.parse(res.body || "[]") as Raw[];
      const items = raw.map((x) => itemOf(o.source, x));
      cache = { ...(res.etag ? { etag: res.etag } : {}), items };
      return items.filter(inScope);
    },
    async get(ref) {
      const m = REF.exec(ref);
      if (!m) return undefined;
      const r = await gh(["api", `/repos/${m[1]}/issues/${m[2]}`]);
      if (r.code !== 0) {
        if (/404|Not Found|410|Gone/i.test(r.err + r.out)) return undefined;
        throw new Error((r.err || r.out).trim().slice(0, 200) || `gh exited ${r.code}`);
      }
      const raw = JSON.parse(r.out) as Raw;
      if (!raw.repository && !raw.repository_url) raw.repository = { full_name: m[1] };
      return itemOf(o.source, raw);
    },
    async write(ref, op: SourceOp, text?: string): Promise<WriteResult> {
      const m = REF.exec(ref);
      if (!m) return { ok: false, error: `not a GitHub ref: ${ref}` };
      if (op === "comment") {
        const body = `${(text ?? "").trim()}${SIGNATURE}`;
        if (!text?.trim()) return { ok: false, error: "an empty comment" };
        const r = await gh(["api", "-X", "POST", `/repos/${m[1]}/issues/${m[2]}/comments`, "--input", "-"], JSON.stringify({ body }));
        if (r.code !== 0) return { ok: false, error: (r.err || r.out).trim().slice(0, 200) || `gh exited ${r.code}` };
        try {
          return { ok: true, link: (JSON.parse(r.out) as { html_url?: string }).html_url };
        } catch {
          return { ok: true };
        }
      }
      if (op === "close") {
        const r = await gh(["api", "-X", "PATCH", `/repos/${m[1]}/issues/${m[2]}`, "--input", "-"], JSON.stringify({ state: "closed", state_reason: "completed" }));
        if (r.code !== 0) return { ok: false, error: (r.err || r.out).trim().slice(0, 200) || `gh exited ${r.code}` };
        cache = undefined; // the next look sees it gone from the open list
        return { ok: true };
      }
      return { ok: false, error: `GitHub can't ${op}` };
    },
  };
}
