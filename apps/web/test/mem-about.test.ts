// D321: what it knows about you (groups by Mem's kind, each line's source) and 和你的其他 agent 通信's 试试看
// (which agents can hear the words); D332: what the pane is about, and what came and went lately.
// The Mac has the same rules (apps/desktop/internal/views/memory_about_test.go TestPeersRules).
import { describe, expect, test } from "bun:test";
import type { BridgeView } from "@ducter/protocol";
import { aboutGroups, bySource, ownsAgents, peersPhase, peersSwitchOn, recentHandoffs, tryAgents } from "../src/mem-view.ts";

describe("What it knows about you (D321)", () => {
  test("groups in a fixed order, empty kinds left out", () => {
    const g = aboutGroups([
      { id: "a", kind: "fact" as const },
      { id: "b", kind: "preference" as const },
      { id: "c", kind: "preference" as const },
    ]);
    expect(g.map((x) => `${x.kind}:${x.items.map((i) => i.id).join("")}`)).toEqual(["preference:bc", "fact:a"]);
    expect(aboutGroups([])).toEqual([]);
  });

  test("each line's source", () => {
    expect(bySource({ by: "said" })).toEqual({ key: "mem.by.said", args: [] });
    expect(bySource({ by: "tool", from: "Codex" })).toEqual({ key: "mem.by.tool", args: ["Codex"] });
    expect(bySource({ by: "tool" })).toEqual({ key: "mem.by.you", args: [] });
    expect(bySource({ by: "mem" })).toEqual({ key: "mem.by.mem", args: [] });
  });

  test("D332: what the pane is about, in each state and with the switch", () => {
    const b = (state: BridgeView["state"]): BridgeView => ({ state, identity: "ducter" });
    expect(peersPhase(undefined, true)).toBe("none");
    expect(peersPhase(b("connected"), true)).toBe("on");
    expect(peersPhase(b("connected"), false)).toBe("on"); // the revoke is on its way
    expect(peersPhase(b("disconnecting"), false)).toBe("off");
    expect(peersPhase(b("ready"), false)).toBe("off");
    for (const s of ["install_mem", "installing", "update_mem", "updating", "sign_in", "signing_in"] as const) expect(peersPhase(b(s), true)).toBe("getting");
    expect(peersPhase(b("ready"), true)).toBe("joining");
    expect(peersPhase(b("connecting"), true)).toBe("joining");
    for (const s of ["elsewhere", "refused", "failed", "unconfirmed", "no_space", "local_mem"] as const) expect(peersPhase(b(s), true)).toBe("problem");
  });

  test("D340: a home that waits to be asked shows the switch off while Mem is ready, so opening the page connects nothing", () => {
    const asks: BridgeView = { state: "ready", identity: "ducter", asks: true };
    expect(peersSwitchOn("own", asks)).toBe(false);
    expect(peersPhase(asks, peersSwitchOn("own", asks))).toBe("off");
    expect(peersSwitchOn("own", { state: "ready", identity: "ducter" })).toBe(true);
    expect(peersSwitchOn("own", { state: "connected", identity: "ducter" })).toBe(true);
    expect(peersSwitchOn("off", { state: "connected", identity: "ducter" })).toBe(false);
  });

  test("D332: whether the person runs agents of their own", () => {
    expect(ownsAgents([], [])).toBe(false);
    expect(ownsAgents(["codex"], [])).toBe(true);
    expect(ownsAgents([], [{ harnesses: [{ harness: "codex", mem: { state: "installed" } }] }])).toBe(true);
    expect(ownsAgents([], [{ harnesses: [{ harness: "codex", mem: { state: "absent" } }] }])).toBe(false);
  });

  test("D332: recently, both ways, newest first, only what really went", () => {
    const ev = (seq: number) => ({ seq, ts: "2026-11-17T10:00:00Z" });
    const got = recentHandoffs([
      { ev: ev(1), peer: { direction: "in", agent: "Claude Code", text: "fix  the\nCI" } },
      { ev: ev(2), peer: { direction: "in", agent: "Codex", text: "old", state: "early" } },
      { ev: ev(3), peer: { direction: "out", to: "Codex", text: "draft", state: "pending", decisionId: "d1" } },
      { ev: ev(4), peer: { direction: "out", to: "Codex", text: "can the PR go tonight?", state: "sent", decisionId: "d1" } },
      { ev: ev(5), peer: { direction: "out", agent: "Claude Code", text: "on it", taskId: "t1" } },
      { ev: ev(6) },
    ]);
    expect(got.map((h) => `${h.seq}:${h.way}:${h.agent}`)).toEqual(["5:replied:Claude Code", "4:sent:Codex", "1:in:Claude Code"]);
    expect(got[0]!.taskId).toBe("t1");
    expect(got[2]!.words).toBe("fix the CI");
    expect(recentHandoffs([{ ev: ev(1), peer: { direction: "in", text: "a" } }, { ev: ev(2), peer: { direction: "in", text: "b" } }], 1).map((h) => h.seq)).toEqual([2]);
  });

  test("which agents can hear the words: signed in somewhere, Mem's plugin in it, else where to put it (the home first)", () => {
    const h = (harness: string, mem?: string, loggedIn = true) => ({ harness, installed: true, loggedIn, ...(mem ? { mem: { state: mem } } : {}) });
    const a = tryAgents([
      { id: "mb", name: "MacBook", harnesses: [h("claude-code", "installed"), h("codex", "absent")] },
      { id: "mini", name: "Mac mini", home: true, harnesses: [h("codex", "absent")] },
    ]);
    expect(a).toEqual([{ harness: "claude-code", plugin: "on" }, { harness: "codex", plugin: "off", device: "mini" }]);
    expect(tryAgents([{ id: "x", name: "x", harnesses: [h("codex")] }])).toEqual([{ harness: "codex" }]);
    expect(tryAgents([{ id: "x", name: "x", harnesses: [h("codex", "installed", false)] }])).toEqual([]);
  });
});
