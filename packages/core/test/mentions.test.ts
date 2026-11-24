// D534: the home's @ and / lists and the resolver: plain lookups over what it holds.
import { expect, test } from "bun:test";
import type { TaskCard } from "@ducter/protocol";
import { createMentions, nativeEntries } from "../src/mentions.ts";

const card = (taskId: string, title: string, attention: TaskCard["attention"], extra: Partial<TaskCard> = {}): TaskCard =>
  ({ taskId, persona: "default", title, project: "ducter", place: { kind: "repo", device: "local", repoPath: "/r", branch: `b-${taskId}`, baseBranch: "main", worktree: `/r/wt/${taskId}` }, harness: "claude-code", attention, updatedAt: "2026-11-24T10:00:00Z", ...extra }) as TaskCard;

test("a task's / list: Ducter's fixed commands first, its catalog without the hidden, its skills in the agent's form", () => {
  const claude = nativeEntries("claude-code", { commands: [{ name: "compact", description: "Clear history but keep a summary", source: "builtin" }, { name: "config", source: "builtin" }, { name: "__remote-workflow" }, { name: "kill-ai-slop", description: "De-slop" }] });
  expect(claude.map((e) => e.name)).toEqual(["model", "effort", "compact", "kill-ai-slop"]);
  expect(claude.find((e) => e.name === "compact")!.insert).toBe("/compact ");
  const codex = nativeEntries("codex", { skills: [{ name: "imagegen", description: "Images" }] });
  expect(codex.map((e) => [e.name, e.group, e.insert])).toEqual([["compact", "native", "/compact "], ["model", "native", "/model "], ["effort", "native", "/effort "], ["imagegen", "skills", "$imagegen "]]);
  const pi = nativeEntries("pi", { commands: [{ name: "piprompt", source: "prompt" }], skills: [{ name: "marker" }] });
  expect(pi.map((e) => e.insert)).toContain("/skill:marker ");
  // An agent with no verified way to run a skill by name offers none of them.
  expect(nativeEntries("antigravity", { skills: [{ name: "x" }] }).map((e) => e.name)).toEqual(["model", "effort"]);
});

test("the @ list: this partner's tasks on hand first, then Keeps, partners and the PRs its tasks own; files only in a task", async () => {
  const tasks = [card("t1", "Fix the sign-in redirect", "done", { prs: [{ pr: "nowledge-co/mem#10932", url: "https://github.com/nowledge-co/mem/pull/10932", state: "open", at: "" }] }), card("t2", "Bench the WAL", "working"), card("t3", "Other partner's", "working", { persona: "home" })];
  const m = createMentions({
    persona: () => "default",
    tasks: () => tasks,
    task: (id) => tasks.find((t) => t.taskId === id),
    partners: () => [{ id: "default", name: "Ducter", look: {} as never, asks: 0 }, { id: "home", name: "家里", look: {} as never, asks: 0, about: "家里的事" }],
    files: async (_id, q) => ["apps/web/src/composer.tsx", "README.md"].filter((p) => p.includes(q)),
  });
  const all = await m.find("");
  expect(all.filter((i) => i.kind === "task").map((i) => i.id)).toEqual(["t2", "t1"]);
  expect(all.find((i) => i.kind === "partner")!.label).toBe("家里");
  expect(all.find((i) => i.kind === "pr")!.label).toBe("mem#10932");
  expect((await m.find("composer")).some((i) => i.kind === "file")).toBe(false);
  expect((await m.find("composer", "t2")).find((i) => i.kind === "file")).toMatchObject({ id: "apps/web/src/composer.tsx", label: "composer.tsx", sub: "apps/web/src" });
});

test("resolving: a task's title, state, report and code; inside a task also what it changed; a gone one said so", async () => {
  const tasks = [card("t1", "Fix the sign-in redirect", "done", { lastReport: { taskId: "t1", state: "done", summary: "Fixed: next wasn't checked.", questions: [], evidence: [] } })];
  const m = createMentions({ persona: () => "default", tasks: () => tasks, task: (id) => tasks.find((t) => t.taskId === id), changes: async () => [{ path: "src/login.ts", adds: 12, dels: 3 }] });
  const [r] = await m.resolve([{ kind: "task", id: "t1", label: "Fix the sign-in redirect" }]);
  expect(r!.state).toBe("done");
  expect(r!.about).toContain("Fixed: next wasn't checked.");
  expect(r!.about).toContain("branch b-t1 off main");
  expect(r!.about).not.toContain("src/login.ts");
  const [inTask] = await m.resolve([{ kind: "task", id: "t1", label: "x" }], { forTask: "t9" });
  expect(inTask!.about).toContain("src/login.ts +12 -3");
  expect((await m.resolve([{ kind: "task", id: "gone", label: "Gone" }]))[0]!.missing).toBe(true);
});

test("the partner's / list: Ducter's actions, then the person's own skills before the agent's", async () => {
  const m = createMentions({ persona: () => "default", tasks: () => [], task: () => undefined, skills: async () => [{ name: "code-review", source: "built-in" }, { name: "kill-ai-slop", source: "userSettings" }] });
  const { entries } = await m.slash();
  expect(entries.filter((e) => e.group === "ducter").map((e) => e.name)).toEqual(["new", "keep", "remind", "handover", "find"]);
  expect(entries.filter((e) => e.group === "skills").map((e) => e.name)).toEqual(["kill-ai-slop", "code-review"]);
});
