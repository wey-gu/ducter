// D315: On hand's line under the partner says what the strip can't (whether anything needs you,
// else that it is on it, else when the first wait is back), the strip shows only the states there
// are, a card names its computer only when it isn't the usual one, and a default's label never
// doubles the sentence's mark. The Mac's d315_test.go checks the same.
import { describe, expect, test } from "bun:test";
import { strings } from "../src/i18n.ts";

const now = Date.now();
const iso = (ms: number) => new Date(now + ms).toISOString();
const card = (id: string, attention: string, project = "", device = "") => ({
  taskId: id,
  persona: "default",
  title: `Task ${id}`,
  project,
  place: device ? { kind: "repo", device, repoPath: `/r/${project}`, branch: "ducter/x", baseBranch: "main" } : { kind: "none" },
  harness: "codex",
  attention,
  residency: "hot",
  openedAt: iso(-60_000),
  updatedAt: iso(-60_000),
});

describe("On hand with its character back (D315)", () => {
  test("the line says what the strip can't", async () => {
    const { A } = await import("../src/app.ts");
    const o = await import("../src/onhand.tsx");
    // Its own store: the line reads the board, and a full run leaves other files' stopped tasks in A.S.
    const { Store } = await import("../src/store.ts");
    A.S = new Store();
    A.L = strings("zh");
    expect(o.headLine("", [2, 3, 1, 1])).toBe(A.L.t("onhand.say.needs", 2));
    expect(o.headLine("", [1, 0, 0, 0])).toBe(A.L.t("onhand.say.needs.one"));
    expect(o.headLine("", [0, 3, 2, 0])).toBe(A.L.t("onhand.line.working"));
    expect(o.headLine("", [0, 0, 0, 4])).toBe(A.L.t("onhand.line.done"));
    expect(o.headLine("", [0, 0, 0, 0])).toBe(A.L.t("onhand.line.idle"));
  });

  test("a card says only where differs", async () => {
    const { A } = await import("../src/app.ts");
    const o = await import("../src/onhand.tsx");
    A.L = strings("zh");
    A.send = () => {};
    A.S.welcomed = true;
    A.S.tasks.clear();
    A.receive({
      t: "on_hand",
      onHand: { tasks: [card("a", "working", "hawdb", "hel"), card("b", "working", "hawdb", "hel"), card("c", "working", "ducter", "mac"), card("d", "working")], counts: { needs_you: 0, working: 4, waiting: 0, done_today: 0 }, waiters: [], missed: [] },
    } as any);
    A.receive({ t: "devices", devices: [{ id: "hel", name: "Hetzner Server", kind: "server", home: true, harnesses: [] }, { id: "mac", name: "MacBook", kind: "mac", harnesses: [] }] } as any);
    const all = [...A.S.tasks.values()];
    o.L.showProj = true;
    o.L.usual = o.usualComputer(all);
    expect(o.L.usual).toBe("hel");
    expect(o.whereMeta(A.S.tasks.get("a")!)).toEqual(["hawdb"]);
    expect(o.whereMeta(A.S.tasks.get("d")!)).toEqual([]);
    A.S.tasks.clear();
  });

  test("a default's label keeps one mark", async () => {
    const { A } = await import("../src/app.ts");
    A.L = strings("zh");
    const src = await Bun.file(new URL("../src/views.tsx", import.meta.url)).text();
    expect(src).toContain('.replace(/[。．.！!；;，,]+$/u, "")');
    const label = "等你登录后继续。".replace(/[。．.！!；;，,]+$/u, "");
    expect(A.L.t("decision.default.go", "26 分钟", label)).not.toContain("。，");
    // D493: the sentence quotes the Go button as it reads (one 就), in zh and en; a Go naming no action quotes nothing.
    const { defaultInfo } = await import("../src/views.tsx");
    const now = Date.now();
    const d = { decisionId: "d1", question: "q", goLabel: "30 分钟后再试", defaultOption: "go", reversible: true, defaultAt: new Date(now + 26 * 60_000).toISOString() } as never;
    expect(defaultInfo(d, now).line).toBe("不回的话，26 分钟后我就按「好，30 分钟后再试」办，之后还能改回来。");
    A.L = strings("en");
    expect(defaultInfo({ ...(d as object), goLabel: "Try again in 30 minutes" } as never, now).line).toBe("If you don't answer, in 26 min I'll go with “Try again in 30 minutes”. It can be undone.");
    expect(defaultInfo({ ...(d as object), goLabel: "Wait until the build on the other machine has finished" } as never, now).line).toBe(A.L.t("decision.default.goon", "26 min"));
    A.L = strings("zh");
  });
});
