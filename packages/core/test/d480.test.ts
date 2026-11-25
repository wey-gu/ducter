// D480: an agent's Nowledge Mem mailbox, its Space chosen in place. Mem's passive setup lists the
// Spaces and picks none (its rule); Ducter recommends the Space its partner listens in, the person's
// tap chooses, and the task that opens it is told that exact Space, so it never asks for a name.
// Round 2: nothing compares Mem servers (the home's relay is the same Mem as the cloud behind it).
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agentBack, mailboxChoice, memSessions, type TaskCard } from "@ducter/protocol";
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
  test("D560: no task opens a mailbox any more; an older app's tap is the plugin's update or nothing", async () => {
    const { mp, opened } = make({ signedIn: true, setup: SETUP });
    const r = await mp.install("mac", "claude-code", "mailbox", { id: "all", label: "Everyone" });
    expect(r).toEqual({ ok: false, reason: "unknown" });
    expect(opened).toEqual([]);
    // No brief ever asks for --enable: the login's own mailbox is not what an agent's sessions read.
    expect(memSetupBrief({ agent: "Claude Code", host: "claude-code", device: "Mac", lang: "en", what: { kind: "update", from: "0.7.20", to: "0.7.38" } })).not.toContain("--enable");
    mp.stop();
  });
});

describe("the partner is told what can't arrive, and what needs nothing (D560)", () => {
  test("the next session: the truth, and nothing to send the person to", () => {
    const s = renderAgentMail([{ harness: "claude-code", back: "next", version: "0.7.38" }], "zh");
    expect(s).toContain("Claude Code: its Nowledge Mem plugin (0.7.38) gets each new Claude Code session ready to receive by itself");
    expect(s).toContain("from the next Claude Code session the person opens");
    expect(s).toContain("no Space to choose, no task to open");
    expect(s).toContain("never send the person to Settings for something these facts say needs nothing from them");
    expect(s).not.toContain("让它也能收到我的回话");
    expect(s).toContain("share one Nowledge Mem");
    expect(s).toContain("through Ducter's relay on the home: the same Mem, not another one");
    expect(s).not.toMatch(/two different|another server|hel\.siwei|cloud\.nowledge|mailbox closed/);
  });
  test("an old plugin: its update is the fix, named by the button's own words", () => {
    const s = renderAgentMail([{ harness: "codex", back: "old", version: "0.1.40", update: true }], "zh");
    expect(s).toContain("Codex: its Nowledge Mem plugin (0.1.40) is older than the one that lets its sessions receive (0.1.50)");
    expect(s).toContain('"让它也能收到我的回话" under it in 设置 › ');
    expect(renderAgentMail([{ harness: "codex", back: "old" }], "en")).toContain("Nowledge Mem hasn't offered a newer one there yet");
    expect(renderAgentMail([])).toBe("");
  });
});

describe("whether replies reach an agent, from Mem's facts only (D560)", () => {
  test("the plugin's version says whether its sessions get ready by themselves", () => {
    expect(memSessions("claude-code", "0.7.38")).toBe("auto");
    expect(memSessions("claude-code", "0.7.35")).toBe("auto");
    expect(memSessions("claude-code", "0.7.34")).toBe("old");
    expect(memSessions("codex", "0.1.53")).toBe("auto");
    expect(memSessions("codex", "0.1.9")).toBe("old");
    expect(memSessions("antigravity", "0.1.7")).toBeUndefined();
    expect(memSessions("claude-code", undefined)).toBeUndefined();
  });
  test("hel, 2026-11-25: Claude Code 0.7.38 and no session connected yet reads as the next session, never closed", () => {
    expect(agentBack("claude-code", { versions: ["0.7.38"] })).toBe("next");
    expect(agentBack("claude-code", { open: true, versions: ["0.7.38"] })).toBe("yes");
    expect(agentBack("claude-code", { heard: true, versions: [] })).toBe("yes");
    expect(agentBack("codex", { versions: ["0.1.40", undefined] })).toBe("old");
    expect(agentBack("codex", { versions: ["0.1.40", "0.1.53"] })).toBe("next");
    expect(agentBack("antigravity", { versions: ["0.1.7"] })).toBe("unknown");
  });
});

// D576: pi's Mem plugin carries Bridge itself from 0.8.20 (its `bridge` skill; research/226 §5). It prepares
// no session and Mem lists no connection for it, so its version is the fact; older passes no message at all.
describe("pi, a full peer from its plugin (D576)", () => {
  test("0.8.20 reads yes with no session to wait for; older is its update", () => {
    expect(memSessions("pi", "0.8.20")).toBe("auto");
    expect(memSessions("pi", "0.8.19")).toBe("old");
    expect(agentBack("pi", { versions: ["0.8.20"] })).toBe("yes");
    expect(agentBack("pi", { versions: ["0.8.21"] })).toBe("yes");
    expect(agentBack("pi", { versions: ["0.8.19"] })).toBe("old");
    expect(agentBack("pi", { versions: [undefined] })).toBe("unknown");
  });
  test("the partner hears an older pi can't write either, and the button that fixes it", () => {
    const s = renderAgentMail([{ harness: "pi", back: "old", version: "0.8.19", update: true }], "zh");
    expect(s).toContain("older than the one that carries Nowledge Bridge (0.8.20)");
    expect(s).toContain("can't write to you or read your replies yet");
    expect(s).toContain('"让它能和我传话"');
    expect(s).not.toContain("让它也能收到我的回话");
  });
  let dir: string;
  beforeEach(() => (dir = mkdtempSync(join(tmpdir(), "ducter-d576-"))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  test("Mem's check doesn't list pi: an older plugin reads update to 0.8.20 all the same, and the tap opens the update", async () => {
    const opened: any[] = [];
    const log = { read: () => [], append: (e: any) => e, subscribe: () => () => {} };
    const mp = createMemPlugins({
      dataDir: dir,
      log: log as any,
      tasks: { get: () => undefined, list: () => [] } as any,
      persona: { id: "p" },
      runner: () => ({ openTask: async (i: any) => (opened.push(i), { taskId: `tsk${opened.length}` } as TaskCard) }) as any,
      on: () => true,
      lang: () => "en",
      inspectLocal: async () => ({ pi: { state: "installed", version: "0.8.19" }, "claude-code": { state: "installed", version: "0.7.38" } }),
      inspectWorker: async () => undefined,
      devices: async () => [{ id: "local", name: "Mac", home: true, awake: true, harnesses: [{ harness: "pi", installed: true, loggedIn: true }, { harness: "claude-code", installed: true, loggedIn: true }] }],
      checkUpdates: async () => ({ "claude-code": "0.7.38" }),
      everyMs: 0,
    });
    await mp.check("local");
    expect(mp.lines("pi").map((x) => x.line)).toMatchObject([{ state: "update", version: "0.8.19", available: "0.8.20" }]);
    expect(mp.lines("claude-code").map((x) => x.line.state)).toEqual(["installed"]);
    const r = await mp.install("local", "pi");
    expect(r.ok).toBe(true);
    expect(opened.length).toBe(1);
    expect(JSON.stringify(opened[0])).toContain("from 0.8.19 to 0.8.20");
    mp.stop();
  });
});
