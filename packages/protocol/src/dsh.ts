// D371: DeepSeek Harness on a computer, as Ducter needs to know it (research/140).
//   - Where its desktop app keeps the `dsh` command (it never puts one on PATH unless the person
//     asks it to, as /usr/local/bin/dsh, a link back into the app).
//   - How it is signed in, read from its own credential file without reading a secret out:
//     an API key (`refs: DEEPSEEK_API_KEY`) or a DeepSeek account (the app's 登录 / Sign in,
//     the `deepseek-account-platform/default` record). Each runs a different model route:
//     `deepseek-official/<model>` on the key, `deepseek-account/<model>` on the account.
// Every read here is presence only; no value leaves this file except dshCredentialKey's, which
// only the runner calls, to hand the key to a session's own environment.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DSH_KEY_ENV } from "./harnesses.ts";

/** The desktop app as macOS names it, and the folder inside it that holds its `dsh` launcher. */
export const DSH_APP = "DeepSeek Harness";
export const DSH_APP_BUNDLE = `${DSH_APP}.app`;
export const DSH_APP_CLI = ["Contents", "Resources", "runtime", "cli", "bin"] as const;
/** Where the app may be: /Applications, then ~/Applications. */
export function dshAppPaths(home: string = homedir()): string[] {
  return ["/Applications", join(home, "Applications")].map((d) => join(d, DSH_APP_BUNDLE));
}
/** Where a DeepSeek API key is made (the key route's sign-in, on any computer). */
export const DSH_KEY_PAGE = "https://platform.deepseek.com/api_keys";

/** The model route for each way of signing in. */
export const DSH_ROUTE = { key: "deepseek-official", account: "deepseek-account" } as const;
const ACCOUNT_RECORD = "deepseek-account-platform/default";

/** `<DSH_HOME or ~/.dsh>/.credentials.yaml`: DeepSeek Harness's own credential file (CLI and app share it). */
export function dshCredentialsFile(env: Record<string, string | null | undefined> = process.env, home: string = homedir()): string {
  return join(env.DSH_HOME || join(home, ".dsh"), ".credentials.yaml");
}

/** How a DSH credential file is signed in: a key under refs, an account grant with its token. */
export function dshSignIns(text: string | undefined): { key: boolean; account: boolean } {
  if (!text) return { key: false, account: false };
  const key = new RegExp(`^\\s+${DSH_KEY_ENV}:\\s*\\S`, "m").test(text);
  // The account record, then a non-empty token line inside it (before the next record at its indent).
  const at = text.search(new RegExp(`^(\\s+)${ACCOUNT_RECORD.replace(/[/-]/g, "\\$&")}:\\s*$`, "m"));
  let account = false;
  if (at >= 0) {
    const rest = text.slice(at).split("\n");
    const indent = /^(\s*)/.exec(rest[0]!)![1]!.length;
    for (const line of rest.slice(1)) {
      if (line.trim() && /^(\s*)/.exec(line)![1]!.length <= indent) break;
      if (/^\s+token:\s*\S/.test(line)) account = true;
    }
  }
  return { key, account };
}

const readSafe = (p: string) => {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return undefined;
  }
};

/** The person's own DSH sign-ins (presence only). */
export function dshOwnSignIns(env: Record<string, string | null | undefined> = process.env, read: (p: string) => string | undefined = readSafe): { key: boolean; account: boolean } {
  return dshSignIns(read(dshCredentialsFile(env)));
}

/** The DeepSeek key in the person's own DSH credential file, if any. Never logged. */
export function dshCredentialKey(env: Record<string, string | null | undefined> = process.env, read: (p: string) => string | undefined = readSafe): string | undefined {
  const m = new RegExp(`^\\s+${DSH_KEY_ENV}:\\s*(?:"([^"\\n]+)"|'([^'\\n]+)'|([^\\s#]+))`, "m").exec(read(dshCredentialsFile(env)) ?? "");
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
}

/**
 * The model a DeepSeek Harness session runs: a bare name gets a route, and the key route becomes
 * the account route when only the account is signed in (the same model ids on both, DSH's own
 * catalogs). A route the person named themselves (another provider) is left alone.
 */
export function dshModel(model: string | undefined, account: boolean): string | undefined {
  if (!model) return account ? `${DSH_ROUTE.account}/deepseek-flash` : undefined;
  const route = account ? DSH_ROUTE.account : DSH_ROUTE.key;
  if (!model.includes("/")) return `${route}/${model}`;
  if (account && model.startsWith(`${DSH_ROUTE.key}/`)) return `${DSH_ROUTE.account}/${model.slice(DSH_ROUTE.key.length + 1)}`;
  return model;
}
