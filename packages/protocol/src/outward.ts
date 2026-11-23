// D496: what a shell command sent out of the task's place, as facts to say in plain words: a push,
// a PR or issue changed, a release, a write to an API, a publish or a deploy, a request to a host,
// a command run on another machine. Read from the command's own grammar (the program, its
// subcommand, its flags), never from words around it; what stays on the machine (an edit, a
// commit, a heredoc's body, a read) is not here. Pure and language-neutral: clients word it from
// `kind` and its fields. The Go port (apps/desktop/internal/store/outward.go) reads the same cases
// from fixtures/outward.json, so both say it alike.

export type OutwardKind =
  | "push" | "push_tags" | "branch_delete"
  | "pr_create" | "pr_edit" | "pr_comment" | "pr_review" | "pr_merge" | "pr_close" | "pr_reopen" | "pr_ready"
  | "issue_create" | "issue_edit" | "issue_comment" | "issue_close" | "issue_reopen" | "issue_delete"
  | "release_create" | "release_edit" | "release_delete" | "release_upload"
  | "api_write" | "api_delete" | "publish" | "image_push" | "deploy" | "http" | "remote" | "copy";

export interface OutwardAct {
  kind: OutwardKind;
  /** A PR or issue number, when the command or its output names it. */
  n?: number;
  /** What a PR or issue edit changed: title, body, labels, reviewers, assignees, base, milestone, projects. */
  fields?: string[];
  /** How a review went: approve, request_changes, comment. */
  review?: string;
  /** A branch, a tag, an image, an API path, a package tool, a host. */
  target?: string;
}

const SEP = new Set([";", "&&", "||", "|", "&", "\n"]);

/** Words and separators of a shell line, quotes honoured; a heredoc's body is dropped (it is data). */
export function shellWords(cmd: string): string[][] {
  const lines = cmd.replace(/\r\n?/g, "\n").split("\n");
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    kept.push(line);
    const m = /<<(-?)\s*(['"]?)([A-Za-z_][\w-]*)\2/.exec(line);
    if (!m) continue;
    const end = m[3]!;
    while (i + 1 < lines.length && (m[1] ? lines[i + 1]!.trim() : lines[i + 1]!) !== end) i++;
    i++; // the delimiter line
  }
  const s = kept.join("\n");
  const out: string[][] = [];
  let cur: string[] = [];
  let word = "";
  let has = false;
  const flush = () => {
    if (has) cur.push(word);
    word = "";
    has = false;
  };
  const end = () => {
    flush();
    if (cur.length) out.push(cur);
    cur = [];
  };
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === "'") {
      const j = s.indexOf("'", i + 1);
      word += j < 0 ? s.slice(i + 1) : s.slice(i + 1, j);
      has = true;
      i = j < 0 ? s.length : j;
    } else if (ch === '"') {
      let j = i + 1;
      while (j < s.length && s[j] !== '"') {
        if (s[j] === "\\" && j + 1 < s.length) j++;
        word += s[j];
        j++;
      }
      has = true;
      i = j;
    } else if (ch === "\\" && i + 1 < s.length) {
      if (s[i + 1] !== "\n") (word += s[i + 1]), (has = true);
      i++;
    } else if (ch === "$" && s[i + 1] === "(" && s[i + 2] !== "(") {
      // A command substitution runs a command of its own: url=$(gh pr create …).
      if (/^[A-Za-z_]\w*=$/.test(word)) (word = ""), (has = false);
      end();
      i++;
    } else if (ch === "`") {
      if (/^[A-Za-z_]\w*=$/.test(word)) (word = ""), (has = false);
      end();
    } else if (ch === "#" && !has) {
      while (i + 1 < s.length && s[i + 1] !== "\n") i++;
    } else if (ch === " " || ch === "\t") flush();
    else if (SEP.has(ch) || ch === "(" || ch === ")") {
      const two = s.slice(i, i + 2);
      if (two === "&&" || two === "||") i++;
      end();
    } else if (ch === ">" || ch === "<") {
      // A redirection: the file after it is not a word of the command (nor its fd: 2>&1).
      if (/^\d$/.test(word)) (word = ""), (has = false);
      flush();
      while (s[i + 1] === ">" || s[i + 1] === "&") i++;
      while (s[i + 1] === " ") i++;
      let j = i + 1;
      while (j < s.length && !/[\s;&|]/.test(s[j]!)) j++;
      i = j - 1;
    } else {
      word += ch;
      has = true;
    }
  }
  end();
  return out;
}

/** The program's own words, after env assignments and the wrappers that only run it. */
function bare(w: string[]): string[] {
  let i = 0;
  while (i < w.length) {
    const x = w[i]!;
    if (/^[A-Za-z_]\w*=/.test(x)) i++;
    else if (["sudo", "env", "time", "nohup", "command", "exec", "xargs"].includes(x)) i++;
    else break;
  }
  const out = w.slice(i);
  if (out[0]) out[0] = out[0].replace(/^.*\//, "");
  return out;
}

const num = (s: string | undefined) => {
  const m = /^(?:#?)(\d+)$/.exec(s ?? "") ?? /\/(?:pull|issues)\/(\d+)/.exec(s ?? "");
  return m ? Number(m[1]) : undefined;
};

/** Positionals after `from`, skipping flags (and the value of a flag that takes one). */
function positionals(w: string[], from: number, takesValue: (f: string) => boolean): string[] {
  const out: string[] = [];
  for (let i = from; i < w.length; i++) {
    const x = w[i]!;
    if (x === "--") {
      out.push(...w.slice(i + 1));
      break;
    }
    if (x.startsWith("-") && x.length > 1) {
      if (!x.includes("=") && takesValue(x)) i++;
      continue;
    }
    out.push(x);
  }
  return out;
}
const has = (w: string[], ...flags: string[]) => w.some((x) => flags.some((f) => x === f || x.startsWith(`${f}=`)));

const GH_VALUE = new Set(["-R", "--repo", "-t", "--title", "-b", "--body", "-F", "--body-file", "-B", "--base", "-H", "--head", "-l", "--label", "-a", "--assignee", "-r", "--reviewer", "-m", "--milestone", "-p", "--project", "--add-label", "--remove-label", "--add-reviewer", "--remove-reviewer", "--add-assignee", "--remove-assignee", "--add-project", "--remove-project", "--template", "--subject", "--match-head-commit", "-n", "--notes", "--notes-file", "--target", "--tag", "--discussion-category", "-e", "--editor"]);
const FIELDS: [string[], string][] = [
  [["-t", "--title"], "title"],
  [["-b", "--body", "-F", "--body-file"], "body"],
  [["--add-label", "--remove-label", "-l", "--label"], "labels"],
  [["--add-reviewer", "--remove-reviewer", "-r", "--reviewer"], "reviewers"],
  [["--add-assignee", "--remove-assignee", "-a", "--assignee"], "assignees"],
  [["-B", "--base"], "base"],
  [["-m", "--milestone"], "milestone"],
  [["--add-project", "--remove-project", "-p", "--project"], "projects"],
];

function gh(w: string[], output: string): OutwardAct[] {
  const [, group, verb] = w;
  if (group === "api") return ghApi(w);
  if (group !== "pr" && group !== "issue" && group !== "release") return [];
  const pos = positionals(w, 3, (f) => GH_VALUE.has(f));
  if (group === "release") {
    const kinds: Record<string, OutwardKind> = { create: "release_create", edit: "release_edit", delete: "release_delete", upload: "release_upload" };
    const kind = kinds[verb ?? ""];
    return kind ? [{ kind, ...(pos[0] ? { target: pos[0] } : {}) }] : [];
  }
  const verbs = group === "pr" ? ["create", "edit", "comment", "review", "merge", "close", "reopen", "ready"] : ["create", "edit", "comment", "close", "reopen", "delete"];
  if (!verbs.includes(verb ?? "")) return [];
  if (verb === "ready" && has(w, "--undo")) return [];
  const kind = `${group}_${verb}` as OutwardKind;
  const n = num(pos[0]) ?? (verb === "create" ? num(/https:\/\/github\.com\/[^\s]+\/(?:pull|issues)\/\d+/.exec(output)?.[0]) : undefined);
  const act: OutwardAct = { kind, ...(n ? { n } : {}) };
  if (verb === "edit") {
    const fields = FIELDS.filter(([flags]) => has(w, ...flags)).map(([, f]) => f);
    if (fields.length) act.fields = fields;
  }
  if (verb === "review") act.review = has(w, "-a", "--approve") ? "approve" : has(w, "-r", "--request-changes") ? "request_changes" : "comment";
  return [act];
}

function ghApi(w: string[]): OutwardAct[] {
  const valued = new Set(["-X", "--method", "-f", "--raw-field", "-F", "--field", "-H", "--header", "--input", "-q", "--jq", "-t", "--template", "--hostname", "--cache", "-p", "--preview"]);
  const pos = positionals(w, 2, (f) => valued.has(f));
  const path = pos[0] ?? "";
  let method = "";
  for (let i = 2; i < w.length; i++) {
    const x = w[i]!;
    if (x === "-X" || x === "--method") method = (w[i + 1] ?? "").toUpperCase();
    else if (x.startsWith("--method=")) method = x.slice(9).toUpperCase();
    else if (/^-X[A-Za-z]+$/.test(x)) method = x.slice(2).toUpperCase();
  }
  const fieldVals: string[] = [];
  for (let i = 2; i < w.length; i++) if (["-f", "-F", "--field", "--raw-field"].includes(w[i]!)) fieldVals.push(w[i + 1] ?? "");
  if (path === "graphql") {
    // A GraphQL call is a POST either way: only a mutation changes anything.
    const q = fieldVals.find((v) => v.startsWith("query="))?.slice(6).trim() ?? "";
    if (!/^mutation\b/.test(q)) return [];
    const name = /^mutation\b[^{]*\{\s*(\w+)/.exec(q)?.[1];
    return [{ kind: "api_write", target: name ? `graphql ${name}` : "graphql" }];
  }
  if (!method) method = fieldVals.length || has(w, "--input") ? "POST" : "GET";
  if (method === "GET" || method === "HEAD") return [];
  return [{ kind: method === "DELETE" ? "api_delete" : "api_write", target: path.replace(/^\/+/, "").split("?")[0]! }];
}

function git(w: string[]): OutwardAct[] {
  let i = 1;
  while (i < w.length && w[i]!.startsWith("-")) i += ["-C", "-c", "--git-dir", "--work-tree"].includes(w[i]!) ? 2 : 1;
  if (w[i] !== "push") return [];
  const pos = positionals(w, i + 1, (f) => ["-o", "--push-option", "--repo", "--receive-pack", "--exec"].includes(f));
  if (has(w, "-d", "--delete")) return [{ kind: "branch_delete", ...(pos[1] ? { target: pos[1] } : {}) }];
  const ref = pos[1];
  if (ref?.startsWith(":")) return [{ kind: "branch_delete", target: ref.slice(1) }];
  if (has(w, "--tags") || ref?.startsWith("refs/tags/") || (ref && /^v\d/.test(ref) && has(w, "--follow-tags"))) return [{ kind: "push_tags" }];
  const branch = ref?.replace(/^\+/, "").split(":").at(-1)?.replace(/^refs\/heads\//, "");
  return [{ kind: "push", ...(branch && branch !== "HEAD" ? { target: branch } : {}) }];
}

function curl(w: string[]): OutwardAct[] {
  let method = "";
  let data = false;
  let url = "";
  const valued = new Set(["-X", "--request", "-d", "--data", "--data-raw", "--data-binary", "--data-urlencode", "--json", "-F", "--form", "-T", "--upload-file", "-H", "--header", "-o", "--output", "-u", "--user", "-A", "--user-agent", "-e", "--referer", "-b", "--cookie", "-c", "--cookie-jar", "-m", "--max-time", "--connect-timeout", "-w", "--write-out", "-x", "--proxy", "--retry", "--url"]);
  for (let i = 1; i < w.length; i++) {
    const x = w[i]!;
    if (x === "-X" || x === "--request") method = (w[i + 1] ?? "").toUpperCase();
    else if (/^-X[A-Za-z]+$/.test(x)) method = x.slice(2).toUpperCase();
    else if (["-d", "--data", "--data-raw", "--data-binary", "--data-urlencode", "--json", "-F", "--form", "-T", "--upload-file"].includes(x) || /^--(data|json|form)/.test(x)) data = true;
    else if (x === "--url") url = w[i + 1] ?? "";
    if (x.startsWith("-") && !x.includes("=") && valued.has(x)) {
      i++;
      continue;
    }
    if (!x.startsWith("-") && !url) url = x;
  }
  if (!method) method = data ? "POST" : "GET";
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return [];
  const host = /^(?:[a-z]+:\/\/)?(?:[^@/]+@)?([^/:?#]+)/i.exec(url)?.[1] ?? "";
  if (/^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(host)) return [];
  return [{ kind: "http", ...(host ? { target: host } : {}) }];
}

const SSH_VALUE = new Set(["-i", "-p", "-o", "-l", "-J", "-F", "-L", "-R", "-D", "-b", "-c", "-E", "-e", "-m", "-O", "-Q", "-S", "-W", "-w", "-P"]);
const remoteHost = (arg: string) => /^(?:[\w.-]+@)?([\w.-]+):/.exec(arg)?.[1];

/** What one simple command sent out, if anything. */
function one(w0: string[], output: string): OutwardAct[] {
  const w = bare(w0);
  const prog = w[0] ?? "";
  if (["bash", "sh", "zsh"].includes(prog)) {
    const c = w.findIndex((x) => x === "-c" || x === "-lc");
    return c > 0 && w[c + 1] ? outwardOf(w[c + 1]!, output) : [];
  }
  if (prog === "git") return git(w);
  if (prog === "gh") return gh(w, output);
  if (["npm", "pnpm", "yarn", "bun", "cargo"].includes(prog) && w[1] === "publish" && !has(w, "--dry-run")) return [{ kind: "publish", target: prog }];
  if (prog === "docker" && w[1] === "push") return [{ kind: "image_push", ...(w[2] ? { target: w[2] } : {}) }];
  if (prog === "wrangler" || (prog === "npx" && w[1] === "wrangler") || (prog === "bunx" && w[1] === "wrangler")) {
    const ws = prog === "wrangler" ? w : w.slice(1);
    if (ws[1] === "deploy" || ws[1] === "publish" || (ws[1] === "pages" && ws[2] === "deploy")) return [{ kind: "deploy", target: "Cloudflare" }];
    return [];
  }
  if (prog === "curl") return curl(w);
  if (prog === "ssh") {
    const pos = positionals(w, 1, (f) => SSH_VALUE.has(f));
    const host = pos[0]?.replace(/^[\w.-]+@/, "");
    return host ? [{ kind: "remote", target: host }] : [];
  }
  if (prog === "scp" || prog === "rsync") {
    const pos = positionals(w, 1, (f) => SSH_VALUE.has(f) || ["-e", "--rsh", "--exclude", "--include", "--filter", "-f"].includes(f));
    const dest = pos.at(-1);
    const host = pos.length >= 2 && dest ? remoteHost(dest) : undefined;
    return host ? [{ kind: "copy", target: host }] : [];
  }
  return [];
}

/** What a shell command sent out of its place, in order; [] when everything stayed on the machine. */
export function outwardOf(cmd: string, output = ""): OutwardAct[] {
  const out: OutwardAct[] = [];
  for (const w of shellWords(cmd)) out.push(...one(w, output));
  return out;
}
