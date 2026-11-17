// D348 (research/124 F8): memory held off by the home's start (DUCTER_MEMORY=off) says so in its
// settings, so the Memory page can show the switch still and why, instead of a switch that does nothing.
import { afterEach, expect, test } from "bun:test";
import { openLog } from "../src/log.ts";
import { openPushStore } from "../src/push.ts";
import { openSettings } from "../src/settings.ts";
import { tempDir } from "./helpers.ts";

const stops: (() => void)[] = [];
afterEach(() => stops.splice(0).forEach((s) => s()));

function open(pinned: boolean) {
  const t = tempDir();
  stops.push(t.cleanup);
  const log = openLog({ path: t.dir + "/log.db", persona: "p" });
  stops.push(() => log.close?.());
  return openSettings({ dataDir: t.dir, log, push: openPushStore(t.dir), persona: { name: "Pebble", identity: "" }, memoryPinnedOff: pinned });
}

test("held off: memory is off, says it is held, and a switch can't turn it on", () => {
  const s = open(true);
  expect(s.get()).toMatchObject({ memory: false, memoryPinned: true });
  s.set({ memory: true });
  expect(s.get().memory).toBe(false);
});

test("not held: no flag, and the switch works", () => {
  const s = open(false);
  expect(s.get().memoryPinned).toBeUndefined();
  s.set({ memory: false });
  expect(s.get().memory).toBe(false);
  s.set({ memory: true });
  expect(s.get().memory).toBe(true);
});
