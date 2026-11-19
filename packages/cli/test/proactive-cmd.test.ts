// D388: `ducter proactive replay` against a running core: the frame goes over the WebSocket, the
// home answers (here: no AI agent to read with, so a plain error, never a silent nothing), and the
// report prints as lines with each find's sources.
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ReplayReport } from "@ducter/protocol";
import { startCore, type Core } from "@ducter/core/src/core.ts";
import { cmdProactive, replayLines } from "../src/proactive-cmd.ts";
import { translator } from "../src/i18n.ts";

let core: Core | undefined;
let dir = "";
afterEach(async () => {
  await core?.stop();
  core = undefined;
  if (dir) rmSync(dir, { recursive: true, force: true });
});

test("usage: only `proactive replay`, days 1 to 7", async () => {
  const lines: string[] = [];
  const t = translator("en");
  expect(await cmdProactive({ t, target: { kind: "local", port: 1 }, json: false, rest: [], print: (l) => lines.push(l) })).toBe(2);
  expect(await cmdProactive({ t, target: { kind: "local", port: 1 }, json: false, rest: ["replay"], days: 9, print: (l) => lines.push(l) })).toBe(2);
  expect(lines[0]).toContain("ducter proactive replay");
});

test("the home answers over the socket: with no AI agent yet, the replay says why it didn't run", async () => {
  dir = mkdtempSync(join(tmpdir(), "ducter-cli-replay-"));
  core = startCore({ dataDir: dir, port: 0, push: false, platform: "linux" });
  const lines: string[] = [];
  const code = await cmdProactive({ t: translator("en"), target: { kind: "local", port: core.port }, json: false, rest: ["replay"], days: 2, print: (l) => lines.push(l) });
  expect(code).toBe(1);
  expect(lines.at(-1)).toMatch(/didn't finish: no AI agent/);
}, 30_000);

test("a report prints each find with its sources, what it doesn't know, and how it knew", () => {
  const r: ReplayReport = {
    days: 3,
    mode: "three",
    zone: "Asia/Shanghai",
    web: true,
    looked: { mail: 412, events: 38, mentions: 5 },
    read: 61,
    noted: 27,
    said: [{ rung: "now", kind: "mismatch", text: "日历上「AGI Bar 北京分享」是 11/21（周六），Lina 的周报写的是 11/20（周五）。", how: [{ src: "calendar", what: "AGI Bar 北京分享", at: "2026-11-12T02:00:00.000Z", says: "11/21（周六），全天，没写时间" }, { src: "web", what: "agibar.example.com", at: "2026-11-19T02:00:00.000Z", url: "https://agibar.example.com/e" }], unknown: "几点开始" }],
    held: [{ reason: "below_bar", n: 4 }],
    noticed: [{ kind: "mismatch", text: "x", said: true, why: "1. 日历「AGI Bar 北京分享」" }],
    open: [{ name: "AGI Bar 北京分享", fields: ["day", "time"], state: "filled" }],
    looks: 1,
  };
  const out = replayLines(translator("zh"), r).join("\n");
  expect(out).toContain("[now] mismatch: 日历上「AGI Bar 北京分享」");
  expect(out).toContain("calendar  2026-11-12  AGI Bar 北京分享  11/21（周六），全天，没写时间");
  expect(out).toContain("https://agibar.example.com/e");
  expect(out).toContain("还不知道：几点开始");
  expect(out).toContain("1. 日历「AGI Bar 北京分享」");
});
