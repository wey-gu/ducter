// D363: an AI agent's row on a device card and the lend sheet: where it stands (安装, 正在装上…,
// 登录, the sign-in in place, 可以用了), what the lend sheet offers checked, and the words in both
// languages, with no dot joins (D291).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { DeviceHarness } from "@ducter/protocol";
import { strings } from "../src/i18n.ts";
import { agentSetupWords } from "../src/i18n-agentsetup.ts";
import { agentRowLook, anyInstalling, anyReady, offerable } from "../src/agent-setup-view.ts";
import { shortUrl } from "../src/agent-setup.tsx";

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
const h = (harness: string, o: Partial<DeviceHarness> = {}): DeviceHarness => ({ harness, installed: false, loggedIn: false, canBePartner: false, ...o });

describe("words", () => {
  test("zh and en, the same keys, never a dot join", () => {
    expect(Object.keys(agentSetupWords.zh).sort()).toEqual(Object.keys(agentSetupWords.en).sort());
    for (const v of [...Object.values(agentSetupWords.zh), ...Object.values(agentSetupWords.en)]) expect(v).not.toContain(" · ");
    expect(strings("zh").t("lend.setup.q")).toBe("装上哪些 AI？");
    expect(strings("zh").t("ag.install")).toBe("安装");
    expect(strings("zh").t("ag.signin")).toBe("登录");
    expect(strings("zh").t("lend.ready", "haswell")).toBe("haswell 可以干活了");
    expect(strings("en").t("lend.ready", "haswell")).toBe("haswell is ready for tasks");
  });
});

describe("a row's look", () => {
  test("installing, then not signed in, then its sign-in, then ready", () => {
    expect(agentRowLook(h("codex", { installable: true }))).toBe("install");
    expect(agentRowLook(h("codex", { installable: true, setup: { phase: "queued" } }))).toBe("queued");
    expect(agentRowLook(h("codex", { installable: true, setup: { phase: "installing" } }))).toBe("installing");
    expect(agentRowLook(h("codex", { installable: true, setup: { phase: "failed", reason: "network" } }))).toBe("failed");
    expect(agentRowLook(h("codex", { installed: true }))).toBe("signin");
    expect(agentRowLook(h("codex", { installed: true, login: { state: "waiting", url: "https://auth.openai.com/codex/device", code: "ABCD-EFGHI" } }))).toBe("login");
    expect(agentRowLook(h("codex", { installed: true, loggedIn: true, login: { state: "done" } }))).toBe("login"); // 登录好了 a moment
    expect(agentRowLook(h("codex", { installed: true, loggedIn: true }))).toBe("ready");
    // An older Ducter there can't install: nothing to press.
    expect(agentRowLook(h("deepseek-harness"))).toBe("missing");
  });

  test("the lend sheet offers what can be installed, Codex and Claude Code checked, pi not", () => {
    const hs = [h("claude-code", { installable: true }), h("codex", { installed: true }), h("pi", { installable: true }), h("deepseek-harness")];
    expect(offerable(hs)).toEqual([
      { harness: "claude-code", checked: true },
      { harness: "pi", checked: false },
    ]);
    // D369: DeepSeek Harness where Ducter can install it: offered, before pi, not checked.
    expect(offerable([...hs.slice(0, 3), h("deepseek-harness", { installable: true })])).toEqual([
      { harness: "claude-code", checked: true },
      { harness: "deepseek-harness", checked: false },
      { harness: "pi", checked: false },
    ]);
    expect(anyReady(hs)).toBe(false);
    expect(anyReady([h("codex", { installed: true, loggedIn: true })])).toBe(true);
    expect(anyInstalling([h("pi", { setup: { phase: "queued" } })])).toBe(true);
  });
});

test("a sign-in link reads as one short line", () => {
  expect(shortUrl("https://auth.openai.com/codex/device")).toBe("auth.openai.com/codex/device");
  expect(shortUrl("https://claude.com/cai/oauth/authorize?code=true&client_id=9d1c250a-e61b-44d9&scope=x")).toBe("claude.com/cai/oauth/authorize?code=true&cl…");
});

describe("where it shows", () => {
  test("the card's socket and a coin's detail use the row; the card looks again when it opens", () => {
    const card = src("devcard.tsx");
    expect(card).toContain("<AgentRow key={h.harness} dv={dv} h={h} />");
    expect(card).toContain("<AgentRow dv={dv} h={h} />");
    expect(card).toContain('A.agentSetup(dv.home ? "local" : dv.id, "look")');
    const lend = src("lend.tsx");
    expect(lend).toContain("<LendAgents dv={dv} done={done} setDone={setDone} />");
    expect(lend).toContain('t("lend.setup.q")');
    const row = src("agent-setup.tsx");
    for (const k of ["ag.login.codex", "ag.login.claude", "ag.login.paste", "ag.login.pi", "ag.retry"]) expect(row).toContain(k);
  });
});
