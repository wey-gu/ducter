// D340: a fake `gh` for 待办来源 / To-do sources: a small GitHub in memory (issues assigned to the
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
  updated?: string;
}

export interface FakeGh {
  run: GhRun;
  issues: FakeIssue[];
  comments: { repo: string; number: number; body: string }[];
  closes: { repo: string; number: number; reason: string }[];
  calls: string[][];
  /** Answer the next list with 304 when its ETag is sent (true by default). */
  etags: boolean;
  signedIn: boolean;
  missing: boolean;
  touch(i: FakeIssue): void;
}

export function fakeGh(seed: FakeIssue[] = [], o: { login?: string } = {}): FakeGh {
  const login = o.login ?? "lin-dev";
  let version = 1;
  const f: FakeGh = {
    issues: seed.map((i) => ({ state: "open", assigned: true, updated: "2026-11-17T08:00:00Z", ...i })),
    comments: [],
    closes: [],
    calls: [],
    etags: true,
    signedIn: true,
    missing: false,
    touch(i) {
      i.updated = new Date().toISOString();
      version++;
    },
    run: async (args, opts) => {
      f.calls.push(args);
      if (f.missing) return { code: 127, out: "", err: "", missing: true };
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
        ...(i.pr ? { pull_request: {} } : {}),
      });
      if (args[0] !== "api") return { code: 1, out: "", err: `fake gh: ${args.join(" ")}` };
      if (args[1] === "user") return { code: 0, out: `${login}\n`, err: "" };
      if (args.includes("/issues")) {
        const etag = `W/"v${version}"`;
        const sent = args.find((a) => a.startsWith("If-None-Match: "))?.slice(15);
        if (f.etags && sent === etag) return { code: 1, out: `HTTP/2.0 304 Not Modified\nEtag: ${etag}\n\n`, err: "gh: HTTP 304" };
        const list = f.issues.filter((i) => i.assigned && i.state === "open").sort((a, b) => (b.updated ?? "").localeCompare(a.updated ?? "")).map(raw);
        return { code: 0, out: `HTTP/2.0 200 OK\nEtag: ${etag}\nContent-Type: application/json\n\n${JSON.stringify(list)}`, err: "" };
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
