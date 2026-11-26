// D599: a sign-in with a one-time code, through the real core (MCP, decisions, the Log, the check
// runner with fake commands): the card's fields, the CLI's own status command settling it while the
// call waits and after it, the task's own word for a CLI Ducter can't check, a new code taking the old
// card's place, Go once it ran out asking for a new code, and the runner's recognizer giving a task's
// worded question (the 2026-11-26 haswell case) the same shape. No real sign-in runs.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Bodies } from "@ducter/protocol";
import { deviceFlowIn, codeIn, pageOf } from "@ducter/protocol/src/device-signin.ts";
import { validateCheck } from "@ducter/protocol/src/checks.ts";
import { askTokens } from "@ducter/protocol/src/ask-text.ts";
import { forwardText } from "../src/decisions.ts";
import { normalizeReport } from "../../runner/src/tools.ts";
import { startCore, type Core } from "../src/core.ts";
import { tempDir } from "./helpers.ts";

let core: Core;
let td: ReturnType<typeof tempDir>;
let sends: { taskId: string; text: string }[];
let ran: string[][];
let signedIn: boolean;

const start = (waitMs: number) => {
  core = startCore({
    dataDir: td.dir,
    port: 0,
    push: false,
    browser: false,
    keyWaitMs: waitMs,
    deviceCheckMs: 20,
    work: {
      exec: async (argv) => {
        ran.push(argv);
        return { exitCode: signedIn ? 0 : 1, stdout: signedIn ? "github.com\n  ✓ Logged in to github.com account octo" : "You are not logged into any GitHub hosts." };
      },
    },
  } as never);
  core.setRunner({ send: async (taskId: string, text: string) => void sends.push({ taskId, text }) } as never);
};
const openTask = (taskId: string) =>
  core.log.append({ stream: `task:${taskId}`, origin: "partner", kind: "task_open", body: { taskId, title: "Clone the repo", project: "", place: { kind: "none" }, harness: "claude-code", brief: "Clone it." } });
const call = (taskId: string, args: object) => core.mcp.call({ role: "task", taskId }, "sign_in_with_code", args) as Promise<string>;
const cards = () => core.log.read({ fromSeq: 0, limit: 10_000, kinds: ["decision"] }).map((e) => e.body as Bodies["decision"]).filter((d) => d.deviceSignIn);
const resolutions = () => core.log.read({ fromSeq: 0, limit: 10_000, kinds: ["decision_resolved"] }).map((e) => e.body as Bodies["decision_resolved"]);
const until = async (pred: () => boolean, ms = 3000) => {
  for (const end = Date.now() + ms; Date.now() < end; ) {
    if (pred()) return;
    await Bun.sleep(10);
  }
  throw new Error("timed out");
};

beforeEach(() => {
  td = tempDir();
  sends = [];
  ran = [];
  signedIn = false;
});
afterEach(async () => {
  await core?.stop();
  td.cleanup();
});

describe("sign_in_with_code", () => {
  test("the card carries the page, the code and until when; gh's own check settles it in the waiting call", async () => {
    start(5000);
    openTask("t1");
    expect(core.mcp.tools("task")).toContain("sign_in_with_code");
    const p = call("t1", { url: "https://github.com/login/device", code: "8694-B656", cli: ".github-cli/gh" });
    await until(() => cards().length === 1);
    const d = cards()[0]!;
    expect(d.deviceSignIn).toMatchObject({ service: "GitHub", url: "https://github.com/login/device", code: "8694-B656", cli: "gh" });
    expect(Date.parse(d.deviceSignIn!.until) - Date.now()).toBeGreaterThan(14 * 60_000);
    expect(d.defaultOption).toBe("hold");
    expect(d.defaultAt).toBeUndefined();
    expect(core.tasks.get("t1")?.attention).toBe("needs_you");
    await until(() => ran.length >= 2);
    expect(ran[0]).toEqual(["gh", "auth", "status"]);
    signedIn = true;
    const out = await p;
    expect(out).toContain("Signed in to GitHub");
    const r = resolutions().find((x) => x.decisionId === d.decisionId)!;
    expect(r).toMatchObject({ option: "go", by: "ended", settled: true, signedIn: true, delivered: true });
    await until(() => core.tasks.get("t1")?.attention === "working");
    expect(sends).toEqual([]); // the call carried it
  });

  test("after the call ended, the check still settles it and the task is told", async () => {
    start(30);
    openTask("t1");
    const out = await call("t1", { url: "https://github.com/login/device", code: "8694-B656", service: "GitHub" });
    expect(out).toContain("End your turn now");
    expect(out).toContain("gh auth status");
    expect(out).not.toContain("已授权");
    signedIn = true;
    await until(() => sends.length === 1);
    expect(sends[0]!.text).toContain("Signed in to GitHub");
    expect(resolutions().at(-1)).toMatchObject({ signedIn: true, settled: true });
  });

  test("a CLI Ducter can't check: the task's own word closes the card", async () => {
    start(30);
    openTask("t1");
    const out = await call("t1", { url: "https://example.dev/activate", code: "QX4P-7TQ2", service: "Example" });
    expect(out).toContain("signed_in true");
    await Bun.sleep(80);
    expect(ran).toEqual([]);
    const done = await call("t1", { signed_in: true });
    expect(done).toContain("signed in to Example");
    expect(resolutions().at(-1)).toMatchObject({ signedIn: true, delivered: true });
    await Bun.sleep(20);
    expect(sends).toEqual([]);
  });

  test("a new code takes the old card's place; Go once it ran out asks the task for a new code", async () => {
    start(30);
    openTask("t1");
    await call("t1", { url: "https://github.com/login/device", code: "8694-B656" });
    await call("t1", { url: "https://github.com/login/device", code: "11AA-22BB", minutes: 1 });
    expect(cards().length).toBe(2);
    expect(resolutions().find((r) => r.decisionId === cards()[0]!.decisionId)?.by).toBe("ended");
    const d = cards()[1]!;
    expect(core.decisions.isPending(d.decisionId)).toBe(true);
    const expired = { ...d, deviceSignIn: { ...d.deviceSignIn!, until: new Date(Date.now() - 1000).toISOString() } };
    expect(forwardText(expired, { decisionId: d.decisionId, option: "go", by: "user" })).toContain("asked for a new one");
    expect(forwardText(d, { decisionId: d.decisionId, option: "go", by: "user" })).toContain("says they approved");
    expect(forwardText(d, { decisionId: d.decisionId, option: "hold", by: "user" })).toBe("");
  });
});

describe("an ask's words (ask-text.ts)", () => {
  test("links, codes in backticks and one-time codes are pieces; the rest is words", () => {
    expect(askTokens("请打开 https://github.com/login/device，输入设备码 8694-B656 并授权。")).toEqual([
      { kind: "text", text: "请打开 " },
      { kind: "link", text: "https://github.com/login/device" },
      { kind: "text", text: "，输入设备码 " },
      { kind: "code", text: "8694-B656" },
      { kind: "text", text: " 并授权。" },
    ]);
    expect(askTokens("Run `bun test` then see https://ducter.ai/docs.")).toEqual([
      { kind: "text", text: "Run " },
      { kind: "code", text: "bun test" },
      { kind: "text", text: " then see " },
      { kind: "link", text: "https://ducter.ai/docs" },
      { kind: "text", text: "." },
    ]);
    expect(askTokens("Merge it? WAIT-HERE is a label")).toEqual([{ kind: "text", text: "Merge it? WAIT-HERE is a label" }]);
  });
});

describe("the recognizer", () => {
  const haswell = "请打开 https://github.com/login/device，输入设备码 8694-B656 并在 GitHub 网页上授权。完成后请回复「已授权」。";
  test("the haswell question: GitHub's page and its code", () => {
    expect(deviceFlowIn(haswell)).toEqual({ cli: "gh", service: "GitHub", url: "https://github.com/login/device", code: "8694-B656" });
    const r = normalizeReport("t1", { state: "needs_input", summary: "需要授权", questions: [{ id: "q", text: haswell, blocking: true, reversible: false }] });
    expect(r.questions[0]!.deviceSignIn).toMatchObject({ service: "GitHub", code: "8694-B656", cli: "gh" });
  });
  test("the CLIs' own printed lines", () => {
    expect(deviceFlowIn("! First copy your one-time code: 8694-B656\nOpen this URL to continue in your web browser: https://github.com/login/device")?.code).toBe("8694-B656");
    expect(deviceFlowIn("To sign in, use a web browser to open the page https://microsoft.com/devicelogin and enter the code F7KQ2ZP9X to authenticate.")).toMatchObject({ cli: "az", code: "F7KQ2ZP9X" });
    expect(deviceFlowIn("1. Open https://auth.openai.com/codex/device\n2. Enter this one-time code ABCD-12345")).toMatchObject({ cli: "codex", code: "ABCD-12345" });
  });
  test("any other link stays a link; words are not codes", () => {
    expect(deviceFlowIn("See https://github.com/owner/repo/pull/12 and run it")).toBeUndefined();
    expect(pageOf("http://github.com/login/device")).toBeUndefined();
    expect(codeIn("WAIT-HERE please")).toBeUndefined();
    expect(normalizeReport("t1", { state: "needs_input", summary: "x", questions: [{ id: "q", text: "Merge https://github.com/a/b/pull/1?", blocking: true }] }).questions[0]!.deviceSignIn).toBeUndefined();
  });
  test("the status commands are checks a check may run, and only their reading form", () => {
    for (const argv of [["gh", "auth", "status"], ["codex", "login", "status"], ["claude", "auth", "status"], ["az", "account", "show"], ["wrangler", "whoami"], ["gcloud", "auth", "list", "--filter=status:ACTIVE"]]) expect(validateCheck({ argv, succeedWhen: { exitCode: 0 } }).ok).toBe(true);
    expect(validateCheck({ argv: ["codex", "login"], succeedWhen: { exitCode: 0 } }).ok).toBe(false);
    expect(validateCheck({ argv: ["gh", "auth", "login"], succeedWhen: { exitCode: 0 } }).ok).toBe(false);
  });
});
