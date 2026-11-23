// D433: who can reach the partner (each AI tool the person runs), what hasn't plainly gone in Recently,
// the other home Mem hasn't seen for a day, and 想起了 for a past conversation with another tool.
// The Mac has the same rules (apps/desktop/internal/views/reach_test.go).
import { describe, expect, test } from "bun:test";
import { awayFor, reachRows, recallLine, recentHandoffs } from "../src/mem-view.ts";
import { memoryWords } from "../src/i18n-memory.ts";

const dev = (harnesses: { harness: string; mem?: string }[], o: { id?: string; home?: boolean } = {}) => ({
  id: o.id ?? "local",
  name: o.id ?? "Mac",
  ...(o.home ? { home: true } : {}),
  harnesses: harnesses.map((h) => ({ harness: h.harness, installed: true, loggedIn: true, ...(h.mem ? { mem: { state: h.mem } } : {}) })),
});

describe("能找到{name}的 / Who can reach (D433)", () => {
  test("each tool the person runs, in a fixed order, with whether it can reach and the one fix", () => {
    const rows = reachRows(
      [dev([{ harness: "codex", mem: "installed" }, { harness: "claude-code", mem: "absent" }, { harness: "antigravity" }], { home: true }), dev([{ harness: "pi", mem: "installed" }], { id: "hel" })],
      [],
      [],
    );
    expect(rows.map((r) => [r.harness, r.can, r.device ?? ""])).toEqual([
      ["claude-code", "install", "local"],
      ["codex", "yes", "local"], // D470: where its mailbox opens
      ["pi", "relay", ""], // D448: signed in where Ducter runs tasks: its tasks pass messages through Ducter
      ["antigravity", "relay", ""],
    ]);
  });

  test("own records alone count; a tool that already came reads as able, with when", () => {
    const rows = reachRows([], ["claude-code"], [{ agent: "你的 Claude Code（终端）", at: "2026-11-20T08:00:00Z" }]);
    expect(rows).toEqual([{ harness: "claude-code", tool: "Claude Code", can: "yes", last: "2026-11-20T08:00:00Z" }]);
    expect(reachRows([], ["codex"], [])).toEqual([{ harness: "codex", tool: "Codex", can: "unknown" }]);
    expect(reachRows([], [], [])).toEqual([]);
  });

  test("every line short, in both languages (D424)", () => {
    for (const lang of ["zh", "en"] as const)
      for (const k of ["peers.st.both", "peers.st.oneway", "peers.st.to", "peers.st.install", "peers.st.unknown", "peers.st.opening", "peers.st.relay", "peers.st.relay.one", "peers.st.none", "peers.st.none.one"]) {
        const s = memoryWords[lang][k]!.replace("%s", "Ducter");
        expect(s.length).toBeLessThanOrEqual(lang === "zh" ? 40 : 60);
        expect(s).not.toContain(" · ");
      }
  });
});

describe("Recently says what hasn't gone (D433)", () => {
  test("an op's latest word: sent ones from the channel, the rest with their state, newest first", () => {
    const ev = (seq: number) => ({ seq, ts: `2026-11-20T08:0${seq}:00Z` });
    const ops = new Map([
      ["op1", { seq: 3, ts: "2026-11-20T08:03:00Z", b: { direction: "out" as const, agent: "Codex", text: "收到了", state: "failed" } }],
      ["op2", { seq: 4, ts: "2026-11-20T08:04:00Z", b: { direction: "out" as const, agent: "Codex", text: "PR 好了吗", state: "unknown", decisionId: "d1" } }],
      ["op3", { seq: 5, ts: "2026-11-20T08:05:00Z", b: { direction: "out" as const, agent: "Codex", text: "好的", state: "sent" } }],
    ]);
    const got = recentHandoffs([{ ev: ev(1), peer: { direction: "in", agent: "Codex", text: "测试" } }, { ev: ev(5), peer: { direction: "out", agent: "Codex", text: "好的", state: "sent" } }], 5, ops);
    expect(got.map((h) => [h.seq, h.way, h.state ?? ""])).toEqual([
      [5, "replied", ""],
      [4, "sent", "unknown"],
      [3, "replied", "failed"],
      [1, "in", ""],
    ]);
  });
  test("each state has its words", () => {
    for (const lang of ["zh", "en"] as const) for (const k of ["sending", "unknown", "unconfirmed", "failed"]) expect(memoryWords[lang][`peers.out.${k}`]).toBeTruthy();
  });
});

describe("the other home, away (D433)", () => {
  test("over a day since Mem saw it", () => {
    const now = Date.UTC(2026, 10, 20);
    expect(awayFor(undefined, now)).toBe(false);
    expect(awayFor(now - 3_600_000, now)).toBe(false);
    expect(awayFor(now - 3 * 86_400_000, now)).toBe(true);
  });
});

describe("想起了 a past conversation (D433)", () => {
  test("names the tool and the day", () => {
    expect(recallLine({ by: "tool", from: "Codex", thread: true }, "11月12日")).toEqual({ key: "recall.thread", args: ["Codex", "11月12日"] });
    expect(recallLine({ by: "tool", from: "Codex", thread: true }, "")).toEqual({ key: "recall.thread.any", args: ["Codex"] });
    expect(memoryWords.zh["recall.thread"]).toBe("想起了你 %[2]s 和 %[1]s 聊的");
  });
});
