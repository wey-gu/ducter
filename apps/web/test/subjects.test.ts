// D653 (research/244 rules 1 and 8): one living card per subject on the web. The card hangs
// from the person's message, keeps one per task (a task that joins its hand-off's PR replaces the
// first key), and is revised in place — the report is never a row of its own. The words are the
// Mac's, key for key (i18n-subjects.ts / i18n/subjects.go; words.test.ts checks the mirror).
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { format } from "../src/i18n.ts";
import { subjectWords } from "../src/i18n-subjects.ts";
import { Store } from "../src/store.ts";

const src = (f: string) => readFileSync(join(import.meta.dir, `../src/${f}`), "utf8");
const ev = (seq: number, kind: string, body: unknown) => ({
  seq,
  ts: "2026-11-27T06:30:00.000Z",
  persona: "default",
  stream: "channel",
  origin: "system",
  kind,
  body,
});

test("the card hangs from the message and is revised in place, one per subject", () => {
  const s = new Store();
  s.applyEvent(ev(1, "user_msg", { text: "官网下载页的下载按钮点不了，帮我修一下。" }) as never);
  s.applyEvent(ev(2, "subject_card", { card: { key: "task:fix", msgSeq: 1, title: "修官网下载页", state: "working", line: "改好了，在等 CI", taskId: "fix", at: "2026-11-27T06:31:00.000Z" } }) as never);
  const row = () => s.channel.find((e) => e.firstSeq === 1)!;
  expect(row().cards!.length).toBe(1);
  expect(row().cards![0]).toMatchObject({ state: "working", line: "改好了，在等 CI" });
  // A helper's card of the same task and the task's own card joining the hand-off's PR replace it.
  s.applyEvent(ev(3, "subject_card", { card: { key: "pr:acme/site#578", msgSeq: 1, title: "官网下载页的下载按钮", state: "waiting", line: "CI 的缓存要不要清掉重跑？", taskId: "fix", at: "2026-11-27T06:32:00.000Z" } }) as never);
  s.applyEvent(ev(4, "subject_card", { card: { key: "pr:acme/site#578", msgSeq: 1, title: "官网下载页的下载按钮", state: "done", line: "PR #578 合并了", took: 17 * 60_000, taskId: "fix", at: "2026-11-27T06:33:00.000Z" } }) as never);
  expect(row().cards!.length).toBe(1);
  expect(row().cards![0]).toMatchObject({ key: "pr:acme/site#578", state: "done", line: "PR #578 合并了", took: 17 * 60_000 });
  // The card is not a row of its own.
  expect(s.channel.filter((e) => !e.user && !e.ai && !e.job).length).toBe(0);
});

test("a card that came before its message is kept until the message is loaded", () => {
  const s = new Store();
  s.applyEvent(ev(5, "subject_card", { card: { key: "task:a", msgSeq: 9, title: "Fix it", state: "working", line: "", taskId: "a", at: "2026-11-27T06:30:00.000Z" } }) as never);
  s.applyEvent(ev(9, "user_msg", { text: "fix it" }) as never);
  const row = s.channel.find((e) => e.firstSeq === 9)!;
  expect(row.cards).toHaveLength(1);
  expect(row.cards![0]!.key).toBe("task:a");
});

test("the state is one word per language, never a joined line", () => {
  for (const [zh, en] of [
    ["在做", "Working"],
    ["等你", "Needs you"],
    ["做完了", "Done"],
    ["没做成", "Didn't work"],
  ] as const) {
    expect(Object.values(subjectWords.zh)).toContain(zh);
    expect(Object.values(subjectWords.en)).toContain(en);
  }
  for (const v of [...Object.values(subjectWords.zh), ...Object.values(subjectWords.en)]) {
    expect(v).not.toContain(" · ");
    expect(v).not.toMatch(/🙂|✅|❌|⏳|\p{Extended_Pictographic}/u);
  }
  expect(format(subjectWords.zh["subject.label"]!, [])).toBe("工作的进展");
  expect(format(subjectWords.en["subject.done"]!, [])).toBe("Done");
});

test("the view draws the card under the message and the styles cover the phone", () => {
  expect(src("views.tsx")).toContain("<SubjectCards cards={cards} />");
  expect(src("subjects.tsx")).toContain('data-subject={c.key}');
  // D653 polish: the time it took is its own element, never joined to the line.
  expect(src("subjects.tsx")).toContain('class="subject-took"');
  expect(src("subjects.tsx")).toContain('t("task.footer.took", duration(A.L, c.took))');
  const css = readFileSync(join(import.meta.dir, "../static/app.css"), "utf8");
  expect(css).toContain(".subject-card {");
  expect(css).toContain(".subject-took {");
  expect(css).toContain("@media (max-width: 460px)");
  expect(css).toContain(".subjects .amark.s-working");
});
