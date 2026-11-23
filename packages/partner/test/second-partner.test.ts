// D312: the real partner on another partner's view of core: its own system prompt (its name),
// its own MCP partner role, its own folder; its words land in its own conversation and the
// default partner's session never sees them.
import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies } from "../../protocol/src/index.ts";
import { startCore, type Core } from "../../core/src/core.ts";
import { logUserMessage } from "../../core/src/reply.ts";
import { createPartner, type PartnerHandle } from "../src/partner.ts";
import { fakeRunner, type FakeSession } from "./fakes.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

test("a second partner's own session answers in its name, on its own role and folder; the default's never sees it", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ducter-p2-"));
  const core: Core = startCore({ dataDir: dir, port: 0, push: false, platform: "darwin", partners: true });
  stops.push(() => rmSync(dir, { recursive: true, force: true }), () => core.stop());
  core.partners.add({ name: "小家" });

  const mainRunner = fakeRunner(async (_i, s) => (s.say("on it."), s.end()));
  const main: PartnerHandle = createPartner(core as never, mainRunner.runner, { prewarm: false, spine: false, persistState: false, onError: () => {} });
  core.setPartner(main);
  stops.push(() => main.close());

  const homeRunner = fakeRunner(async (_i, s) => (s.say("约了，周六上午十点。"), s.end()));
  const made: PartnerHandle[] = [];
  core.setPartnerFactory((view, _id, o) => {
    const p = createPartner(view, homeRunner.runner, { dir: o.dir, prewarm: false, spine: false, onError: (e) => console.error(e) });
    made.push(p);
    stops.push(() => p.close());
    return p;
  });

  logUserMessage(core.log, core.decisions, { text: "ship the release" });
  logUserMessage(core.log, core.decisions, { text: "周六的牙医约了吗", stream: "channel:p2" });
  for (let i = 0; i < 100 && (!made.length || !homeRunner.sessions.length); i++) await Bun.sleep(10);
  await main.idle();
  await made[0]!.idle();

  const home = homeRunner.sessions[0] as FakeSession;
  expect(home.spec.systemPrompt).toContain("# You are 小家");
  expect(home.spec.systemPrompt).toContain("never see theirs");
  // Its own partner role: the token names it.
  const auth = home.spec.mcp![0]!.headers.Authorization!.slice(7);
  expect(core.mcp.verify(auth)).toEqual({ role: "partner", persona: "p2" });
  expect(core.mcp.verify((mainRunner.sessions[0] as FakeSession).spec.mcp![0]!.headers.Authorization!.slice(7))).toEqual({ role: "partner" });
  // Its folder, apart from the default's.
  expect(existsSync(join(dir, "partners", "p2", "state.json"))).toBe(true);
  expect(home.spec.cwd).toBe(join(dir, "partners", "p2"));

  const inputs = (r: typeof homeRunner) => r.sessions.flatMap((s) => (s as FakeSession).inputs).join("\n");
  expect(inputs(homeRunner)).toContain("周六的牙医约了吗");
  expect(inputs(homeRunner)).not.toContain("ship the release");
  expect(inputs(mainRunner)).toContain("ship the release");
  expect(inputs(mainRunner)).not.toContain("牙医");

  const words = (s: string) => core.log.read({ stream: s, kinds: ["ai_msg"] }).map((e) => (e.body as Bodies["ai_msg"]).text);
  // Both answers are written by turns that may still be landing on a slow machine (CI): wait for them.
  for (let i = 0; i < 500 && (!words("channel:p2").length || !words("channel").length); i++) await Bun.sleep(10);
  expect(words("channel:p2")).toEqual(["约了，周六上午十点。"]);
  expect(words("channel")).toEqual(["on it."]);
});
