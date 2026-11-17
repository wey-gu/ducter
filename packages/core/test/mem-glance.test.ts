// D295, D321: the glance at Nowledge Mem for Settings › 记忆: its count, what it knows about the person
// by Mem's own kinds, and which other AI tools wrote this week (a count, never their working notes).
import { describe, expect, test } from "bun:test";
import { aboutOf, createMemGlance, foundOf, recentOf } from "../src/mem-glance.ts";
import { whereOf } from "../src/bridge-link.ts";

const list = (memories: object[], total = 1284) => JSON.stringify({ memories, total, returned: memories.length });
const NOW = Date.parse("2026-11-17T12:00:00Z");
const m = (id: string, source: string, title: string, created_at = "2026-11-15T10:00:00Z") => ({ id, source, title, content: "never shown", created_at });

describe("Mem glance (D295, D321)", () => {
  test("preferences from anyone Mem knows, by who said it; unknown sources left out; contents never", () => {
    const a = aboutOf(list([m("a", "codex", "Replies in Chinese"), m("b", "ducter", "Conclusion first"), m("c", "thread_distillation", "Short mail"), m("d", "cli", "Fridays"), m("e", "raft #wg-cloud msg 1", "?"), m("f", "cursor", "  ")]), "preference")!;
    expect(a.map((x) => `${x.by}:${x.from ?? ""}:${x.title}`)).toEqual(["tool:Codex:Replies in Chinese", "said::Conclusion first", "mem::Short mail", "you::Fridays"]);
    expect(a.every((x) => x.kind === "preference")).toBe(true);
    expect(JSON.stringify(a)).not.toContain("never shown");
  });

  test("decisions and facts only when the person saved them or told the partner: another tool's are its working notes", () => {
    const d = aboutOf(list([m("a", "codex", "nowledge-co/mem#10358: subject continuity"), m("b", "ducter", "Reports go out Fridays"), m("c", "cli", "Keep the old API name"), m("d", "thread_distillation", "Distilled decision")]), "decision")!;
    expect(d.map((x) => x.id)).toEqual(["b", "c"]);
  });

  test("other tools this week as counts, never titles; a full week's read says at least", () => {
    const r = recentOf(list([m("a", "codex", "Title A"), m("b", "codex", "Title B"), m("c", "claude-code", "Title C"), m("d", "codex", "old", "2026-11-01T00:00:00Z"), m("e", "cli", "mine")], 10980), NOW)!;
    expect(r.total).toBe(10980);
    expect(r.tools).toEqual([{ from: "Codex", count: 2 }, { from: "Claude Code", count: 1 }]);
    expect(JSON.stringify(r)).not.toContain("Title");
    const full = recentOf(list(Array.from({ length: 100 }, (_, i) => m(`x${i}`, "codex", "t"))), NOW)!;
    expect(full.tools[0]).toEqual({ from: "Codex", count: 100, more: true });
    expect(recentOf("not json", NOW)).toBeUndefined();
  });

  test("at most eight per kind, long titles clipped; a search shows the person's own hits", () => {
    const a = aboutOf(list(Array.from({ length: 12 }, (_, i) => m(`x${i}`, "ducter", "t".repeat(300)))), "fact")!;
    expect(a.length).toBe(8);
    expect(a[0]!.title.length).toBeLessThanOrEqual(120);
    const f = foundOf(JSON.stringify({ query: "q", memories: [{ ...m("s", "github:pr", "From a PR"), unit_type: "decision" }] }))!;
    expect(f[0]).toMatchObject({ id: "s", kind: "decision", by: "mem" });
  });

  test("read in the background, once per while, only when on; forget and fix change it at once", async () => {
    const calls: string[] = [];
    let changed = 0;
    let now = NOW;
    let on = true;
    const g = createMemGlance({
      run: async (args) => {
        calls.push(args.join(" "));
        if (args.includes("--unit-type")) return { code: 0, out: list(args.includes("preference") ? [m("p1", "ducter", "Conclusion first")] : []), err: "" };
        if (args[1] === "search") return { code: 0, out: JSON.stringify({ memories: [m("s1", "codex", "Found")] }), err: "" };
        return { code: 0, out: list([m("a", "codex", "One")], 7), err: "" };
      },
      on: () => on,
      changed: () => changed++,
      now: () => now,
      ttlMs: 1000,
    });
    expect(g.get()).toBeUndefined(); // first read starts it
    await g.refresh();
    expect(g.get()).toMatchObject({ total: 7, about: [{ id: "p1", by: "said" }], tools: [{ from: "Codex", count: 1 }] });
    expect(changed).toBe(1);
    expect(calls.length).toBe(4);
    now += 500;
    g.get();
    expect(calls.length).toBe(4); // still fresh
    g.fixed("p1", "Details after");
    expect(g.get()!.about[0]!.title).toBe("Details after");
    g.forgot("p1");
    expect(g.get()!.about).toEqual([]);
    expect(g.get()!.total).toBe(6);
    expect(changed).toBe(3);
    expect((await g.find("  report  "))!.map((x) => x.title)).toEqual(["Found"]);
    expect(calls.at(-1)).toBe("m search -n 8 -- report");
    on = false;
    expect(g.get()).toBeUndefined();
  });

  test("where Mem keeps them, in the person's words", () => {
    expect(whereOf("cloud")).toBe("cloud");
    expect(whereOf("local")).toBe("local");
    expect(whereOf("postgres")).toBe("server");
  });
});
