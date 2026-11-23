// D495: 不用问我的 / Without asking is recorded by the partner (without_asking), never read from the
// person's words by code. Code checks only the invariants: the words were said (in a message or a
// reply to a card), and the action is one Ducter has an audited write for.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCore, type Core } from "../../core/src/core.ts";
import { createPartner, type PartnerHandle } from "../src/partner.ts";
import { fakeRunner } from "./fakes.ts";

let dir: string;
let core: Core;
let partner: PartnerHandle;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "ducter-without-asking-"));
  core = startCore({ dataDir: dir, port: 0, push: false, platform: "darwin" });
  partner = createPartner(core as never, fakeRunner(() => {}).runner, { prewarm: false, spine: false, persistState: false, onError: () => {} });
});
afterAll(async () => {
  await partner.close();
  await core.stop();
  rmSync(dir, { recursive: true, force: true });
});

const call = (args: unknown) => core.mcp.call({ role: "partner" } as never, "without_asking", args) as Promise<{ ok: boolean; error?: string; note?: string }>;

test("no saying of theirs is read by code: the words alone keep nothing", () => {
  core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "review 做好了直接发别和我确认" } });
  expect(core.standing.list()).toEqual([]);
});

test("kept with their own words; a paraphrase or an action without an audited write keeps nothing", async () => {
  expect((await call({ do: "keep", action: "pr_review", said: "reviews may always be posted" })).ok).toBe(false);
  expect((await call({ do: "keep", action: "pay", said: "review 做好了直接发" })).ok).toBe(false);
  expect(core.standing.list()).toEqual([]);
  const r = await call({ do: "keep", action: "pr_review", said: "「review 做好了直接发别和我确认」" });
  expect(r.ok).toBe(true);
  expect(core.standing.list()).toEqual([expect.objectContaining({ action: "pr_review", text: "「review 做好了直接发别和我确认」" })]);
  expect(core.standing.allows("pr_review", "nowledge-co/mem#11024")).toBeDefined();
});

test("a reply to a card counts as their words; owners bound it; take_back ends it", async () => {
  for (const s of core.standing.list()) core.standing.revoke(s.id); // 收回 on the Partner page
  core.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: "d_1", option: "reply", by: "user", text: "你自己推进到能合并就好，这些都别问我" } });
  const r = await call({ do: "keep", action: "pr_review", owners: ["@Nowledge-Co"], said: "这些都别问我" });
  expect(r.ok).toBe(true);
  expect(core.standing.allows("pr_review", "acme/site#1")).toBeUndefined();
  expect(core.standing.allows("pr_review", "nowledge-co/mem#1")).toBeDefined();
  core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "以后评审发之前先问我" } });
  expect((await call({ do: "take_back", action: "pr_review", said: "评审发之前先问我" })).ok).toBe(true);
  expect(core.standing.list()).toEqual([]);
});
