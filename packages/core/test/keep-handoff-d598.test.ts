// D598: work handed to a helper is something it holds, or a fact that it doesn't yet. hel, 2026-11-26: a
// task handed mem#11393 to "Nowledge Mem PR Babysitter" as a reply on the babysitter's own last message,
// so nothing counted it as work (no item, no round), and a rule the person added from now on reached
// none of the work the babysitter held. Here, on hel's own shapes (fixtures/keeps-old.ts): a reply on the
// helper's own message is an arrival; keep_change hand writes one on this home; also reaches each item.
import { afterEach, describe, expect, test } from "bun:test";
import type { Bodies, TaskCard } from "@ducter/protocol";
import type { Runner } from "@ducter/protocol/src/internal.ts";
import { isHelperWork, helperSent, localHandoff, LOCAL_MSG } from "@ducter/protocol/src/helpers.ts";
import { startCore } from "../src/core.ts";
import { tempDir } from "./helpers.ts";
import { seedOld } from "./fixtures/keeps-old.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

function boot(dir: string) {
  const core = startCore({ dataDir: dir, port: 0, batchMs: 5, keeps: { endAsk: async () => ({}) }, deviceProbes: { cua: async () => ({ missing: "test" }), harnesses: async () => [{ harness: "codex", installed: true, loggedIn: true }], kind: async () => "laptop" } });
  core.setPartner({ onTrigger: () => {} });
  const told: { taskId: string; text: string }[] = [];
  core.setRunner({
    harness: { start: async () => ({}) as never, available: async () => [] },
    async openTask(): Promise<TaskCard> {
      throw new Error("not here");
    },
    send: async (taskId: string, text: string) => (told.push({ taskId, text }), { delivered: "prompted" as const }),
    interrupt: async () => {},
    drop: async () => {},
  } as unknown as Runner);
  return { core, told };
}

const HELPER = "nowledge-mem-pr-babysitter";

describe("D598: what counts as work handed to a helper", () => {
  test("an original, a hand-off on this home, a reply on the helper's own message; never a reply on another's", () => {
    const evs = [{ body: { direction: "out", messageId: "m2", inReplyTo: "m1", helper: HELPER, text: "Taken", taskId: "t1", state: "sent" } }];
    const sent = helperSent(evs);
    expect(isHelperWork({ direction: "in", messageId: "a", helper: HELPER }, sent)).toBe(true);
    expect(isHelperWork({ direction: "in", messageId: "b", helper: HELPER, inReplyTo: "m2" }, sent)).toBe(true);
    expect(isHelperWork({ direction: "in", messageId: "c", helper: HELPER, inReplyTo: "elsewhere" }, sent)).toBe(false);
    expect(isHelperWork({ direction: "in", messageId: "d", helper: HELPER, state: "muted" }, sent)).toBe(false);
    expect(isHelperWork({ direction: "in", messageId: "e" }, sent)).toBe(false);
    const l = localHandoff({ id: "x", helper: HELPER, text: "接手 mem#11393", from: "Ducter", fromTask: "m2uifpyn", head: "Ducter 的任务「用 agy 处理 Mem #11390」：" });
    expect(l).toMatchObject({ direction: "in", messageId: `${LOCAL_MSG}x`, helper: HELPER, local: true, fromTask: "m2uifpyn", mine: true });
    expect(l.text).toBe("Ducter 的任务「用 agy 处理 Mem #11390」：\n接手 mem#11393");
  });

  test("hel's sequence: a reply on its own message is an arrival; hand writes one here; also reaches what it holds", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    seedOld(t.dir);
    const { core, told } = boot(t.dir);
    stops.push(() => core.stop());
    const keeps = core.keeps!;
    const h = keeps.all().find((k) => k.from.kind === "helper" && k.life === "on")!;
    const arrivals = () => keeps.page(h.keepId)!.rounds.filter((r) => r.woke === "arrival");
    expect(arrivals()).toHaveLength(1); // #11030, an original

    // The task's hand-off came back as a reply on the helper's own claim (m2): work, so an arrival.
    core.log.append({ stream: "channel", origin: "peer", kind: "bridge_msg", body: { direction: "in", messageId: "bm-11393", from: "Ducter", agent: "Ducter", mine: true, helper: HELPER, inReplyTo: "m2", text: "Ducter 的任务「用 agy 处理 Mem #11390 并准备 PR 交接」：\n请接手推进 PR https://github.com/nowledge-co/mem/pull/11393" } });
    expect(arrivals()).toHaveLength(2);
    expect(arrivals()[0]).toMatchObject({ did: "Ducter 的任务「用 agy 处理 Mem #11390 并准备 PR 交接」：" });

    // A rule from now on reaches each piece of work it holds, at once (the item at work: t_pr11030).
    const a = await keeps.change(h.keepId, { also: "Babysitter 负责到底：独立评审，OK 就 /lgtm，Prow/Tide 仓库绝不手动合并。" }, { by: "partner" });
    expect(a.ok).toBe(true);
    expect(told).toEqual([{ taskId: "t_pr11030", text: expect.stringContaining("Babysitter 负责到底") }]);

    // The person hands it over through the partner: mail at its address on this home, never an edit.
    const before = core.log.read({ stream: "channel", kinds: ["bridge_msg"], limit: 9999 }).length;
    const r = await keeps.change(h.keepId, { hand: "接手 mem#11393：独立评审，OK 就 /lgtm" }, { by: "partner" });
    expect(r).toMatchObject({ ok: true, edits: [] });
    const mail = core.log.read({ stream: "channel", kinds: ["bridge_msg"], limit: 9999 });
    expect(mail.length).toBe(before + 1);
    expect(mail[mail.length - 1]!.body as Bodies["bridge_msg"]).toMatchObject({ direction: "in", helper: HELPER, local: true, mine: true, text: "接手 mem#11393：独立评审，OK 就 /lgtm" });
    expect(arrivals()).toHaveLength(3);
    expect(core.log.read({ stream: `keep:${h.keepId}`, kinds: ["keep_edit"], limit: 99 }).some((e) => JSON.stringify(e.body).includes("11393"))).toBe(false);

    // Only a Keep that takes work as it comes takes a piece handed to it.
    const loop = keeps.all().find((k) => k.from.kind === "loop" && k.life === "on")!;
    expect(await keeps.change(loop.keepId, { hand: "审 #551" }, { by: "partner" })).toMatchObject({ ok: false, error: expect.stringContaining("next_round") });
    expect(await keeps.change(h.keepId, { hand: "  " }, { by: "partner" })).toMatchObject({ ok: false });
  });
});
