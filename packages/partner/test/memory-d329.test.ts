// D329: search before writing (supersede, never duplicate), Undo on the Noted line (archive, never
// delete; a replaced memory comes back), and the outbox when Mem is down. Against a STUB nmem and
// fake clients only, never the user's real Mem.
import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies } from "../../protocol/src/index.ts";
import { createNmemClient, createPartner } from "../src/index.ts";
import { likeness, sameAs, type MemoryAdd, type MemoryClient } from "../src/memory.ts";
import { outboxKey, withOutbox } from "../src/outbox.ts";
import { FakeClock, fakeCore, fakeRunner } from "./fakes.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "ducter-d329-test-"));

function stub(script: string) {
  const dir = tmp();
  const bin = join(dir, "nmem");
  writeFileSync(bin, `#!/bin/sh\nprintf '%s\\n' "$*" >> "${dir}/all"\n${script}\n`);
  chmodSync(bin, 0o755);
  return { bin, calls: () => readFileSync(join(dir, "all"), "utf8").trim().split("\n") };
}

describe("search before writing", () => {
  test("likeness and sameAs: a restatement or the same topic is the same thing; another tool's or a clipped one never", () => {
    expect(likeness("周报周五下午发", "周报周五下午发")).toBe(1);
    expect(likeness("Weekly report day", "weekly report day!")).toBe(1);
    expect(likeness("周报周五下午发", "喜欢深色模式")).toBeLessThan(0.2);
    const hits = [
      { id: "a", title: "Weekly report goes out Friday", content: "Friday afternoon, to the product team.", source: "ducter" },
      { id: "b", title: "Weekly report goes out Friday", content: "x", source: "codex" },
      { id: "c", title: "Weekly report", content: "clipped…", source: "ducter" },
    ];
    expect(sameAs("Weekly report goes out Thursday", hits)?.id).toBe("a");
    expect(sameAs("Prefers dark mode", hits)).toBeUndefined();
    expect(sameAs("Weekly report goes out Thursday", hits.slice(1))).toBeUndefined();
  });

  test("add: the partner's own earlier memory of the same thing is superseded, not duplicated", async () => {
    const s = stub(`case "$*" in
  *" m search "*) echo '{"memories":[{"id":"old1","title":"周报周五下午发","content":"周五下午发给产品组","source":"ducter","score":0.9}]}' ;;
  *" m add "*) cat >/dev/null; echo '{"id":"new1"}' ;;
  *) echo '{}' ;;
esac`);
    const r = await createNmemClient({ bin: s.bin }).add({ title: "周报周五下午发给产品组", content: "改成发给产品组和设计组", provenance: { persona: "default", logSeq: 4 } });
    expect(r).toEqual({ ok: true, id: "new1", replaced: { id: "old1", title: "周报周五下午发" } });
    expect(s.calls().some((c) => c.startsWith("--json m supersede --reason Said again in Ducter -- old1 new1"))).toBe(true);
    // Nothing alike: a plain save, no supersede.
    const n = stub(`case "$*" in *" m search "*) echo '{"memories":[{"id":"o","title":"喜欢深色模式","content":"x","source":"ducter"}]}' ;; *) cat >/dev/null; echo '{"id":"n2"}' ;; esac`);
    expect(await createNmemClient({ bin: n.bin }).add({ title: "周报周五发", content: "c", provenance: { persona: "p" } })).toEqual({ ok: true, id: "n2" });
    expect(n.calls().some((c) => c.includes("supersede"))).toBe(false);
  });

  test("a search that fails is no reason not to save", async () => {
    const s = stub(`case "$*" in *" m search "*) echo boom >&2; exit 1 ;; *) cat >/dev/null; echo '{"id":"n3"}' ;; esac`);
    expect(await createNmemClient({ bin: s.bin }).add({ title: "t1234", content: "c", provenance: { persona: "p" } })).toEqual({ ok: true, id: "n3" });
  });
});

describe("Undo", () => {
  test("archive and restore: undo archives (never deletes); the replaced one is written back from its own words", async () => {
    const s = stub(`case "$*" in
  *" m show "*) echo '{"id":"old1","title":"周报周五下午发","content":"周五下午发给产品组","importance":0.7}' ;;
  *" m add "*) cat >/dev/null; echo '{"id":"back1"}' ;;
  *) echo '{}' ;;
esac`);
    const c = createNmemClient({ bin: s.bin });
    expect(await c.archive!("new1")).toBe(true);
    expect(await c.restore!("old1", { persona: "default" })).toBe(true);
    const calls = s.calls();
    expect(calls[0]).toBe("--json m archive --reason Undone in Ducter -- new1");
    expect(calls.some((x) => x.includes(" m delete") || x.includes(" m forget"))).toBe(false);
    expect(calls.some((x) => x.startsWith("--json m add --stdin --title=周报周五下午发 -i 0.70"))).toBe(true);
    // A restore writes as is: no search beside it.
    expect(calls.filter((x) => x.includes(" m search ")).length).toBe(0);
  });
});

describe("the outbox", () => {
  test("Mem down keeps the save under its key; it goes in with that key when Mem answers; a dropped one never does", async () => {
    const dir = tmp();
    let up = false;
    const seen: MemoryAdd[] = [];
    const inner: MemoryClient = {
      search: async () => (up ? { ok: true, hits: [] } : { ok: false, reason: "unavailable", message: "down" }),
      add: async (m) => {
        if (!up) return { ok: false, reason: "unavailable", message: "down" };
        seen.push(m);
        return { ok: true, id: m.id ?? "x" };
      },
    };
    let changes = 0;
    const box = withOutbox(inner, { file: join(dir, "mem-outbox.json"), everyMs: 0, onChange: () => changes++ });
    const a = { title: "周报周五发", content: "c", provenance: { persona: "default", logSeq: 3 } };
    expect(await box.add(a)).toEqual({ ok: true, waiting: outboxKey(a) });
    expect(outboxKey(a)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(await box.add(a)).toEqual({ ok: true, waiting: outboxKey(a) }); // the same save waits once
    const b = (await box.add({ ...a, title: "另一件" })) as { waiting: string };
    expect(box.waiting().size).toBe(2);
    expect(box.drop(b.waiting)).toBe(true);
    // Read again from disk (the home restarted), it still waits.
    const again = withOutbox(inner, { file: join(dir, "mem-outbox.json"), everyMs: 0 });
    expect([...again.waiting()]).toEqual([outboxKey(a)]);
    up = true;
    await again.search("q", 1); // a call that works sends what waits
    await again.flush();
    expect(seen.map((m) => [m.title, m.id, m.plain])).toEqual([["周报周五发", outboxKey(a), true]]);
    expect(again.waiting().size).toBe(0);
    expect(again.idOf(outboxKey(a))).toBe(outboxKey(a));
    expect(changes).toBeGreaterThan(0);
    // Not installed is not "down": nothing waits for a Mem that isn't there.
    const none = withOutbox({ ...inner, add: async () => ({ ok: false, reason: "not_configured", message: "" }) }, { file: join(dir, "b.json"), everyMs: 0 });
    expect(await none.add(a)).toMatchObject({ ok: false, reason: "not_configured" });
    box.stop();
    again.stop();
    none.stop();
  });

  test("Mem refuses the key itself: once more without it", async () => {
    let up = false;
    const tries: (string | undefined)[] = [];
    const inner: MemoryClient = {
      search: async () => ({ ok: true, hits: [] }),
      add: async (m) => {
        if (!up) return { ok: false, reason: "unavailable", message: "down" };
        tries.push(m.id);
        return m.id ? { ok: false, reason: "rejected", message: "bad id" } : { ok: true, id: "mem-7" };
      },
    };
    const box = withOutbox(inner, { file: join(tmp(), "o.json"), everyMs: 0 });
    const a = { title: "t", content: "c", provenance: { persona: "p", logSeq: 1 } };
    await box.add(a);
    up = true;
    await box.flush();
    await box.flush();
    expect(tries).toEqual([outboxKey(a), undefined]);
    expect(box.idOf(outboxKey(a))).toBe("mem-7");
  });
});

describe("the partner", () => {
  test("a save while Mem is down waits (its line says so); Undo drops a waiting one and archives a saved one, its replaced memory back", async () => {
    let up = false;
    const done: string[] = [];
    const memory: MemoryClient = {
      search: async () => ({ ok: true, hits: [] }),
      add: async () => (up ? { ok: true, id: "mem-1", replaced: { id: "old", title: "旧的" } } : { ok: false, reason: "unavailable", message: "down" }),
      archive: async (id) => (done.push(id), true),
      restore: async (id) => (done.push(`restore:${id}`), true),
    };
    let hooks: any;
    const clock = new FakeClock();
    const fc = fakeCore(clock, tmp());
    (fc.core as any).settings = { get: () => ({ memory: true }), setForgetter() {}, setMemState() {}, setMemHooks: (h: unknown) => (hooks = h), memChanged() {} };
    const fr = fakeRunner(async (_i, s) => {
      await fc.callTool("memory_add", { title: "周报周五发", content: "周五下午发", said: "周报周五发" });
      s.say("好。");
      s.end();
    });
    fr.bindCards(fc.cards);
    const partner = createPartner(fc.core, fr.runner, { now: clock.now, persistState: false, onError: () => {}, memory, outboxEveryMs: 0 });
    partner.onTrigger(fc.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "记住：周报周五发" } }));
    await partner.idle();
    const noted = fc.events.find((e) => e.kind === "memory_noted")!.body as Bodies["memory_noted"];
    expect(typeof noted.waiting).toBe("string");
    expect(hooks.waiting().has(noted.waiting)).toBe(true);
    expect(await hooks.undo(noted)).toBe(true);
    expect(hooks.waiting().size).toBe(0);
    expect(done).toEqual([]); // it never reached Mem
    up = true;
    expect(await hooks.undo({ title: "周报周五发", memoryId: "mem-1", replaced: { id: "old", title: "旧的" } })).toBe(true);
    expect(done).toEqual(["mem-1", "restore:old"]);
    await partner.close();
  });
});
