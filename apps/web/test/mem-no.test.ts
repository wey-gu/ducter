// D669 (#4): Mem's no reaches the person, on the web. 去 Nowledge Mem 看 goes where Mem
// lives (the site only for Cloud); an unregistered refusal code is a fact behind 详情, never the
// line; the policy_invalid family has one sentence and no Try again; the stuck mailbox keeps its
// code behind 详情. The Mac has the same rules (mem_no_test.go).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BridgeView } from "@ducter/protocol";
import { memOpenTarget } from "../src/mem-view.ts";
import { strings, TABLES } from "../src/i18n.ts";

const src = (f: string) => readFileSync(join(import.meta.dir, "../src", f), "utf8");
const b = (x: Partial<BridgeView> = {}): BridgeView => ({ state: "connected", identity: "ducter", home: "hel", ...x });

describe("the app link goes where Mem lives (D669 #4)", () => {
  test("Cloud: its site; a local Mem or one's own server: the app on the computer; unknown: no link", () => {
    expect(memOpenTarget(b({ where: "cloud" }))).toBe("site");
    expect(memOpenTarget(b({ where: "local" }))).toBe("app");
    expect(memOpenTarget(b({ state: "local_mem" }))).toBe("app");
    expect(memOpenTarget(b({ where: "server" }))).toBe("app");
    expect(memOpenTarget(b())).toBeUndefined();
    expect(memOpenTarget(undefined)).toBeUndefined();
  });

  test("the count row uses it, and a server's label names the computer", () => {
    const m = src("memory.tsx");
    expect(m).toMatch(/const open = memOpen\(b\);/);
    expect(m).toMatch(/open\?\.how === "site" \? \(/);
    expect(m).toMatch(/A\.openBridgeMem\(\)/);
    expect(m).toContain('t("mem.all.open.server", home)');
    const zh = strings("zh");
    const en = strings("en");
    expect(zh.t("mem.all.open.server", "hel")).toBe("在 hel 上打开 Nowledge Mem");
    expect(en.t("mem.all.open.server", "hel")).toBe("Open Nowledge Mem on hel");
  });
});

describe("no Mem code in a line (D669 #4)", () => {
  test("every bridge, Mem and Agent messaging word, both languages", () => {
    for (const lang of ["zh", "en"] as const) {
      for (const [key, text] of Object.entries(TABLES[lang])) {
        if (!/^(bridge|mem|peers)\./.test(key)) continue;
        expect([lang, key, /cloud_bridge_setup_|policy_invalid|（%s）|\(%s\)/.test(text)], `${lang} ${key}`).toEqual([lang, key, false]);
      }
    }
  });

  test("policy_invalid has its one line, and a refused state offers no Try again", () => {
    const line = "这个 Nowledge Mem 工作区还没让这台电脑收发消息";
    for (const lang of ["zh", "en"] as const) {
      expect(strings(lang).t("bridge.refused.policy_invalid.title")).toBeTruthy();
      expect(strings(lang).t("bridge.refused.policy_invalid.line")).toContain(lang === "zh" ? line : "hasn't let this computer send or receive yet");
    }
  });

  test("the stuck mailbox's code is behind 详情, never in the line", () => {
    const m = src("memory.tsx");
    expect(m).toMatch(/line=\{t\("peers\.stuck\.line", name\)\}/);
    expect(m).toMatch(/<MemMore label=\{t\("mem\.details"\)\} text=\{\[t\("mem\.details\.code"\), code\]\} \/>/);
    expect(TABLES.zh["peers.stuck.line"]).not.toContain("%s）");
    expect(TABLES.en["peers.stuck.line"]).not.toContain("(%s)");
  });

  test("the failed code is its own fact in the pane's 详情", () => {
    expect(src("memory.tsx")).toMatch(/\["mem\.details\.code", b\.code\]/);
    expect(TABLES.zh["mem.details.code"]).toBe("Mem 的代码");
    expect(TABLES.en["mem.details.code"]).toBe("Mem's code");
  });
});
