// D401: what the person said about who does which work is kept as their rule the moment it lands
// (core); the partner sees that under their words, so it says it back and never saves it again.
import { expect, test } from "bun:test";
import type { LogEvent } from "../../protocol/src/index.ts";
import { keptLine, renderTrigger, type RenderCtx } from "../src/render.ts";

test("the user's line carries what Ducter kept from it as their rule", () => {
  const e = { seq: 7, ts: "2026-11-18T14:29:49.748Z", persona: "default", stream: "channel", origin: "user", kind: "user_msg", body: { text: "对了，请你记住，订酒店等生活相关的工作别用 claude code 哈" } } as LogEvent;
  const kept = [{ text: "订酒店等生活相关的工作别用 claude code", harness: "claude-code", never: true, kinds: ["errand"] }];
  const ctx = { kept: (seq: number) => (seq === 7 ? kept : []), taskTitle: () => undefined, decision: () => undefined } as unknown as RenderCtx;
  const line = renderTrigger(e, ctx);
  expect(line).toContain("[user] 对了，请你记住");
  expect(line).toContain(keptLine(kept));
  expect(keptLine(kept)).toMatch(/never claude-code for errand/);
  expect(keptLine(kept)).toMatch(/No rule_save/);
  // A message that kept nothing carries no such line.
  expect(renderTrigger({ ...e, seq: 8 } as LogEvent, ctx)).not.toContain("Ducter already kept");
});
