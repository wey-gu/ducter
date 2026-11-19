// D248: the screens a task drives: asleep never woken by looking, the turn that waits for the step
// in flight, and what it did. Every word in zh and en, and the same keys on the Mac.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { strings } from "../src/i18n.ts";

const KEYS = [
  "phoneuse.asleep.title",
  "phoneuse.asleep.why",
  "phoneuse.asleep.task",
  "phoneuse.wake",
  "phoneuse.waking",
  "phoneuse.again",
  "phoneuse.taking",
  "phoneuse.taking.why",
  "phoneuse.did.title",
  "phoneuse.did.tap",
  "phoneuse.did.tap.0",
  "phoneuse.did.type",
  "phoneuse.did.type.0",
  "phoneuse.did.swipe",
  "phoneuse.did.key",
  "phoneuse.did.open",
];

test("the glossary's words for a device: 叫醒 to wake it, asleep, never off or broken (D56)", () => {
  const zh = strings("zh");
  expect(zh.t("phoneuse.wake")).toBe("叫醒");
  for (const k of ["phoneuse.asleep", "phoneuse.asleep.title", "phoneuse.running"]) expect(zh.t(k)).not.toMatch(/关机|故障|离线/);
});

test("the Mac has the same keys", () => {
  const go = readFileSync(join(import.meta.dir, "../../desktop/internal/i18n/phoneuse.go"), "utf8");
  for (const k of KEYS) expect(go.split(`"${k}":`).length).toBe(3); // zh and en
});
