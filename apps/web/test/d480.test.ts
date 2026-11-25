// D480, D489: an agent's mailbox, its Space chosen in place under its row (web and Mac alike). Core's
// side is packages/core/test/d480.test.ts. Round 2: no "another Mem" is ever said from API URLs (the
// home's relay is the same Mem); the author's case is one way with the Space choice.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { reachRows, reachWays, standing, type ReachRow } from "../src/mem-view.ts";
import { memoryWords } from "../src/i18n-memory.ts";

const read = (p: string) => readFileSync(join(import.meta.dir, "..", p), "utf8");

describe("the author's case (D480 round 2)", () => {
  test("Claude Code on the Mac (its tasks carried through the home's relay), its mailbox closed: one way, the Space choice", () => {
    const mac = { id: "mac", name: "MacBook Pro M3", mem: { state: "ready", carried: true }, harnesses: [{ harness: "claude-code", installed: true, loggedIn: true, mem: { state: "installed" } }] };
    const [r] = reachRows([{ id: "local", name: "hel", home: true, harnesses: [] }, mac], [], [], [{ harness: "claude-code", open: false }]);
    expect(r!.device).toBe("mac");
    expect(reachWays(r!)).toEqual({ to: "yes", back: "no", fix: "mailbox" });
  });
  test("nothing on either client compares Mem servers or says another Mem", () => {
    for (const f of ["src/mem-view.ts", "src/memory.tsx", "../../packages/core/src/mem-plugins.ts", "../../packages/core/src/core.ts", "../../packages/protocol/src/mailbox.ts", "../desktop/internal/views/peers_d470.go", "../desktop/internal/views/mailbox_d480.go"]) {
      const s = read(f);
      expect(s, f).not.toMatch(/memApart|memHost|serverNow|withApart|peers\.why\.apart|fix\.server|mailbox\.same/);
    }
    for (const lang of ["zh", "en"] as const) expect(Object.values(memoryWords[lang]).join("\n")).not.toMatch(/另一个 Nowledge Mem|another Nowledge Mem/);
  });
});


// D489: the pane says what each agent can do as what the person gets, and the one-way link is an offer
// with its Space already in it (D480's facts stand: Mem never picks a Space, the person's tap does).
describe("each agent said as what the person gets (D489)", () => {
  const row = (harness: string, can: ReachRow["can"], o: Partial<ReachRow> = {}): ReachRow => ({ harness, tool: harness, can, ...o });
  test("every true state, read off what Mem said", () => {
    expect(standing(row("codex", "yes", { box: "open" }))).toBe("both");
    expect(standing(row("claude-code", "yes", { box: "closed", device: "mac" }))).toBe("oneway");
    expect(standing(row("claude-code", "yes", { box: "closed" }))).toBe("oneway");
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
});

describe("one tap, the Space already in it (D489, D480)", () => {
  test("the pane looks the Spaces up once by itself (read only); the tap opens it in the Space shown; another Space is a quiet link to the real list", () => {
    const mem = read("src/memory.tsx");
    expect(mem).toContain("A.mailboxAsked.add(key)");
    expect(mem).toContain("A.openMailbox(r.device!, r.harness, { id: pick.id, label: pick.label })");
    expect(mem).toContain('role="radiogroup"');
    expect(read("src/settings-home.tsx")).toContain("A.chooseMailbox(f.device, f.harness), go(n.page)");
    const go = read("../desktop/internal/views/mailbox_d480.go");
    expect(go).toContain("a.openMailbox(r.Device, r.Harness, &protocol.MailboxSpaceRef{ID: p.ID, Label: p.Label})");
    expect(go).toContain("ui.RoleRadioGroup");
    expect(read("../desktop/internal/views/peers_d470.go")).toContain("a.mailboxAsked[key] = true");
  });
  test("never the first Space by default: without Ducter's suggestion the person picks", () => {
    expect(read("src/app.ts")).toContain("pick: c.pick ?? f.look.recommend }");
    expect(read("../desktop/internal/views/mailbox_d480.go")).not.toContain("f.Look.Spaces[0].ID");
  });
  test("every word in zh and en on both clients, the same; no typed name asked, no joined facts", () => {
    const keys = Object.keys(memoryWords.zh).filter((k) => /^mailbox\./.test(k));
    expect(keys.length).toBe(18);
    const goWords = read("../desktop/internal/i18n/memory.go");
    for (const lang of ["zh", "en"] as const) {
      for (const k of keys) {
        const w = memoryWords[lang][k];
        expect(w, `${lang} ${k}`).toBeTruthy();
        expect(goWords, `Go ${lang} ${k}`).toContain(`${JSON.stringify(k)}:`);
        expect(goWords).toContain(JSON.stringify(w).slice(1, -1).replaceAll("\\u2026", "…"));
        expect(w).not.toContain(" · ");
        expect(w).not.toMatch(/件|回复.*名称|type the|Space name/);
      }
    }
  });
});
