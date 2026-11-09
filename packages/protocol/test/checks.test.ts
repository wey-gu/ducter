// D112: the check allowlist, bypass by bypass. Each row is a command the model might write; the
// refused ones are the ways around "only reading commands" that a review found.
import { expect, test } from "bun:test";
import { validateCheck, type CheckContext } from "../src/checks.ts";
import { resolveOnPath, runCheck } from "../src/checks-run.ts";

const ctx: CheckContext = { home: "/Users/me", dataDir: "/Users/me/.ducter", cwd: "/Users/me/dev/app" };
const ok = (argv: string[], cwd?: string) => validateCheck({ argv, succeedWhen: {}, ...(cwd ? { cwd } : {}) }, ctx).ok;

const refused: [string, string[], string?][] = [
  // argv[0] is a bare name, looked up on PATH
  ["relative gh", ["./gh", "pr", "view", "1"]],
  ["absolute gh", ["/tmp/x/gh", "pr", "view", "1"]],
  ["path to cat", ["/bin/cat", "README.md"]],
  ["windows path", ["C:\\tools\\gh", "pr", "view"]],
  // gh api methods, every form
  ["gh -X POST", ["gh", "api", "-X", "POST", "repos/o/r/issues"]],
  ["gh -XPOST", ["gh", "api", "-XPOST", "repos/o/r/issues"]],
  ["gh -X=POST", ["gh", "api", "-X=POST", "repos/o/r/issues"]],
  ["gh --method POST", ["gh", "api", "--method", "POST", "repos/o/r"]],
  ["gh --method=DELETE", ["gh", "api", "--method=DELETE", "repos/o/r"]],
  ["gh -iXPATCH", ["gh", "api", "-iXPATCH", "repos/o/r"]],
  ["gh -f", ["gh", "api", "repos/o/r/issues", "-f", "title=x"]],
  ["gh -ftitle=x", ["gh", "api", "repos/o/r/issues", "-ftitle=x"]],
  ["gh --field=x", ["gh", "api", "repos/o/r/issues", "--field=title=x"]],
  ["gh --raw-field", ["gh", "api", "graphql", "--raw-field", "query=mutation{}"]],
  ["gh --input", ["gh", "api", "repos/o/r", "--input", "body.json"]],
  ["gh pr merge", ["gh", "pr", "merge", "1"]],
  // curl methods, bodies, files
  ["curl -X POST", ["curl", "-X", "POST", "https://a"]],
  ["curl -XPOST", ["curl", "-XPOST", "https://a"]],
  ["curl -sXPOST", ["curl", "-sXPOST", "https://a"]],
  ["curl --request=PUT", ["curl", "--request=PUT", "https://a"]],
  ["curl --request DELETE", ["curl", "--request", "DELETE", "https://a"]],
  ["curl --json", ["curl", "--json", "{}", "https://a"]],
  ["curl -d", ["curl", "-d", "x=1", "https://a"]],
  ["curl -sd", ["curl", "-sdx=1", "https://a"]],
  ["curl --data-binary", ["curl", "--data-binary", "@f", "https://a"]],
  ["curl --data-urlencode=", ["curl", "--data-urlencode=x=1", "https://a"]],
  ["curl -F", ["curl", "-F", "f=@x", "https://a"]],
  ["curl --form", ["curl", "--form", "f=@x", "https://a"]],
  ["curl -T", ["curl", "-T", "x", "https://a"]],
  ["curl --upload-file", ["curl", "--upload-file", "x", "https://a"]],
  ["curl -o file", ["curl", "-o", "out.html", "https://a"]],
  ["curl -ofile", ["curl", "-sofile", "https://a"]],
  ["curl --output=", ["curl", "--output=x", "https://a"]],
  ["curl -O", ["curl", "-O", "https://a/x"]],
  ["curl -K", ["curl", "-K", "cfg", "https://a"]],
  ["curl -b cookie file", ["curl", "-b", "notes.txt", "https://a"]],
  ["curl -D dump", ["curl", "-D", "h.txt", "https://a"]],
  ["curl -H @file", ["curl", "-H", "@headers", "https://a"]],
  ["curl -w @file", ["curl", "-w", "@fmt", "https://a"]],
  ["curl %output", ["curl", "-w", "%output{x}hi", "https://a"]],
  ["curl file://", ["curl", "file:///etc/passwd"]],
  ["curl unknown option", ["curl", "--libcurl", "x.c", "https://a"]],
  // git writes and helpers
  ["git log --output=", ["git", "log", "--output=/tmp/x"]],
  ["git log --output", ["git", "log", "--output", "x"]],
  ["git ls-remote --upload-pack", ["git", "ls-remote", "--upload-pack=touch x", "origin"]],
  ["git ls-remote -u", ["git", "ls-remote", "-u", "touch x", "origin"]],
  ["git ext::", ["git", "ls-remote", "ext::sh -c id"]],
  ["git push", ["git", "push"]],
  // secrets: Ducter's data folder, harness logins, oo, ssh/aws/gh, .env
  ["keys.env", ["cat", "/Users/me/.ducter/keys.env"]],
  ["connection tokens", ["cat", "~/.ducter/connection-tokens.json"]],
  ["push.json", ["cat", "~/.ducter/push.json"]],
  ["devices.db", ["head", "-c", "100", "/Users/me/.ducter/devices.db"]],
  ["ducter.db", ["wc", "-c", "/Users/me/.ducter/ducter.db"]],
  ["data dir itself", ["ls", "~/.ducter"]],
  ["data dir partner", ["ls", "/Users/me/.ducter/partner"]],
  ["claude credentials", ["cat", "~/.claude/.credentials.json"]],
  ["claude.json", ["cat", "/Users/me/.claude.json"]],
  ["codex auth", ["cat", "~/.codex/auth.json"]],
  ["oo mac", ["ls", "/Users/me/Library/Application Support/oo"]],
  ["oo linux", ["cat", "/home/me/.config/oo/config.json"]],
  ["oo windows", ["cat", "C:\\Users\\me\\AppData\\Roaming\\oo\\x"]],
  ["ssh dir", ["ls", "~/.ssh"]],
  ["ssh key", ["cat", "/Users/me/.ssh/id_ed25519"]],
  ["aws", ["cat", "~/.aws/credentials"]],
  ["gh hosts", ["cat", "~/.config/gh/hosts.yml"]],
  [".env", ["cat", ".env"]],
  [".env.local", ["cat", "web/.env.local"]],
  ["relative climb to keys", ["cat", "../../.ducter/keys.env"]],
  ["relative climb, no telltale name", ["cat", "x/../../../.ducter/partner/memory.md"]],
  ["climb to ssh", ["cat", "../../.ssh/config"]],
  ["climb out of a worktree", ["cat", "../../partner/memory.md"], "/Users/me/.ducter/worktrees/t1"],
  // recursive grep over home or the data folder
  ["grep -r home", ["grep", "-r", "token", "/Users/me"]],
  ["grep -rn ~", ["grep", "-rn", "token", "~"]],
  ["grep -R /", ["grep", "-R", "sk-", "/"]],
  ["grep --recursive /Users", ["grep", "--recursive", "token", "/Users"]],
  ["grep -d recurse", ["grep", "-d", "recurse", "x", "/Users/me"]],
  ["grep -r ..", ["grep", "-r", "x", "../.."]],
  ["grep -r data dir", ["grep", "-r", "x", "/Users/me/.ducter"]],
  ["grep -r -e", ["grep", "-r", "-e", "x", "/Users/me"]],
  // cwd from the model
  ["cwd in the data dir", ["ls"], "/Users/me/.ducter"],
  ["cwd in ssh", ["ls"], "~/.ssh"],
  ["cwd at home, grep -r", ["grep", "-r", "x"], "~"],
  // the rest
  ["rm", ["rm", "-rf", "/"]],
  ["shell in test", ["test", "-f", "a; rm x"]],
  ["nc without -z", ["nc", "localhost", "5432"]],
];

const allowed: [string, string[], string?][] = [
  ["gh pr checks", ["gh", "pr", "checks", "1592", "--repo", "o/r", "--json", "state"]],
  ["gh api GET", ["gh", "api", "-X", "GET", "repos/o/r/pulls/1"]],
  ["gh api --method=get", ["gh", "api", "--method=get", "repos/o/r"]],
  ["gh api jq", ["gh", "api", "repos/o/r/pulls/1", "--jq", ".merged"]],
  ["gh api -H", ["gh", "api", "-H", "Accept: application/vnd.github+json", "repos/o/r"]],
  ["curl -sI", ["curl", "-sI", "https://ducter.dev"]],
  ["curl status code", ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "https://ducter.dev"]],
  ["curl -fsSL -XGET", ["curl", "-fsSL", "-XGET", "https://a/health"]],
  ["curl --request=HEAD", ["curl", "--request=HEAD", "-m", "5", "https://a"]],
  ["git log", ["git", "log", "-1", "--format=%H"]],
  ["git ls-remote", ["git", "ls-remote", "origin", "refs/heads/main"]],
  ["test -f ~", ["test", "-f", "~/out/report.pdf"]],
  ["ls task worktree", ["ls", "/Users/me/.ducter/worktrees/t1/dist"]],
  ["grep -r in place", ["grep", "-rn", "TODO", "src"]],
  ["grep -r default .", ["grep", "-r", "TODO"]],
  ["grep plain", ["grep", "-c", "error", "build.log"]],
  ["nc -zv", ["nc", "-zv", "localhost", "5432"]],
  ["ping -c3", ["ping", "-c3", "a.example"]],
  ["cwd sub folder", ["ls"], "/Users/me/dev/app/web"],
];

for (const [name, argv, cwd] of refused) test(`refused: ${name}`, () => expect(ok(argv, cwd)).toBe(false));
for (const [name, argv, cwd] of allowed) test(`allowed: ${name}`, () => expect(ok(argv, cwd)).toBe(true));

test("bare names resolve only from PATH's absolute entries", () => {
  expect(resolveOnPath("./ls", "/bin:/usr/bin")).toBeNull();
  expect(resolveOnPath("ls", ".:bin")).toBeNull();
  expect(resolveOnPath("ls", "/bin:/usr/bin")).toMatch(/\/ls$/);
});

test("runCheck refuses before running, and expands ~ in what it runs", async () => {
  const seen: string[][] = [];
  const exec = async (argv: string[]) => (seen.push(argv), { exitCode: 0, stdout: "" });
  expect((await runCheck({ argv: ["./gh", "pr", "view"], succeedWhen: {} }, { exec, ctx })).ok).toBe(false);
  expect((await runCheck({ argv: ["cat", "../../.ducter/keys.env"], succeedWhen: {} }, { exec, ctx, cwd: "/Users/me/dev/app" })).ok).toBe(false);
  expect(seen).toEqual([]);
  expect((await runCheck({ argv: ["test", "-f", "~/out/r.pdf"], succeedWhen: {} }, { exec, ctx })).ok).toBe(true);
  expect(seen).toEqual([["test", "-f", "/Users/me/out/r.pdf"]]);
});
