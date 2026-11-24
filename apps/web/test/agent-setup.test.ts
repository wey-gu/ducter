// D363: an AI agent's row on a device card and the lend sheet: where it stands (安装, 正在装上…,
// 登录, the sign-in in place, 可以用了), what the lend sheet offers checked, and the words in both
// languages, with no dot joins (D291).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { DeviceHarness } from "@ducter/protocol";
import { agentRowLook, anyInstalling, anyReady, offerable } from "../src/agent-setup-view.ts";
import { loginSteps, loginTrouble, minutesLeft, shortUrl } from "../src/agent-setup.tsx";
import { agentSetupWords } from "../src/i18n-agentsetup.ts";

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
const h = (harness: string, o: Partial<DeviceHarness> = {}): DeviceHarness => ({ harness, installed: false, loggedIn: false, canBePartner: false, ...o });

describe("a row's look", () => {
  test("D549: an agent that won't run as root where Ducter runs as root: its own look, signed in or not, with its why in both languages", () => {
    expect(agentRowLook(h("claude-code", { installed: true, loggedIn: true, trouble: { kind: "root" } }))).toBe("cant");
    expect(agentRowLook(h("claude-code", { installed: true, trouble: { kind: "root" } }))).toBe("cant");
    for (const f of ["i18n-agentsetup.ts"]) for (const k of ["ag.trouble.root", "ag.trouble.root.why"]) expect(src(f).split(`"${k}":`).length).toBe(3);
    expect(src("agent-setup.tsx")).toContain('t("ag.trouble.root.why", name)');
  });

  test("installing, then not signed in, then its sign-in, then ready", () => {
    expect(agentRowLook(h("codex", { installable: true }))).toBe("install");
    expect(agentRowLook(h("codex", { installable: true, setup: { phase: "queued" } }))).toBe("queued");
    expect(agentRowLook(h("codex", { installable: true, setup: { phase: "installing" } }))).toBe("installing");
    expect(agentRowLook(h("codex", { installable: true, setup: { phase: "failed", reason: "network" } }))).toBe("failed");
    expect(agentRowLook(h("codex", { installed: true }))).toBe("signin");
    expect(agentRowLook(h("codex", { installed: true, login: { state: "waiting", url: "https://auth.openai.com/codex/device", code: "ABCD-EFGHI" } }))).toBe("login");
    expect(agentRowLook(h("codex", { installed: true, loggedIn: true, login: { state: "done" } }))).toBe("ready"); // D518: 登录好了 on a ready row
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
    // D371: DeepSeek Harness where Ducter can install it: offered, before pi, not checked.
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
    for (const k of ["ag.login.${k}.1", "ag.login.${k}.2", "ag.login.paste", "ag.login.pi", "ag.retry", "ag.login.wait.paste", "ag.login.confirming"]) expect(row).toContain(k);
  });
});

// D518: a sign-in from a server: two steps in each agent's words, a live line, how it ended.
test("a sign-in's steps, its trouble and its time left, in both languages", () => {
  expect(loginSteps("claude-code")).toEqual({ open: "ag.login.claude.1", code: "ag.login.claude.2" });
  expect(loginSteps("codex")).toEqual({ open: "ag.login.codex.1", code: "ag.login.codex.2" });
  expect(loginSteps("antigravity")).toEqual({ open: "ag.login.agy.1", code: "ag.login.agy.2" });
  expect(loginTrouble({ state: "expired" })).toBe("ag.login.expired");
  expect(loginTrouble({ state: "failed", reason: "not_seen" })).toBe("ag.login.not_seen");
  expect(loginTrouble({ state: "failed", reason: "no_answer" })).toBe("ag.login.no_answer");
  expect(loginTrouble({ state: "failed", reason: "wrong_code" })).toBe("ag.login.wrong_code");
  // D523: its sign-in ended well, its own check got no answer from its service.
  expect(loginTrouble({ state: "failed", reason: "offline" })).toBe("ag.login.unreachable");
  expect(loginTrouble({ state: "failed" })).toBe("ag.login.failed");
  expect(minutesLeft(15 * 60_000, 0)).toBe(15);
  expect(minutesLeft(61_000, 0)).toBe(2);
  expect(minutesLeft(0, 5000)).toBe(1);
  const keys = ["ag.signing_in", "ag.login.wait.paste", "ag.login.wait.self", "ag.login.left", "ag.login.confirming", "ag.login.not_seen", "ag.login.no_answer", "ag.login.send", "ag.login.claude.1", "ag.login.claude.2", "ag.login.codex.1", "ag.login.codex.2", "ag.login.agy.1", "ag.login.agy.2"];
  for (const lang of ["zh", "en"] as const) for (const k of keys) expect(agentSetupWords[lang][k]).toBeTruthy();
  // 好了 / Done read as "I finished" beside the paste box; it sends the code.
  expect(agentSetupWords.zh["ag.login.send"]).toBe("确认登录");
  expect(agentSetupWords.en["ag.login.send"]).toBe("Confirm");
  // The Mac's words are the same (apps/desktop/internal/i18n/agentsetup.go).
  const mac = readFileSync(new URL("../../desktop/internal/i18n/agentsetup.go", import.meta.url), "utf8");
  for (const lang of ["zh", "en"] as const) for (const k of keys) expect(mac).toMatch(new RegExp(`"${k.replace(/\./g, "\\.")}":\\s+${JSON.stringify(agentSetupWords[lang][k]).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
});

// D518: a tray tile holds its name with room on both sides; a long one grows it (never clipped).
test("a coin tile pads its name and grows for a long one", () => {
  const css = readFileSync(new URL("../static/app.css", import.meta.url), "utf8");
  const rule = /\n\.coin-tile \{([^}]*)\}/.exec(css)?.[1] ?? "";
  expect(rule).toContain("padding: 4px 8px 2px");
  expect(rule).toContain("min-width: 70px");
  expect(rule).not.toMatch(/(^|[ ;])width: 70px/);
});
