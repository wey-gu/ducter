// D664: one Nowledge Mem setup for Memory and Agent messaging, its steps live. The steps read the
// facts core sends (mem-setup-view.ts); the next undone step carries its one action, and every step
// after it is "later" and claims nothing; all done, the group is one calm line naming the home. A
// look again runs when a pane opens, when the person comes back, and on 再看一次, held to once in
// MEM_LOOK_MS, and the home's settings frame ends the spinner. Both panes draw the one component.
// The Mac draws the same (apps/desktop/internal/views/memsetup_test.go).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BridgeView, MemView } from "@ducter/protocol";
import { memSetup, type MemSetupView, type SetupStep } from "../src/mem-setup-view.ts";
import { strings, TABLES } from "../src/i18n.ts";

const b = (x: Partial<BridgeView> = {}): BridgeView => ({ state: "ready", identity: "ducter", home: "hel", version: "0.10.125", where: "cloud", space: { id: "p", label: "Only me" }, ...x });
const mem = (x: Partial<MemView> = {}): MemView => ({ state: "connected", noted: [], keptUnder: "小满", health: {}, ...x });
const O = { home: "hel", partner: "小满" };
const looks = (v: MemSetupView) => v.steps.map((s) => `${s.id}:${s.look}`);
const next = (v: MemSetupView): SetupStep => v.steps.find((s) => s.look !== "done")!;
const src = (f: string) => readFileSync(join(import.meta.dir, "../src", f), "utf8");

describe("the steps, from the facts", () => {
  test("no nmem on the home: install is next, with Ducter's own install when it can", () => {
    const v = memSetup(undefined, b({ state: "install_mem", canRun: true, version: undefined, space: undefined }), O);
    expect(looks(v)).toEqual(["nmem:now", "signin:later", "name:later"]);
    expect(next(v)).toMatchObject({ act: "install", label: "bridge.mem.install.go" });
    expect(v.done).toBe(false);
    expect(v.head).toEqual({ key: "memsetup.head.left", args: ["3"] });
  });

  test("no nmem and a missing tool: the line to copy, looked at again when the person comes back", () => {
    const v = memSetup(undefined, b({ state: "install_mem", cmd: "brew install pipx", version: undefined, space: undefined }), O);
    expect(next(v)).toMatchObject({ id: "nmem", look: "now", act: "copy", cmd: "brew install pipx", line: { key: "memsetup.nmem.run", args: ["hel"] } });
    // No tool to name: the one step in words, then 再看一次.
    expect(next(memSetup(undefined, b({ state: "install_mem", version: undefined, space: undefined }), O))).toMatchObject({ act: "check_again", line: { key: "memsetup.nmem.how" } });
    // An install that failed says so, with the installer's words behind 细节, and tries again.
    expect(next(memSetup(undefined, b({ state: "install_mem", canRun: true, detail: "ERROR: boom", version: undefined }), O))).toMatchObject({ look: "failed", act: "install", label: "bridge.retry", detail: "ERROR: boom" });
  });

  test("an old nmem: the step fails with its version, and Update when Ducter can run it", () => {
    const v = memSetup(undefined, b({ state: "update_mem", version: "0.10.116", canRun: true }), O);
    expect(next(v)).toMatchObject({ id: "nmem", look: "failed", title: { key: "mem.update.needed" }, act: "update", line: { key: "bridge.mem.update", args: ["hel", "0.10.116", "0.10.118"] } });
    expect(v.tone).toBe("bad");
    expect(v.head.key).toBe("memsetup.head.failed");
    // The Nowledge Mem app's own copy: its line, and 再看一次 once the person updated it there.
    expect(next(memSetup(undefined, b({ state: "update_mem", need: "app" }), O))).toMatchObject({ act: "check_again", line: { key: "bridge.update" } });
    // Mem's doctor says this nmem is too old to tell (D375): the same step, the table's action.
    expect(next(memSetup(mem({ health: { issue: "old" } }), b({ canRun: true }), O))).toMatchObject({ id: "nmem", look: "failed", act: "update" });
  });

  test("signed out: a first sign-in is next with the account link; a lapsed one fails with how to get a link", () => {
    const first = memSetup(undefined, b({ state: "sign_in", space: undefined }), O);
    expect(looks(first)).toEqual(["nmem:done", "signin:now", "name:later"]);
    expect(next(first)).toMatchObject({ act: "sign_in", account: true, line: { key: "bridge.mem.signin", args: ["hel"] } });
    expect(next(memSetup(undefined, b({ state: "sign_in", signIn: "used" }), O))).toMatchObject({ look: "failed", why: { key: "bridge.mem.signin.used" } });
    const lapsed = memSetup(mem({ health: { issue: "signed_out" } }), b(), O);
    expect(next(lapsed)).toMatchObject({ id: "signin", look: "failed", act: "sign_in", also: { key: "mem.health.resign.how" } });
    // Out of reach: the home's line and 再看一次.
    expect(next(memSetup(mem({ health: { issue: "unreachable" } }), b(), O))).toMatchObject({ id: "signin", look: "failed", act: "check_again", title: { key: "mem.health.unreachable", args: ["hel"] } });
  });

  test("the app closed: the first step fails with Open where the home can, else where to open it", () => {
    expect(next(memSetup(undefined, b({ state: "mem_closed", canOpen: true }), O))).toMatchObject({ id: "nmem", look: "failed", act: "open_mem" });
    expect(next(memSetup(undefined, b({ state: "mem_closed" }), O))).toMatchObject({ act: "check_again", line: { key: "bridge.mem.closed.there", args: ["hel"] } });
  });

  test("no Space: on Agent messaging the place fails with 再看一次; on Memory it is not a step", () => {
    const peers = memSetup(mem(), b({ state: "no_space", space: undefined }), { ...O, mailbox: true });
    expect(looks(peers)).toEqual(["nmem:done", "signin:done", "space:failed", "mailbox:later", "name:later"]);
    expect(next(peers)).toMatchObject({ act: "check_again", title: { key: "bridge.no_space.title" } });
    const memory = memSetup(mem(), b({ state: "no_space", space: undefined }), O);
    expect(memory.steps.map((s) => s.id)).toEqual(["nmem", "signin", "name"]);
    // Mem on this computer offers no place for agents: the table's 再试一次 on Agent messaging.
    expect(next(memSetup(mem(), b({ state: "local_mem", space: undefined }), { ...O, mailbox: true }))).toMatchObject({ id: "space", act: "connect", label: "bridge.retry" });
  });

  test("ready: Memory is all done, one calm line naming the home; each done step says its fact", () => {
    const v = memSetup(mem(), b(), O);
    expect(v.done).toBe(true);
    expect(v.head).toEqual({ key: "memsetup.done", args: ["hel"] });
    expect(v.tone).toBe("done");
    expect(v.steps.map((s) => [s.id, s.line])).toEqual([
      ["nmem", { key: "memsetup.nmem.version", args: ["hel", "0.10.125"] }],
      ["signin", { key: "mem.app.kept.cloud", args: [] }],
      ["space", { key: "memsetup.space.line", args: ["Only me"] }],
      ["name", { key: "memsetup.name.line", args: [] }],
    ]);
    expect(v.steps.at(-1)!.title).toEqual({ key: "memsetup.name.done", args: ["小满"] });
  });

  test("Bridge not ready: the mailbox step joins by itself, fails with the table's words, is done when connected", () => {
    const joining = memSetup(mem(), b(), { ...O, mailbox: true });
    expect(next(joining)).toMatchObject({ id: "mailbox", look: "busy", act: "none", line: { key: "peers.joining", args: ["小满"] } });
    const refused = memSetup(mem(), b({ state: "refused", reason: "authority_missing" }), { ...O, mailbox: true });
    expect(next(refused)).toMatchObject({ id: "mailbox", look: "failed", act: "connect", label: "bridge.retry", title: { key: "bridge.refused.authority_missing.title" }, fact: { key: "bridge.refused.detail", args: ["ducter"] } });
    expect(next(memSetup(mem(), b({ state: "refused", reason: "conflict" }), { ...O, mailbox: true }))).toMatchObject({ act: "none" });
    // A newer Mem is one quiet line, never a second button.
    expect(next(memSetup(mem(), b({ state: "failed", detail: "x", newer: "0.10.126" }), { ...O, mailbox: true, why: "x" }))).toMatchObject({ also: { key: "peers.mem.newer" }, act: "connect" });
    const on = memSetup(mem(), b({ state: "connected" }), { ...O, mailbox: true });
    expect(on.done).toBe(true);
    expect(looks(on)).toEqual(["nmem:done", "signin:done", "space:done", "mailbox:done", "name:done"]);
  });

  test("nothing after the next step pretends to be done: later steps carry no line of state and no action", () => {
    // Signed in in fact, but the nmem before it is too old: the later steps say only what they are.
    const v = memSetup(mem(), b({ state: "update_mem", version: "0.10.100", canRun: true, space: { id: "p", label: "Only me" } }), { ...O, mailbox: true });
    const later = v.steps.slice(1);
    expect(later.every((s) => s.look === "later" && s.act === "none")).toBe(true);
    expect(later.map((s) => s.title.key)).toEqual(["mem.step.signin", "memsetup.space", "memsetup.mailbox", "memsetup.name"]);
    // D554: the sign-in says it needs an account even before its turn (a line, not a state).
    expect(later[0]!.line).toEqual({ key: "mem.step.account", args: ["hel"] });
    expect(later.slice(1).every((s) => !s.line)).toBe(true);
  });

  test("a look again: the next step's mark is the spinner, its words and action stay; a done setup shows none", () => {
    const v = memSetup(undefined, b({ state: "sign_in" }), { ...O, checking: true });
    expect(next(v)).toMatchObject({ id: "signin", look: "now", checking: true, act: "sign_in" });
    expect(memSetup(mem(), b(), { ...O, checking: true }).steps.some((s) => s.checking)).toBe(false);
  });

  test("no bridge view (memory only): Mem's own answer is the fact", () => {
    expect(memSetup(mem(), undefined, O).done).toBe(true);
    expect(next(memSetup(mem({ state: "missing", keptUnder: undefined }), undefined, O))).toMatchObject({ id: "nmem", act: "check_again", line: { key: "memsetup.nmem.unseen", args: ["hel"] } });
  });
});

describe("the words", () => {
  const STATES: [MemView | undefined, BridgeView | undefined, boolean][] = [
    [undefined, b({ state: "install_mem", canRun: true }), true],
    [undefined, b({ state: "install_mem", cmd: "x" }), false],
    [undefined, b({ state: "install_mem" }), true],
    [undefined, b({ state: "installing" }), true],
    [undefined, b({ state: "update_mem", version: "0.10.1", canRun: true }), false],
    [undefined, b({ state: "updating", upkeep: { kind: "move" } }), true],
    [undefined, b({ state: "mem_closed", canOpen: true }), false],
    [undefined, b({ state: "sign_in", signIn: "bad" }), true],
    [undefined, b({ state: "signing_in" }), false],
    [mem({ health: { issue: "signed_out" } }), b(), true],
    [mem({ health: { issue: "unreachable" } }), b(), false],
    [mem({ keptUnder: undefined }), b({ state: "no_space", space: undefined }), true],
    [mem(), b({ state: "local_mem", space: undefined }), true],
    [mem({ keptUnder: undefined }), b(), false],
    [mem(), b({ state: "connecting" }), true],
    [mem(), b({ state: "ready", asks: true }), true],
    [mem(), b({ state: "unconfirmed" }), true],
    [mem(), b({ state: "connected" }), true],
    [mem({ state: "missing", keptUnder: undefined }), undefined, false],
  ];
  test("every line in both languages is real words: no key, no format slip, no emoji, no joined facts", () => {
    for (const [m, v, mailbox] of STATES)
      for (const checking of [false, true]) {
        const s = memSetup(m, v, { ...O, mailbox, checking });
        for (const lang of ["zh", "en"] as const) {
          const L = strings(lang);
          for (const w of [s.head, ...s.steps.flatMap((x) => [x.title, x.line, x.why, x.also, x.fact].filter(Boolean))] as { key: string; args: string[] }[]) {
            const text = L.t(w.key, ...w.args);
            const tag = `${v?.state ?? "none"} ${lang} ${w.key}`;
            expect([tag, text === w.key || text.includes("%!") || text.includes("%s") || / · /.test(text) || /\p{Extended_Pictographic}/u.test(text)]).toEqual([tag, false]);
          }
          for (const x of s.steps) {
            expect([lang, x.look, L.t(`memsetup.look.${x.look}`) !== `memsetup.look.${x.look}`]).toEqual([lang, x.look, true]);
            if (x.label) expect([lang, x.label, L.t(x.label) !== x.label]).toEqual([lang, x.label, true]);
          }
        }
      }
  });

  test("every memsetup key is in zh and en, and the Mac's table is the same", () => {
    const keys = Object.keys(TABLES.zh).filter((k) => k.startsWith("memsetup."));
    expect(keys.length).toBeGreaterThan(25);
    for (const k of keys) expect([k, typeof TABLES.en[k]]).toEqual([k, "string"]);
    const mac = readFileSync(join(import.meta.dir, "../../desktop/internal/i18n/memory.go"), "utf8");
    for (const k of keys) expect([k, mac.includes(JSON.stringify(TABLES.zh[k]!)), mac.includes(JSON.stringify(TABLES.en[k]!))]).toEqual([k, true, true]);
  });
});

describe("one component, live", () => {
  test("Memory and Agent messaging draw the one MemSetup; no other Mem steps are left", () => {
    const memory = src("memory.tsx");
    expect(memory).toContain('import { failedWhy, MemSetup, memSetupNow } from "./mem-setup.tsx";');
    const page = memory.slice(memory.indexOf("export function PeersPage"));
    expect(page).toContain("<MemSetup\n          mailbox");
    expect(page).toContain("<MemSetup mailbox />");
    expect(memory).toMatch(/function MemLink[\s\S]*?<MemSetup\n/);
    expect(memory).toMatch(/function MemFirst[\s\S]*?<MemSetup\n/);
    expect(memory).not.toMatch(/function (MemSteps|MemClosed|MemHealthHead|MemProblemRow)\b/);
    expect(memory).not.toContain("chat-steps");
    // The steps are drawn only by the shared SetupStep.
    expect(src("mem-setup.tsx")).toContain("<SetupStep ");
    expect(src("controls.tsx")).toContain("export function SetupStep(");
  });

  test("a look again: when a pane opens, held to once in MEM_LOOK_MS unless tapped; the home's frame ends the spinner", async () => {
    const { A, MEM_LOOK_MS } = await import("../src/app.ts");
    A.L = strings("en");
    const sent: unknown[] = [];
    const send = A.send;
    (A as any).send = (f: unknown) => sent.push(f);
    const now = Date.now;
    let clock = 10_000_000;
    Date.now = () => clock;
    (A as any).memLookedAt = 0; // whatever an earlier file's pane did on the real clock
    try {
      A.lookAtMemSetup();
      expect(sent.at(-1)).toEqual({ t: "mem_health", setup: true });
      expect(A.memChecking).toBe(true);
      A.applySettings({ t: "settings", settings: { memory: true } as never, mem: mem(), bridge: b() } as never);
      expect(A.memChecking).toBe(false);
      const n = sent.length;
      clock += 1_000;
      A.lookAtMemSetup(); // the person came back a second later: no second look
      expect(sent.length).toBe(n);
      A.lookAtMemSetup(true); // 再看一次: always
      expect(sent.length).toBe(n + 1);
      clock += MEM_LOOK_MS;
      A.lookAtMemSetup();
      expect(sent.length).toBe(n + 2);
    } finally {
      Date.now = now;
      (A as any).send = send;
      A.memChecking = false;
    }
  });

  test("the component looks again on open and on coming back (focus, visibility), and stops when it goes", () => {
    const s = src("mem-setup.tsx");
    expect(s).toMatch(/useEffect\(\(\) => \{\s*A\.lookAtMemSetup\(\);/);
    expect(s).toContain('addEventListener("focus", back)');
    expect(s).toContain('document.addEventListener("visibilitychange", back)');
    expect(s).toContain('removeEventListener("focus", back)');
    expect(s).not.toMatch(/setInterval/);
  });
});
