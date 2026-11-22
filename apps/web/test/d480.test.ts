// D480: an agent's mailbox, its Space chosen in place under its link row (web and Mac alike), and
// another Mem server said as a fact on the row. Core's side is packages/core/test/d480.test.ts.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { reachRows, reachSplit, reachWays, type ReachRow } from "../src/mem-view.ts";
import { memoryWords } from "../src/i18n-memory.ts";

const read = (p: string) => readFileSync(join(import.meta.dir, "..", p), "utf8");
const row = (extra: Partial<ReachRow> = {}): ReachRow => ({ harness: "claude-code", tool: "Claude Code", can: "yes", ...extra });

describe("another Mem is its own reason (D480)", () => {
  test("apart: neither way meets, and the fix is the same Mem, never the mailbox", () => {
    expect(reachWays(row({ box: "closed", device: "mac", apart: { theirs: "cloud.nowledge.co", ours: "hel.siwei.info" } }))).toEqual({ to: "no", back: "no", fix: "server" });
    expect(reachWays(row({ box: "closed", device: "mac" }))).toEqual({ to: "yes", back: "no", fix: "mailbox" });
  });
  test("read from that computer's own Mem and the partner's; unknown on either side is never apart", () => {
    const dev = (server?: string) => ({ id: "mac", name: "MacBook Pro M3", ...(server ? { mem: { server } } : {}), harnesses: [{ harness: "claude-code", installed: true, loggedIn: true, mem: { state: "installed" } }] });
    expect(reachRows([dev("cloud.nowledge.co")], [], [], [], "hel.siwei.info")[0]!.apart).toEqual({ theirs: "cloud.nowledge.co", ours: "hel.siwei.info" });
    expect(reachRows([dev("hel.siwei.info")], [], [], [], "hel.siwei.info")[0]!.apart).toBeUndefined();
    expect(reachRows([dev()], [], [], [], "hel.siwei.info")[0]!.apart).toBeUndefined();
    expect(reachRows([dev("cloud.nowledge.co")], [], [])[0]!.apart).toBeUndefined();
    expect(reachSplit(reachRows([dev("cloud.nowledge.co")], [], [], [], "hel.siwei.info")).notYet.length).toBe(1);
  });
});

describe("the choice in place (D480)", () => {
  test("the row's button opens the choice, never a task; the Overview's goes there too", () => {
    const mem = read("src/memory.tsx");
    expect(mem).toContain("A.chooseMailbox(r.device!, r.harness)");
    expect(mem).toContain("A.openMailbox(r.device!, r.harness, { id: pick.id, label: pick.label })");
    expect(mem).toContain('role="radiogroup"');
    expect(read("src/settings-home.tsx")).toContain("A.chooseMailbox(f.device, f.harness), go(n.page)");
    const go = read("../desktop/internal/views/mailbox_d480.go");
    expect(go).toContain("a.openMailbox(r.Device, r.Harness, &protocol.MailboxSpaceRef{ID: pick.ID, Label: pick.Label})");
    expect(go).toContain("ui.RoleRadioGroup");
  });
  test("every word in zh and en on both clients, the same; no typed name asked, no joined facts", () => {
    const keys = Object.keys(memoryWords.zh).filter((k) => /^(mailbox\.|say\.peers\.apart|peers\.why\.apart|peers\.fix\.server)/.test(k));
    expect(keys.length).toBe(24);
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
