// D329 on the home: Nowledge Mem's app closed (one line, a way to open it), Mem in 全部更新 / Update
// all, the first words' Mem line (nothing in Mem read for it), and 撤销 / Undo on a Noted line through
// settings. Fake nmem calls and fake installers only; nothing here reaches Mem or runs `open`.
import { afterEach, describe, expect, test } from "bun:test";
import type { Bodies, DeviceView } from "@ducter/protocol";
import { createBridgeLink, memClosedIn, type MemExec, type NmemCall } from "../src/bridge-link.ts";
import type { MemSys } from "../src/mem-cli.ts";
import { createUpdateAll, MEM_KEY, offerFrom } from "../src/update-all.ts";
import { firstWords } from "../src/first-words.ts";
import { openLog } from "../src/log.ts";
import { openSettings } from "../src/settings.ts";
import { openPushStore } from "../src/push.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => void)[] = [];
afterEach(() => {
  for (const s of stops.reverse()) s();
  stops = [];
});

const sysOf = (files: Record<string, string>, tools: Record<string, string>, platform: NodeJS.Platform = "darwin"): MemSys => ({
  which: (cmd) => tools[cmd],
  exists: (p) => p in files,
  read: (p) => files[p],
  list: (d) => [...new Set(Object.keys(files).filter((p) => p.startsWith(d + "/")).map((p) => p.slice(d.length + 1).split("/")[0]!))],
  real: (p) => p,
  home: "/Users/u",
  platform,
  uid: 501,
});

/** A home whose Mem is the app: closed until `open -a` runs; pipx's copy with a newer one out when `latest`. */
function rig(o: { app?: boolean; latest?: boolean; pipx?: boolean } = {}) {
  const t = tempDir();
  stops.push(t.cleanup);
  let open = false;
  let version = "0.10.118";
  let newer = !!o.latest;
  const execs: string[][] = [];
  const run: NmemCall = async (args) => {
    if (args[0] === "--version") return { code: 0, out: `nmem ${version}`, err: "" };
    if (args[0] === "status")
      return open || o.pipx
        ? { code: 0, out: JSON.stringify({ status: "healthy", backend: o.pipx ? "cloud" : "local", update: { current: version, latest: "0.10.119", update_available: newer } }), err: "" }
        : { code: 1, out: "", err: "error: connecting to http://127.0.0.1:14242 for /health/details: error sending request: tcp connect error: Connection refused (os error 61)" };
    if (args.join(" ") === "bridge setup") return { code: 0, out: JSON.stringify({ candidates: [{ id: "v1", label: "My vault", kind: "personal" }] }), err: "" };
    return { code: 1, out: "", err: "not in this rig" };
  };
  const exec: MemExec = async (argv) => {
    execs.push(argv);
    if (argv[0] === "/usr/bin/open") open = true;
    else if (argv.includes("upgrade")) {
      version = "0.10.119";
      newer = false;
    }
    return { code: 0, out: "", err: "" };
  };
  const files: Record<string, string> = o.pipx ? { "/Users/u/.local/pipx/venvs/nmem-cli/bin/nmem": "ELF" } : { "/Applications/Nowledge Mem.app/Contents/Resources/nmem": "bin" };
  const tools: Record<string, string> = o.pipx ? { nmem: "/Users/u/.local/pipx/venvs/nmem-cli/bin/nmem", pipx: "/usr/local/bin/pipx" } : { nmem: "/Applications/Nowledge Mem.app/Contents/Resources/nmem" };
  const link = createBridgeLink({
    dataDir: t.dir,
    identity: () => "ducter",
    home: () => "Wey’s Mac",
    run,
    exec,
    sys: sysOf(files, tools),
    env: { PATH: "/usr/bin" },
    memApp: () => (o.app === false ? undefined : "/Applications/Nowledge Mem.app"),
    openWaitMs: 50,
    openEveryMs: 5,
  });
  return { link, execs };
}

describe("Mem's app closed", () => {
  test("a refused connection to this computer reads as closed; anything else does not", () => {
    expect(memClosedIn("error sending request for url (http://127.0.0.1:14242/health): tcp connect error: Connection refused")).toBe(true);
    expect(memClosedIn("error: connecting to http://localhost:14242: Connection refused")).toBe(true);
    expect(memClosedIn("error: connecting to https://mem.example.com: Connection refused")).toBe(false);
    expect(memClosedIn("401 Unauthorized")).toBe(false);
  });

  test("closed: one state with a way to open it; the tap opens the app and the row goes on by itself", async () => {
    const r = rig();
    expect(await r.link.view()).toEqual({ state: "mem_closed", identity: "ducter", home: "Wey’s Mac", version: "0.10.118", canOpen: true });
    expect(r.link.memSignedIn()).toBe(false);
    await r.link.openMem();
    expect(r.execs).toEqual([["/usr/bin/open", "-a", "/Applications/Nowledge Mem.app"]]);
    expect((await r.link.view())?.state).toBe("ready");
    expect(r.link.memSignedIn()).toBe(true);
  });

  test("no app to open here (a server, or the app elsewhere): the line alone, and the tap does nothing", async () => {
    const r = rig({ app: false });
    expect(await r.link.view()).toEqual({ state: "mem_closed", identity: "ducter", home: "Wey’s Mac", version: "0.10.118" });
    await r.link.openMem();
    expect(r.execs).toEqual([]);
  });
});

describe("Mem in Update all", () => {
  const home = (): DeviceView => ({ id: "local", name: "hel", kind: "server", home: true, state: "awake", version: "0.0.67", harnesses: [], abilities: [], update: { current: "0.0.67", latest: "0.0.67", available: false, how: "self" } });

  test("the offer: Mem after everything else, by day only", () => {
    const { offer } = offerFrom([home()], { mem: { from: "0.10.118", to: "0.10.119" } });
    expect(offer).toEqual([expect.objectContaining({ key: MEM_KEY, kind: "mem", device: "local", deviceName: "hel", from: "0.10.118", to: "0.10.119", state: "queued" })]);
    expect(offerFrom([home()], { mem: { from: "0.10.118", to: "0.10.119" }, night: true }).offer).toEqual([]);
  });

  test("the bridge link says when Mem is behind and updates it from its own source", async () => {
    const r = rig({ pipx: true, latest: true });
    expect(await r.link.memUpdate.behind()).toEqual({ from: "0.10.118", to: "0.10.119" });
    expect(r.link.memUpdate.cached()).toEqual({ from: "0.10.118", to: "0.10.119" });
    expect(await r.link.memUpdate.run()).toEqual({ ok: true });
    expect(r.execs.filter((a) => !a.includes("-c"))).toEqual([["/usr/local/bin/pipx", "upgrade", "nmem-cli"]]);
    expect(await r.link.memUpdate.behind()).toBeUndefined();
  });

  test("one tap: the plan holds Mem, runs it once the home is over, and finishes with it", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    const log = openLog({ path: t.dir + "/log.db", persona: "p" });
    stops.push(() => log.close?.());
    let ran = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const ua = createUpdateAll({
      dataDir: t.dir,
      log,
      now: () => Date.parse("2026-11-17T10:00:00Z"),
      updates: () => undefined,
      agents: () => undefined,
      devices: async () => [home()],
      busy: () => 0,
      tickMs: 0,
      nightEveryMs: 0,
      mem: { behind: async () => ({ from: "0.10.118", to: "0.10.119" }), cached: () => ({ from: "0.10.118", to: "0.10.119" }), run: async () => (ran++, await gate, { ok: true }) },
    });
    stops.push(() => ua.stop_());
    expect(ua.view([home()]).offer.map((i) => i.key)).toEqual([MEM_KEY]);
    expect(await ua.start()).toMatchObject({ ok: true });
    await ua.step();
    expect(ua.plan()!.items[0]).toMatchObject({ key: MEM_KEY, state: "running" });
    expect(ran).toBe(1);
    release();
    await gate;
    await Bun.sleep(5);
    await ua.step();
    expect(ua.plan()!.items[0]!.state).toBe("done");
    expect(ua.plan()!.finishedAt).toBeString();
  });
});

describe("the first words' Mem line", () => {
  const base = { name: "Pebble", now: new Date("2026-11-17T09:00:00Z"), tz: "UTC", projects: [], everyday: [{ zh: "帮我查查明天的天气", en: "Check tomorrow's weather" }, { zh: "理理下载文件夹", en: "Tidy my Downloads" }, { zh: "写封邮件", en: "Write an email" }] };
  test("Mem there: one line, and one start asking what it remembers; nothing from Mem in the words", () => {
    const zh = firstWords({ ...base, lang: "zh", mem: true });
    expect(zh.text).toContain("你的 Nowledge Mem 我也接上了");
    expect(zh.first.starts.map((s) => s.id)).toEqual(["mem", "everyday:1", "everyday:2"]);
    expect(zh.first.starts[0]).toMatchObject({ from: "everyday", words: "你都记得我些什么？", draft: "你都记得我些什么？" });
    const en = firstWords({ ...base, lang: "en", mem: true });
    expect(en.text).toContain("I'm on your Nowledge Mem too");
    expect(en.first.starts[0]!.words).toBe("What do you remember about me?");
  });
  test("no Mem: neither", () => {
    const zh = firstWords({ ...base, lang: "zh" });
    expect(zh.text).not.toContain("Nowledge Mem");
    expect(zh.first.starts.some((s) => s.id === "mem")).toBe(false);
  });
});

describe("Undo through settings", () => {
  test("taken back: the line reads undone; Mem refused: nothing changes; a line still waiting is listed", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    const log = openLog({ path: t.dir + "/log.db", persona: "p" });
    stops.push(() => log.close?.());
    const settings = openSettings({ dataDir: t.dir, log, push: openPushStore(t.dir), persona: { name: "Pebble", identity: "" } });
    const a = log.append({ stream: "channel", origin: "partner", kind: "memory_noted", body: { title: "周报周五发", memoryId: "m1" } satisfies Bodies["memory_noted"] });
    const b = log.append({ stream: "channel", origin: "partner", kind: "memory_noted", body: { title: "喜欢深色", waiting: "k-1" } satisfies Bodies["memory_noted"] });
    let ok = true;
    const asked: unknown[] = [];
    settings.setMemHooks({ undo: async (n) => (asked.push(n), ok), waiting: () => new Set(["k-1"]) });
    expect((await settings.view()).mem.waiting).toEqual([b.seq]);
    ok = false;
    expect(await settings.undo(a.seq)).toBe(false);
    expect((await settings.view()).mem.undone).toBeUndefined();
    ok = true;
    expect(await settings.undo(a.seq)).toBe(true);
    expect((await settings.view()).mem.undone).toEqual([a.seq]);
    expect(asked.at(-1)).toMatchObject({ memoryId: "m1" });
    expect(await settings.undo(9999)).toBe(false);
  });
});
