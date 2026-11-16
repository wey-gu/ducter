// D272: `ducter git login` / `ducter git status`, the headless twin of Sign in to GitHub on a
// computer. A fake gh (protocol's createGitLogin with an injected runner): nothing signs in.
import { describe, expect, test } from "bun:test";
import { createGitLogin, type GhRun } from "@ducter/protocol/src/git-login.ts";
import { parseArgs } from "../src/args.ts";
import { cmdGit } from "../src/git-cmd.ts";
import { translator } from "../src/i18n.ts";

function gh(o: { signedIn?: boolean; missing?: boolean } = {}) {
  let account = o.signedIn ? "wey-gu" : undefined;
  const calls: { args: string[]; stdin?: string }[] = [];
  const run: GhRun = async (args, x) => {
    calls.push({ args, ...(x.stdin !== undefined ? { stdin: x.stdin } : {}) });
    if (o.missing) return { code: 127, out: "", err: "", missing: true };
    if (args[1] === "status") return account ? { code: 0, out: JSON.stringify({ hosts: { "github.com": [{ state: "success", active: true, login: account }] } }), err: "" } : { code: 1, out: "", err: "" };
    if (args[1] === "login" && args.includes("--web")) {
      x.onErr?.("! First copy your one-time code: AB12-CD34\nOpen this URL to continue in your web browser: https://github.com/login/device\n");
      await Bun.sleep(5);
    }
    if (args[1] === "login") account = "wey-gu";
    return { code: 0, out: "", err: "" };
  };
  return { run, calls };
}

describe("D272 ducter git", () => {
  test("parses git login --with-token", () => {
    const r = parseArgs(["git", "login", "--with-token"]);
    expect(r.ok && r.args.command).toBe("git");
    expect(r.ok && r.args.rest).toEqual(["login"]);
    expect(r.ok && r.args.withToken).toBe(true);
  });

  test("login: the code and link, then who it signed in as", async () => {
    for (const lang of ["en", "zh"] as const) {
      const lines: string[] = [];
      const f = gh();
      const code = await cmdGit({ t: translator(lang), json: false, rest: ["login"], print: (s) => lines.push(s), login: createGitLogin({ run: f.run }) });
      expect(code).toBe(0);
      const all = lines.join("\n");
      expect(all).toContain("https://github.com/login/device");
      expect(all).toContain("AB12-CD34");
      expect(all).toContain("wey-gu");
      expect(f.calls.some((c) => c.args.join(" ") === "auth setup-git --hostname github.com")).toBe(true);
    }
  });

  test("status, json, no gh", async () => {
    const lines: string[] = [];
    expect(await cmdGit({ t: translator("en"), json: true, rest: ["status"], print: (s) => lines.push(s), login: createGitLogin({ run: gh({ signedIn: true }).run }) })).toBe(0);
    expect(JSON.parse(lines[0]!)).toEqual({ host: "github.com", state: "signed_in", account: "wey-gu" });
    lines.length = 0;
    expect(await cmdGit({ t: translator("en"), json: false, rest: ["login"], print: (s) => lines.push(s), login: createGitLogin({ run: gh({ missing: true }).run }) })).toBe(1);
    expect(lines.join("\n")).toContain("brew install gh");
  });

  test("--with-token: the key from stdin goes to gh's stdin only and is never printed", async () => {
    const lines: string[] = [];
    const f = gh();
    const key = "ghp_" + "k".repeat(36);
    expect(await cmdGit({ t: translator("en"), json: false, rest: ["login"], withToken: true, stdin: async () => key + "\n", print: (s) => lines.push(s), login: createGitLogin({ run: f.run }) })).toBe(0);
    expect(f.calls.find((c) => c.args.includes("--with-token"))?.stdin).toBe(key + "\n");
    expect(lines.join("\n")).not.toContain(key);
  });
});
