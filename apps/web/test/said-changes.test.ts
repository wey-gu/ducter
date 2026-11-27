// D296: a consequential change says what it did. The words wait for the home's own answer (never
// the tap), say what will now happen, and a removal says what happens to tasks already bound to it.
// The Mac has the same rules (views/{todos,peers_d470,loadout,folderrow}_test.go).
import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { A } from "../src/app.ts";
import { saidClear, saidNow } from "../src/set-grid.tsx";
import { todoSetSaid, TS } from "../src/todos.tsx";
import { todoWords } from "../src/i18n-todos.ts";
import { TABLES } from "../src/i18n.ts";

const read = (p: string) => readFileSync(join(import.meta.dir, "..", p), "utf8");
const before = { settings: A.settings, rules: A.rules };
afterEach(() => {
  A.settings = before.settings;
  A.rules = before.rules;
  TS.pending = undefined;
  TS.said = undefined;
  saidClear();
});
const settings = (trusted: string[], muted: string[] = []) => ({ name: "Ducter", peers: { reach: "own", trusted, muted } }) as never;

describe("a word after the home's answer, never the tap", () => {
  test("a trust change: nothing on the tap, the word once the settings frame shows it", () => {
    A.settings = settings(["Codex"]);
    A.sayAfter("peer-trust:Codex", A.L.t("said.peers.trust.ask", "Codex"), () => !(A.settings?.peers?.trusted ?? []).includes("Codex"));
    expect(saidNow("peer-trust:Codex")).toBeUndefined();
    // An answer that still has it trusted is not the change: the word keeps waiting.
    A.receive({ t: "settings", settings: settings(["Codex"]) } as never);
    expect(saidNow("peer-trust:Codex")).toBeUndefined();
    // The home's own answer, now with it no longer trusted.
    A.receive({ t: "settings", settings: settings([]) } as never);
    expect(saidNow("peer-trust:Codex")).toBe(A.L.t("said.peers.trust.ask", "Codex"));
  });

  test("a rule's removal: nothing until the home's rules frame no longer has it", () => {
    A.rules = [{ id: "r1", text: "后端的事 → Codex" } as never];
    A.sayAfter("tasks-rule", A.L.t("loadout.rule.removed", "后端的事：Codex"), () => !(A.rules ?? []).some((r) => r.id === "r1"));
    expect(saidNow("tasks-rule")).toBeUndefined();
    A.receive({ t: "rules", rules: [{ id: "r1", text: "后端的事 → Codex" }] } as never);
    expect(saidNow("tasks-rule")).toBeUndefined();
    A.receive({ t: "rules", rules: [] } as never);
    expect(saidNow("tasks-rule")).toBe(A.L.t("loadout.rule.removed", "后端的事：Codex"));
  });
});

describe("To-do sources (D296)", () => {
  test("新的来了 and 做完以后: the word is what the choice will now do", () => {
    expect(todoSetSaid({ whenNew: "take" }, "github")).toBe(A.L.t("said.todos.new.take"));
    expect(todoSetSaid({ whenNew: "tell" }, "github")).toBe(A.L.t("said.todos.new.tell"));
    expect(todoSetSaid({ whenNew: "quiet" }, "obsidian")).toBe(A.L.t("said.todos.new.quiet"));
    expect(todoSetSaid({ whenDone: "close" }, "github")).toBe(A.L.t("said.todos.done.close"));
    expect(todoSetSaid({ whenDone: "ask" }, "github")).toBe(A.L.t("said.todos.done.ask"));
    expect(todoSetSaid({ whenDone: "ask" }, "obsidian")).toBe(A.L.t("said.todos.done.ask.obsidian"));
    expect(todoSetSaid({ whenDone: "tick" }, "obsidian")).toBe(A.L.t("said.todos.done.tick"));
    expect(todoSetSaid({ whenDone: "leave" }, "obsidian")).toBe(A.L.t("said.todos.done.leave"));
  });

  test("the said line comes only from the source_result frame, and says what stays", async () => {
    await import("../src/todos.tsx"); // registers A.onSourcesFrame
    TS.pending = { id: "src_gh", name: "GitHub", kind: "github", patch: { whenDone: "close" } };
    expect(saidNow("todos:src_gh")).toBeUndefined();
    A.onSourcesFrame?.({ t: "source_result", op: "set", ok: true, id: "src_gh" } as never);
    expect(saidNow("todos:src_gh")).toBe(A.L.t("said.todos.done.close"));
    TS.pending = { id: "src_gh", name: "GitHub", kind: "github", remove: true };
    A.onSourcesFrame?.({ t: "source_result", op: "remove", ok: true, id: "src_gh" } as never);
    expect(saidNow("todos-remove")).toBe(A.L.t("said.todos.remove", "GitHub"));
  });

  test("the remove ask and its word say what happens to tasks already taken", () => {
    const zh = todoWords.zh;
    const en = todoWords.en;
    for (const k of ["todos.remove.ask", "said.todos.remove"]) {
      expect(zh[k]).toContain("已经接下的事还在");
      expect(zh[k]).toContain("不会再写回去");
      expect(en[k]).toContain("Tasks it took stay");
      expect(en[k]).toContain("won't write back");
    }
  });

  test("the pane asks for the errors, the whole head and Jira's line, never a raw row", () => {
    const src = read("src/todos.tsx");
    expect(src).toContain("todos.error.line");
    expect(src).toContain("todos.details");
    expect(src).toContain("<GBlock>");
    expect(src).toContain("todos.jira.line");
    expect(src).not.toContain("todos.jira.sub");
    expect(todoWords.zh["todos.add.first"]).toBe("可以加上这些");
    expect(todoWords.en["todos.add.first"]).toBe("You can add these");
    expect(todoWords.zh["todos.jira.line"]).toContain("即将推出");
    expect(todoWords.en["todos.details"]).toBe("Details");
  });
});

describe("the two new confirms and their words (D296)", () => {
  test("a rule's removal asks in place, then says what will now happen", () => {
    const src = read("src/partner-story.tsx");
    expect(src).toContain("GConfirm");
    expect(src).toContain('t("loadout.rule.remove.ask", ruleWords(r.text))');
    expect(src).toContain('A.sayAfter("tasks-rule", t("loadout.rule.removed", ruleWords(r.text))');
    expect(TABLES.zh["loadout.rule.removed"]).toBe("好，以后不按「%s」了。");
    expect(TABLES.en["loadout.rule.removed"]).toBe("Got it: I won’t go by “%s” any more.");
  });

  test("改成 ~/Ducter asks in place, and the move's word waits for the home's answer", () => {
    const web = read("src/folder-row.tsx");
    expect(web).toContain('t("settings.folder.toMac.ask")');
    expect(web).toContain('t("settings.folder.toMac.go")');
    expect(web).toContain("st.ask");
    expect(read("src/app.ts")).toContain('say(`folder:${hit?.[0] ?? dev}`, this.L.t("said.folder.moved", tilde(f.path)))');
    for (const l of ["zh", "en"] as const) {
      expect(TABLES[l]["settings.folder.toMac.ask"]).toContain("~/Ducter");
      expect(TABLES[l]["said.folder.moved"]).toContain("%s");
    }
  });

  test("Agent messaging's trust changes each get their word", () => {
    const src = read("src/memory.tsx");
    expect(src).toContain("A.sayAfter(");
    for (const k of ["said.peers.trust.ask", "said.peers.trust.mute", "said.peers.trust.undo"])
      for (const l of ["zh", "en"] as const) expect(TABLES[l][k] ?? (l === "zh" ? todoWords.zh[k] : todoWords.en[k])).toBeTruthy();
  });
});
