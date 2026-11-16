// D295: the glance at Nowledge Mem for Settings › 记忆: its count, and the latest memories the
// person's other AI tools saved (titles only, never Ducter's own or the person's own command line).
import { describe, expect, test } from "bun:test";
import { createMemGlance, parseGlance } from "../src/mem-glance.ts";
import { whereOf } from "../src/bridge-link.ts";

const list = (memories: object[], total = 1284) => JSON.stringify({ memories, total, returned: memories.length });
const m = (id: string, source: string, title: string, created_at = "2026-11-15T10:00:00Z") => ({ id, source, title, content: "never shown", created_at });

describe("Mem glance (D295)", () => {
  test("other AI tools by their own names; Ducter's own, the command line and unknown sources left out", () => {
    const g = parseGlance(list([m("a", "claude-code", "Run gofmt"), m("b", "ducter", "Fake clock"), m("c", "cli", "mine"), m("d", "codex", "Flaky on Linux"), m("e", "weird-tool", "?"), m("f", "cursor", "  ")]))!;
    expect(g.total).toBe(1284);
    expect(g.others.map((o) => `${o.from}:${o.title}`)).toEqual(["Claude Code:Run gofmt", "Codex:Flaky on Linux"]);
    expect(JSON.stringify(g)).not.toContain("never shown");
    expect(g.others[0]!.at).toBe("2026-11-15T10:00:00.000Z");
  });

  test("at most six, long titles clipped, anything not an answer is nothing", () => {
    const many = Array.from({ length: 10 }, (_, i) => m(`x${i}`, "codex", "t".repeat(300)));
    const g = parseGlance(list(many))!;
    expect(g.others.length).toBe(6);
    expect(g.others[0]!.title.length).toBeLessThanOrEqual(120);
    expect(parseGlance("not json")).toBeUndefined();
    expect(parseGlance(JSON.stringify({ error: "x" }))).toBeUndefined();
  });

  test("read in the background, once per while, only when on; a new glance says so", async () => {
    let calls = 0;
    let changed = 0;
    let now = 0;
    let on = true;
    const g = createMemGlance({
      run: async (args) => (calls++, expect(args).toEqual(["m", "list", "-n", "40"]), { code: 0, out: list([m("a", "codex", "One")], 7), err: "" }),
      on: () => on,
      changed: () => changed++,
      now: () => now,
      ttlMs: 1000,
    });
    expect(g.get()).toBeUndefined(); // first read starts it
    await g.refresh();
    expect(g.get()?.total).toBe(7);
    expect(changed).toBe(1);
    expect(calls).toBe(1);
    now = 500;
    g.get();
    expect(calls).toBe(1); // still fresh
    now = 2000;
    g.get();
    await g.refresh();
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(changed).toBe(1); // same answer, nothing new to say
    on = false;
    expect(g.get()).toBeUndefined();
  });

  test("where Mem keeps them, in the person's words", () => {
    expect(whereOf("cloud")).toBe("cloud");
    expect(whereOf("local")).toBe("local");
    expect(whereOf("postgres")).toBe("server");
  });
});
