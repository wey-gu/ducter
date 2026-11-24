// D539 (D528): the partner reads every time in the person's zone, never the server's clock. On hel
// (a UTC server) a partner that read 06:08 told someone in Shanghai 「06:08 UTC」.
import { afterEach, expect, test } from "bun:test";
import { hhmm, renderTime, setRenderZone } from "../src/render.ts";

afterEach(() => setRenderZone(undefined));

test("a time on a UTC server reads in the person's zone, and [time] names it", () => {
  setRenderZone("Asia/Shanghai");
  expect(hhmm("2026-11-24T06:08:00.000Z")).toBe("2026-11-24 14:08");
  // 23:30 UTC is the next morning in Shanghai, the next day's date and weekday.
  expect(hhmm("2026-11-24T23:30:00.000Z")).toBe("2026-11-25 07:30");
  const line = renderTime(new Date("2026-11-24T23:30:00.000Z"));
  expect(line).toBe("[time] 2026-11-25 07:30 Wed (Asia/Shanghai, the user's time)");
  expect(line).not.toContain("UTC");
});

test("a zone Intl doesn't know falls back to the process's own, never a throw", () => {
  setRenderZone("Mars/Olympus");
  expect(hhmm("2026-11-24T06:08:00.000Z")).toMatch(/^2026-11-2\d \d\d:08$/);
  expect(renderTime(new Date("2026-11-24T06:08:00.000Z"))).not.toContain("Mars");
});
