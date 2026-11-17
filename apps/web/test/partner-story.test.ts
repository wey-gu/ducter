// D322: Settings › Partner as one story: its words in both languages and the same as the Mac's, no
// " · " joins (D291), only the shared controls and the grid's pieces, and what counts as "can think"
// and "can do tasks" for the five cases.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { strings } from "../src/i18n.ts";

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
const KEYS = [
  "loadout.brain.title", "loadout.tasks.title", "loadout.brain.none", "loadout.brain.none.line", "loadout.model.default.line",
  "loadout.brain.fallback", "loadout.brain.key", "loadout.acct.paid.short", "loadout.use", "said.brain", "loadout.tasks.how",
  "loadout.tasks.only", "loadout.acct.thinks", "said.tasks.on", "said.tasks.off", "loadout.rule.line", "loadout.rule.add.line",
  "loadout.tasks.override", "loadout.add.title", "loadout.add.none", "loadout.add.one", "loadout.add.more", "loadout.add.install",
  "loadout.add.install.go", "loadout.add.signin", "loadout.add.signin.go", "partner.header.none", "handoff.one",
];

test("every word in zh and en, never a dot join, the same as the Mac's", () => {
  const mac = readFileSync(new URL("../../desktop/internal/i18n/loadout.go", import.meta.url), "utf8");
  for (const lang of ["zh", "en"] as const) {
    const L = strings(lang);
    for (const k of KEYS) {
      const v = L.t(k, "X");
      expect(v).not.toBe(k);
      expect(v).not.toContain(" · ");
      const raw = L.t(k);
      expect(mac).toContain(`"${k}":`);
      expect(mac).toContain(JSON.stringify(raw).replace(/%/g, "%"));
    }
  }
  expect(strings("zh").t("loadout.brain.title")).toBe("想事情用");
  expect(strings("zh").t("loadout.tasks.title")).toBe("做事的");
  expect(strings("en").t("loadout.add.title")).toBe("Add another AI agent");
});

test("partner-story.tsx is built from the grid's pieces and the shared controls only", () => {
  const f = src("partner-story.tsx");
  expect(f.match(/<(button|input|select|textarea|a)\b/g) ?? []).toEqual([]);
  expect(f.match(/<[a-z][a-z0-9]*\b[^>]*\bon(Click|Input|Change|KeyDown)=/g) ?? []).toEqual([]);
  // No art inside the groups beyond the 40 tile (D289): every coin is drawn at 40.
  expect([...f.matchAll(/<Coin [^>]*size=\{(\d+)\}/g)].map((m) => m[1])).toEqual(["40"]);
  // The old pieces are gone from the page: no tray, no socket, no separate key card.
  const v = src("views.tsx");
  expect(v).not.toContain("function Loadout(");
  expect(v).not.toContain("<KeyRow");
});

test("can think, can do tasks: the five cases", async () => {
  const { A } = await import("../src/app.ts");
  const { noBrain, readyAgents } = await import("../src/partner-story.tsx");
  const off = (harness: string) => ({ harness, installed: false, loggedIn: false, canBePartner: false });
  const on = (harness: string, billing: "plan" | "usage" = "plan") => ({ harness, installed: true, loggedIn: true, canBePartner: true, billing });
  const cases: [string, any[], boolean, number][] = [
    ["one agent", [off("claude-code"), on("codex")], false, 1],
    ["two agents", [on("claude-code"), on("codex")], false, 2],
    ["none", [{ harness: "claude-code", installed: true, loggedIn: false, canBePartner: true }, off("codex")], true, 0],
    ["key only", [off("claude-code"), off("codex"), on("deepseek-harness", "usage")], false, 1],
    ["not said yet", [], false, 0],
  ];
  for (const [name, agents, none, ready] of cases) {
    A.agents = agents;
    expect([name, noBrain()]).toEqual([name, none]);
    expect([name, readyAgents().length]).toEqual([name, ready]);
  }
});
