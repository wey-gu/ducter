// D347: 加一台做事的电脑 / Add a computer for tasks on the web: every word in both languages with no " · "
// joins (D291), the sheet's steps from what the home says (waiting → joined → here, the code's
// expiry, no address), and the entry in sight in 你的设备 and as the partner's card.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import type { LendFrame } from "@ducter/protocol";
import { strings } from "../src/i18n.ts";
import { lendWords } from "../src/i18n-lend.ts";
import { applyLend, arrived, LEND_WAIT_MS, lendError, lendStep, minutesLeft, type LendState } from "../src/lend-view.ts";

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
const NOW = Date.parse("2026-11-18T10:00:00Z");
const waiting: LendFrame = {
  t: "lend",
  code: "K7QM-4XPA",
  expiresAt: new Date(NOW + 10 * 60_000).toISOString(),
  state: "waiting",
  address: "https://hel.example.com",
  line: "curl -fsSL https://ducter.ai/install.sh | sh -s -- worker https://hel.example.com --code K7QM-4XPA",
  check: "curl -sS -m 10 https://hel.example.com/health",
};

describe("words", () => {
  test("zh and en, the same keys, never a dot join", () => {
    expect(Object.keys(lendWords.zh).sort()).toEqual(Object.keys(lendWords.en).sort());
    for (const v of [...Object.values(lendWords.zh), ...Object.values(lendWords.en)]) expect(v).not.toContain(" · ");
    expect(strings("zh").t("lend.entry")).toBe("加一台做事的电脑");
    expect(strings("en").t("lend.entry")).toBe("Add a computer for tasks");
    expect(strings("zh").t("lend.left", 9)).toBe("这个码还能用 9 分钟，只能用一次。");
    expect(strings("en").t("lend.here", "nas")).toBe("nas is here");
    expect(strings("en").t("lend.mac.app", "hel", "Let this Mac do tasks for Ducter")).toBe("Does that Mac have the Ducter app, connected to hel? On that Mac, open its own card and turn on “Let this Mac do tasks for Ducter”.");
    // The agent sentence carries the line whole, so it can be pasted as is.
    expect(strings("zh").t("lend.agent.ask", waiting.line)).toContain(waiting.line!);
  });

  test("the Mac says the same words under the same keys (once its table is there)", () => {
    const f = new URL("../../desktop/internal/i18n/lend.go", import.meta.url);
    if (!existsSync(f)) return;
    const mac = readFileSync(f, "utf8");
    // The web's own: the Mac's switch, rename and From outside words live in its other tables.
    const webOnly = new Set(["lend.mac.toggle", "lend.rename", "lend.noaddress.go"]);
    for (const lang of ["zh", "en"] as const) for (const k of Object.keys(lendWords[lang])) if (!webOnly.has(k) && !k.startsWith("add.pair.")) expect(mac).toContain(`"${k}"`);
  });
});

describe("the sheet's steps", () => {
  test("ask → asking → the line → expired; the minutes count down", () => {
    let l: LendState = {};
    expect(lendStep(l, NOW)).toBe("ask");
    l = { kind: "linux", awaiting: true };
    expect(lendStep(l, NOW)).toBe("asking");
    l = applyLend(l, waiting)!;
    expect(lendStep(l, NOW)).toBe("line");
    expect(minutesLeft(l.frame!, NOW)).toBe(10);
    expect(minutesLeft(l.frame!, NOW + 9 * 60_000 + 30_000)).toBe(1);
    expect(lendStep(l, NOW + 10 * 60_000)).toBe("expired");
  });

  test("joined, then here, on the same code only; the line is kept", () => {
    let l: LendState = applyLend({ kind: "linux", awaiting: true }, waiting)!;
    expect(applyLend(l, { ...waiting, code: "ZZZZ-ZZZZ", state: "joined", device: "x" })).toBe(l); // another window's lend
    const { line: _, ...later } = waiting;
    l = applyLend(l, { ...later, state: "joined", device: "d1", name: "nas" })!;
    expect(lendStep(l, NOW)).toBe("joined");
    expect(l.frame!.line).toBe(waiting.line);
    l = applyLend(l, { ...later, state: "here", device: "d1", name: "nas" })!;
    // here even after the code's minutes ran out
    expect(lendStep(l, NOW + 60 * 60_000)).toBe("here");
  });

  test("a waiting frame nobody here asked for is ignored; a closed sheet stays closed", () => {
    const l: LendState = { kind: "mac" };
    expect(applyLend(l, waiting)).toBe(l);
    expect(applyLend(undefined, waiting)).toBeUndefined();
  });

  // research/127: the author's Mac sat at 正在拿一个码… forever. Never an endless wait here either.
  test("no answer within the wait, or an error frame: failed, with Try again; a late code still lands", () => {
    const asked: LendState = { kind: "linux", awaiting: true, askedAt: NOW };
    expect(lendStep(asked, NOW + LEND_WAIT_MS - 1)).toBe("asking");
    expect(lendStep(asked, NOW + LEND_WAIT_MS)).toBe("failed");
    expect(lendStep(applyLend(asked, waiting)!, NOW + LEND_WAIT_MS)).toBe("line");
    const err = lendError(asked, "lend_code: lending is not available")!;
    expect(err).toMatchObject({ failed: true, awaiting: false });
    expect(lendStep(err, NOW)).toBe("failed");
    // Another frame's error, or nothing asked: untouched.
    expect(lendError(asked, "task_send: gone")).toBe(asked);
    expect(lendError({ kind: "linux" }, "lend_code: x")).toEqual({ kind: "linux" });
    const app = src("app.ts");
    expect(app).toContain('f.message.startsWith("lend_code:")');
    expect(app).toContain("LEND_WAIT_MS + 50");
    const sheet = src("lend.tsx");
    expect(sheet).toContain('step === "failed"');
    expect(sheet).toContain('"lend.retry"');
  });

  test("no address: the step that offers From outside", () => {
    const { address: _a, line: _l, check: _c, ...bare } = waiting;
    expect(lendStep(applyLend({ kind: "linux", awaiting: true }, bare)!, NOW)).toBe("noaddress");
  });

  test("here: its name, OS, arch and the agents signed in there, from Devices", () => {
    const f: LendFrame = { ...waiting, state: "here", device: "d1", name: "nas" };
    const devices = [{ id: "d1", name: "Build box", kind: "server", home: false, state: "awake", platform: "linux-x64", harnesses: [{ harness: "claude-code", installed: true, loggedIn: true }, { harness: "codex", installed: true, loggedIn: false }], abilities: [] }] as any;
    expect(arrived(f, devices)).toEqual({ id: "d1", name: "Build box", os: "linux", arch: "x64", agents: ["claude-code"] });
    expect(arrived(f, [])).toEqual({ id: "d1", name: "nas", agents: [] }); // before Devices has it
  });
});

describe("in the app", () => {
  test("lend frames reach the sheet through the app's receive", async () => {
    const { A } = await import("../src/app.ts");
    A.L = strings("en");
    A.lend = { kind: "linux", awaiting: true };
    A.receive(waiting as any);
    expect(A.lend.frame?.code).toBe("K7QM-4XPA");
    A.receive({ ...waiting, line: undefined, state: "here", device: "d1", name: "nas" } as any);
    expect(lendStep(A.lend!, NOW)).toBe("here");
    A.lend = undefined;
  });

  test("one 加一台设备 row in 你的设备's list, the sheet replaces the list, the card opens it (D358)", () => {
    const dev = src("devcard.tsx");
    expect(dev).toContain("<AddDeviceRow />");
    expect(dev).not.toContain("<LendEntry />");
    expect(dev).toContain("if (A.lend) return <LendSheet />;");
    expect(dev.indexOf("if (A.lend) return <LendSheet />;")).toBeLessThan(dev.indexOf("if (!list?.length) return null;"));
    expect(src("lend.tsx")).toContain("A.openAdd()");
    expect(src("rich.tsx")).toContain('case "lend":');
    expect(src("lend.tsx")).toContain("A.openLend()");
    // Controls only through the shared ones; no dot joins in the view.
    expect(src("lend.tsx")).not.toMatch(/" · "|' · '/);
  });

  test("the sheet's CSS uses tokens only and keeps 44-tall targets", () => {
    const css = readFileSync(new URL("../static/app.css", import.meta.url), "utf8");
    const block = css.slice(css.indexOf("/* D347: 加一台做事的电脑"));
    expect(block.length).toBeGreaterThan(100);
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(/);
    expect(block).toContain(".lend-copy .btn { flex: none; min-height: 44px; }");
  });
});
