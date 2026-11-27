// D631 (#243): a Keep made in a second partner's conversation is that partner's. keep_make
// records the acting partner (the same one routines.make stamps), keep_list returns only the
// caller's own, keep_change refuses another partner's with a plain line, and the one old shape
// (routine p2, Keep the default's) takes its routine's partner once at start, recorded in the Log.
import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import type { KeepBody, RoutineBody } from "@ducter/protocol";
import { startCore, type Core } from "../src/core.ts";
import { openLog } from "../src/log.ts";
import { createPartner } from "../../partner/src/partner.ts";
import { fakeRunner } from "../../partner/test/fakes.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

function boot(dir: string): Core {
  const core = startCore({
    dataDir: dir,
    port: 0,
    batchMs: 5,
    partners: true,
    keeps: { endAsk: async () => ({}) },
    deviceProbes: { cua: async () => ({ missing: "test" }), harnesses: async () => [{ harness: "claude-code", installed: true, loggedIn: true }], kind: async () => "laptop" },
  });
  core.setPartner({ onTrigger() {} });
  stops.push(() => core.stop());
  return core;
}

/** A real second partner session: the only thing that registers its own keep_make. */
function secondPartner(core: Core, id: string): void {
  const p = createPartner(core.partnerView(id), fakeRunner(() => {}).runner, { dir: core.partnerDir(id), prewarm: false, spine: false, persistState: false, onError: () => {} });
  stops.push(() => p.close());
}

test("keep_make through the hub as p2 is p2's; keep_list and keep_change keep to the caller", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const core = boot(t.dir);
  const added = core.partners.add({ name: "小家" });
  expect(added.ok).toBe(true);
  const p2 = added.ok ? added.partner.id : "";
  secondPartner(core, p2);

  const made = (await core.mcp.call({ role: "partner", persona: p2 }, "keep_make", {
    title: "每天看两次邮件",
    said: "每天早晚帮我看一次邮件",
    brief: "Check the mailbox morning and evening.",
    at: { every: "day", time: "08:00" },
  })) as { ok: boolean; id: string };
  expect(made.ok).toBe(true);
  // The routine is p2's (D312) and now the Keep is too.
  const keep = core.keeps!.get(made.id)!;
  expect(keep.persona).toBe(p2);
  const routine = core.work.routines.get((keep.from as { routineId: string }).routineId)!;
  expect(routine.persona).toBe(p2);

  const list = async (persona?: string) => (await core.mcp.call(persona ? { role: "partner", persona } : { role: "partner" }, "keep_list", {})) as { id: string }[];
  expect((await list(p2)).map((x) => x.id)).toContain(made.id);
  expect((await list()).map((x) => x.id)).not.toContain(made.id);

  // The other way too: the default's Keep is not p2's to list or change.
  const mine = await core.keeps!.make({ title: "周报", said: "每周一给我一份周报", brief: "Write the weekly report.", wake: { at: { kind: "time", every: "day", time: "09:00", zone: "personal", tz: "Asia/Shanghai" } } });
  expect(mine.ok).toBe(true);
  const defaultId = mine.ok ? mine.keep.keepId : "";
  expect((await list()).map((x) => x.id)).toContain(defaultId);
  expect((await list(p2)).map((x) => x.id)).not.toContain(defaultId);
  const refusedBack = (await core.mcp.call({ role: "partner", persona: p2 }, "keep_change", { id: defaultId, action: "pause" })) as { ok: boolean; error?: string };
  expect(refusedBack.ok).toBe(false);
  expect(refusedBack.error).toContain("Ducter");

  const refused = (await core.mcp.call({ role: "partner" }, "keep_change", { id: made.id, action: "pause" })) as { ok: boolean; error?: string };
  expect(refused.ok).toBe(false);
  expect(refused.error).toContain("小家");
  expect(refused.error).toContain("ask in its conversation");
  expect(core.keeps!.get(made.id)!.life).toBe("on");

  // Its owner changes it; the person's own page (keeps.change, not the tool) still may change any Keep.
  expect((await core.mcp.call({ role: "partner", persona: p2 }, "keep_change", { id: made.id, action: "pause" })) as { ok: boolean }).toMatchObject({ ok: true });
  expect(core.keeps!.get(made.id)!.life).toBe("paused");
  expect((await core.keeps!.change(made.id, { act: { action: "resume" } }, { by: "you" })).ok).toBe(true);
  expect(core.keeps!.get(made.id)!.life).toBe("on");
});

test("the issue's shape takes its routine's partner once at start, recorded, and never again", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const first = boot(t.dir);
  const added = first.partners.add({ name: "小家" });
  expect(added.ok).toBe(true);
  const p2 = added.ok ? added.partner.id : "";
  await first.stop();
  stops.pop();

  // Seed the old shape straight into the Log: the routine carries p2, its Keep the default.
  const log = openLog({ path: join(t.dir, "ducter.db"), persona: "default" });
  const at = "2026-11-24T01:00:00.000Z";
  const routine: RoutineBody = {
    routineId: "rt_issue243",
    persona: p2,
    name: "看邮件",
    trigger: { kind: "time", every: "day", time: "08:00", zone: "personal", tz: "Asia/Shanghai" },
    triggerWords: "每天 08:00",
    brief: "Check the mailbox.",
    reports: "on_change",
    effect: "read_only",
    budget: { monthTokens: 100_000 },
    state: "active",
    createdAt: at,
    reviewAt: "2026-12-24T01:00:00.000Z",
  };
  const keep: KeepBody = {
    keepId: "kp_issue243",
    title: "看邮件",
    said: "每天早晚帮我看一次邮件",
    from: { kind: "routine", routineId: routine.routineId },
    run: "fresh",
    wakes: [{ kind: "at", words: "每天 08:00" }],
    life: "on",
    createdAt: at,
    made: "keep_make",
  };
  log.append({ stream: `routine:${routine.routineId}`, origin: "system", kind: "routine", body: routine } as never);
  log.append({ stream: `keep:${keep.keepId}`, origin: "system", kind: "keep", body: keep } as never);
  log.close();

  const repaired = boot(t.dir);
  expect(repaired.keeps!.get(keep.keepId)!.persona).toBe(p2);
  const events = repaired.log.read({ fromSeq: 0, limit: 1_000, kinds: ["keep_owner_repaired"] });
  expect(events).toHaveLength(1);
  expect(events[0]!.body).toMatchObject({ keepId: keep.keepId, routineId: routine.routineId, from: "default", to: p2 });
  await repaired.stop();
  stops.pop();

  // A second start finds the owner right: no second repair, same owner.
  const again = boot(t.dir);
  expect(again.keeps!.get(keep.keepId)!.persona).toBe(p2);
  again.keeps!.sync();
  expect(again.log.read({ fromSeq: 0, limit: 1_000, kinds: ["keep_owner_repaired"] })).toHaveLength(1);
});
