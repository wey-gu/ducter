// D102: helpers Ducter runs itself (nmem, git, gh, the doctor's probes) get an allowlist, never
// the whole environment.
import { expect, test } from "bun:test";
import { ghEnv, gitEnv, nmemEnv, toolEnv } from "../src/tool-env.ts";

const inherited = {
  PATH: "/usr/bin", HOME: "/h", LANG: "en_US.UTF-8", LC_ALL: "C", HTTPS_PROXY: "http://p", SSH_AUTH_SOCK: "/s",
  ANTHROPIC_API_KEY: "sk-ant", OPENAI_API_KEY: "sk-oa", CLAUDE_CODE_OAUTH_TOKEN: "o", DUCTER_MCP_SECRET: "m", AWS_SECRET_ACCESS_KEY: "a",
  NMEM_API_KEY: "nm", NMEM_SPACE: "work", GIT_AUTHOR_NAME: "Wei", GIT_SSH_COMMAND: "ssh -i k", GIT_TOKEN: "t",
  GH_TOKEN: "ghp", GITHUB_TOKEN: "ght", GH_HOST: "github.com", RANDOM_SETTING: "1",
};
const SECRETS = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN", "DUCTER_MCP_SECRET", "AWS_SECRET_ACCESS_KEY"];

test("basics only: paths, locale, proxies; no keys, nothing unknown", () => {
  const e = toolEnv({ inherited });
  expect(e).toMatchObject({ PATH: "/usr/bin", HOME: "/h", LANG: "en_US.UTF-8", LC_ALL: "C", HTTPS_PROXY: "http://p" });
  for (const k of [...SECRETS, "NMEM_API_KEY", "GH_TOKEN", "RANDOM_SETTING", "SSH_AUTH_SOCK"]) expect(e[k]).toBeUndefined();
});

test("nmem: its own NMEM_* (its key too), nothing else secret", () => {
  const e = nmemEnv(inherited);
  expect(e).toMatchObject({ NMEM_API_KEY: "nm", NMEM_SPACE: "work", PATH: "/usr/bin" });
  for (const k of [...SECRETS, "GH_TOKEN", "GIT_AUTHOR_NAME"]) expect(e[k]).toBeUndefined();
});

test("git: GIT_* settings and the SSH agent, no secret-shaped GIT_*", () => {
  const e = gitEnv(inherited);
  expect(e).toMatchObject({ GIT_AUTHOR_NAME: "Wei", GIT_SSH_COMMAND: "ssh -i k", SSH_AUTH_SOCK: "/s" });
  for (const k of [...SECRETS, "GIT_TOKEN", "NMEM_API_KEY", "GH_TOKEN"]) expect(e[k]).toBeUndefined();
});

test("gh: git's plus gh's own token", () => {
  const e = ghEnv(inherited);
  expect(e).toMatchObject({ GH_TOKEN: "ghp", GITHUB_TOKEN: "ght", GH_HOST: "github.com", GIT_AUTHOR_NAME: "Wei" });
  for (const k of [...SECRETS, "NMEM_API_KEY"]) expect(e[k]).toBeUndefined();
});
