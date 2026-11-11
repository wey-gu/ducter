// D185 and D186: the New task sheet starts work now, at a time, on a schedule, when something
// happens or until it holds; ⇧⌘↩ keeps the sheet for the next one; a folder place is a place.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { strings } from "../src/i18n.ts";
import { starts } from "../src/i18n-starts.ts";

const options = {
  t: "task_new_options",
  places: [
    { place: { kind: "repo", device: "local", repoPath: "/r/ducter" }, name: "ducter", defaultBranch: "main", branches: ["main", "release/0.0.1"] },
    { place: { kind: "folder", device: "local", path: "/r/notes" }, name: "notes", added: true },
    { place: { kind: "none" }, name: "" },
  ],
  candidates: [
    { harness: "claude-code", model: "opus", reason: { kind: "fit" } },
    { harness: "codex", reason: { kind: "fast" } },
  ],
} as any;

async function sheet() {
  const { A } = await import("../src/app.ts");
  A.L = strings("en");
  const sent: any[] = [];
  A.send = (f) => void sent.push(f);
  A.S.welcomed = true;
  A.status = "connected";
  A.openNewTask();
  A.receive(options);
  return { A, sent };
}

describe("New task: when it starts (D185)", () => {
  test("now sends no when; a time, a schedule, a wait and a loop say theirs", async () => {
    const { A, sent } = await sheet();
    A.nt.words = "Ship 0.4.1.";
    A.startNewTask();
    expect(sent.at(-1).when).toBeUndefined();
    A.receive({ t: "task_new_result", ok: false, clientId: sent.at(-1).clientId, reason: "offline" } as any);

    A.nt.when = "at";
    A.nt.atDay = 1;
    A.nt.atTime = "9.30";
    A.startNewTask();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(sent.at(-1).when).toMatchObject({ kind: "at", time: "09:30", date: `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}` });
    A.receive({ t: "task_new_result", ok: false, clientId: sent.at(-1).clientId, reason: "past" } as any);
    expect(A.nt.err).toBe("That time has already passed.");

    A.nt.when = "every";
    A.nt.every = 2;
    A.nt.weekday = 1;
    A.nt.atTime = "9";
    A.startNewTask();
    expect(sent.at(-1).when).toMatchObject({ kind: "every", every: "week", days: [1], time: "09:00" });
    A.receive({ t: "task_new_result", ok: false, clientId: sent.at(-1).clientId, reason: "failed" } as any);

    A.nt.every = 3;
    A.nt.hours = 1;
    A.startNewTask();
    expect(sent.at(-1).when).toMatchObject({ kind: "every", every: "hours", hours: 2, time: "00:00" });
    A.receive({ t: "task_new_result", ok: false, clientId: sent.at(-1).clientId, reason: "failed" } as any);

    // A bad time, and a wait with nothing to wait for, are said before anything is sent.
    A.nt.every = 0;
    A.nt.atTime = "25:00";
    const n = sent.length;
    expect(A.startNewTask()).toBe(false);
    expect(A.nt.err).toBe("Write the time like 9:00.");
    A.nt.when = "when";
    A.nt.condition = "  ";
    expect(A.startNewTask()).toBe(false);
    expect(A.nt.err).toBe("Say what it waits for, or what it keeps going until.");
    expect(sent.length).toBe(n);

    A.nt.condition = "PR #1592's CI passes";
    A.startNewTask();
    expect(sent.at(-1).when).toEqual({ kind: "when", condition: "PR #1592's CI passes" });
    A.receive({ t: "task_new_result", ok: false, clientId: sent.at(-1).clientId, reason: "failed" } as any);
    A.nt.when = "until";
    A.nt.condition = "every test passes";
    A.startNewTask();
    expect(sent.at(-1).when).toEqual({ kind: "until", condition: "every test passes" });
    A.receive({ t: "task_new_result", ok: false, clientId: sent.at(-1).clientId, reason: "failed" } as any);
    A.nt.words = "";
    A.nt.when = "";
  });

  test("a schedule closes the sheet on On hand; ⇧⌘↩ keeps it, empty, saying what started", async () => {
    const g = globalThis as any;
    const had = { location: g.location, history: g.history, scrollTo: g.scrollTo };
    g.location = { hash: "", pathname: "/" };
    g.history = { pushState: (_: unknown, __: string, h: string) => void (g.location.hash = h) };
    g.scrollTo = () => {};
    try {
      const { A, sent } = await sheet();
      A.nt.words = "Check the nightly.";
      A.nt.when = "every";
      A.nt.every = 1;
      A.startNewTask(true);
      A.receive({ t: "task_new_result", ok: true, clientId: sent.at(-1).clientId, routineId: "rt1", routine: { routineId: "rt1", name: "Check the nightly", triggerWords: "Weekdays 9:00 · follows your time zone" } } as any);
      expect(A.sheet).toEqual({ kind: "newtask" });
      expect(A.nt.words).toBe("");
      expect(A.nt.started).toBe("Scheduled: Weekdays 9:00 · follows your time zone · “Check the nightly”");
      expect(A.nt.when).toBe("every"); // the next one starts the same way
      A.nt.words = "Check the nightly again.";
      A.startNewTask();
      A.receive({ t: "task_new_result", ok: true, clientId: sent.at(-1).clientId, routineId: "rt2", routine: { routineId: "rt2", name: "x", triggerWords: "y" } } as any);
      expect(A.sheet).toBeNull();
      expect(A.route).toEqual({ name: "onhand" });
    } finally {
      Object.assign(g, had);
    }
  });

  test("a folder is a place; who the user picked is remembered for the next sheet", async () => {
    const { A, sent } = await sheet();
    A.pickPlace(options.places[1]);
    expect(sent.at(-1)).toEqual({ t: "task_new_options", place: { kind: "folder", device: "local", path: "/r/notes" } });
    A.receive(options);
    A.nt.words = "Sort the notes by month.";
    A.pickWho("codex");
    A.startNewTask();
    expect(sent.at(-1)).toMatchObject({ place: { kind: "folder", device: "local", path: "/r/notes" }, harness: "codex" });
    A.receive({ t: "task_new_result", ok: false, clientId: sent.at(-1).clientId, reason: "failed" } as any);
    A.nt.words = "";
    A.sheet = null;
    A.openNewTask();
    expect(A.nt.pick).toBe("codex");
    A.pickWho("");
    A.sheet = null;
  });

  test("D197: a place on the user's Mac, for a home on a server: listed with its computer, its branch, and started there", async () => {
    const { A, sent } = await sheet();
    const { placeLine } = await import("../src/app.ts");
    const mac = { place: { kind: "repo", device: "dev_mac", repoPath: "/Users/weyl/dev/ducter" }, name: "ducter", defaultBranch: "main", branches: ["main", "worktree-x"], added: true, computer: "Macbook Pro M3" } as any;
    const hel = { place: { kind: "repo", device: "local", repoPath: "/root/ducter-server" }, name: "ducter-server", computer: "Hetzner Server" } as any;
    expect(placeLine(mac)).toBe("~/dev/ducter · Macbook Pro M3");
    expect(placeLine(hel)).toBe("/root/ducter-server · Hetzner Server");
    expect(placeLine({ place: { kind: "folder", device: "local", path: "/home/wey/notes" }, name: "notes" } as any)).toBe("~/notes");
    A.receive({ ...options, places: [mac, hel, { place: { kind: "none" }, name: "" }] });
    A.nt.words = "Fix the card.";
    A.nt.branch = "worktree-x";
    A.startNewTask();
    expect(sent.at(-1)).toMatchObject({ t: "task_new", place: { kind: "repo", device: "dev_mac", repoPath: "/Users/weyl/dev/ducter", baseBranch: "worktree-x" } });
    A.receive({ t: "task_new_result", ok: false, clientId: sent.at(-1).clientId, reason: "offline" } as any);
    A.nt.words = "";
    A.sheet = null;
  });
});

describe("New task copy (D185, D186)", () => {
  test("zh and en have the same keys, and the same as the Mac", () => {
    expect(Object.keys(starts.zh).sort()).toEqual(Object.keys(starts.en).sort());
    const mac = readFileSync(new URL("../../desktop/internal/i18n/starts.go", import.meta.url), "utf8");
    const macKeys = [...mac.matchAll(/^\t"([^"]+)":/gm)].map((m) => m[1]);
    expect([...new Set(macKeys)].sort()).toEqual(Object.keys(starts.zh).sort());
    for (const [k, v] of Object.entries(starts.zh)) expect(mac).toContain(`"${k}":`), expect(mac).toContain(JSON.stringify(v));
  });

  test("the sheet draws its pills and rows only through controls.tsx", () => {
    const src = readFileSync(new URL("../src/newtask.tsx", import.meta.url), "utf8");
    expect(src.match(/<(button|a|select)\b/g) ?? []).toEqual([]);
  });
});
