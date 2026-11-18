// D362: a running AI agent update's line moves: the bytes of the download, the install, the
// elapsed time where nothing else can be seen; past its usual time one quiet line offers
// 再等等 and 停止 (only that step). The same words as the Mac (updateall.test.ts keeps them equal).
import { expect, test } from "bun:test";
import type { UpdateAllItem } from "@ducter/protocol";
import { strings } from "../src/i18n.ts";

const now = Date.parse("2026-11-18T14:40:00Z");
const ago = (ms: number) => new Date(now - ms).toISOString();
const step = (o: Partial<UpdateAllItem>): UpdateAllItem => ({ key: "agent:m1:codex", kind: "agent", device: "m1", deviceName: "MacBook Pro M3", harness: "codex", from: "0.169.1", to: "0.170.0", state: "running", phase: "updating", at: ago(60_000), ...o });

test("the words: bytes with the whole size, bytes alone, the time, the install, an unseen updater after 10 s", async () => {
  const { A } = await import("../src/app.ts");
  const { updatingWords, elapsedWords, mb } = await import("../src/agent-progress.ts");
  A.L = strings("zh");
  expect(updatingWords({ step: "downloading", got: 12_000_000, size: 98_000_000 }, "0.170.0", now)).toBe("正在下载（12 / 98 MB）");
  expect(updatingWords({ step: "downloading", got: 38_400_000 }, "0.170.0", now)).toBe("正在下载（38 MB）");
  expect(updatingWords({ step: "downloading", since: ago(80_000) }, "0.170.0", now)).toBe("正在下载… 1 分 20 秒");
  expect(updatingWords({ step: "installing", since: ago(80_000) }, "0.170.0", now)).toBe("正在装好…");
  expect(updatingWords({ since: ago(125_000) }, "0.170.0", now)).toBe("正在更新到 0.170.0… 2 分 5 秒");
  expect(updatingWords({ since: ago(3_000) }, "0.170.0", now)).toBeUndefined(); // the plain words then
  expect(updatingWords({}, "0.170.0", now)).toBeUndefined();
  expect(elapsedWords(9_400)).toBe("9 秒");
  expect(mb(1)).toBe(1);
  expect(mb(0)).toBe(0);
  A.L = strings("en");
  expect(updatingWords({ step: "downloading", got: 12_000_000, size: 98_000_000 }, "0.170.0", now)).toBe("Downloading (12 / 98 MB)");
  expect(updatingWords({ step: "downloading", since: ago(80_000) }, "0.170.0", now)).toBe("Downloading… 1 min 20 s");
  expect(updatingWords({ step: "installing" }, "0.170.0", now)).toBe("Installing…");
  expect(updatingWords({ since: ago(125_000) }, "0.170.0", now)).toBe("Updating to 0.170.0… 2 min 5 s");
});

test("Update all's row reads the step; timeout and stopped say why; the device card's row reads the same", async () => {
  const { A } = await import("../src/app.ts");
  const { stateWords, whyWords } = await import("../src/updateall.tsx");
  A.L = strings("zh");
  expect(stateWords(step({ step: "downloading", got: 61_000_000, size: 155_000_000 }))).toBe("正在下载（61 / 155 MB）");
  expect(stateWords(step({ step: "installing" }))).toBe("正在装好…");
  expect(stateWords(step({}))).toBe("正在更新到 0.170.0…");
  expect(stateWords(step({ phase: "checking" }))).toBe("在检查 0.170.0…");
  expect(whyWords(step({ state: "failed", reason: "timeout" }))).toBe("下载太久没完成，已经停下了，原来的版本照常能用。网络好些时再试一次。");
  expect(stateWords(step({ state: "skipped", reason: "stopped" }))).toBe("已停止");
});

test("slower than usual: only past slowMs; 再等等 hides it for another stretch; a new attempt starts fresh", async () => {
  const { isSlow, keepWaiting } = await import("../src/agent-progress.ts");
  const p = { since: ago(5 * 60_000), slowMs: 240_000 };
  expect(isSlow("k", { since: ago(60_000), slowMs: 240_000 }, now)).toBe(false);
  expect(isSlow("k", { since: ago(60 * 60_000) }, now)).toBe(false); // no limit known: never
  expect(isSlow("k", p, now)).toBe(true);
  keepWaiting("k", p, now);
  expect(isSlow("k", p, now)).toBe(false);
  expect(isSlow("k", p, now + 3 * 60_000)).toBe(false);
  expect(isSlow("k", p, now + 4 * 60_000 + 1)).toBe(true);
  expect(isSlow("k", { since: ago(5 * 60_000 - 1), slowMs: 240_000 }, now)).toBe(true); // another attempt
});

