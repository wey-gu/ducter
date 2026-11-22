// D480: an agent's mailbox, its Space chosen in place under its link row (web and Mac alike). Core's
// side is packages/core/test/d480.test.ts. Round 2: no "another Mem" is ever said from API URLs (the
// home's relay is the same Mem); the author's case is one way with the Space choice.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { reachRows, reachWays } from "../src/mem-view.ts";
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
    const keys = Object.keys(memoryWords.zh).filter((k) => /^mailbox\./.test(k));
    expect(keys.length).toBe(17);
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
