// D169 on the phone: an agent's Nowledge Mem line in its device card, in the same words as the
// Mac; 装上 goes to the server; a refusal is kept for the card; Ducter's one card reads in words.
import { expect, test } from "bun:test";
import { strings, TABLES } from "../src/i18n.ts";

test("the line per state, in zh and en, never claiming more than the check knows", async () => {
  const { memWords: words } = await import("../src/format.ts");
  let L = strings("zh");
  const memWords = (m: any) => words(L, m);
  expect(memWords({ state: "installed", version: "0.7.34" })).toEqual({ line: "装着 Nowledge Mem 0.7.34" });
  expect(memWords({ state: "absent" })).toEqual({ line: "Nowledge Mem 没装", action: "安装" });
  expect(memWords({ state: "review", why: "multiple" })).toEqual({ line: "Nowledge Mem 装了不止一份，需要检查", action: "理成一份" });
  expect(memWords({ state: "absent", taskId: "t1" })).toEqual({ line: "正在安装 Nowledge Mem…", busy: "安装中…" });
  L = strings("en");
  expect(memWords({ state: "update" })).toEqual({ line: "Nowledge Mem has an update", action: "Update" });
  expect(memWords({ state: "review", why: "unclear" }).line).toBe("Can't tell if Nowledge Mem is set up; worth a look");
});

test("D466: a newer version out from to, two copies by their versions, a task's line by what it does", async () => {
  const { memWords: words } = await import("../src/format.ts");
  let L = strings("zh");
  expect(words(L, { state: "update", version: "0.7.34", available: "0.7.37" })).toEqual({ line: "Nowledge Mem 0.7.34，有新的 0.7.37 了", action: "更新" });
  expect(words(L, { state: "review", why: "multiple", versions: ["0.1.10", "0.1.53"] })).toEqual({ line: "Nowledge Mem 装了两份：0.1.10 和 0.1.53", action: "理成一份" });
  // D552: a task on it, or the tap still on its way (busy): the line says to which version, the button 更新中….
  expect(words(L, { state: "update", version: "0.7.34", available: "0.7.37", taskId: "t1" })).toEqual({ line: "正在更新到 0.7.37…", busy: "更新中…" });
  expect(words(L, { state: "update", version: "0.7.34", available: "0.7.37", busy: true })).toEqual({ line: "正在更新到 0.7.37…", busy: "更新中…" });
  expect(words(L, { state: "update", taskId: "t1" })).toEqual({ line: "正在更新 Nowledge Mem…", busy: "更新中…" });
  expect(words(L, { state: "review", why: "multiple", taskId: "t1" })).toEqual({ line: "正在把 Nowledge Mem 理成一份…", busy: "整理中…" });
  // D552: an update that took says the version it reached, with no button.
  expect(words(L, { state: "installed", version: "0.7.38", updated: true }, "Claude Code")).toEqual({ line: "已更新到 0.7.38，重开 Claude Code 就用上了" });
  expect(words(strings("en"), { state: "installed", version: "0.7.38", updated: true }, "Claude Code")).toEqual({ line: "Updated to 0.7.38; start Claude Code again to use it" });
  L = strings("en");
  expect(words(L, { state: "update", version: "0.7.34", available: "0.7.37" })).toEqual({ line: "Nowledge Mem 0.7.34; 0.7.37 is out", action: "Update" });
  expect(words(L, { state: "review", why: "multiple", versions: ["0.1.10", "0.1.53"] })).toEqual({ line: "Nowledge Mem is in twice: 0.1.10 and 0.1.53", action: "Keep one" });
  // Three copies: no list, the plain line.
  expect(words(L, { state: "review", why: "multiple", versions: ["1.0.0", "1.0.1", "1.0.2"] }).line).toBe("Nowledge Mem is installed more than once; worth a look");
});

test("D466: the ask in place says what the tap does, by the line", async () => {
  const { memAsk } = await import("../src/format.ts");
  const zh = strings("zh");
  expect(memAsk(zh, { state: "update", version: "0.7.34", available: "0.7.37" }, "Claude Code", "hel", false)).toEqual({
    ask: "要把 hel 上 Claude Code 的 Nowledge Mem 更新到 0.7.37 吗？",
    means: "会在 hel 上新建一个任务，照 Nowledge Mem 的官方说明来更新：只改 Claude Code 自己的设置，不动 Ducter。更新以后，重开 Claude Code 才用得上。",
    ok: "更新",
  });
  expect(memAsk(zh, { state: "review", why: "multiple" }, "Codex", "hel", false).ok).toBe("理成一份");
  expect(memAsk(zh, { state: "review", why: "unclear" }, "Codex", "hel", false).ok).toBe("检查");
  expect(memAsk(zh, { state: "absent" }, "Codex", "hel", true).means).toContain("Nowledge Mem 自己的命令");
  const en = strings("en");
  expect(memAsk(en, { state: "update" }, "Claude Code", "hel", false).ask).toBe("Update Nowledge Mem for Claude Code on hel?");
  expect(memAsk(en, { state: "review", why: "multiple" }, "Codex", "hel", false).ask).toBe("Keep one Nowledge Mem in Codex on hel?");
});

test("D466: Settings › Memory's rows: an update or several copies, per agent per computer, the home first; nothing else", async () => {
  const { memPluginRows } = await import("../src/mem-plugin.tsx");
  const dev = (id: string, home: boolean, hs: any[]) => ({ id, name: id, home, state: "awake", harnesses: hs }) as any;
  const rows = memPluginRows([
    dev("mini", false, [{ harness: "claude-code", installed: true, mem: { state: "update", version: "0.7.30", available: "0.7.37" } }]),
    dev("hel", true, [
      { harness: "claude-code", installed: true, mem: { state: "installed", version: "0.7.37" } },
      { harness: "codex", installed: true, mem: { state: "review", why: "multiple", versions: ["0.1.10", "0.1.53"] } },
      { harness: "pi", installed: true, mem: { state: "absent" } },
      { harness: "deepseek-harness", installed: true, mem: { state: "review", why: "unclear" } },
      { harness: "opencode", installed: false, mem: { state: "update" } },
    ]),
  ]);
  expect(rows.map((r) => `${r.dv.id}:${r.h.harness}`)).toEqual(["hel:codex", "mini:claude-code"]);
  expect(memPluginRows(undefined)).toEqual([]);
  expect(strings("zh").t("memp.row", "Codex", "hel")).toBe("hel 上的 Codex");
  expect(strings("en").t("memp.row", "Codex", "hel")).toBe("Codex on hel");
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
  expect(strings("zh").t("memp.card.question", "Codex", "Mac mini")).toBe("Mac mini 上的 Codex 还没装 Nowledge Mem。装上以后，我在那儿做事和你自己用 Codex 时都记得你；会改 Codex 自己的设置。");
});
