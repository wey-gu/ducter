// D306: the page keeps the app's glances true: a followed task's phase goes to the app when it
// changes (never a heartbeat), a finished one ends, a call that goes live is shown once by itself,
// and no title ever goes anywhere but the app. Words in both languages, the iOS and Android tables
// the same as the protocol's.
import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AMBIENT_PHASES, AMBIENT_WORDS } from "@ducter/protocol/src/ambient.ts";

const sent: Record<string, unknown>[] = [];
const g = globalThis as Record<string, unknown>;
g.ducterNative = { platform: "ios", version: "1" };
g.webkit = { messageHandlers: { ducter: { postMessage: async (m: Record<string, unknown>) => (sent.push(m), m.t === "glance.start" ? { ok: true } : undefined) } } };

// Other files share this process: the app's bridge goes when these tests are done.
afterAll(() => {
  delete g.ducterNative;
  delete g.webkit;
});

const ev = (seq: number, stream: string, kind: string, body: unknown) => ({ seq, ts: "2026-11-17T09:00:00Z", persona: "default", stream, origin: "system", kind, body });

describe("D306 the page keeps the glance true", () => {
  test("a followed task: start with its title, then each change of phase once, then the end", async () => {
    const { A } = await import("../src/app.ts");
    const { strings } = await import("../src/i18n.ts");
    const { resetAmbient, setShown, syncAmbient } = await import("../src/ambient.tsx");
    A.L = strings("zh");
    resetAmbient(true);
    A.S.apply({ t: "events", events: [ev(1, "task:t1", "task_open", { taskId: "t1", title: "修 CI", project: "p", place: { kind: "none" }, harness: "claude-code", brief: "b" }), ev(2, "task:t1", "task_state", { taskId: "t1", attention: "working", residency: "hot" })] } as never);
    await setShown("task", "t1", "修 CI", "working", true);
    expect(sent.at(-1)).toMatchObject({ t: "glance.start", kind: "task", id: "t1", title: "修 CI", phase: "working" });
    sent.length = 0;
    syncAmbient();
    expect(sent).toEqual([]); // the same phase: nothing
    A.S.apply({ t: "events", events: [ev(3, "task:t1", "task_state", { taskId: "t1", attention: "needs_you", residency: "hot" })] } as never);
    syncAmbient();
    syncAmbient();
    expect(sent.map((m) => m.phase)).toEqual(["needs_you"]);
    expect(sent[0]!.title).toBeUndefined(); // updates carry no words
    A.S.apply({ t: "events", events: [ev(4, "task:t1", "task_state", { taskId: "t1", attention: "done", residency: "warm" })] } as never);
    syncAmbient();
    syncAmbient();
    expect(sent.map((m) => m.phase)).toEqual(["needs_you", "done"]);
  });

  test("a call that goes live shows once by itself; a removed one isn't put back", async () => {
    const { A } = await import("../src/app.ts");
    const { resetAmbient, setShown, syncAmbient } = await import("../src/ambient.tsx");
    resetAmbient(true);
    sent.length = 0;
    const call = (state: string) => A.S.apply({ t: "on_hand", onHand: { tasks: [], counts: { needsYou: 0, working: 0, waiting: 0, doneToday: 0 }, waiters: [], calls: [{ callId: "c1", connectionId: "x", state, plan: { to: "+15550100", name: "Dr. Lee", goal: "", say: [], mustNot: [], voice: "ducter" } }] } } as never);
    call("needs_go");
    syncAmbient();
    expect(sent).toEqual([]); // not live yet
    call("calling");
    syncAmbient();
    await Promise.resolve();
    expect(sent[0]).toMatchObject({ t: "glance.start", kind: "call", id: "c1", title: "Dr. Lee", phase: "calling" });
    await setShown("call", "c1", "Dr. Lee", "calling", false);
    sent.length = 0;
    call("talking");
    syncAmbient();
    expect(sent).toEqual([]);
  });

  test("outside the apps nothing is offered", async () => {
    const { resetAmbient, syncAmbient } = await import("../src/ambient.tsx");
    resetAmbient(false);
    sent.length = 0;
    syncAmbient();
    expect(sent).toEqual([]);
  });
});

describe("D306 words", () => {
  const ROOT = join(import.meta.dir, "../../..");
  const strings = (p: string) => Object.fromEntries([...readFileSync(join(ROOT, p), "utf8").matchAll(/"glance\.phase\.(\w+)" = "([^"]*)";/g)].map((m) => [m[1], m[2]]));
  const android = (p: string) => Object.fromEntries([...readFileSync(join(ROOT, p), "utf8").matchAll(/<string name="glance_(\w+)">([^<]*)<\/string>/g)].map((m) => [m[1], m[2]!.replace(/\\'/g, "'")]));
  test("the iPhone's and Android's tables say what the protocol says", () => {
    for (const [lang, ios, droid] of [["zh", "apps/ios/LiveShared/zh-Hans.lproj/Glance.strings", "apps/android/app/src/main/res/values-zh/strings.xml"], ["en", "apps/ios/LiveShared/en.lproj/Glance.strings", "apps/android/app/src/main/res/values/strings.xml"]] as const) {
      const w = AMBIENT_WORDS[lang]!;
      const i = strings(ios);
      const a = android(droid);
      for (const p of AMBIENT_PHASES) {
        expect(i[p]).toBe(w.phase[p]);
        expect(a[p]).toBe(w.phase[p]);
      }
      expect(a.channel).toBe(w.channel);
    }
  });
});
