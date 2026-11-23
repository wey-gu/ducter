// D444: Nowledge Mem in the person's day. What Mem's grouped contact list says of a tool's mailbox, what a
// message handed over from Mem (by its title, never its address), a fresh 记下了 line shown once under the
// reply with 别记这个, and 让它说说它记得你什么 on the Memory pane. The Mac has the same rules
// (apps/desktop/internal/views/mem_d444_test.go) and the same words (internal/i18n/memory.go).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { reachRows } from "../src/mem-view.ts";
import { memoryWords } from "../src/i18n-memory.ts";

const src = (f: string) => readFileSync(join(import.meta.dir, "../src", f), "utf8");
const KEYS = ["peers.st.both", "peers.st.oneway","peers.ref", "peers.ref.inline", "peers.ref.plan", "peers.ref.none.memory", "peers.ref.none.artifact", "peers.ref.none.thread", "peers.ref.none.plan", "peers.ref.none.other", "mem.about.ask", "mem.about.ask.words"];

describe("能找到{name}的 with Mem's contact list (D444)", () => {
  const dev = { id: "local", name: "Mac", home: true, harnesses: [{ harness: "claude-code", installed: true, loggedIn: true, mem: { state: "installed" } }] };
  test("a mailbox Mem lists as open makes a tool able; closed is said; pi and Antigravity unchanged", () => {
    const rows = reachRows([dev], [], [], [{ harness: "claude-code", open: false }, { harness: "codex", open: true }, { harness: "pi", open: true }]);
    expect(rows.map((r) => [r.harness, r.can, r.box ?? ""])).toEqual([
      ["claude-code", "yes", "closed"],
      ["codex", "yes", "open"],
      ["pi", "none", ""],
    ]);
    expect(reachRows([dev], [], []).map((r) => r.box)).toEqual([undefined]);
  });
  test("the line says what Mem said, and pi's stays its own", () => {
    const m = src("memory.tsx");
    // D489: what Mem said is said as what the person gets (peers.st.*); pi and Antigravity share their own row.
    expect(m).toContain("t(`peers.st.${st}`)");
    expect(m).toContain('r.can === "relay" || r.can === "none"');
    expect(m).toMatch(/A\.bridge\?\.mailboxes\)/);
  });
});

describe("the words, both languages, the same on the Mac", () => {
  // The Mac's memory.go equals memoryWords, key for key: words.test.ts (D488).
  test("every D444 word in zh and en", () => {
    for (const lang of ["zh", "en"] as const) for (const k of KEYS) expect(memoryWords[lang][k], `${lang} ${k}`).toBeTruthy();
    expect(memoryWords.zh["peers.st.both"]).toBe("能把事交给我，也收得到我的回话");
  });
  test("别记这个 is the fresh line's button, and the Memory pane says it can be said", () => {
    const i18n = src("i18n.ts");
    expect(i18n).toContain('"memory.undo": "别记这个"');
    expect(i18n).toContain(`"memory.undo": "Don't keep this"`);
    expect(memoryWords.zh["mem.switch.note"]).toContain("别记这个");
  });
});

describe("in the conversation", () => {
  const v = src("views.tsx");
  test("a fresh Noted line shows under the reply; once the person speaks it folds into Details", () => {
    expect(v).toMatch(/const shown = noted\.filter\(\(n\) => A\.notedState\(n\.seq\)\.fresh\);/);
    expect(v).toMatch(/\{folded\.map\(\(n\) => \(\s*<NotedLine/);
  });
  test("a nowledgemem:// address reads as its title; a handed-over thing named once", () => {
    expect(v).toMatch(/text: withRefTitles\(b\.text, refs\)/);
    expect(v).toMatch(/refs\.filter\(\(r\) => !\(r\.uri && r\.title && b\.text\.includes\(r\.uri\)\)\)/);
  });
});
