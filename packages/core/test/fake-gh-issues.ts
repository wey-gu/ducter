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
    calls: [],
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
