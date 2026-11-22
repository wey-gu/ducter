// D480: an agent's Nowledge Mem mailbox, its Space chosen in place. Mem's passive setup lists the
// Spaces and picks none (its rule); Ducter recommends the Space its partner listens in, the person's
// tap chooses, and the task that opens it is told that exact Space, so it never asks for a name.
// An agent whose computer talks to another Mem server than the partner's is said as a fact.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mailboxChoice, memApart, memHost, type TaskCard } from "@ducter/protocol";
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

describe("two Mems are a fact both sides said (D480)", () => {
  test("hosts from Mem's API URLs; apart only when both are known and differ", () => {
    expect(memHost("https://cloud.nowledge.co/remote-api")).toBe("cloud.nowledge.co");
    expect(memHost("http://127.0.0.1:14242")).toBe("127.0.0.1:14242");
    expect(memHost("not a url")).toBeUndefined();
    expect(memApart("cloud.nowledge.co", "hel.siwei.info")).toBe(true);
    expect(memApart("hel.siwei.info", "hel.siwei.info")).toBe(false);
    expect(memApart(undefined, "hel.siwei.info")).toBe(false);
    expect(memApart("cloud.nowledge.co", undefined)).toBe(false);
  });
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
    expect(got).toEqual({ signedIn: true, server: "cloud.nowledge.co", backend: "cloud", setup: { state: "selection_needed", candidates: SETUP.candidates } });
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
  test("same Mem: the Spaces, the partner's suggested", async () => {
    const { mp } = make({ signedIn: true, server: "hel.siwei.info", setup: SETUP });
    const look = await mp.mailboxLook("mac", "claude-code", { space: "personal-4e74", server: "hel.siwei.info" });
    expect(look.state).toBe("choose");
    expect(look.recommend).toBe("personal-4e74");
    expect(look.spaces?.length).toBe(6);
    mp.stop();
  });
  test("another Mem: said, with no Spaces to pick (none would reach the partner)", async () => {
    const { mp } = make({ signedIn: true, server: "cloud.nowledge.co", setup: SETUP });
    expect(await mp.mailboxLook("mac", "claude-code", { space: "personal-4e74", server: "hel.siwei.info" })).toEqual({ state: "apart", theirs: "cloud.nowledge.co", ours: "hel.siwei.info" });
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
  test("a closed mailbox and another Mem, as facts, with where the person fixes them", () => {
    const s = renderAgentMail([
      { harness: "claude-code", box: "closed" },
      { harness: "codex", device: "MacBook Pro M3", apart: { theirs: "cloud.nowledge.co", ours: "hel.siwei.info" } },
    ]);
    expect(s).toContain("Claude Code: Nowledge Mem lists its mailbox closed");
    expect(s).toContain("Codex on MacBook Pro M3: that computer's own Nowledge Mem is cloud.nowledge.co, yours is hel.siwei.info");
    expect(s).toContain("Never promise a reply");
    expect(s).toContain("never ask them to type a Space name");
    expect(renderAgentMail([])).toBe("");
  });
});
