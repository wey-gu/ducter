// D631 (#243): the receipt card of a Keep made by a second partner goes to that partner's
// turn and conversation, and its [keeps] line is that partner's own.
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies } from "../../protocol/src/index.ts";
import { startCore, type Core } from "../../core/src/core.ts";
import { createPartner, type PartnerHandle } from "../src/partner.ts";
import { fakeRunner } from "./fakes.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

test("a Keep made in p2's turn carries its card in p2's conversation and its [keeps] line", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ducter-keep-owner-"));
  const core: Core = startCore({ dataDir: dir, port: 0, push: false, platform: "darwin", partners: true, deviceProbes: { harnesses: async () => [{ harness: "claude-code", loggedIn: true, installed: true }] as never } });
  stops.push(() => rmSync(dir, { recursive: true, force: true }), () => core.stop());
  expect(core.partners.add({ name: "小家" }).ok).toBe(true);

  let keepId = "";
  const homeRunner = fakeRunner(async (_input, s, turn) => {
    if (turn === 0) {
      const made = (await core.mcp.call({ role: "partner", persona: "p2" }, "keep_make", {
        title: "看邮件",
        said: "每天早晚帮我看一次邮件",
        brief: "Check the mailbox morning and evening.",
        at: { every: "day", time: "08:00" },
      })) as { ok: boolean; id: string };
      expect(made.ok).toBe(true);
      keepId = made.id;
      s.say("好，我来照看：每天早晚看邮件。");
    } else {
      s.say("都在。");
    }
    s.end();
  });
  const made: PartnerHandle[] = [];
  core.setPartner({ onTrigger() {} });
  core.setPartnerFactory((view, _id, o) => {
    const p = createPartner(view, homeRunner.runner, { dir: o.dir, prewarm: false, spine: false, persistState: false, onError: (e) => console.error(e) });
    made.push(p);
    stops.push(() => p.close());
    return p;
  });

  core.log.append({ stream: "channel:p2", origin: "user", kind: "user_msg", body: { text: "每天早晚帮我看一次邮件" } });
  for (let i = 0; i < 300 && (!made.length || !homeRunner.sessions.length); i++) await Bun.sleep(10);
  await made[0]!.idle();
  expect(keepId).not.toBe("");
  expect(core.keeps!.get(keepId)!.persona).toBe("p2");
  const p2 = core.log.read({ stream: "channel:p2", kinds: ["ai_msg"] });
  const card = p2.find((e) => (e.body as Bodies["ai_msg"]).keep?.id === keepId);
  expect(card).toBeDefined();
  expect((card!.body as Bodies["ai_msg"]).text).toContain("照看");
  // Nothing of it is the default's.
  expect(core.log.read({ stream: "channel", kinds: ["ai_msg"] }).some((e) => (e.body as Bodies["ai_msg"]).keep)).toBe(false);

  // Its next turn hears [keeps] with its own Keep; the default partner's would not.
  core.log.append({ stream: "channel:p2", origin: "user", kind: "user_msg", body: { text: "我的循环任务都怎么样了" } });
  for (let i = 0; i < 300 && (homeRunner.sessions[0]?.inputs.length ?? 0) < 2; i++) await Bun.sleep(10);
  await made[0]!.idle();
  const inputs = homeRunner.sessions[0]!.inputs.join("\n");
  expect(inputs).toContain("[keeps]");
  expect(inputs).toContain("看邮件");
});
