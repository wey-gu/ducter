// D652: Settings › 记忆's 改 and 忘掉 say the partner's line only after Nowledge Mem answered.
// At the tap the row waits and nothing is said or changed on the page; mem_done ok says it, and a
// refusal leaves the row as it was with one line in the failed ink (why in D590's words). The Mac
// draws the same (apps/desktop/internal/views/memory_done_test.go).
import { describe, expect, test } from "bun:test";
import type { MemItem } from "@ducter/protocol";
import { strings } from "../src/i18n.ts";
import { memoryWords } from "../src/i18n-memory.ts";

const row = (): MemItem => ({ id: "codex-1", title: "Deploy on Fridays is fine", kind: "preference", by: "tool", from: "Codex" });

describe("a correction that sticks", () => {
  test("no said line and no page change at the tap; the row waits for Mem", async () => {
    const { A } = await import("../src/app.ts");
    const { saidFor } = await import("../src/set-grid.tsx");
    A.L = strings("zh");
    const sent: unknown[] = [];
    const send = A.send;
    (A as any).send = (f: unknown) => sent.push(f);
    try {
      const before = saidFor("mem-about");
      A.mem = { state: "connected", noted: [], glance: { total: 1, about: [row()], tools: [] } } as never;
      A.memFix("codex-1", "Avoid Friday deploys", "preference");
      expect(sent.at(-1)).toEqual({ t: "mem_fix", id: "codex-1", title: "Avoid Friday deploys", kind: "preference" });
      expect(A.memBusy).toEqual({ id: "codex-1", op: "fix", title: "Avoid Friday deploys" });
      expect(A.mem!.glance!.about).toEqual([row()]); // the page waits: the row is as it was
      expect(saidFor("mem-about")).toBe(before); // never 好 before Mem answered

      // Mem refused: the row is as it was, one failed line says why, and nothing is said.
      A.receive({ t: "mem_done", id: "codex-1", op: "fix", ok: false, why: "signed_out" });
      expect(A.memBusy).toBeUndefined();
      expect(A.memFailed).toEqual({ id: "codex-1", op: "fix", why: "signed_out" });
      expect(A.mem!.glance!.about).toEqual([row()]);
      expect(saidFor("mem-about")).toBe(before);
      expect(memoryWords.zh["mem.done.failed.fix"]).toContain("%s");
      expect(memoryWords.zh["mem.done.why.signed_out"]).toContain("登录");

      // Mem took it: the said line is the partner's, the failure clears, the fresh settings frame
      // (core's own) is what moves the row.
      A.receive({ t: "mem_done", id: "codex-1", op: "fix", ok: true, title: "Avoid Friday deploys" });
      expect(A.memFailed).toBeUndefined();
      expect(saidFor("mem-about")).toBe("好，改成「Avoid Friday deploys」。");
    } finally {
      (A as any).send = send;
    }
  });

  test("forget: the row stays until Mem answers; a refusal is why, a success is the partner's word", async () => {
    const { A } = await import("../src/app.ts");
    const { saidFor } = await import("../src/set-grid.tsx");
    A.L = strings("zh");
    const sent: unknown[] = [];
    const send = A.send;
    (A as any).send = (f: unknown) => sent.push(f);
    try {
      const before = saidFor("mem-about");
      A.mem = { state: "connected", noted: [], glance: { total: 1, about: [row()], tools: [] } } as never;
      A.memFailed = undefined;
      A.memForget("codex-1", "Deploy on Fridays is fine");
      expect(sent.at(-1)).toEqual({ t: "mem_forget", id: "codex-1" });
      expect(A.mem!.glance!.about).toEqual([row()]);
      expect(saidFor("mem-about")).toBe(before);
      A.receive({ t: "mem_done", id: "codex-1", op: "forget", ok: false, why: "unreachable" });
      expect(A.memFailed).toEqual({ id: "codex-1", op: "forget", why: "unreachable" });
      expect(A.mem!.glance!.about).toEqual([row()]);
      expect(memoryWords.zh["mem.done.failed.forget"]).toBe("没忘掉：%s");
      expect(memoryWords.en["mem.done.why.unreachable"]).toContain("can't be reached");
      A.receive({ t: "mem_done", id: "codex-1", op: "forget", ok: true, title: "Deploy on Fridays is fine" });
      expect(saidFor("mem-about")).toBe("好，忘掉「Deploy on Fridays is fine」。");
    } finally {
      (A as any).send = send;
    }
  });

  test("这条不对 carries the memory's id on the message (the person's tap, not the model's word)", async () => {
    const { A } = await import("../src/app.ts");
    const { Store } = await import("../src/store.ts");
    A.L = strings("zh");
    A.S = new Store();
    const sent: any[] = [];
    const send = A.send;
    (A as any).send = (f: unknown) => sent.push(f);
    (A as any).outbox = { put: () => {} };
    try {
      A.correctMemory("codex-1", "Deploy on Fridays is fine");
      expect(sent.at(-1)).toMatchObject({ t: "send", corrects: "codex-1" });
      expect(sent.at(-1).text).toContain("codex-1");
    } finally {
      (A as any).send = send;
    }
  });

  test("zh and en carry every failed line", () => {
    for (const lang of ["zh", "en"] as const) {
      for (const k of ["mem.done.wait", "mem.done.failed.fix", "mem.done.failed.forget"]) expect(memoryWords[lang][k]).toBeTruthy();
      for (const why of ["signed_out", "unreachable", "refused", "off", "missing"]) expect(memoryWords[lang][`mem.done.why.${why}`]).toBeTruthy();
    }
  });
});
