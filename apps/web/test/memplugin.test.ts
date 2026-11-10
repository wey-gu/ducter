// D169 on the phone: an agent's Nowledge Mem line in its device card, in the same words as the
// Mac; 装上 goes to the server; a refusal is kept for the card; Ducter's one card reads in words.
import { expect, test } from "bun:test";
import { strings, TABLES } from "../src/i18n.ts";

test("the line per state, in zh and en, never claiming more than the check knows", async () => {
  const { memWords: words } = await import("../src/format.ts");
  let L = strings("zh");
  const memWords = (m: any) => words(L, m);
  expect(memWords({ state: "installed", version: "0.7.34" })).toEqual({ line: "Nowledge Mem 已装 · 0.7.34" });
  expect(memWords({ state: "absent" })).toEqual({ line: "没装 Nowledge Mem", action: "装上" });
  expect(memWords({ state: "review", why: "multiple" })).toEqual({ line: "Nowledge Mem 装了不止一份，要看一下", action: "理一下" });
  expect(memWords({ state: "absent", taskId: "t1" })).toEqual({ line: "正在装 Nowledge Mem…" });
  L = strings("en");
  expect(memWords({ state: "update" })).toEqual({ line: "Nowledge Mem has an update", action: "Update" });
  expect(memWords({ state: "review", why: "unclear" }).line).toBe("Can't tell if Nowledge Mem is set up; worth a look");
});

test("装上 goes to the server; a refusal is kept for that agent's line", async () => {
  const { A } = await import("../src/app.ts");
  const sent: unknown[] = [];
  A.send = (f) => void sent.push(f);
  A.installMem("w1", "codex");
  expect(sent).toEqual([{ t: "mem_plugin_install", device: "w1", harness: "codex" }]);
  A.receive({ t: "mem_plugin_result", device: "w1", harness: "codex", ok: false, reason: "no_agent" } as any);
  expect(A.memAnswer).toEqual({ device: "w1", harness: "codex", reason: "no_agent" });
  A.receive({ t: "mem_plugin_result", device: "w1", harness: "codex", ok: true, taskId: "t1" } as any);
  expect(A.memAnswer).toBeUndefined();
});

test("zh and en have the same Nowledge Mem keys, and the same as the Mac", async () => {
  const keys = (l: "zh" | "en") => Object.keys(TABLES[l]).filter((k) => k.startsWith("memp.")).sort();
  expect(keys("zh")).toEqual(keys("en"));
  const mac = await Bun.file(new URL("../../desktop/internal/i18n/memplugin.go", import.meta.url)).text();
  for (const k of keys("zh")) expect(mac).toContain(`"${k}":`);
  expect(strings("zh").t("memp.card.question", "Codex", "Mac mini")).toBe("Mac mini 上的 Codex 还没有 Nowledge Mem。装上以后，你自己用 Codex 的时候它也记得你。");
});
