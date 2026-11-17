// D329: the Noted line's states (undone, replaced, waiting, Undo while fresh, a refused undo), Nowledge
// Mem's app closed, and Mem as a step of Update all. The words come from the tables (D292).
import { describe, expect, test } from "bun:test";
import type { BridgeView, MemView } from "@ducter/protocol";
import { memPhase } from "../src/mem-view.ts";
import { strings, TABLES } from "../src/i18n.ts";
import { memoryWords } from "../src/i18n-memory.ts";
import { updateAllWords } from "../src/i18n-updateall.ts";

describe("the Noted line (D329)", () => {
  test("its words in both languages", () => {
    expect(TABLES.zh["memory.undone"]).toBe("不记了「%s」");
    expect(TABLES.en["memory.undone"]).toBe("Not kept “%s”");
    expect(TABLES.zh["memory.replaced"]).toBe("换掉了之前那条「%s」");
    expect(TABLES.en["memory.replaced"]).toBe("In place of “%s”");
    expect(TABLES.zh["memory.waiting"]).toBe("等 Nowledge Mem 回来就存进去");
    expect(TABLES.en["memory.undo"]).toBe("Undo");
    expect(TABLES.zh["memory.undo.failed"]).toBe("Nowledge Mem 没回应，还记着");
  });

  test("state from the settings frame and the conversation: undone, waiting, Undo only until the person speaks again, a refused undo", async () => {
    const { A } = await import("../src/app.ts");
    A.L = strings("zh");
    const sent: unknown[] = [];
    const send = A.send;
    (A as any).send = (f: unknown) => sent.push(f);
    try {
      A.mem = { state: "connected", noted: [], undone: [3], waiting: [5] } as MemView;
      A.S.lastUserSeq = 4;
      expect(A.notedState(3)).toMatchObject({ undone: true, fresh: false });
      expect(A.notedState(5)).toMatchObject({ undone: false, waiting: true, fresh: true });
      expect(A.notedState(2).fresh).toBe(false); // the person spoke after it: Forget, not Undo
      A.undoNoted(5);
      expect(sent).toEqual([{ t: "memory_undo", seq: 5 }]);
      A.applySettings({ t: "settings", settings: A.settings ?? ({ memory: true } as any), mem: A.mem, undid: { seq: 5, ok: false } } as any);
      expect(A.notedState(5).failed).toBe(true);
      A.applySettings({ t: "settings", settings: A.settings ?? ({ memory: true } as any), mem: { state: "connected", noted: [], undone: [3, 5] } } as any);
      expect(A.notedState(5)).toMatchObject({ failed: false, undone: true });
      A.openBridgeMem();
      expect(sent.at(-1)).toEqual({ t: "bridge_mem_open" });
    } finally {
      (A as any).send = send;
    }
  });
});

describe("Nowledge Mem's app closed (D329)", () => {
  const b = (o: Partial<BridgeView>): BridgeView => ({ state: "connected", identity: "ducter", ...o });
  test("its own phase, and its words", () => {
    expect(memPhase(true, undefined, b({ state: "mem_closed", canOpen: true, home: "Wey’s Mac" }))).toBe("closed");
    expect(memPhase(false, undefined, b({ state: "mem_closed" }))).toBe("off");
    expect(memoryWords.zh["bridge.mem.closed"]).toBe("Nowledge Mem 没开着");
    expect(memoryWords.en["bridge.mem.closed.open"]).toBe("The Nowledge Mem app on %s is closed. Memories wait; open it and they're back.");
    expect(memoryWords.zh["bridge.mem.closed.there"]).toBe("在 %s 上打开 Nowledge Mem 应用就好。");
    expect(memoryWords.en["bridge.mem.open"]).toBe("Open Nowledge Mem");
  });
});

describe("Mem in Update all (D329)", () => {
  test("its step's name", async () => {
    const { A } = await import("../src/app.ts");
    const { itemName, stateWords } = await import("../src/updateall.tsx");
    A.L = strings("zh");
    const it = { key: "mem:local", kind: "mem" as const, device: "local", deviceName: "hel", from: "0.10.118", to: "0.10.119", state: "running" as const, phase: "updating" as const, at: "" };
    expect(itemName(it)).toBe("hel 上的 Nowledge Mem");
    expect(stateWords(it)).toBe("正在更新到 0.10.119…");
    A.L = strings("en");
    expect(itemName(it)).toBe("Nowledge Mem on hel");
    expect(updateAllWords.en["upall.item.mem"]).toBe("Nowledge Mem on %s");
  });

  test("no newer version named: the bare words; never hidden under N more; the order note names it", async () => {
    const { A } = await import("../src/app.ts");
    const { shownOffer, orderWords, stateWords, versions } = await import("../src/updateall.tsx");
    A.L = strings("zh");
    const at = "";
    const mem = { key: "mem:local", kind: "mem" as const, device: "local", deviceName: "hel", from: "0.10.118", to: "", state: "running" as const, phase: "updating" as const, at };
    expect(stateWords(mem)).toBe("正在更新…");
    expect(stateWords({ ...mem, state: "done" })).toBe("已更新");
    expect(versions(mem)).toBe("0.10.118");
    const agent = (n: number) => ({ key: `agent:local:h${n}`, kind: "agent" as const, device: "local", deviceName: "hel", harness: "codex", from: "1", to: "2", state: "queued" as const, at });
    const offer = [agent(1), agent(2), agent(3), agent(4), agent(5), { ...mem, state: "queued" as const }];
    expect(shownOffer(offer).map((i) => i.key)).toEqual(["agent:local:h1", "agent:local:h2", "agent:local:h3", "mem:local"]);
    expect(shownOffer(offer.slice(0, 3)).length).toBe(3);
    expect(orderWords(offer, "hel", 2)).toBe("先更新 hel，再更新其他电脑，然后是各台电脑上的 AI，最后是 hel 上的 Nowledge Mem。正在做的事不会被打断。");
    expect(orderWords(offer.slice(0, 2), "hel", 1)).toBe(updateAllWords.zh["upall.order.solo"]);
    A.L = strings("en");
    expect(orderWords(offer, "hel", 2)).toBe("hel first, then the other computers, then the AI agents on each, and Nowledge Mem on hel last. Nothing running is cut off.");
  });
});
