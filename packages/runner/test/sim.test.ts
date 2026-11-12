// D220: the iOS Simulator in the workbench, with a fake simctl (no Xcode needed): the booted list,
// when it is the task's business, a frame made small, each control's exact argv, the checks on
// udids and links, and what isn't there (taps, rotation). The real simctl is research/64.
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appProject, isUdid, simLinkOk, simsSaid, simTextOf } from "@ducter/protocol/src/workbench.ts";
import { createSims, holdsApp, jpegSize, osName, parseBooted, type Exec } from "../src/sim.ts";
import { wbOp, WbFail, type WbCtx } from "../src/workbench.ts";
import { saidSims } from "../../core/src/workbench.ts";

const U = "651C1449-DA9D-4D9D-9223-B4CBF5571A4A";
const LIST = JSON.stringify({
  devices: {
    "com.apple.CoreSimulator.SimRuntime.iOS-26-3": [
      { udid: U, name: "iPhone 16e", state: "Booted", isAvailable: true },
      { udid: "7F4C6FB5-AB55-461D-94B2-0898325AD829", name: "iPhone 17 Pro", state: "Shutdown" },
    ],
    "com.apple.CoreSimulator.SimRuntime.watchOS-26-0": [{ udid: "11111111-2222-3333-4444-555555555555", name: "Apple Watch", state: "Booted" }],
  },
});
// A 1×1 JPEG's header with a SOF0 saying 360 × 780.
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x03, 0x0c, 0x01, 0x68, 0x01, 0x01, 0x11, 0x00, 0xff, 0xd9]);

let dir: string;
let calls: string[][];
let booted = true;
beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "ducter-sim-")));
  calls = [];
  booted = true;
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const enc = (s: string) => new TextEncoder().encode(s);
const fake: Exec = async (argv) => {
  calls.push(argv);
  const a = argv.join(" ");
  if (a.startsWith("xcrun simctl list")) return { code: 0, out: enc(booted ? LIST : JSON.stringify({ devices: {} })), err: "" };
  if (a.endsWith("ui " + U + " appearance")) return { code: 0, out: enc("dark\n"), err: "" };
  if (a.endsWith("ui " + U + " content_size")) return { code: 0, out: enc("extra-extra-large\n"), err: "" };
  if (a.includes("screenshot --type=jpeg")) return { code: 0, out: JPEG, err: "" };
  if (a.includes("screenshot --type=png")) return { code: 0, out: new Uint8Array([0x89, 0x50, 0x4e, 0x47]), err: "" };
  if (argv[0] === "sips") {
    writeFileSync(argv.at(-1)!, JPEG);
    return { code: 0, out: new Uint8Array(), err: "" };
  }
  return { code: 0, out: new Uint8Array(), err: "" };
};
const sims = () => createSims({ exec: fake, platform: "darwin", tmp: dir });

test("words: the runtime as Apple says it, booted iPhones only, the four text steps", () => {
  expect(osName("com.apple.CoreSimulator.SimRuntime.iOS-26-3")).toBe("iOS 26.3");
  expect(parseBooted(LIST)).toEqual([{ udid: U, name: "iPhone 16e", os: "iOS 26.3" }]);
  expect(parseBooted("not json")).toEqual([]);
  expect(["extra-small", "large", "extra-extra-large", "accessibility-large", "accessibility-extra-extra-extra-large", "nope"].map(simTextOf)).toEqual(["small", "default", "large", "xlarge", "xlarge", undefined]);
  expect(jpegSize(JPEG)).toEqual({ w: 360, h: 780 });
});

test("links: a scheme and something after it; never file:, never too long", () => {
  expect(simLinkOk("https://example.com")).toBe(true);
  expect(simLinkOk("myapp://home")).toBe(true);
  expect(simLinkOk("file:///etc/passwd")).toBe(false);
  expect(simLinkOk("not a link")).toBe(false);
  expect(simLinkOk("https://" + "a".repeat(3000))).toBe(false);
  expect(isUdid(U)).toBe(true);
  expect(isUdid("booted")).toBe(false);
});

test("whether a task touched a simulator, from its own commands and words", () => {
  expect(simsSaid("xcrun simctl boot 'iPhone 16e'")).toBe(true);
  expect(simsSaid("xcodebuild -scheme Levav -destination 'platform=iOS Simulator,name=iPhone 16e' build")).toBe(true);
  expect(simsSaid("I'll run it in the iOS Simulator")).toBe(true);
  expect(simsSaid("bun test && git push")).toBe(false);
  const ev = (text: string) => ({ seq: 1, ts: "", stream: "task:t", origin: "task", kind: "task_event", body: { taskId: "t", role: "tool", tool: { name: "Bash", input: { command: text } } } }) as never;
  expect(saidSims([ev("ls"), ev("xcrun simctl io booted screenshot a.png")])).toBe(true);
  expect(saidSims([ev("ls")])).toBe(false);
});

test("an app project: an Xcode project, an ios/ folder, or one under apps/*", () => {
  expect(appProject(["Levav.xcodeproj", "README.md"])).toBe(true);
  expect(appProject(["src", "package.json"])).toBe(false);
  mkdirSync(join(dir, "apps", "ios", "Ducter.xcodeproj"), { recursive: true });
  expect(holdsApp(dir)).toBe(true);
  const plain = join(dir, "plain");
  mkdirSync(join(plain, "src"), { recursive: true });
  expect(holdsApp(plain)).toBe(false);
  mkdirSync(join(plain, "mobile", "ios"), { recursive: true });
  expect(holdsApp(plain)).toBe(true);
});

test("the list carries each simulator's own settings; none off a Mac", async () => {
  expect(await sims().list()).toEqual([{ udid: U, name: "iPhone 16e", os: "iOS 26.3", appearance: "dark", text: "large" }]);
  expect(await createSims({ exec: fake, platform: "linux" }).list()).toEqual([]);
  expect(calls.filter((c) => c.includes("list")).length).toBe(1);
});

test("a frame is made small (sips) and says its size", async () => {
  const f = await sims().frame(U, 780);
  expect(f.image.startsWith("data:image/jpeg;base64,")).toBe(true);
  expect([f.w, f.h]).toEqual([360, 780]);
  expect(calls.find((c) => c[0] === "sips")?.slice(0, 3)).toEqual(["sips", "-Z", "780"]);
});

test("each control is simctl's own argv; taps and rotation aren't there", async () => {
  const s = sims();
  await s.act(U, "home");
  await s.act(U, "appearance", "light");
  await s.act(U, "text", "xlarge");
  await s.act(U, "url", "myapp://settings");
  const shot = await s.act(U, "shot");
  const acts = calls.filter((c) => c[1] === "simctl" && !["list"].includes(c[2]!) && !(c[2] === "ui" && c.length === 5)).map((c) => c.slice(2).join(" "));
  expect(acts).toEqual([`launch ${U} com.apple.springboard`, `ui ${U} appearance light`, `ui ${U} content_size accessibility-large`, `openurl ${U} myapp://settings`, `io ${U} screenshot --type=png -`]);
  expect(shot.image?.startsWith("data:image/png;base64,")).toBe(true);
  await expect(s.act(U, "url", "file:///etc/hosts")).rejects.toBeInstanceOf(WbFail);
  await expect(s.act(U, "rotate" as never)).rejects.toMatchObject({ code: "unsupported" });
  await expect(s.act("not-a-udid", "home")).rejects.toMatchObject({ code: "outside" });
  await expect(s.act("7F4C6FB5-AB55-461D-94B2-0898325AD829", "home")).rejects.toMatchObject({ code: "missing" });
});

test("the workbench offers simulators only to a task whose business they are", async () => {
  const ctx = (o: Partial<WbCtx> = {}): WbCtx => ({ taskId: "t1", cwd: dir, place: { kind: "folder", device: "local", path: dir }, dataDir: join(dir, ".data"), ...o });
  const s = sims();
  expect(await wbOp(ctx(), { op: "sims" }, { sims: s })).toEqual({ op: "sims", sims: [] });
  expect(((await wbOp(ctx({ simSaid: true }), { op: "sims" }, { sims: s })) as { sims: unknown[] }).sims.length).toBe(1);
  mkdirSync(join(dir, "Levav.xcodeproj"));
  expect(((await wbOp(ctx(), { op: "sims" }, { sims: s })) as { sims: unknown[] }).sims.length).toBe(1);
  booted = false;
  expect(await wbOp(ctx({ simSaid: true }), { op: "sims" }, { sims: createSims({ exec: fake, platform: "darwin" }) })).toEqual({ op: "sims", sims: [] });
});
