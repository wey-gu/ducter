// D560 (was D480, D489): whether the partner's replies reach one of the person's agents is Mem's facts,
// web and Mac alike: an active connection Mem labels with the tool, a message from one of its sessions,
// or its plugin's version (Claude Code 0.7.35+ and Codex 0.1.50+ ready each new session by themselves).
// No Space is chosen, no task opens a mailbox, and nothing is offered again while nothing has changed.
// Core's side is packages/core/test/d480.test.ts. No "another Mem" is ever said from API URLs.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { reachRows, reachWays, standing, type ReachRow } from "../src/mem-view.ts";
import { memoryWords } from "../src/i18n-memory.ts";

const read = (p: string) => readFileSync(join(import.meta.dir, "..", p), "utf8");

describe("the author's loop on hel (D560)", () => {
  const hel = (version: string, state = "installed") => ({ id: "local", name: "hel", home: true, harnesses: [{ harness: "claude-code", installed: true, loggedIn: true, mem: { state, version } }] });
  test("Claude Code 0.7.38 with no session connected yet: its next session hears back, nothing to tap; an older home's closed is not a fact", () => {
    const [r] = reachRows([hel("0.7.38")], [], [], [{ harness: "claude-code", open: false }]);
    expect(r).toMatchObject({ can: "yes", back: "next", device: "local" });
    expect(r!.box).toBeUndefined();
    expect(reachWays(r!)).toEqual({ to: "yes", back: "soon" });
    expect(standing(r!)).toBe("next");
  });
  test("a session connected (Mem's connection labelled claude-code), or a message from one: both ways", () => {
    expect(standing(reachRows([hel("0.7.38")], [], [], [{ harness: "claude-code", open: true }])[0]!)).toBe("both");
    expect(standing(reachRows([hel("0.7.38")], [], [{ agent: "Claude Code", host: "Claude Code", at: "2026-11-25T01:00:00Z" }])[0]!)).toBe("both");
  });
  test("an older plugin: its update is the one button, only where Mem offers the newer one; while it runs, said so", () => {
    const [r] = reachRows([hel("0.7.20", "update")], [], []);
    expect(r).toMatchObject({ back: "old", update: true });
    expect(reachWays(r!)).toEqual({ to: "yes", back: "no", fix: "update" });
    expect(standing(r!)).toBe("old");
    expect(reachWays(reachRows([hel("0.7.20")], [], [])[0]!)).toEqual({ to: "yes", back: "no" });
    const [busy] = reachRows([{ ...hel("0.7.20", "update"), harnesses: [{ harness: "claude-code", installed: true, loggedIn: true, mem: { state: "update", version: "0.7.20", taskId: "t1" } }] }], [], []);
    expect(busy!.busy).toBe(true);
    const mem = read("src/memory.tsx");
    expect(mem).toContain('const updating = st === "old" && !!r.busy;');
    expect(mem).toContain('const hear = st === "old" && r.update && r.device && !updating;');
  });
  test("nothing on either client chooses a Space, opens a mailbox task or compares Mem servers", () => {
    for (const f of ["src/mem-view.ts", "src/memory.tsx", "src/app.ts", "src/settings-home.tsx", "../desktop/internal/views/peers_d470.go", "../desktop/internal/views/settings_home.go"]) {
      const s = read(f);
      expect(s, f).not.toMatch(/chooseMailbox|openMailbox|mailboxChoosing|what: "mailbox"|What: "mailbox"|HearBack|hearBack/);
      expect(s, f).not.toMatch(/memApart|memHost|serverNow|withApart|peers\.why\.apart|fix\.server|mailbox\.same/);
    }
    for (const lang of ["zh", "en"] as const) expect(Object.values(memoryWords[lang]).join("\n")).not.toMatch(/另一个 Nowledge Mem|another Nowledge Mem/);
  });
});

describe("each agent said as what the person gets (D489, D560)", () => {
  const row = (harness: string, can: ReachRow["can"], o: Partial<ReachRow> = {}): ReachRow => ({ harness, tool: harness, can, ...o });
  test("every true state, read off what Mem said", () => {
    expect(standing(row("codex", "yes", { box: "open" }))).toBe("both");
    expect(standing(row("claude-code", "yes", { box: "closed", device: "mac" }))).toBe("to");
    expect(standing(row("claude-code", "yes", { back: "next", device: "mac" }))).toBe("next");
    expect(standing(row("codex", "yes", { back: "old", update: true, device: "mac" }))).toBe("old");
    expect(standing(row("codex", "yes"))).toBe("to");
    expect(standing(row("codex", "install", { device: "mac" }))).toBe("install");
    expect(standing(row("codex", "unknown"))).toBe("unknown");
    expect(standing(row("pi", "relay"))).toBe("relay");
    expect(standing(row("pi", "none"))).toBe("none");
  });
  test("both clients draw no link diagram and keep the pane's head out of the needs-you ink", () => {
    for (const f of ["src/memory.tsx", "../desktop/internal/views/peers_d470.go"]) expect(read(f), f).not.toMatch(/stroke-dasharray|lr-line|drawLinkWay|peers\.way\./);
    expect(read("src/settings-home.tsx")).toContain('page === "peers" ? [] : needsOf(page)');
    expect(read("../desktop/internal/views/settings_home.go")).toContain("if tab == TabPeers {");
  });
  test("every D560 word in zh and en on both clients, the same; the button says what the person gets", () => {
    const keys = ["peers.st.next", "peers.st.old", "peers.st.updating", "peers.fix.hear", "say.peers.next", "say.peers.mixed.next", "say.peers.oneway", "say.peers.mixed"];
    const goWords = read("../desktop/internal/i18n/memory.go");
    for (const lang of ["zh", "en"] as const) {
      for (const k of keys) {
        const w = memoryWords[lang][k];
        expect(w, `${lang} ${k}`).toBeTruthy();
        expect(goWords, `Go ${lang} ${k}`).toContain(`${JSON.stringify(k)}:`);
        expect(goWords).toContain(JSON.stringify(w).slice(1, -1));
        expect(w).not.toContain(" · ");
      }
    }
    expect(memoryWords.zh["peers.fix.hear"]).toBe("让它也能收到我的回话");
    expect(memoryWords.en["peers.fix.hear"]).toBe("Let it hear my answers");
    for (const k of ["peers.st.oneway", "peers.st.opening", "need.peers.oneway", "mailbox.in", "mailbox.other"]) expect(memoryWords.zh[k], k).toBeUndefined();
  });
});
