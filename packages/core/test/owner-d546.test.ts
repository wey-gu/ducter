// D546: every object a partner owns carries its owner, and On hand is one board (D24): another
// partner's Keeps stand on it beside the default's, each sheet naming its own partner, and a wait
// another partner set carries that partner. With one partner nothing changes.
import { afterEach, expect, test } from "bun:test";
import type { KeepBody } from "@ducter/protocol/src/keeps.ts";
import type { OnHand, ServerFrame } from "@ducter/protocol";
import { startCore, type Core } from "../src/core.ts";
import { createPartner } from "../../partner/src/partner.ts";
import { fakeRunner } from "../../partner/test/fakes.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

const keep = (keepId: string, title: string, persona?: string): KeepBody => ({
  keepId,
  ...(persona ? { persona } : {}),
  title,
  said: title,
  from: { kind: "routine", routineId: `r_${keepId}` },
  run: "fresh",
  wakes: [{ kind: "at", words: "每天 08:00" }],
  life: "on",
  createdAt: "2026-11-24T01:00:00.000Z",
  made: "keep_make",
});

function boot(dir: string, partners: boolean): Core {
  const core = startCore({ dataDir: dir, port: 0, batchMs: 5, partners });
  core.setPartner({ onTrigger() {} });
  stops.push(() => core.stop());
  return core;
}

/** D631 (#243): a real second partner session, so its Keep is made through keep_make, not written raw. */
function secondPartner(core: Core, id: string): { close: () => Promise<void> } {
  const p = createPartner(core.partnerView(id), fakeRunner(() => {}).runner, { dir: core.partnerDir(id), prewarm: false, spine: false, persistState: false, onError: () => {} });
  stops.push(() => p.close());
  return p;
}

async function onHand(core: Core): Promise<OnHand> {
  const frames: ServerFrame[] = [];
  const ws = new WebSocket(core.url);
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  stops.push(() => ws.close());
  ws.send(JSON.stringify({ t: "hello" }));
  for (let i = 0; i < 300; i++) {
    const hit = [...frames].reverse().find((f) => f.t === "on_hand") as Extract<ServerFrame, { t: "on_hand" }> | undefined;
    if (hit) return hit.onHand as OnHand;
    await Bun.sleep(10);
  }
  throw new Error(`no on_hand; got ${frames.map((f) => f.t)}`);
}

test("D546: On hand holds every partner's Keeps, each carrying its partner; a wait another partner set carries it", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const first = boot(t.dir, true);
  const added = first.partners.add({ name: "小玛", look: "sage" });
  expect(added.ok).toBe(true);
  const p2 = added.ok ? added.partner.id : "";
  // D631 (#243): p2's Keep goes through its own keep_make, as it does in its conversation.
  const p2session = secondPartner(first, p2);
  const made = (await first.mcp.call({ role: "partner", persona: p2 }, "keep_make", {
    title: "看着机票价格",
    said: "盯着机票价格，降下来告诉我",
    brief: "Watch the fare and say when it drops.",
    at: { every: "day", time: "08:00" },
  })) as { ok: boolean; id: string };
  expect(made.ok).toBe(true);
  first.log.append({ stream: "keep:k_mine", origin: "system", kind: "keep", body: keep("k_mine", "周报") } as never);
  first.log.append({ stream: `channel:${p2}`, origin: "partner", kind: "waiter", persona: p2, body: { waiterId: "w_hers", reason: "提醒带小米打疫苗", at: "2030-01-01T06:00:00.000Z", state: "armed" } } as never);
  await p2session.close();
  await first.stop();
  stops.splice(-2, 2); // its session's stop and the core's (both run here, before the restart)

  const again = boot(t.dir, true);
  const oh = await onHand(again);
  const byId = new Map((oh.keeps ?? []).map((k) => [k.id, k]));
  expect([...byId.keys()].sort()).toEqual(["k_mine", made.id].sort());
  expect(byId.get(made.id)!.persona).toBe(p2);
  expect(again.keeps!.get(made.id)!.persona).toBe(p2);
  expect(byId.get("k_mine")!.persona).toBeUndefined(); // absent: the default
  expect(oh.waiters.find((w) => w.waiterId === "w_hers")?.persona).toBe(p2);
});

test("D546: with one partner the board is as before: the Keep is the default's, a wait carries no persona", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const first = boot(t.dir, false);
  first.log.append({ stream: "keep:k_mine", origin: "system", kind: "keep", body: keep("k_mine", "周报") } as never);
  first.log.append({ stream: "channel", origin: "partner", kind: "waiter", body: { waiterId: "w_mine", reason: "提醒交周报", at: "2030-01-01T06:00:00.000Z", state: "armed" } } as never);
  await first.stop();
  stops.pop();
  const oh = await onHand(boot(t.dir, false));
  expect((oh.keeps ?? []).map((k) => [k.id, k.persona])).toEqual([["k_mine", undefined]]);
  expect(oh.waiters.find((w) => w.waiterId === "w_mine")).toBeDefined();
  expect(oh.waiters.find((w) => w.waiterId === "w_mine")!.persona).toBeUndefined();
});
