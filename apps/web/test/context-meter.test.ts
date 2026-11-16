// D288: 上下文 / Context on the web: every word in both languages, a usage window worded, the
// ring's states, the compaction hairline's sizes, and the account's limits asked for at most once
// a minute (the home reads them at most every few minutes).
import { expect, test } from "bun:test";
import type { LogEvent } from "@ducter/protocol";
import { strings } from "../src/i18n.ts";
import { contextWords } from "../src/i18n-context.ts";

test("every context word in zh and en, the same keys", () => {
  expect(Object.keys(contextWords.zh).sort()).toEqual(Object.keys(contextWords.en).sort());
  const zh = strings("zh");
  const en = strings("en");
  expect(zh.t("ctx.ring", "48%")).toBe("上下文 · 已用 48%");
  expect(en.t("ctx.ring", "48%")).toBe("Context · 48% used");
  expect(zh.t("note.compacted.size", "152k", "31k")).toBe("压缩了上下文 · 152k → 31k");
  expect(en.t("note.compacted.size", "152k", "31k")).toBe("Context compacted · 152k → 31k");
  expect(zh.t("ctx.why.unsupported", "pi")).toBe("pi 不提供额度信息");
  expect(en.t("ctx.compact")).toBe("Compact now");
  expect(zh.t("ctx.compact")).toBe("现在压缩");
});

test("a usage window in words", async () => {
  const { A } = await import("../src/app.ts");
  const { limitName } = await import("../src/context-meter.tsx");
  A.L = strings("zh");
  expect(limitName({ id: "codex:secondary", label: "Codex", used: 0.4, durationMs: 604_800_000 })).toBe("7 天额度");
  expect(limitName({ id: "five_hour", label: "Current session", used: 0.1 })).toBe("5 小时额度");
  expect(limitName({ id: "model_scoped:Opus", label: "Current week (Opus)", used: 0.2, durationMs: 604_800_000 })).toBe("7 天额度 · Opus");
  A.L = strings("en");
  expect(limitName({ id: "five_hour", label: "Current session", used: 0.1 })).toBe("5-hour limit");
  expect(limitName({ label: "Usage limit", used: 0.1 })).toBe("Usage limit");
});

test("the ring: empty until a reading, butter once close, the compaction point a tick", async () => {
  const { Ring, hasMeter } = await import("../src/context-meter.tsx");
  const { contextMeter } = await import("@ducter/protocol");
  const ev = (seq: number, raw: object): LogEvent => ({ seq, ts: "2026-11-16T10:00:00.000Z", persona: "p", stream: "task:t", origin: "task", kind: "task_event", body: { taskId: "t", role: "system", raw } });
  expect(hasMeter(contextMeter([]))).toBe(false);
  const calm = contextMeter([ev(1, { kind: "context", contextTokens: 40_000, contextWindow: 200_000, compactAt: 160_000 })]);
  const near = contextMeter([ev(1, { kind: "context", contextTokens: 150_000, contextWindow: 200_000, compactAt: 160_000 })]);
  const kids = (v: any) => (Array.isArray(v.props.children) ? v.props.children : [v.props.children]).filter(Boolean);
  const a = Ring({ m: calm }) as any;
  const b = Ring({ m: near }) as any;
  expect(a.props.class).toBe("ctx-ring");
  expect(b.props.class).toBe("ctx-ring near");
  expect(kids(a).map((k: any) => k.props.class)).toEqual(["track", "fill", "tick"]);
});

test("the account's limits: asked once a minute at most, answered into the card", async () => {
  const { A } = await import("../src/app.ts");
  const sent: any[] = [];
  A.send = (f) => void sent.push(f);
  A.accountUsage.clear();
  A.askAccountUsage("codex");
  A.askAccountUsage("codex");
  expect(sent).toEqual([{ t: "account_usage", harness: "codex" }]);
  A.askAccountUsage("codex", true);
  expect(sent.at(-1)).toEqual({ t: "account_usage", harness: "codex", fresh: true });
  A.receive({ t: "account_usage", harness: "codex", usage: { harness: "codex", plan: "plus", windows: [{ id: "codex:secondary", label: "Codex", used: 0.4 }], at: "2026-11-16T10:00:00.000Z" } });
  expect(A.accountUsage.get("codex")?.usage?.plan).toBe("plus");
  A.receive({ t: "account_usage", harness: "pi", why: "unsupported" });
  expect(A.accountUsage.get("pi")?.why).toBe("unsupported");
});
