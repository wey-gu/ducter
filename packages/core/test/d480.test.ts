// D480: an agent's Nowledge Mem mailbox, its Space chosen in place. Mem's passive setup lists the
// Spaces and picks none (its rule); Ducter recommends the Space its partner listens in, the person's
// tap chooses, and the task that opens it is told that exact Space, so it never asks for a name.
// Round 2: nothing compares Mem servers (the home's relay is the same Mem as the cloud behind it).
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mailboxChoice, type TaskCard } from "@ducter/protocol";
import { inspectMemBridge, type MemBridgeLook } from "@ducter/protocol/src/mem-plugins.ts";
import { renderAgentMail } from "../../partner/src/partner.ts";
import { createMemPlugins, memSetupBrief } from "../src/mem-plugins.ts";

// The author's Spaces as nmem 0.10.122's passive `bridge setup` listed them (2026-11-22).
const SETUP = {
  state: "selection_needed",
  candidates: [
    { id: "default", label: "Before the team", kind: "default", readers: 6, write_default: false },
    { id: "all", label: "Everyone", kind: "commons", readers: 10, write_default: false },
    { id: "codex", label: "Codex", kind: "team", readers: 7, write_default: false },
    { id: "dev-team", label: "dev team", kind: "team", readers: 7, write_default: false },
    { id: "personal-4e74", label: "Only me", kind: "personal", readers: 1, write_default: true },
    { id: "userfiles", label: "userFiles", kind: "team", readers: 8, write_default: false },
  ],
};

describe("the choice is Mem's list, with Ducter's suggestion first (D480)", () => {
  test("the partner's own Space is suggested and marked; the widest audiences go last", () => {
    const c = mailboxChoice(SETUP, "personal-4e74");
    expect(c.recommend).toBe("personal-4e74");
    expect(c.spaces[0]).toEqual({ id: "personal-4e74", label: "Only me", kind: "personal", readers: 1, partner: true });
    expect(c.spaces.map((s) => s.id)).toEqual(["personal-4e74", "codex", "dev-team", "userfiles", "default", "all"]);
  });
  test("without the partner's Space in the list, Mem's personal one is suggested (by its kind, never its label)", () => {
    expect(mailboxChoice(SETUP, "elsewhere").recommend).toBe("personal-4e74");
    const renamed = { candidates: SETUP.candidates.map((c) => (c.kind === "personal" ? { ...c, label: "Mine" } : c)) };
    expect(mailboxChoice(renamed).recommend).toBe("personal-4e74");
    // No personal kind at all: nothing is suggested, and nothing is chosen for the person.
    expect(mailboxChoice({ candidates: SETUP.candidates.filter((c) => c.kind !== "personal") }).recommend).toBeUndefined();
  });
  test("a broken answer is an empty choice, never a guess", () => {
    expect(mailboxChoice(undefined)).toEqual({ spaces: [] });
    expect(mailboxChoice({ candidates: [{ label: "no id" }, null, 3] }).spaces).toEqual([]);
  });
});

describe("the look on that computer (D480)", () => {
  test("the look on a computer runs only nmem's status and the passive setup, and passes on state and Spaces only", async () => {
    const ran: string[][] = [];
    const exec = async (argv: string[]) => {
      ran.push(argv.slice(1));
      if (argv.includes("status")) return { code: 0, out: JSON.stringify({ status: "ok", api_url: "https://cloud.nowledge.co/remote-api", backend: "cloud" }) };
      return { code: 0, out: JSON.stringify({ ...SETUP, detail: "No identity, credential or mailbox was created.", note: "x" }) };
    };
    const got = await inspectMemBridge(exec);
    expect(ran).toEqual([["--json", "status"], ["--json", "bridge", "setup"]]);
    expect(ran.flat()).not.toContain("--enable");
    // Round 2: no server is passed on (an API URL names a relay as readily as a Mem).
    expect(got).toEqual({ signedIn: true, setup: { state: "selection_needed", candidates: SETUP.candidates } });
    // Not signed in: the setup isn't asked.
    const out = await inspectMemBridge(async () => ({ code: 1, out: "" }));
    expect(out).toEqual({ signedIn: false });
    expect(await inspectMemBridge(async () => ({ code: 127, out: "" }))).toBeUndefined();
  });
});

describe("the look and the open, in core (D480)", () => {
  let dir: string;
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "ducter-d480-"))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const make = (look: MemBridgeLook | "old" | undefined, awake = true) => {
    const opened: any[] = [];
    const log = { read: () => [], append: (e: any) => e, subscribe: () => () => {} };
    const mp = createMemPlugins({
      dataDir: dir,
      log: log as any,
      tasks: { get: () => undefined, list: () => [] } as any,
      persona: { id: "p" },
      runner: () => ({ openTask: async (i: any) => (opened.push(i), { taskId: `tsk${opened.length}` } as TaskCard) }) as any,
      on: () => true,
      lang: () => "zh",
      inspectLocal: async () => undefined,
      inspectWorker: async () => undefined,
      devices: async () => [
        { id: "local", name: "hel", home: true, awake: true, harnesses: [] },
        { id: "mac", name: "MacBook Pro M3", home: false, awake, harnesses: [{ harness: "claude-code", installed: true, loggedIn: true }] },
      ],
      bridgeLook: async () => look,
      everyMs: 0,
    });
    return { mp, opened };
  };
  test("the author's case: the Spaces, the partner's suggested, never another Mem", async () => {
    const { mp } = make({ signedIn: true, setup: SETUP });
    const look = await mp.mailboxLook("mac", "claude-code", { space: "personal-4e74" });
    expect(look.state).toBe("choose");
    expect(look.recommend).toBe("personal-4e74");
    expect(look.spaces?.length).toBe(6);
    mp.stop();
  });
  test("away, too old, not signed in", async () => {
    let m = make(undefined, false);
    expect((await m.mp.mailboxLook("mac", "claude-code", {})).state).toBe("away");
    m.mp.stop();
    m = make("old");
    expect((await m.mp.mailboxLook("mac", "claude-code", {})).state).toBe("old");
    m.mp.stop();
    m = make({ signedIn: false });
    expect((await m.mp.mailboxLook("mac", "claude-code", {})).state).toBe("no_mem");
    m.mp.stop();
  });
  test("the open names the chosen Space by its id, so the task never asks which", async () => {
    const { mp, opened } = make({ signedIn: true, setup: SETUP });
    const r = await mp.install("mac", "claude-code", "mailbox", { id: "personal-4e74", label: "Only me" });
    expect(r.ok).toBe(true);
    expect(opened[0].brief).toContain("--space-id personal-4e74");
    expect(opened[0].brief).toContain("never ask which Space");
    expect(opened[0].brief).toContain("If Mem refuses that Space, stop and report");
    mp.stop();
  });
  test("the brief without a chosen Space stays D470's", () => {
    const b = memSetupBrief({ agent: "Claude Code", host: "claude-code", device: "Mac", lang: "en", what: { kind: "mailbox" } });
    expect(b).not.toContain("--space-id");
    expect(b).toContain("--enable");
  });
});

describe("the partner is told what can't arrive (D480)", () => {
  test("a closed mailbox as a fact, the one Mem and the relay said truthfully, and where the person fixes it", () => {
    const s = renderAgentMail([{ harness: "claude-code", box: "closed" }]);
    expect(s).toContain("Claude Code: Nowledge Mem lists its mailbox closed");
    expect(s).toContain("share one Nowledge Mem");
    expect(s).toContain("through Ducter's relay on the home: the same Mem, not another one");
    expect(s).not.toMatch(/two different|another server|hel\.siwei|cloud\.nowledge/);
    expect(s).toContain("Never promise a reply");
    expect(s).toContain("never ask them to type a Space name");
    expect(renderAgentMail([])).toBe("");
  });
});
