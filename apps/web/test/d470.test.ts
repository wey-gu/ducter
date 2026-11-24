// D470: Agent messaging in Settings' voice. Who reaches whom read off each agent (both ways, one way,
// not yet, and the one fix Ducter can start), the exchanges as a thread per agent with what came of
// each, who may ask what by the rules in code, and the conversation's request line giving way to the
// partner's own words. The Mac has the same rules (apps/desktop/internal/views/peers_d470_test.go).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { exchangeThreads, reachSplit, reachWays, SENDER_DAILY, spokenPeers, trustOf, TRUSTED_DAILY, type ReachRow } from "../src/mem-view.ts";
import { memoryWords } from "../src/i18n-memory.ts";
import { memSetupBrief } from "../../../packages/core/src/mem-plugins.ts";
import { renderBridge } from "../../../packages/partner/src/render.ts";
import { Store } from "../src/store.ts";

const read = (p: string) => readFileSync(join(import.meta.dir, "..", p), "utf8");
const row = (harness: string, can: ReachRow["can"], extra: Partial<ReachRow> = {}): ReachRow => ({ harness, tool: harness === "codex" ? "Codex" : "Claude Code", can, ...extra });

describe("who reaches whom (D470)", () => {
  test("each way read off what Mem said, and the fix only where Ducter can start it", () => {
    expect(reachWays(row("codex", "yes", { box: "open" }))).toEqual({ to: "yes", back: "yes" });
    expect(reachWays(row("claude-code", "yes", { box: "closed", device: "local" }))).toEqual({ to: "yes", back: "no", fix: "mailbox" });
    expect(reachWays(row("claude-code", "yes", { box: "closed" }))).toEqual({ to: "yes", back: "no" });
    expect(reachWays(row("codex", "yes"))).toEqual({ to: "yes", back: "unknown" });
    expect(reachWays(row("codex", "install", { device: "local" }))).toEqual({ to: "no", back: "no", fix: "install" });
    expect(reachWays(row("codex", "unknown"))).toEqual({ to: "unknown", back: "unknown" });
    expect(reachWays({ can: "none" })).toEqual({ to: "no", back: "no" });
  });
  test("split: both ways, one way, not yet; pi is Mem's to add (D555: Antigravity is a Bridge tool)", () => {
    const s = reachSplit([row("codex", "yes", { box: "open" }), row("claude-code", "yes", { box: "closed", device: "local" }), { harness: "pi", tool: "pi", can: "relay" }]);
    expect([s.both.map((r) => r.harness), s.oneWay.map((r) => r.harness), s.notYet.length]).toEqual([["codex"], ["claude-code"], 0]);
  });
});

const codex = { mine: true, agent: "Codex", selfNamed: true, role: "Mem 协作" };
const cc = { mine: true, agent: "Claude Code" };
const feed = () => {
  let seq = 0;
  const e = (x: Record<string, unknown>, h: number) => ({ ev: { seq: ++seq, ts: new Date(Date.UTC(2026, 10, 22, h)).toISOString() }, ...x });
  return [
    e({ peer: { direction: "in", messageId: "a", ...codex, text: "重跑 benchmark" } }, 1),
    e({ peer: { direction: "out", messageId: "c", inReplyTo: "a", taskId: "t1", ...codex, text: "接下了", opId: "o1", state: "sent" } }, 1),
    e({ peer: { direction: "in", messageId: "b", ...codex, text: "怎么修的？" } }, 2),
    e({ peer: { direction: "out", messageId: "r", inReplyTo: "b", ...codex, text: "先等 indexReady()", opId: "o2", state: "sent" } }, 2),
    e({ peer: { direction: "out", messageId: "q", decisionId: "d", ...cc, text: "今晚还修吗？", opId: "o3", state: "sent" } }, 3),
    e({ peer: { direction: "in", messageId: "x", ...cc, text: "CI 红了" } }, 4),
    e({ peer: { direction: "in", messageId: "k", ...codex, text: "要你定" } }, 5),
    e({ peer: { direction: "in", messageId: "h", ...codex, text: "发布清单" } }, 6),
    e({ ai: { text: "你的 Codex 把发布清单发过来了，要我去跑吗？" } }, 6),
  ];
};

describe("the exchanges as threads (D470)", () => {
  const ops = new Map([["o4", { seq: 99, ts: "2026-11-22T04:30:00.000Z", b: { direction: "out" as const, inReplyTo: "x", ...cc, text: "是昨晚的改动", opId: "o4", state: "failed" } }]]);
  const decisions = [{ asker: { messageId: "k" } }];
  const th = exchangeThreads(feed(), ops, decisions);
  test("one thread per agent, newest first, each with what came of it", () => {
    expect(th.map((t) => t.agent)).toEqual(["Codex", "Claude Code"]);
    expect(th[0]!.items.map((x) => [x.words, x.outcome.kind])).toEqual([
      ["发布清单", "told"],
      ["要你定", "card"],
      ["怎么修的？", "replied"],
    ]);
    expect(exchangeThreads(feed(), ops, decisions, 9)[0]!.items.at(-1)!.outcome).toEqual({ kind: "task", taskId: "t1" });
    expect(th[1]!.items.map((x) => [x.way, x.outcome.kind])).toEqual([
      ["in", "replied"],
      ["asked", "waiting"],
    ]);
    expect(th[1]!.items[0]!.outcome).toEqual({ kind: "replied", words: "是昨晚的改动", state: "failed" });
  });
  test("an answer to the partner's question is said on it, not as an exchange of its own", () => {
    const f = [...feed(), { ev: { seq: 50, ts: "2026-11-22T07:00:00.000Z" }, peer: { direction: "in" as const, messageId: "z", inReplyTo: "q", ...cc, text: "修，十点前" } }];
    const t = exchangeThreads(f, ops, decisions).find((x) => x.agent === "Claude Code")!;
    expect(t.items.map((x) => x.outcome)).toContainEqual({ kind: "answered", words: "修，十点前" });
    expect(t.items.some((x) => x.words === "修，十点前")).toBe(false);
  });
  test("a resolved card is the person's word: go or held", () => {
    expect(exchangeThreads(feed(), ops, [{ asker: { messageId: "k" }, resolved: { option: "hold" } }])[0]!.items[1]!.outcome.kind).toBe("held");
    expect(exchangeThreads(feed(), ops, [{ asker: { messageId: "k" }, resolved: { option: "go" } }])[0]!.items[1]!.outcome.kind).toBe("go");
  });
});

describe("who may ask what (D470, bridge.md X1–X3)", () => {
  test("by the rules in code", () => {
    const p = { trusted: ["Codex"], muted: ["spam"] };
    expect(trustOf({ agent: "Codex", mine: true }, p)).toBe("trusted");
    expect(trustOf({ agent: "Claude Code", mine: true }, p)).toBe("own");
    expect(trustOf({ agent: "reviewer (dev team)" }, p)).toBe("team");
    expect(trustOf({ agent: "spam", mine: true }, p)).toBe("muted");
  });
  test("the limits said are the partner's own", () => {
    const out = read("../../packages/partner/src/bridge-out.ts");
    expect(out).toContain(`export const SENDER_DAILY = ${SENDER_DAILY};`);
    expect(out).toContain(`export const TRUSTED_DAILY = ${TRUSTED_DAILY};`);
  });
});

describe("the conversation says it once (D470)", () => {
  test("a request the partner's next words say gives way to its origin line", () => {
    const f = feed();
    const { hidden, origin } = spokenPeers(f as never, () => false);
    expect([...hidden]).toEqual([8]);
    expect(origin.get(9)?.messageId).toBe("h");
  });
  test("a card asked for it, or the person speaking first, keeps the line", () => {
    const f = feed();
    expect(spokenPeers(f as never, (id) => id === "h").hidden.size).toBe(0);
    const g = [...f.slice(0, 8), { ev: { seq: 20, ts: "" }, user: { text: "?" } }, f[8]!];
    expect(spokenPeers(g as never, () => false).hidden.size).toBe(0);
  });
  test("both clients use it", () => {
    expect(read("src/app.ts")).toContain("spokenPeers(rows,");
    expect(read("src/views.tsx")).toContain("A.peerSpoken.has(e.ev.seq)");
    expect(read("../desktop/internal/views/conversation.go")).toContain("spokenPeers(es, a.peerAsked)");
  });
});

describe("the words (D470)", () => {
  const go = read("../desktop/internal/i18n/memory.go");
  const mine = Object.keys(memoryWords.zh).filter((k) => /^(say\.peers\.|need\.peers\.|peers\.(agents|st|fix|last|ex|trust|rules)\b|peer\.origin)/.test(k));
  test("zh and en together, the same on the Mac, no counter word, no dot-joined facts", () => {
    expect(mine.length).toBeGreaterThan(30);
    for (const lang of ["zh", "en"] as const)
      for (const k of mine) {
        const w = memoryWords[lang][k]!;
        expect(w, `${lang} ${k}`).toBeTruthy();
        expect(go).toContain(JSON.stringify(w));
        expect(w).not.toContain(" · ");
        expect(w).not.toMatch(/\d\s*件|%d\s*件/);
      }
  });
  test("the retired words are gone: the week's count, the waiting dot, Recently's who-to-who", () => {
    for (const k of ["peers.wait.title", "peers.wait.line", "peers.week.count", "peers.week.none", "peers.head.on", "peers.recent.title", "peers.recent.in", "peers.reach.title", "peers.reach.yes.open"]) {
      expect(memoryWords.zh[k], k).toBeUndefined();
      expect(go).not.toContain(`"${k}":`);
    }
    expect(read("src/memory.tsx")).not.toContain("handoff-wait");
    expect(read("../desktop/internal/views/peers_pane.go")).not.toContain("handoffDot");
  });
});

describe("the fix is the button (D470)", () => {
  test("Open its mailbox is one task through the agent's own plugin, never Ducter's own connection", () => {
    const b = memSetupBrief({ agent: "Claude Code", host: "claude-code", device: "Mac", lang: "en", what: { kind: "mailbox" } });
    expect(b).toContain("--enable");
    expect(b).toContain("Never touch Ducter's own Nowledge Mem connection");
    expect(read("../../packages/protocol/src/index.ts")).toContain('{ t: "mem_plugin_install"; device: string; harness: string; what?: "mailbox"; space?: { id: string; label: string } }'); // D480: with the Space chosen in place
  });
  test("a one-way link is what needs you on Overview, with that button", () => {
    expect(read("src/settings-home.tsx")).toContain('fix: { kind: "mailbox", device: r.device!, harness: r.harness }');
    expect(read("../desktop/internal/views/settings_home.go")).toContain("a.chooseMailbox(n.boxDevice, n.boxHarness)"); // D480: chosen in place
  });
});

// D470 round 2: hel's Log (2026-11-22, read only): one reply to the person's own Claude Code logged as two
// bridge_msg out events six seconds apart (same words, same inReplyTo), while Mem held one delivered reply;
// and the request logged with from "another agent" beside agent "Claude Code", mine, selfNamed.
describe("round 2: one delivered reply is one line, the sender by its name", () => {
  const req = { direction: "in" as const, messageId: "m-cc", from: "another agent", agent: "Claude Code", mine: true, selfNamed: true, text: "联络测试：你那边现在几点？" };
  const reply = (opId: string, state: string) => ({ direction: "out" as const, messageId: state === "sent" ? `r-${opId}` : "", to: "another agent", agent: "Claude Code", mine: true, selfNamed: true, text: "现在 01:52，手上 0 个任务在跑。", inReplyTo: "m-cc", opId, state });
  const ev = (body: unknown, seq: number, ts: string) => ({ seq, ts, persona: "p", stream: "channel", origin: "partner", kind: "bridge_msg", body }) as never;
  test("the conversation shows it once, whether the second is the same op or another", () => {
    for (const second of [reply("bo1", "sent"), reply("bo2", "sent")]) {
      const s = new Store();
      s.apply({ t: "events", events: [ev(req, 1, "2026-11-22T01:51:00Z"), ev(reply("bo1", "sending"), 2, "2026-11-22T01:52:23Z"), ev(reply("bo1", "sent"), 3, "2026-11-22T01:52:29Z"), ev(second, 4, "2026-11-22T01:52:35Z")] } as never);
      expect(s.channel.filter((e) => e.peer?.direction === "out").length).toBe(1);
      const th = exchangeThreads(s.channel as never, s.outOps as never);
      expect(th.map((x) => [x.agent, x.items.length, x.items[0]!.outcome.kind])).toEqual([["Claude Code", 1, "replied"]]);
    }
  });
  test("the partner logs a sent op once, and names a known sender by its name", () => {
    expect(read("../../packages/partner/src/partner.ts")).toContain('foldOut(loggedBridge()).get(base.opId)?.state === "sent"');
    expect(read("../../packages/partner/src/bridge.ts")).toContain('const from = said0 === "another agent" ? (agent ?? self?.agent ?? said0) : said0;');
  });
  test("the person's own agent asking only for status, in their own place, gets its answer without a card", () => {
    const own = renderBridge({ ...req, messageId: "m1" } as never);
    expect(own).toContain("answer it now with bridge_reply");
    expect(own).toContain("and no card");
    expect(renderBridge({ ...req, messageId: "m2", shared: true, spaceLabel: "Everyone" } as never)).not.toContain("and no card");
    expect(renderBridge({ direction: "in", messageId: "m3", from: "reviewer (dev team)", text: "?", spaceLabel: "dev team" } as never)).not.toContain("and no card");
  });
});
