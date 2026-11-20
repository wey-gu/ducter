// D437: what the partner reads of another AI's look: what is still so (the app shows it, never
// repeated word for word, never called complete), nothing for a clean or fixed look; and the
// 这类不用复查 rule Ducter kept from the person's words, said back without a rule_save.
import { expect, test } from "bun:test";
import type { Bodies, LogEvent } from "@ducter/protocol";
import { noLookLine, renderTrigger, type RenderCtx } from "../src/render.ts";

const ctx = { taskTitle: () => "安装目录可配置", decision: () => undefined } as unknown as RenderCtx;
const report = (look?: Bodies["report"]["look"]): LogEvent =>
  ({ seq: 9, ts: "2026-11-21T10:00:00Z", persona: "default", stream: "task:t1", origin: "task", kind: "report", body: { taskId: "t1", state: "done", summary: "改好了。", questions: [], evidence: [], ...(look ? { look } : {}) } }) as LogEvent;

test("a look with something still so: the partner hears it, and that the app shows it", () => {
  const s = renderTrigger(report({ by: "codex", found: ["Windows 的 install.ps1 没改"], left: ["Windows 的 install.ps1 没改"] }), ctx);
  expect(s).toContain('another AI (Codex) looked it over');
  expect(s).toContain('"Windows 的 install.ps1 没改"');
  expect(s).toContain("don't call the result complete");
});

test("a clean or fixed look: nothing for the partner to say", () => {
  expect(renderTrigger(report({ by: "codex", found: [], left: [] }), ctx)).not.toContain("another AI");
  expect(renderTrigger(report({ by: "codex", found: ["x"], left: [] }), ctx)).not.toContain("another AI");
});

test("这类不用复查 kept: said back in one line, no rule_save", () => {
  const l = noLookLine({ text: "这类不用复查", kinds: ["writing"] });
  expect(l).toContain("writing work");
  expect(l).toContain("No rule_save");
  const e = { seq: 12, ts: "2026-11-21T10:00:00Z", persona: "default", stream: "channel", origin: "user", kind: "user_msg", body: { text: "这类不用复查" } } as LogEvent;
  expect(renderTrigger(e, { ...ctx, noLook: (seq: number) => (seq === 12 ? { text: "这类不用复查", kinds: ["writing"] } : undefined) } as RenderCtx)).toContain("another AI no longer looks over results of writing work");
});
