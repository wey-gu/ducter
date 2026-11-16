// `ducter git login` / `ducter git status` (D272): the headless twin of 在 {computer} 上登录 GitHub.
// It signs in the computer you are on (a server home over SSH, a worker), through its own GitHub
// CLI, exactly as the app's sign-in does there (protocol/src/git-login.ts): GitHub's one-time code
// and link, entered on any device; or `--with-token`, a key read from stdin. Then plain git and
// every task here use it. The key never leaves this computer and nothing is logged.
import { createGitLogin, type GitLogin, type GitLoginState } from "@ducter/protocol/src/git-login.ts";
import type { T } from "./i18n.ts";

export interface GitCtx {
  t: T;
  json: boolean;
  rest: string[];
  withToken?: boolean;
  print?: (s: string) => void;
  /** Test seams: the sign-in (default: this computer's gh) and stdin. */
  login?: GitLogin;
  stdin?: () => Promise<string>;
}

const say = (c: GitCtx) => c.print ?? ((s: string) => console.log(s));

/** One line for a state, in the CLI's words. */
function line(c: GitCtx, s: GitLoginState): string {
  const { t } = c;
  switch (s.state) {
    case "signed_in":
      return t("git.signedIn", { account: s.account ?? "?" });
    case "signed_out":
      return t("git.signedOut");
    case "no_gh":
      return t("git.noGh");
    case "cancelled":
      return t("git.cancelled");
    default:
      return t(s.reason === "expired" ? "git.err.expired" : s.reason === "denied" ? "git.err.denied" : s.reason === "bad_token" ? "git.err.badKey" : "git.err.failed", { message: s.message ?? "" });
  }
}

export async function cmdGit(c: GitCtx): Promise<number> {
  const p = say(c);
  const g = c.login ?? createGitLogin();
  const sub = c.rest[0] ?? "status";
  const done = (s: GitLoginState) => {
    if (c.json) p(JSON.stringify({ host: "github.com", ...s }));
    else p(line(c, s));
    return s.state === "signed_in" ? 0 : 1;
  };
  if (sub === "status") return done(await g.status());
  if (sub !== "login") return p(c.t("git.usage")), 2;
  if (c.withToken) {
    const key = (await (c.stdin ?? (() => Bun.stdin.text()))()).trim();
    if (!key) return p(c.t("git.noKey")), 2;
    return done(await g.token(key));
  }
  const first = await g.start();
  if (first.state !== "code") return done(first);
  if (c.json) p(JSON.stringify({ host: "github.com", ...first }));
  else {
    p(c.t("git.step1", { url: first.url ?? "https://github.com/login/device" }));
    p(c.t("git.step2", { code: first.code ?? "" }));
    p(c.t("git.waiting"));
  }
  const stop = () => void g.cancel();
  process.once("SIGINT", stop);
  try {
    return done(await g.wait());
  } finally {
    process.off("SIGINT", stop);
  }
}
