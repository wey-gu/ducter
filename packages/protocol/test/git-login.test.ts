// D272: 在 {computer} 上登录 GitHub / Sign in to GitHub on {computer}, through that computer's gh.
// A fake gh only: it prints what gh prints without a terminal (research/87) and never signs in.
import { describe, expect, test } from "bun:test";
import { createGitLogin, ghRunEnv, loginWhy, parseDeviceCode, parseStatus, type GhRun } from "../src/git-login.ts";

const CODE_TEXT = "\n! First copy your one-time code: AB12-CD34\nOpen this URL to continue in your web browser: https://github.com/login/device\n";

/** A fake gh: who is signed in, what a login prints and how it ends; every call recorded. */
function fakeGh(o: { account?: string; missing?: boolean; oldGh?: boolean; login?: "ok" | "expired" | "denied" | "hang"; tokenOk?: boolean } = {}) {
  const calls: { args: string[]; env: Record<string, string>; stdin?: string }[] = [];
  let account = o.account;
  const run: GhRun = async (args, x) => {
    calls.push({ args, env: x.env, ...(x.stdin !== undefined ? { stdin: x.stdin } : {}) });
    if (o.missing) return { code: 127, out: "", err: "", missing: true };
    const [a, b] = args;
    if (a === "auth" && b === "status") {
      if (args.includes("--json")) {
        if (o.oldGh) return { code: 1, out: "", err: "unknown flag: --json" };
        return account ? { code: 0, out: JSON.stringify({ hosts: { "github.com": [{ state: "success", active: true, host: "github.com", login: account }] } }), err: "" } : { code: 1, out: '{"hosts":{}}', err: "" };
      }
      return account ? { code: 0, out: "", err: `github.com\n  ✓ Logged in to github.com account ${account} (keyring)\n` } : { code: 1, out: "", err: "You are not logged into any GitHub hosts." };
    }
    if (a === "auth" && b === "setup-git") return { code: 0, out: "", err: "" };
    if (a === "auth" && b === "login" && args.includes("--with-token")) {
      if (!o.tokenOk) return { code: 1, out: "", err: "error validating token: missing required scope 'read:org'" };
      account = "wey-gu";
      return { code: 0, out: "", err: "" };
    }
    if (a === "auth" && b === "login") {
      x.onErr?.(CODE_TEXT.slice(0, 20));
      x.onErr?.(CODE_TEXT.slice(20));
      if (o.login === "hang") {
        await new Promise<void>((r) => x.signal?.addEventListener("abort", () => r()));
        return { code: 1, out: "", err: "" };
      }
      await Bun.sleep(5);
      if (o.login === "expired") return { code: 1, out: "", err: CODE_TEXT + "failed to authenticate via web browser: the device code has expired" };
      if (o.login === "denied") return { code: 1, out: "", err: CODE_TEXT + "failed to authenticate via web browser: access_denied" };
      account = "wey-gu";
      return { code: 0, out: "", err: CODE_TEXT + "✓ Authentication complete.\n" };
    }
    return { code: 1, out: "", err: "unexpected" };
  };
  return { run, calls };
}

describe("D272 git login", () => {
  test("reads gh's code and link from its stderr, with or without the clipboard line", () => {
    expect(parseDeviceCode(CODE_TEXT)).toEqual({ code: "AB12-CD34", url: "https://github.com/login/device" });
    expect(parseDeviceCode("! One-time code (WXYZ-0001) copied to clipboard")).toEqual({ code: "WXYZ-0001" });
    expect(parseDeviceCode("nothing yet")).toEqual({});
  });

  test("reads the account from gh's JSON and from an older gh's text", () => {
    expect(parseStatus(JSON.stringify({ hosts: { "github.com": [{ state: "success", active: true, login: "a" }] } }), "")).toBe("a");
    expect(parseStatus("", "  ✓ Logged in to github.com account wey-gu (keyring)")).toBe("wey-gu");
    expect(parseStatus("", "  ✓ Logged in to github.com as old-user (oauth_token)")).toBe("old-user");
    expect(parseStatus('{"hosts":{}}', "")).toBeUndefined();
  });

  test("status: signed in, signed out, no gh, an older gh", async () => {
    expect(await createGitLogin({ run: fakeGh({ account: "wey-gu" }).run }).status()).toEqual({ state: "signed_in", account: "wey-gu" });
    expect(await createGitLogin({ run: fakeGh().run }).status()).toEqual({ state: "signed_out" });
    expect(await createGitLogin({ run: fakeGh({ missing: true }).run }).status()).toEqual({ state: "no_gh" });
    expect(await createGitLogin({ run: fakeGh({ account: "x", oldGh: true }).run }).status()).toEqual({ state: "signed_in", account: "x" });
  });

  test("a sign-in: the code and link, then gh set up for git, then the account", async () => {
    const gh = fakeGh({ login: "ok" });
    const g = createGitLogin({ run: gh.run, env: { PATH: "/usr/bin", HOME: "/home/me", GH_TOKEN: "ghp_fake_should_not_pass_000", ANTHROPIC_API_KEY: "sk-fake" } });
    const first = await g.start();
    expect(first).toEqual({ state: "code", code: "AB12-CD34", url: "https://github.com/login/device" });
    // A second start (another client, a socket that came back) answers the same code; one gh.
    expect(await g.start()).toEqual(first);
    expect(await g.wait()).toEqual({ state: "signed_in", account: "wey-gu" });
    const login = gh.calls.filter((c) => c.args[1] === "login");
    expect(login).toHaveLength(1);
    expect(login[0]!.args).toEqual(["auth", "login", "--hostname", "github.com", "--git-protocol", "https", "--web"]);
    // gh never asks, and never gets Ducter's keys; a GH_TOKEN would stop gh from storing the login.
    expect(login[0]!.env.GH_PROMPT_DISABLED).toBe("1");
    expect(login[0]!.env.GH_TOKEN).toBeUndefined();
    expect(login[0]!.env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(login[0]!.env.HOME).toBe("/home/me");
    expect(gh.calls.some((c) => c.args.join(" ") === "auth setup-git --hostname github.com")).toBe(true);
  });

  test("already signed in: no sign-in runs", async () => {
    const gh = fakeGh({ account: "wey-gu" });
    expect(await createGitLogin({ run: gh.run }).start()).toEqual({ state: "signed_in", account: "wey-gu" });
    expect(gh.calls.some((c) => c.args[1] === "login")).toBe(false);
  });

  test("an expired code and a denied one say why", async () => {
    for (const [login, reason] of [["expired", "expired"], ["denied", "denied"]] as const) {
      const g = createGitLogin({ run: fakeGh({ login }).run });
      expect((await g.start()).state).toBe("code");
      const end = await g.wait();
      expect(end.state).toBe("failed");
      expect(end.reason).toBe(reason);
    }
    expect(loginWhy("something else")).toBe("failed");
  });

  test("cancel stops the sign-in in flight", async () => {
    const g = createGitLogin({ run: fakeGh({ login: "hang" }).run });
    expect((await g.start()).state).toBe("code");
    expect(await g.cancel()).toEqual({ state: "cancelled" });
  });

  test("the token fallback: checked first, sent on stdin only, then git set up", async () => {
    const bad = fakeGh({ tokenOk: true });
    expect((await createGitLogin({ run: bad.run }).token("not a token; rm -rf")).reason).toBe("bad_token");
    expect(bad.calls).toHaveLength(0);
    const gh = fakeGh({ tokenOk: true });
    const tok = "ghp_" + "a".repeat(36);
    expect(await createGitLogin({ run: gh.run }).token(tok)).toEqual({ state: "signed_in", account: "wey-gu" });
    const login = gh.calls.find((c) => c.args.includes("--with-token"))!;
    expect(login.stdin).toBe(tok + "\n");
    expect(login.args.join(" ")).not.toContain(tok);
    expect(Object.values(login.env).join(" ")).not.toContain(tok);
    const refused = await createGitLogin({ run: fakeGh({ tokenOk: false }).run }).token(tok);
    expect(refused.state).toBe("failed");
    expect(refused.reason).toBe("bad_token");
    expect(JSON.stringify(refused)).not.toContain(tok);
  });

  test("no gh: the start says so", async () => {
    expect(await createGitLogin({ run: fakeGh({ missing: true }).run }).start()).toEqual({ state: "no_gh" });
  });

  test("gh's environment: a status check sees the person's GH_TOKEN, a sign-in doesn't", () => {
    const env = { PATH: "/bin", GH_TOKEN: "t", GH_CONFIG_DIR: "/c", OPENAI_API_KEY: "k" };
    expect(ghRunEnv(env, true).GH_TOKEN).toBe("t");
    expect(ghRunEnv(env, false).GH_TOKEN).toBeUndefined();
    expect(ghRunEnv(env, false).GH_CONFIG_DIR).toBe("/c");
    expect(ghRunEnv(env, true).OPENAI_API_KEY).toBeUndefined();
  });
});
