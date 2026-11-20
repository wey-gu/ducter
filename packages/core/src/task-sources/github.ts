// D341: GitHub issues and pull requests assigned to the person, through the home's own GitHub
// command line (gh, signed in by D272). No public address is needed: the home asks, with the last
// answer's ETag, so a look that finds nothing new costs nothing against the hourly limit
// (research/126 §1). Writes are one comment or one close, each with the gate's say (index.ts).
import type { SourceItem, SourceOp } from "@ducter/protocol";
import { ghRunEnv, realGhRun, type GhRun } from "@ducter/protocol/src/git-login.ts";
import { BROWSE_PAGE } from "@ducter/protocol";
import { RateLimited, SIGNATURE, type AdapterStatus, type BrowseOpts, type SourceAdapter, type Totals, type WriteResult } from "./adapter.ts";

export interface GitHubOpts {
  source: string;
  run?: GhRun;
  env?: Record<string, string | undefined>;
  /** Only these repositories ("owner/repo", any case); absent = every repository. */
  repos?: () => string[] | undefined;
  /** Only issues with this label. */
  label?: () => string | undefined;
  timeoutMs?: number;
  now?: () => number;
}

const BODY_MAX = 1200;
/** The list's one page: the recent ones, for offering and "new". */
const PER_PAGE = 50;
/** The search total is asked again at least this often while the list's ETag says nothing changed. */
export const TOTAL_MS = 10 * 60_000;
/** D357: a page of the fold is kept this long (the same page asked again costs nothing). */
export const BROWSE_MS = 2 * 60_000;
/** GitHub search answers at most the first 1000 results. */
const SEARCH_CAP = 1000;
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
  user?: { login?: string };
  comments?: number;
  created_at?: string;
  assignees?: { login?: string }[];
  milestone?: { title?: string } | null;
}

const repoOf = (r: Raw): string => r.repository?.full_name ?? r.repository_url?.replace(/^.*\/repos\//, "") ?? "";

export function itemOf(source: string, r: Raw): SourceItem {
  const repo = repoOf(r);
  const body = (r.body ?? "").trim();
  const labels = (r.labels ?? []).map((l) => (typeof l === "string" ? l : (l.name ?? ""))).filter(Boolean);
  const assignees = (r.assignees ?? []).map((a) => a.login ?? "").filter(Boolean);
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
    ...(r.user?.login ? { author: r.user.login } : {}),
    ...(assignees.length ? { assignees } : {}),
    ...(r.created_at ? { createdAt: r.created_at } : {}),
    ...(r.milestone?.title ? { milestone: r.milestone.title } : {}),
    ...(typeof r.comments === "number" && r.comments > 0 ? { comments: r.comments } : {}),
  };
}

/**
 * D428: who assigned each open to-do to the person: GitHub's issue list doesn't say, its timeline does
 * (the last AssignedEvent naming them). One GraphQL search page of 100 per call, at most ASSIGNERS_PAGES.
 */
export const ASSIGNERS_PAGES = 7;
export const ASSIGNERS_QUERY = `query($q: String!, $c: String) { viewer { login } search(query: $q, type: ISSUE, first: 100, after: $c) { pageInfo { endCursor hasNextPage } nodes { ... on Issue { number repository { nameWithOwner } timelineItems(last: 5, itemTypes: [ASSIGNED_EVENT]) { nodes { ... on AssignedEvent { actor { login } assignee { ... on User { login } } } } } } ... on PullRequest { number repository { nameWithOwner } timelineItems(last: 5, itemTypes: [ASSIGNED_EVENT]) { nodes { ... on AssignedEvent { actor { login } assignee { ... on User { login } } } } } } } } }`;
type AssignPage = { data?: { viewer?: { login?: string }; search?: { pageInfo?: { endCursor?: string; hasNextPage?: boolean }; nodes?: { number?: number; repository?: { nameWithOwner?: string }; timelineItems?: { nodes?: { actor?: { login?: string } | null; assignee?: { login?: string } | null }[] } }[] } } };
/** One page's ref → who assigned it to `me` (the last such event), and the next cursor. */
export function assignersOf(page: AssignPage, me?: string): { by: Map<string, string>; me?: string; next?: string } {
  const who = (me ?? page.data?.viewer?.login ?? "").toLowerCase();
  const by = new Map<string, string>();
  for (const n of page.data?.search?.nodes ?? []) {
    const repo = n.repository?.nameWithOwner;
    if (!repo || typeof n.number !== "number") continue;
    const ev = (n.timelineItems?.nodes ?? []).filter((e) => e.actor?.login && (!who || e.assignee?.login?.toLowerCase() === who));
    const last = ev.at(-1)?.actor?.login;
    if (last) by.set(`${repo}#${n.number}`, last);
  }
  const pi = page.data?.search?.pageInfo;
  return { by, ...(page.data?.viewer?.login ? { me: page.data.viewer.login } : {}), ...(pi?.hasNextPage && pi.endCursor ? { next: pi.endCursor } : {}) };
}

/** D359: a PR's diff is cut here before a model reads it (the pre-read says when it was cut). */
export const DIFF_MAX = 60_000;

/** D357: GitHub's "slow down": its primary or secondary rate limit. */
export const rateLimited = (text: string) => /rate limit|HTTP 429|abuse detection/i.test(text);

/** D357: the words of a search: the person's text, a "#12" read as the number, no qualifiers of their own. */
export function searchWords(q: string): string {
  return q
    .replace(/[<>"]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.replace(/^#(\d+)$/, "$1"))
    .filter((w) => !/^[\w-]+:/.test(w))
    .slice(0, 8)
    .join(" ");
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
  // Read each time: gh Ducter put in its own folder joins PATH while this runs (D345).
  const env = () => ghRunEnv(o.env ?? process.env);
  const timeoutMs = o.timeoutMs ?? 30_000;
  let login: string | undefined;
  let cache: { etag?: string; items: SourceItem[]; whole?: boolean } | undefined;
  let counted: { key: string; at: number; value: Totals } | undefined;
  const pages = new Map<string, { at: number; value: { items: SourceItem[]; more: boolean } }>();
  const now = o.now ?? (() => Date.now());

  const gh = (args: string[], stdin?: string) => run(args, { env: env(), timeoutMs, ...(stdin !== undefined ? { stdin } : {}) });

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
      const args = ["api", "-i", "-X", "GET", "/issues", "-f", "filter=assigned", "-f", "state=open", "-f", "sort=updated", "-f", `per_page=${PER_PAGE}`];
      if (cache?.etag) args.push("-H", `If-None-Match: ${cache.etag}`);
      const r = await gh(args);
      if (r.missing) throw new Error("gh isn't on this computer");
      const res = splitResponse(r.out);
      if (res.status === 304 && cache) return cache.items.filter(inScope);
      if (r.code !== 0 || res.status >= 400) throw new Error((r.err || res.body).trim().slice(0, 200) || `gh exited ${r.code}`);
      // Only a whole 200 answer is a list: anything else is "couldn't read", never "nothing assigned".
      if (res.status !== 200) throw new Error(`GitHub's answer couldn't be read (${res.status ? `HTTP ${res.status}` : "no status line"})`);
      let raw: Raw[];
      try {
        raw = JSON.parse(res.body) as Raw[];
      } catch {
        throw new Error("GitHub's answer couldn't be read (not JSON)");
      }
      if (!Array.isArray(raw)) throw new Error("GitHub's answer couldn't be read (not a list)");
      const items = raw.map((x) => itemOf(o.source, x));
      cache = { ...(res.etag ? { etag: res.etag } : {}), items, ...(raw.length < PER_PAGE ? { whole: true } : {}) };
      counted = undefined; // the list changed: count again
      pages.clear(); // and page again
      return items.filter(inScope);
    },
    // The list is the recent page (for offering and "new"); the count is GitHub's search total over
    // the same scope, so 557 assigned reads 557, not 50. Two searches per change (or every
    // TOTAL_MS), far inside search's 30 a minute.
    async total() {
      const key = JSON.stringify([o.repos?.() ?? [], o.label?.() ?? ""]);
      if (counted && counted.key === key && now() - counted.at < TOTAL_MS) return counted.value;
      const scope = [...(o.repos?.() ?? []).map((r) => `repo:${r}`), ...(o.label?.()?.trim() ? [`label:"${o.label!()!.trim().replace(/"/g, "")}"`] : [])];
      const who = login ?? "@me";
      const search = async (q: string) => {
        const r = await gh(["api", "-X", "GET", "search/issues", "-f", `q=${q}`, "-f", "per_page=1", "--jq", "[.total_count, .incomplete_results] | @tsv"]);
        if (r.code !== 0) throw new Error((r.err || r.out).trim().slice(0, 200) || `gh exited ${r.code}`);
        const [n, partial] = r.out.trim().split("\t");
        if (!/^\d+$/.test(n ?? "")) throw new Error("GitHub's search total couldn't be read");
        return { n: Number(n), partial: partial === "true" };
      };
      // Fewer than a page assigned: the list is all of them, and is the count.
      const open = cache?.whole ? { n: cache.items.filter(inScope).length, partial: false } : await search([`assignee:${who}`, "is:open", "archived:false", ...scope].join(" "));
      // D357: the newest few of what On hand shows first: review requests and mentions (three each).
      const few = async (q: string) => {
        const r = await gh(["api", "-X", "GET", "search/issues", "-f", `q=${q}`, "-f", "sort=updated", "-f", "order=desc", "-f", "per_page=3"]);
        if (r.code !== 0) throw new Error((r.err || r.out).trim().slice(0, 200) || `gh exited ${r.code}`);
        const j = JSON.parse(r.out) as { total_count?: number; items?: Raw[] };
        if (typeof j.total_count !== "number") throw new Error("GitHub's search total couldn't be read");
        return { n: j.total_count, items: (j.items ?? []).map((x) => itemOf(o.source, x)) };
      };
      const review = await few([`review-requested:${who}`, "is:open", "is:pr", "archived:false", ...scope].join(" ")).catch(() => undefined);
      const mentioned = await few([`assignee:${who}`, `mentions:${who}`, "is:open", "archived:false", ...scope].join(" ")).catch(() => undefined);
      const value: Totals = {
        open: open.n,
        ...(open.partial ? { atLeast: true } : {}),
        ...(review ? { review: review.n, reviewItems: review.items.map((i) => ({ ...i, review: true })) } : {}),
        ...(mentioned?.items.length ? { mentioned: mentioned.items } : {}),
      };
      counted = { key, at: now(), value };
      return value;
    },
    // D357: On hand's fold. The plain list's pages (newest first) while nothing narrows it; GitHub's
    // search for words, a repository, a label or the review requests. Each page is kept BROWSE_MS.
    async browse(b: BrowseOpts) {
      const page = Math.max(1, Math.min(Math.floor(b.page) || 1, SEARCH_CAP / BROWSE_PAGE));
      const words = searchWords(b.query ?? "");
      const repos = b.where ? [b.where] : (o.repos?.() ?? []);
      const label = (b.tag ?? o.label?.() ?? "").trim().replace(/"/g, "");
      const key = JSON.stringify([page, words, repos, label, !!b.review]);
      const kept = pages.get(key);
      if (kept && now() - kept.at < BROWSE_MS) return kept.value;
      const who = login ?? "@me";
      const fail = (r: { code: number; err: string; out: string }): never => {
        const why = (r.err || r.out).trim().slice(0, 200) || `gh exited ${r.code}`;
        throw rateLimited(why) ? new RateLimited(why) : new Error(why);
      };
      const parse = <T>(out: string): T => {
        try {
          return JSON.parse(out) as T;
        } catch {
          throw new Error("GitHub's answer couldn't be read (not JSON)");
        }
      };
      let value: { items: SourceItem[]; more: boolean };
      if (!words && !repos.length && !label && !b.review) {
        const r = await gh(["api", "-X", "GET", "/issues", "-f", "filter=assigned", "-f", "state=open", "-f", "sort=updated", "-f", `per_page=${BROWSE_PAGE}`, "-f", `page=${page}`]);
        if (r.missing) throw new Error("gh isn't on this computer");
        if (r.code !== 0) fail(r);
        const raw = parse<Raw[]>(r.out);
        if (!Array.isArray(raw)) throw new Error("GitHub's answer couldn't be read (not a list)");
        value = { items: raw.map((x) => itemOf(o.source, x)), more: raw.length >= BROWSE_PAGE };
      } else {
        const q = [b.review ? `review-requested:${who}` : `assignee:${who}`, "is:open", ...(b.review ? ["is:pr"] : []), "archived:false", ...repos.map((x) => `repo:${x}`), ...(label ? [`label:"${label}"`] : []), ...(words ? [words] : [])].join(" ");
        const r = await gh(["api", "-X", "GET", "search/issues", "-f", `q=${q}`, "-f", "sort=updated", "-f", "order=desc", "-f", `per_page=${BROWSE_PAGE}`, "-f", `page=${page}`]);
        if (r.missing) throw new Error("gh isn't on this computer");
        if (r.code !== 0) fail(r);
        const j = parse<{ total_count?: number; items?: Raw[] }>(r.out);
        const items = (j.items ?? []).map((x) => ({ ...itemOf(o.source, x), ...(b.review ? { review: true } : {}) }));
        value = { items, more: page * BROWSE_PAGE < Math.min(j.total_count ?? 0, SEARCH_CAP) };
      }
      pages.set(key, { at: now(), value });
      if (pages.size > 60) pages.delete(pages.keys().next().value!);
      return value;
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
        // D359: a to-do closed from the pile's batch isn't "completed": it closes as not planned.
        const reason = text === "not_planned" ? "not_planned" : "completed";
        const r = await gh(["api", "-X", "PATCH", `/repos/${m[1]}/issues/${m[2]}`, "--input", "-"], JSON.stringify({ state: "closed", state_reason: reason }));
        if (r.code !== 0) return { ok: false, error: (r.err || r.out).trim().slice(0, 200) || `gh exited ${r.code}` };
        cache = undefined; // the next look sees it gone from the open list
        counted = undefined; // and counts again
        return { ok: true };
      }
      if (op === "review") {
        // D359: a pre-read's kept comments, as one review that only comments (never approves or
        // requests changes). text: {"body", "notes": [{path, line, text}]}. A line GitHub won't
        // place (outside the diff) goes into the review's body instead of failing the whole review.
        let p: { body?: string; notes?: { path?: string; line?: number; text: string }[] };
        try {
          p = JSON.parse(text ?? "{}");
        } catch {
          return { ok: false, error: "a review needs its notes" };
        }
        const notes = (p.notes ?? []).filter((n) => n.text?.trim());
        if (!notes.length && !p.body?.trim()) return { ok: false, error: "an empty review" };
        const placed = notes.filter((n) => n.path && n.line);
        const loose = notes.filter((n) => !(n.path && n.line));
        const bodyOf = (xs: typeof notes) => [p.body?.trim(), ...xs.map((n) => `- ${n.path ? `\`${n.path}${n.line ? `:${n.line}` : ""}\` ` : ""}${n.text.trim()}`)].filter(Boolean).join("\n") + SIGNATURE;
        const send = (payload: unknown) => gh(["api", "-X", "POST", `/repos/${m[1]}/pulls/${m[2]}/reviews`, "--input", "-"], JSON.stringify(payload));
        let r = await send({ event: "COMMENT", body: bodyOf(loose), comments: placed.map((n) => ({ path: n.path, line: n.line, side: "RIGHT", body: n.text.trim() })) });
        if (r.code !== 0 && placed.length && /422|Unprocessable|line/i.test(r.err + r.out)) r = await send({ event: "COMMENT", body: bodyOf(notes) });
        if (r.code !== 0) return { ok: false, error: (r.err || r.out).trim().slice(0, 200) || `gh exited ${r.code}` };
        try {
          return { ok: true, link: (JSON.parse(r.out) as { html_url?: string }).html_url };
        } catch {
          return { ok: true };
        }
      }
      return { ok: false, error: `GitHub can't ${op}` };
    },
    // D359: every open one assigned (up to max), for the sort: the list's pages of 100, newest first.
    async all(max: number) {
      const items: SourceItem[] = [];
      let ended = false;
      for (let page = 1; items.length < max && page <= 30; page++) {
        const r = await gh(["api", "-X", "GET", "/issues", "-f", "filter=assigned", "-f", "state=open", "-f", "sort=updated", "-f", "per_page=100", "-f", `page=${page}`]);
        if (r.missing) throw new Error("gh isn't on this computer");
        if (r.code !== 0) {
          const why = (r.err || r.out).trim().slice(0, 200) || `gh exited ${r.code}`;
          throw rateLimited(why) ? new RateLimited(why) : new Error(why);
        }
        let raw: Raw[];
        try {
          raw = JSON.parse(r.out) as Raw[];
        } catch {
          throw new Error("GitHub's answer couldn't be read (not JSON)");
        }
        if (!Array.isArray(raw)) throw new Error("GitHub's answer couldn't be read (not a list)");
        items.push(...raw.map((x) => itemOf(o.source, x)).filter(inScope));
        if (raw.length < 100) {
          ended = true;
          break;
        }
      }
      const more = !ended || items.length > max;
      if (items.length > max) items.length = max;
      // D428: who assigned each one (the finder's 「100gle 分给你的」). A failure leaves it unsaid, never the list.
      try {
        const by = new Map<string, string>();
        let me = login;
        let cursor: string | undefined;
        for (let p = 0; p < ASSIGNERS_PAGES; p++) {
          const r = await gh(["api", "graphql", "-f", `query=${ASSIGNERS_QUERY}`, "-f", `q=assignee:${login ?? "@me"} is:open archived:false`, ...(cursor ? ["-f", `c=${cursor}`] : [])]);
          if (r.code !== 0) break;
          const got = assignersOf(JSON.parse(r.out) as AssignPage, me);
          me ??= got.me;
          for (const [k, v] of got.by) by.set(k, v);
          if (!got.next) break;
          cursor = got.next;
        }
        for (const it of items) {
          const a = by.get(it.ref);
          if (a) it.assignedBy = a;
        }
      } catch (err) {
        console.warn("[github] who assigned them couldn't be read:", (err as Error).message);
      }
      return { items, more };
    },
    // D359: a PR's diff, for the pre-read (cut at DIFF_MAX).
    async diff(ref: string) {
      const m = REF.exec(ref);
      if (!m) throw new Error(`not a GitHub ref: ${ref}`);
      const r = await gh(["api", `/repos/${m[1]}/pulls/${m[2]}`, "-H", "Accept: application/vnd.github.diff"]);
      if (r.code !== 0) throw new Error((r.err || r.out).trim().slice(0, 200) || `gh exited ${r.code}`);
      return r.out.length > DIFF_MAX ? { text: r.out.slice(0, DIFF_MAX), cut: true } : { text: r.out, cut: false };
    },
    // D385: a PR's checks for review together (read-only): passed, failed (how many), or still running.
    async checks(ref: string) {
      const m = REF.exec(ref);
      if (!m) return undefined;
      const r = await gh(["pr", "checks", m[2]!, "--repo", m[1]!, "--json", "bucket"]);
      // gh exits 8 while checks are pending and 1 when one failed; the JSON is printed either way.
      let rows: { bucket?: string }[];
      try {
        rows = JSON.parse(r.out || "[]") as { bucket?: string }[];
      } catch {
        return undefined;
      }
      if (!Array.isArray(rows) || !rows.length) return undefined;
      const failed = rows.filter((x) => x.bucket === "fail" || x.bucket === "cancel").length;
      if (failed) return { state: "failed" as const, failed };
      if (rows.some((x) => x.bucket === "pending")) return { state: "running" as const };
      return { state: "passed" as const };
    },
  };
}
