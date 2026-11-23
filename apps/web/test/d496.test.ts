// D496 (hel, 2026-11-23): task xfnccfi7's opened view listed raw shell commands under 发出去的
// (`sed -i …; gh pr edit …`, `git add … && git commit … && git push`, a python heredoc), and its
// wait read 「等 PR #10847 is merged」. Sent out now says what went out in plain words (the
// commands behind a hover); a condition in another language than the screen's is quoted. The
// Mac's outward_test.go and the fixture check the same acts.
import { afterAll, describe, expect, test } from "bun:test";
import { strings } from "../src/i18n.ts";

afterAll(async () => {
  const { A } = await import("../src/app.ts");
  A.S.tasks.clear();
  A.L = strings("zh");
});

const bash = (seq: number, command: string, output = "") => ({
  seq,
  ts: "2026-11-21T22:10:29.486Z",
  persona: "default",
  stream: "task:xfnccfi7",
  origin: "task",
  kind: "task_event",
  body: { taskId: "xfnccfi7", role: "tool", tool: { name: "Bash", input: { command }, output, ok: true } },
});

const HEL = [
  // gh pr create's input came as JSON text from the harness.
  { ...bash(37741, ""), body: { taskId: "xfnccfi7", role: "tool", tool: { name: "Bash", input: JSON.stringify({ command: "cat > /tmp/ger_pr.md <<'EOF'\n### Issue\ngit push origin main\nEOF\ngh pr create --repo nowledge-co/mem --title t --body-file /tmp/ger_pr.md" }), output: "https://github.com/nowledge-co/mem/pull/10847\n", ok: true } } },
  bash(37743, "sed -i '' 's/x/y/' /tmp/ger_pr.md; grep -n Fixes /tmp/ger_pr.md; gh pr edit 10847 --repo nowledge-co/mem --body-file /tmp/ger_pr.md >/dev/null"),
  bash(37747, "gh pr edit 10847 --repo nowledge-co/mem --add-label component/server,type/test >/dev/null; gh pr view 10847 --repo nowledge-co/mem --json labels"),
  bash(37790, "git push -u origin ducter/graph-error-response-tests"),
  bash(37803, "git add nmem-rs/x.json && git commit -q -m 'test: refresh pin' && git push -q 2>&1 | tail -2"),
  bash(37806, "python3 - <<'EOF'\ns=open('/tmp/p.md').read()\nEOF\ngh pr edit 10847 --repo nowledge-co/mem --body-file /tmp/p.md"),
  bash(37810, "git commit --amend --no-edit && cargo test"),
];

async function app(lang: "zh" | "en") {
  const { A } = await import("../src/app.ts");
  A.L = strings(lang);
  A.S.tasks.clear();
  A.receive({
    t: "events",
    events: [
      { seq: 37544, ts: "2026-11-21T21:51:20.414Z", persona: "default", stream: "task:xfnccfi7", origin: "partner", kind: "task_open", body: { taskId: "xfnccfi7", title: "graph_error_response_tests intermittently…", place: { kind: "repo", device: "local", repoPath: "/r", branch: "ducter/graph-error-response-tests", baseBranch: "main" }, harness: "claude-code", brief: "x" } },
      ...HEL,
    ],
  } as never);
  const task = A.S.tasks.get("xfnccfi7")!;
  task.historyLoaded = true;
  return { A, task };
}

describe("D496 Sent out in plain words", () => {
  test("hel's task: the PR opened and edited, its branch pushed twice; no command, nothing local", async () => {
    const { task } = await app("zh");
    const { outsideActs } = await import("../src/store.ts");
    const { outsideSentence } = await import("../src/outward.ts");
    const rows = outsideActs(task);
    const said = rows.map((r) => outsideSentence(r, "ducter/graph-error-response-tests"));
    expect(said).toEqual(["开了 PR #10847", "改了 PR #10847 的说明和标签", "推送到 ducter/graph-error-response-tests（2 次）"]);
    expect(said.join(" ")).not.toMatch(/sed|git add|python3|commit/);
    // The commands are kept for a hover.
    expect(rows[1]!.commands.length).toBe(3);
  });
  test("the same in English", async () => {
    const { task } = await app("en");
    const { outsideActs } = await import("../src/store.ts");
    const { outsideSentence } = await import("../src/outward.ts");
    expect(outsideActs(task).map((r) => outsideSentence(r, "ducter/graph-error-response-tests"))).toEqual(["Opened PR #10847", "Edited PR #10847's description and labels", "Pushed to ducter/graph-error-response-tests (2 times)"]);
  });
});

describe("D496 a wait's condition in another language", () => {
  test("quoted under the screen's words, never glued into its sentence", async () => {
    const { A } = await app("zh");
    const { waitLine } = await import("../src/work.tsx");
    expect(waitLine("PR #10847 is merged")).toBe("在等：「PR #10847 is merged」");
    expect(waitLine("PR #10847 合并")).toBe("等 PR #10847 合并");
    expect(waitLine("PR #10847's checks pass on the new head")).toBe("在等：「PR #10847's checks pass on the new head」");
    expect(waitLine("PR #10847")).toBe("等 PR #10847");
    A.L = strings("en");
    expect(waitLine("PR #10847 的 CI 通过")).toBe("Waiting for: “PR #10847 的 CI 通过”");
    expect(waitLine("PR #10847 is merged")).toBe("Waiting until PR #10847 is merged");
  });
});
