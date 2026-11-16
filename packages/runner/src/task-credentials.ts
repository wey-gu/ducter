// What a task environment inherits for git and GitHub (D272): the one place that decides it.
//
// Today ("home"): a task runs as the person, on the computer that does the work, in its own
// process with the allowlisted environment (child-env.ts, D102). Its git reads the person's own
// git settings from $HOME (~/.gitconfig, or GIT_CONFIG_GLOBAL), and for github.com those settings
// name gh as the password helper (`gh auth setup-git`, which 在 {computer} 上登录 GitHub runs); gh
// reads its login from its own config folder (GH_CONFIG_DIR, else $XDG_CONFIG_HOME/gh, else
// ~/.config/gh) or the system keyring. ssh keys reach git through the agent (SSH_AUTH_SOCK). So
// the task needs only the route to those: HOME, the config-folder settings and the agent socket.
// Never a token in the environment: GH_TOKEN / GITHUB_TOKEN stay out (they are secret-shaped and
// child-env drops them), so a task signs in exactly as the person's own terminal git does.
//
// A sandbox ("sandbox": a container or a separate user, todo) has no $HOME of the person's. It gets
// the same route made explicit instead, never the whole environment: a token scoped for it (passed
// in by whoever starts the sandbox; never read here from Ducter's own environment) and git told,
// through GIT_CONFIG_COUNT/KEY/VALUE (no file written), to ask gh for github.com, with every other
// helper for that host cleared first. Nothing else of the person's crosses.

/** The names a task keeps so its git finds the person's sign-in (none of them is a secret). */
export const CREDENTIAL_ROUTE = ["HOME", "GH_CONFIG_DIR", "GH_HOST", "XDG_CONFIG_HOME", "GIT_CONFIG_GLOBAL", "SSH_AUTH_SOCK"] as const;

export type TaskCredentialMode =
  | { kind: "home" }
  /** A sandbox: a token scoped to it (from its starter), and where gh is inside it. */
  | { kind: "sandbox"; githubToken?: string; ghPath?: string };

export interface TaskCredentials {
  /** How git signs in there, in a word (for the design notes and tests). */
  route: "person's git and gh, from home" | "scoped token through gh" | "none";
  /** Set explicitly in the task's environment (null removes). */
  env: Record<string, string | null>;
}

/**
 * The git/GitHub part of a task's environment. "home": the route names, kept as the person has
 * them (only those set); "sandbox": a scoped token and the helper made explicit, or none at all.
 */
export function taskCredentials(mode: TaskCredentialMode = { kind: "home" }, inherited: Record<string, string | undefined> = process.env): TaskCredentials {
  if (mode.kind === "home") {
    const env: Record<string, string | null> = {};
    for (const k of CREDENTIAL_ROUTE) {
      const v = inherited[k];
      if (typeof v === "string" && v) env[k] = v;
    }
    return { route: "person's git and gh, from home", env };
  }
  if (!mode.githubToken) return { route: "none", env: { GH_TOKEN: null, GITHUB_TOKEN: null } };
  const gh = mode.ghPath ?? "gh";
  return {
    route: "scoped token through gh",
    env: {
      GH_TOKEN: mode.githubToken,
      GITHUB_TOKEN: null,
      GIT_TERMINAL_PROMPT: "0",
      GIT_CONFIG_COUNT: "2",
      GIT_CONFIG_KEY_0: "credential.https://github.com.helper",
      GIT_CONFIG_VALUE_0: "",
      GIT_CONFIG_KEY_1: "credential.https://github.com.helper",
      GIT_CONFIG_VALUE_1: `!${gh} auth git-credential`,
    },
  };
}
