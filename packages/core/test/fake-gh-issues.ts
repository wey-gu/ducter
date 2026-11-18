// D341: a fake `gh` for 待办来源 / To-do sources: a small GitHub in memory (issues assigned to the
// person, comments, closes) answering the same argv the GitHub adapter runs. No network, never the
// real GitHub; the tests and the demo core use it.
import type { GhRun } from "@ducter/protocol/src/git-login.ts";

export interface FakeIssue {
  repo: string;
  number: number;
  title: string;
  body?: string;
  state?: "open" | "closed";
  labels?: string[];
  pr?: boolean;
  assigned?: boolean;
  /** A PR whose review is requested of the person (not assigned). */
  review?: boolean;
  /** D357: it mentions the person. */
  mentions?: boolean;
  /** D357: who opened it. */
  author?: string;
  updated?: string;
  /** D359: how many comments it has. */
  comments?: number;
  /** D359: a PR's diff (what `Accept: application/vnd.github.diff` answers). */
  diff?: string;
}

export interface FakeGh {
  run: GhRun;
  issues: FakeIssue[];
  comments: { repo: string; number: number; body: string }[];
  closes: { repo: string; number: number; reason: string }[];
  /** D359: reviews sent on PRs (event, body, line comments). */
  reviews: { repo: string; number: number; event: string; body: string; comments: { path: string; line: number; body: string }[] }[];
  calls: string[][];
  /** Search calls (the count). */
  searches: number;
  /** Answer the next list with 304 when its ETag is sent (true by default). */
  etags: boolean;
  signedIn: boolean;
  /** D357: answer searches as GitHub does over its rate limit. */
  limited?: boolean;
  missing: boolean;
  touch(i: FakeIssue): void;
  /**
   * D345: how GitHub's device flow ends (`gh auth login --web`): approve (at once), hold (until
   * approve() or deny() is called), expired, denied, network (GitHub out of reach before a code).
   */
  deviceFlow: "approve" | "hold" | "expired" | "denied" | "network";
  /** The one-time code it prints. */
  code: string;
  /** A held device flow: the person entered the code on GitHub (or refused it). */
  approve(): void;
  deny(): void;
  /** Tokens pasted that it takes (any other is refused for its scopes). */
  goodTokens: string[];
}

export function fakeGh(seed: FakeIssue[] = [], o: { login?: string } = {}): FakeGh {
  const login = o.login ?? "lin-dev";
  let version = 1;
  let held: ((how: "ok" | "denied") => void) | undefined;
  const f: FakeGh = {
    issues: seed.map((i) => ({ state: "open", assigned: true, updated: "2026-11-17T08:00:00Z", ...i })),
    comments: [],
    closes: [],
    reviews: [],
    calls: [],
    searches: 0,
    etags: true,
    signedIn: true,
    missing: false,
    deviceFlow: "approve",
    code: "AB12-CD34",
    goodTokens: [],
    approve: () => held?.("ok"),
    deny: () => held?.("denied"),
    touch(i) {
      i.updated = new Date().toISOString();
      version++;
    },
    run: async (args, opts) => {
      f.calls.push(args);
      if (f.missing) return { code: 127, out: "", err: "", missing: true };
      // D272/D345: the sign-in, as gh says it without a terminal (research/87).
      if (args[0] === "auth") {
        if (args[1] === "status") return f.signedIn ? { code: 0, out: JSON.stringify({ hosts: { "github.com": [{ state: "success", active: true, host: "github.com", login }] } }), err: "" } : { code: 1, out: '{"hosts":{}}', err: "" };
        if (args[1] === "setup-git") return { code: 0, out: "", err: "" };
        if (args[1] === "login" && args.includes("--with-token")) {
          const tok = (opts.stdin ?? "").trim();
          if (!f.goodTokens.includes(tok)) return { code: 1, out: "", err: "error validating token: missing required scope 'read:org'" };
          f.signedIn = true;
          return { code: 0, out: "", err: "" };
        }
        if (args[1] === "login") {
          if (f.deviceFlow === "network") return { code: 1, out: "", err: 'failed to authenticate via web browser: Post "https://github.com/login/device/code": dial tcp: lookup github.com: no such host' };
          const said = `\n! First copy your one-time code: ${f.code}\nOpen this URL to continue in your web browser: https://github.com/login/device\n`;
          opts.onErr?.(said);
          let how: "ok" | "denied" | "expired" | "aborted" = f.deviceFlow === "denied" ? "denied" : f.deviceFlow === "expired" ? "expired" : "ok";
          if (f.deviceFlow === "hold") {
            how = await new Promise((r) => {
              held = (h) => ((held = undefined), r(h));
              opts.signal?.addEventListener("abort", () => ((held = undefined), r("aborted")), { once: true });
            });
          } else await Bun.sleep(5);
          if (how === "aborted") return { code: 1, out: "", err: said };
          if (how === "denied") return { code: 1, out: "", err: said + "failed to authenticate via web browser: access_denied" };
          if (how === "expired") return { code: 1, out: "", err: said + "failed to authenticate via web browser: the device code has expired" };
          f.signedIn = true;
          return { code: 0, out: "", err: said + "Authentication complete.\n" };
        }
      }
      if (!f.signedIn) return { code: 4, out: "", err: "To get started with GitHub CLI, please run:  gh auth login" };
      const raw = (i: FakeIssue) => ({
        number: i.number,
        title: i.title,
        body: i.body ?? "",
        state: i.state,
        html_url: `https://github.com/${i.repo}/${i.pr ? "pull" : "issues"}/${i.number}`,
        updated_at: i.updated,
        labels: (i.labels ?? []).map((name) => ({ name })),
        repository: { full_name: i.repo },
        ...(i.author ? { user: { login: i.author } } : {}),
        ...(i.pr ? { pull_request: {} } : {}),
        ...(i.comments ? { comments: i.comments } : {}),
      });
      if (args[0] !== "api") return { code: 1, out: "", err: `fake gh: ${args.join(" ")}` };
      if (args[1] === "user") return { code: 0, out: `${login}\n`, err: "" };
      // The search total (per_page=1, --jq ... @tsv): assignee / review-requested, repo:, label:.
      if (args.includes("search/issues")) {
        f.searches++;
        const q = (args.find((a) => a.startsWith("q=")) ?? "q=").slice(2);
        const repos = [...q.matchAll(/repo:(\S+)/g)].map((m) => m[1]!.toLowerCase());
        const label = /label:"([^"]*)"/.exec(q)?.[1]?.toLowerCase();
        const review = q.includes("review-requested:");
        const mentions = q.includes("mentions:");
        // D357: free words (not qualifiers) match the title or the number.
        const words = q.split(/\s+/).filter((w) => w && !/^[\w-]+:/.test(w) && !/^"/.test(w) && !/"$/.test(w));
        const hits = f.issues
          .filter((i) => i.state === "open" && (review ? i.review && i.pr : i.assigned) && (!mentions || i.mentions) && (!repos.length || repos.includes(i.repo.toLowerCase())) && (!label || (i.labels ?? []).some((l) => l.toLowerCase() === label)))
          .filter((i) => words.every((w) => i.title.toLowerCase().includes(w.toLowerCase()) || String(i.number) === w))
          .sort((a, b) => (b.updated ?? "").localeCompare(a.updated ?? ""));
        if (f.limited) return { code: 1, out: "", err: "gh: API rate limit exceeded for user ID 1. (HTTP 403)" };
        if (args.includes("--jq")) return { code: 0, out: `${hits.length}\tfalse\n`, err: "" };
        const per = Number((args.find((a) => a.startsWith("per_page=")) ?? "per_page=30").slice(9));
        const page = Number((args.find((a) => a.startsWith("page=")) ?? "page=1").slice(5));
        return { code: 0, out: JSON.stringify({ total_count: hits.length, incomplete_results: false, items: hits.slice((page - 1) * per, page * per).map(raw) }), err: "" };
      }
      if (args.includes("/issues")) {
        const etag = `W/"v${version}"`;
        const sent = args.find((a) => a.startsWith("If-None-Match: "))?.slice(15);
        if (f.etags && sent === etag) return { code: 1, out: `HTTP/2.0 304 Not Modified\nEtag: ${etag}\n\n`, err: "gh: HTTP 304" };
        const list = f.issues.filter((i) => i.assigned && i.state === "open").sort((a, b) => (b.updated ?? "").localeCompare(a.updated ?? "")).map(raw);
        // D357: a page of the fold (no -i, no ETag): the list's page, plain JSON.
        if (!args.includes("-i")) {
          const per = Number((args.find((a) => a.startsWith("per_page=")) ?? "per_page=30").slice(9));
          const page = Number((args.find((a) => a.startsWith("page=")) ?? "page=1").slice(5));
          return { code: 0, out: JSON.stringify(list.slice((page - 1) * per, page * per)), err: "" };
        }
        const per = Number((args.find((a) => a.startsWith("per_page=")) ?? "per_page=30").slice(9));
        if (list.length > per) list.length = per;
        return { code: 0, out: `HTTP/2.0 200 OK\nEtag: ${etag}\nContent-Type: application/json\n\n${JSON.stringify(list)}`, err: "" };
      }
      // D359: a PR's diff, and a review sent on it.
      const pull = /^\/repos\/([^/]+\/[^/]+)\/pulls\/(\d+)(\/reviews)?$/.exec(args.find((a) => a.startsWith("/repos/")) ?? "");
      if (pull) {
        const pr = f.issues.find((i) => i.repo === pull[1] && i.number === Number(pull[2]) && i.pr);
        if (!pr) return { code: 1, out: "", err: "gh: Not Found (HTTP 404)" };
        if (pull[3]) {
          const b = JSON.parse(opts.stdin ?? "{}") as { event?: string; body?: string; comments?: { path: string; line: number; body: string }[] };
          f.reviews.push({ repo: pr.repo, number: pr.number, event: b.event ?? "", body: b.body ?? "", comments: b.comments ?? [] });
          return { code: 0, out: JSON.stringify({ html_url: `https://github.com/${pr.repo}/pull/${pr.number}#pullrequestreview-${f.reviews.length}` }), err: "" };
        }
        return { code: 0, out: pr.diff ?? "", err: "" };
      }
      const m = /^\/repos\/([^/]+\/[^/]+)\/issues\/(\d+)(\/comments)?$/.exec(args.find((a) => a.startsWith("/repos/")) ?? "");
      if (!m) return { code: 1, out: "", err: `fake gh: no route ${args.join(" ")}` };
      const issue = f.issues.find((i) => i.repo === m[1] && i.number === Number(m[2]));
      if (!issue) return { code: 1, out: "", err: "gh: Not Found (HTTP 404)" };
      const method = args[args.indexOf("-X") + 1];
      if (m[3] && method === "POST") {
        const body = JSON.parse(opts.stdin ?? "{}").body as string;
        f.comments.push({ repo: issue.repo, number: issue.number, body });
        f.touch(issue);
        return { code: 0, out: JSON.stringify({ html_url: `https://github.com/${issue.repo}/issues/${issue.number}#issuecomment-${f.comments.length}` }), err: "" };
      }
      if (method === "PATCH") {
        const b = JSON.parse(opts.stdin ?? "{}") as { state?: string; state_reason?: string };
        if (b.state === "closed") {
          issue.state = "closed";
          f.closes.push({ repo: issue.repo, number: issue.number, reason: b.state_reason ?? "" });
          f.touch(issue);
        }
        return { code: 0, out: JSON.stringify(raw(issue)), err: "" };
      }
      return { code: 0, out: JSON.stringify(raw(issue)), err: "" };
    },
  };
  return f;
}
