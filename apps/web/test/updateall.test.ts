// 全部更新 / Update all on the phone and the wide page (D224): the plan from the devices frame, each
// step in words, the buttons' frames, the apps' own last step (the Android app checks, a page the
// home now serves newer reloads back on 你的设备), and the copy equal to the Mac's.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { UpdateAllItem } from "@ducter/protocol";
import { strings } from "../src/i18n.ts";
import { updateAllWords } from "../src/i18n-updateall.ts";

const item = (o: Partial<UpdateAllItem>): UpdateAllItem => ({ key: "ducter:local", kind: "ducter", device: "local", deviceName: "hel", from: "0.0.30", to: "0.0.31", state: "queued", at: "2026-11-12T10:00:00Z", ...o });

const frame = (updateAll: unknown) =>
  ({
    t: "devices",
    devices: [{ id: "local", name: "hel", kind: "server", home: true, state: "awake", version: "0.0.30", harnesses: [], abilities: [], update: { current: "0.0.30", latest: "0.0.31", available: true, how: "self" } }],
    reach: { clients: [] },
    updateAll,
  }) as any;

describe("Update all (D224)", () => {
  test("each step reads in words: queued, waiting for tasks, the single update's own step, done, why it didn't", async () => {
    const { A } = await import("../src/app.ts");
    const { stateWords, whyWords, itemName, planTitle } = await import("../src/updateall.tsx");
    A.L = strings("zh");
    expect(itemName(item({}))).toBe("hel 上的 Ducter");
    expect(itemName(item({ kind: "agent", harness: "claude-code", deviceName: "MacBook" }))).toBe("MacBook 上的 Claude Code");
    expect(stateWords(item({}))).toBe("排队中");
    expect(stateWords(item({ kind: "agent", harness: "codex", state: "waiting", busy: 2 }))).toBe("等用它的 2 件事停下");
    expect(stateWords(item({ state: "running", phase: "downloading", progress: 0.42 }))).toBe("在下载 0.0.31… 42%");
    expect(stateWords(item({ state: "running", phase: "restarting" }))).toBe("在重启…");
    expect(stateWords(item({ state: "done" }))).toBe("已更新到 0.0.31");
    expect(stateWords(item({ state: "failed", rolledBack: true, reason: "health" }))).toBe("没能更新，已换回 0.0.30");
    expect(whyWords(item({ state: "failed", reason: "health" }))).toContain("三分钟");
    expect(whyWords(item({ state: "failed", reason: "no_answer" }))).toBe("开始更新以后，一直没有收到它的结果。");
    expect(stateWords(item({ key: "ducter:mini", state: "skipped", reason: "home", detail: "hel" }))).toBe("hel 没能更新，这台保持原版本");
    expect(planTitle({ id: "p", by: "user", startedAt: "", items: [item({ state: "running" }), item({ state: "queued" })] })).toBe("正在全部更新");
    expect(planTitle({ id: "p", by: "user", startedAt: "", finishedAt: "x", items: [item({ state: "done" }), item({ state: "failed" })] })).toBe("已更新 1 项，1 项没能更新");
    // D227: what a step waits on, a step started again after a cut, and why one cut twice failed.
    expect(stateWords(item({ kind: "agent", harness: "codex", deviceName: "Macbook Pro M3", state: "waiting", wait: "ducter" }))).toBe("等 Macbook Pro M3 上的 Ducter 更新完");
    expect(stateWords(item({ kind: "agent", harness: "codex", deviceName: "Macbook Pro M3", state: "running", phase: "updating", to: "0.167.2", wait: "reconnect" }))).toBe("等 Macbook Pro M3 重新连上");
    expect(stateWords(item({ kind: "agent", harness: "codex", state: "running", phase: "updating", to: "0.167.2", retried: true }))).toBe("刚才被打断了，正在重新更新到 0.167.2");
    expect(whyWords(item({ kind: "agent", harness: "codex", deviceName: "Macbook Pro M3", state: "failed", reason: "interrupted", retried: true }))).toBe("更新时 Macbook Pro M3 上的 Ducter 重启了，把它打断了；重新试了一次，还是没更新完。");
    A.L = strings("en");
    expect(stateWords(item({ kind: "agent", harness: "codex", deviceName: "Macbook Pro M3", state: "running", phase: "updating", wait: "reconnect" }))).toBe("Waiting for Macbook Pro M3 to reconnect");
    expect(stateWords(item({ kind: "agent", harness: "codex", state: "waiting", busy: 2 }))).toBe("Waiting for 2 tasks using it to pause");
    expect(planTitle({ id: "p", by: "user", startedAt: "", finishedAt: "x", items: [item({ state: "done" })] })).toBe("All updated");
  });

  test("the buttons send update_all; the frame keeps the plan; a refusal other than nothing-to-do is kept", async () => {
    const { A } = await import("../src/app.ts");
    const sent: unknown[] = [];
    A.send = (f) => void sent.push(f);
    A.receive(frame({ offer: [item({})], notNow: [] }));
    expect(A.updateAll?.offer.length).toBe(1);
    A.startUpdateAll();
    A.stopUpdateAll();
    A.dismissUpdateAll();
    expect(sent).toEqual([{ t: "update_all" }, { t: "update_all", stop: true }, { t: "update_all", dismiss: true }]);
    A.receive({ t: "update_all_result", ok: false, reason: "running" } as any);
    expect(A.updateAllAnswer).toBe("running");
    A.receive({ t: "update_all_result", ok: false, reason: "nothing" } as any);
    expect(A.updateAllAnswer).toBeUndefined();
  });

  test("the apps' last step: once a plan this page saw running is over, the page the home serves newer reloads back on 你的设备", async () => {
    const { A } = await import("../src/app.ts");
    const store = new Map<string, string>();
    const g = globalThis as any;
    const had = { s: g.sessionStorage, l: g.location };
    let reloaded = 0;
    g.sessionStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    g.location = { reload: () => void reloaded++ };
    try {
      A.staleFor = "0.0.31";
      A.sheet = { kind: "settings", page: "devices" }; // watching the list: the usual reload waits
      A.receive(frame({ offer: [], notNow: [], plan: { id: "ua-1", by: "user", startedAt: "", items: [item({ state: "running" })] } }));
      expect(store.get("ducter.updateAll")).toBe("ua-1:running");
      A.receive(frame({ offer: [], notNow: [], plan: { id: "ua-1", by: "user", startedAt: "", finishedAt: "x", items: [item({ state: "done" })] } }));
      await Bun.sleep(1300);
      expect(reloaded).toBe(1);
      expect(store.get("ducter.reopen")).toBe("devices");
      // Once per plan: the same frame again does nothing.
      A.receive(frame({ offer: [], notNow: [], plan: { id: "ua-1", by: "user", startedAt: "", finishedAt: "x", items: [item({ state: "done" })] } }));
      await Bun.sleep(1300);
      expect(reloaded).toBe(1);
    } finally {
      g.sessionStorage = had.s;
      g.location = had.l;
      A.staleFor = "";
      A.sheet = null;
    }
  });

  test("zh and en have the same keys, and the same words as the Mac", () => {
    expect(Object.keys(updateAllWords.zh).sort()).toEqual(Object.keys(updateAllWords.en).sort());
    const mac = readFileSync(new URL("../../desktop/internal/i18n/updateall.go", import.meta.url), "utf8");
    const macKeys = [...mac.matchAll(/^\t"([^"]+)":/gm)].map((m) => m[1]);
    expect([...new Set(macKeys)].sort()).toEqual(Object.keys(updateAllWords.zh).sort());
    for (const [k, v] of Object.entries({ ...updateAllWords.zh, ...updateAllWords.en })) expect(mac).toContain(`"${k}":`), expect(mac).toContain(JSON.stringify(v));
  });
});
