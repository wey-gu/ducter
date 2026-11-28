// D654 (research/245 §3.2): the project lens is core's. A card names its project (key and
// name); the web never derives one from a folder again. Machines and worktrees are attributes, and
// 来自 / From is a filter chip, never a project row.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const now = new Date().toISOString();
const card = (id: string, title: string, extra: object = {}) => ({
  taskId: id,
  persona: "default",
  title,
  project: "",
  place: { kind: "none" as const },
  harness: "claude-code",
  attention: "working",
  residency: "hot",
  openedAt: now,
  updatedAt: now,
  ...extra,
});

async function home() {
  const { A } = await import("../src/app.ts");
  const o = await import("../src/onhand.tsx");
  const { strings } = await import("../src/i18n.ts");
  A.L = strings("en");
  A.S.tasks.clear();
  A.S.onHand = undefined;
  A.S.welcomed = true;
  A.send = () => {};
  A.receive({
    t: "on_hand",
    onHand: {
      tasks: [
        card("m1", "Fix the 403", { projectKey: "github.com/nowledge-co/mem", projectName: "mem", place: { kind: "repo", device: "local", repoPath: "/home/w/ducter/projects/mem" }, attention: "working" }),
        card("m2", "Review the PR", { projectKey: "github.com/nowledge-co/mem", projectName: "mem", place: { kind: "repo", device: "haswell", repoPath: "/home/w/dev/mem-identity" }, attention: "blocked" }),
        card("b1", "Backbone migration", { projectKey: "github.com/nowledge-co/mem-backbone", projectName: "mem-backbone", place: { kind: "repo", device: "haswell", repoPath: "/home/w/ducter/projects/mem-backbone" }, attention: "working" }),
        card("n1", "Read the research", { projectGroup: "none", attention: "done" }),
        card("c1", "Prow MCP on hel", { projectGroup: "computer", attention: "failed" }),
      ],
      counts: { needs_you: 0, working: 3, waiting: 1, done_today: 1 },
      waiters: [],
      projectList: [
        { key: "github.com/nowledge-co/mem", name: "mem", devices: ["hel", "haswell"], pinned: true },
        { key: "github.com/nowledge-co/mem-backbone", name: "mem-backbone", devices: ["haswell"] },
        { key: "github.com/nowledge-co/nowledge-labs-website", name: "nowledge-labs-website", hidden: true, added: true, place: { kind: "repo", device: "mac", repoPath: "/x" } },
      ],
    },
  } as any);
  return { A, o };
}

describe("the project lens reads core's key", () => {
  test("one repository on two computers is one row; a repository's short name is its name", async () => {
    const { o } = await home();
    expect(o.lensOf({ card: { projectKey: "github.com/nowledge-co/mem" }, open: undefined } as any)).toBe("github.com/nowledge-co/mem");
    const groups = o.lensGroups();
    expect(groups.map((g) => g.name)).toEqual(["mem", "mem-backbone", "Not in a project", "On your computers"]);
    const mem = groups.find((g) => g.name === "mem")!;
    expect(mem.tasks.map((t) => t.id)).toEqual(["m1", "m2"]);
    expect(mem.pinned).toBe(true);
    expect(o.lensLanes("github.com/nowledge-co/mem").flat().map((t) => t.id)).toEqual(["m1", "m2"]);
  });

  test("a hidden project is out of the column and back when something there needs the person", async () => {
    const { A, o } = await home();
    // A hidden project with only waiting work stays out; one with a stopped task shows again.
    const before = o.lensGroups().map((g) => g.name);
    expect(before).not.toContain("nowledge-labs-website");
    A.S.tasks.set("w1", { ...card("w1", "Website copy", { projectKey: "github.com/nowledge-co/nowledge-labs-website", projectName: "nowledge-labs-website", attention: "needs_you" }), id: "w1", card: { projectKey: "github.com/nowledge-co/nowledge-labs-website", projectName: "nowledge-labs-website", attention: "needs_you" }, state: { attention: "needs_you" } } as any);
    expect(o.lensGroups().map((g) => g.name)).toContain("nowledge-labs-website");
  });

  test("来自 / From is a filter over the project lens, never a row", async () => {
    const { A, o } = await home();
    A.S.tasks.get("m1")!.card!.source = { source: "src_github", kind: "github", ref: "nowledge-co/mem#1", label: "#1" } as any;
    expect(o.sourceGroups().map((g) => g.name)).toEqual(["GitHub"]);
    expect(o.lensGroups().some((g) => g.name === "GitHub")).toBe(false);
    o.L.source = "src:src_github";
    expect(o.lensLanes("github.com/nowledge-co/mem").flat().map((t) => t.id)).toEqual(["m1"]);
    o.L.source = "";
  });


  test("the column follows core's projectList order, not the tasks' lane order", async () => {
    const { A, o } = await home();
    const list = A.S.onHand!.projectList!;
    A.S.onHand!.projectList = [list[1]!, list[0]!, ...list.slice(2)];
    expect(o.lensGroups().map((g) => g.name)).toEqual(["mem-backbone", "mem", "Not in a project", "On your computers"]);
  });

  test("a project's name is one line with a middle ellipsis, its computers one line with +N", () => {
    const src = readFileSync(join(import.meta.dir, "../src/onhand.tsx"), "utf8");
    expect(src).toContain("function MidName");
    expect(src).toContain('"…"');
    expect(src).toContain("function WhereLine");
    expect(src).toContain("rest > 0");
    expect(src).toContain("<MenuHead>{name}</MenuHead>");
  });

  test("no client derivation is left: both lens builders read the card, never a folder name", () => {
    const onhand = readFileSync(join(import.meta.dir, "../src/onhand.tsx"), "utf8");
    const lens = onhand.slice(onhand.indexOf("export const lensOf"), onhand.indexOf("export const lensName"));
    expect(lens).toContain("projectOf(task)");
    expect(lens).not.toContain("repoPath");
    expect(lens).not.toContain(".split(");
    // The row's menu sends one project_change; the home keeps it.
    expect(onhand).toContain('t: "project_change"');
    expect(onhand).toContain('act: "rename"');
    expect(onhand).toContain('act: "merge"');
    expect(onhand).toContain('act: "hide"');
    expect(onhand).toContain('act: "pin"');
    expect(onhand).toContain('act: "order"');
  });
});
