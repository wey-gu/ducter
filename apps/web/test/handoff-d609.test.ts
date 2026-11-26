// D609: the web's words for a hand-off: the task's one line in every state, and 手上的事 grouped
// by state (等接手, 在做, 退回了, 没接), nothing for an empty group, a legacy taken item still 在做.
import { describe, expect, test } from "bun:test";
import type { HandoffLine, KeepItem } from "@ducter/protocol";
import { strings } from "../src/i18n.ts";
import { handoffGroups, handoffTaskWords } from "../src/handoff.ts";

const line = (state: HandoffLine["state"], extra: Partial<HandoffLine> = {}): HandoffLine => ({
  id: `ho_${state}`,
  state,
  item: { kind: "pr", ref: "nowledge-co/mem#11393", title: "修好 mem#11393 的登录跳转" },
  sender: "Ducter 的任务「官网」",
  to: "PR Babysitter",
  givenAt: "2026-11-26T16:31:00Z",
  at: "2026-11-26T16:32:00Z",
  ...extra,
});

describe("D609: the sender's one line", () => {
  test("given, taken, done, returned, declined, withdrawn, unclaimed; zh and en", () => {
    const zh = strings("zh");
    const en = strings("en");
    expect(handoffTaskWords(line("given"), zh)).toBe("交给 PR Babysitter，等它接手");
    expect(handoffTaskWords(line("taken"), zh)).toBe("PR Babysitter 接手了");
    expect(handoffTaskWords(line("done", { outcome: "评审通过，已评论 /lgtm。" }), zh)).toBe("PR Babysitter 做完了：评审通过，已评论 /lgtm。");
    expect(handoffTaskWords(line("returned", { why: "我只接 PR，这个是 issue。" }), zh)).toBe("PR Babysitter 退回了：我只接 PR，这个是 issue。");
    expect(handoffTaskWords(line("declined", { why: "超出我接的范围。" }), zh)).toBe("PR Babysitter 没接：超出我接的范围。");
    expect(handoffTaskWords(line("withdrawn"), zh)).toBe("不用 PR Babysitter 跟了");
    expect(handoffTaskWords(line("unclaimed"), zh)).toBe("交给 PR Babysitter，等它接手");
    expect(handoffTaskWords(line("given"), en)).toBe("Handed to PR Babysitter, waiting for it to take it");
    expect(handoffTaskWords(line("taken"), en)).toBe("PR Babysitter took it");
    expect(handoffTaskWords(line("done", { outcome: "Review passed." }), en)).toBe("PR Babysitter finished: Review passed.");
    expect(handoffTaskWords(line("returned", { why: "Out of scope." }), en)).toBe("PR Babysitter returned it: Out of scope.");
    expect(handoffTaskWords(line("declined", { why: "Not mine." }), en)).toBe("PR Babysitter didn't take it: Not mine.");
    expect(handoffTaskWords(line("withdrawn"), en)).toBe("Stopped asking PR Babysitter to follow it");
  });
});

describe("D609: 手上的事 grouped by state", () => {
  test("waiting first, then working, returned, declined; empty groups are empty; a legacy item stays 在做", () => {
    const takenItem: KeepItem = { taskId: "t-taken", title: "接手 mem#11393", at: "work" };
    const legacy: KeepItem = { taskId: "t-legacy", title: "旧的活", at: "work" };
    const hs = [
      line("declined", { id: "ho_d", taskId: "t-d", why: "不是我的范围" }),
      line("taken", { id: "ho_t", taskId: "t-taken" }),
      line("given", { id: "ho_g", givenAt: "2026-11-26T16:40:00Z" }),
      line("returned", { id: "ho_r", taskId: "t-r", why: "退回来了" }),
      line("given", { id: "ho_g0", givenAt: "2026-11-26T16:20:00Z" }),
      line("done", { id: "ho_done", taskId: "t-done", outcome: "评审通过" }),
      line("withdrawn", { id: "ho_w", taskId: "t-w" }),
    ];
    const doneItem: KeepItem = { taskId: "t-done", title: "完成的 PR", at: "work" };
    const gs = handoffGroups(hs, [takenItem, legacy, doneItem]);
    expect(gs.map((g) => g.key)).toEqual(["waiting", "working", "returned", "declined"]);
    expect(gs[0]!.rows.map((h) => h.id)).toEqual(["ho_g0", "ho_g"]); // oldest given first
    expect(gs[1]!.rows.map((h) => h.id)).toEqual(["ho_t"]);
    expect(gs[1]!.legacy.map((x) => x.taskId)).toEqual(["t-legacy", "t-done"]); // a done task's open PR still 在做
    expect(gs[2]!.rows.map((h) => h.id)).toEqual(["ho_r"]);
    expect(gs[3]!.rows.map((h) => h.id)).toEqual(["ho_d"]);
    expect(gs.flatMap((g) => g.rows.map((h) => h.id))).not.toContain("ho_w");
    // Nothing for an empty group: all four get an entry, but the view draws only the non-empty.
    const onlyGiven = handoffGroups([line("given")], []);
    expect(onlyGiven.filter((g) => g.rows.length || g.legacy.length).map((g) => g.key)).toEqual(["waiting"]);
  });
});
