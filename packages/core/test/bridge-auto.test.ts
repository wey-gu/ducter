// D332: the partner connects with the person's own agents by itself once Mem is ready, says so once,
// and the one switch connects or revokes; nothing connects for someone without agents of their own.
import { describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { BridgeView } from "@ducter/protocol";
import { BRIDGE_SAID_FILE, bridgeOnWords, connectsByItself, createBridgeAuto, SERVICE_DATA_DIR_ENV } from "../src/bridge-auto.ts";
import { createBridgeLink, nmemCall } from "../src/bridge-link.ts";

const FAKE = resolve(import.meta.dir, "../../partner/eval/fake-bridge-nmem.ts");

function fakeLink(start: BridgeView["state"]) {
  const calls: string[] = [];
  let state: BridgeView["state"] = start;
  return {
    calls,
    set: (s: BridgeView["state"]) => (state = s),
    link: {
      view: async (): Promise<BridgeView> => ({ state, identity: "ducter" }),
      connect: async () => {
        calls.push("connect");
        state = "connected";
      },
      disconnect: async () => {
        calls.push("disconnect");
        state = "ready";
      },
    },
  };
}

const dir = () => mkdtempSync(join(tmpdir(), "ducter-bridge-auto-"));

describe("Connect without a tap (D332)", () => {
  test("ready, switch on, agents of their own: connects and says so once", async () => {
    const f = fakeLink("ready");
    const said: string[][] = [];
    const d = dir();
    const auto = createBridgeAuto({ link: f.link, on: () => true, own: () => ["Claude Code", "Codex"], dataDir: d, byItself: () => true, say: (a) => said.push(a) });
    await auto.tick();
    expect(f.calls).toEqual(["connect"]);
    expect(said).toEqual([["Claude Code", "Codex"]]);
    expect(existsSync(join(d, BRIDGE_SAID_FILE))).toBe(true);
    await auto.tick();
    expect(f.calls).toEqual(["connect"]);
    expect(said.length).toBe(1);
  });

  test("no agents of their own: nothing connects by itself", async () => {
    const f = fakeLink("ready");
    const said: string[][] = [];
    const auto = createBridgeAuto({ link: f.link, on: () => true, own: () => [], dataDir: dir(), byItself: () => true, say: (a) => said.push(a) });
    await auto.tick();
    expect(f.calls).toEqual([]);
    expect(said).toEqual([]);
  });

  test("switched off: never connects by itself; on connects (asked), off revokes", async () => {
    const f = fakeLink("ready");
    let on = false;
    const said: string[][] = [];
    const auto = createBridgeAuto({ link: f.link, on: () => on, own: () => ["Codex"], dataDir: dir(), byItself: () => true, say: (a) => said.push(a) });
    await auto.tick();
    expect(f.calls).toEqual([]);
    on = true;
    await auto.switched(true);
    expect(f.calls).toEqual(["connect"]);
    expect(said.length).toBe(1);
    on = false;
    await auto.switched(false);
    expect(f.calls).toEqual(["connect", "disconnect"]);
  });

  test("connected before (an earlier tap): nothing said; Mem not ready or a problem: quiet", async () => {
    const f = fakeLink("connected");
    const said: string[][] = [];
    const auto = createBridgeAuto({ link: f.link, on: () => true, own: () => ["Codex"], dataDir: dir(), byItself: () => true, say: (a) => said.push(a) });
    await auto.tick();
    expect(said).toEqual([]);
    for (const s of ["sign_in", "install_mem", "refused", "elsewhere"] as const) {
      const g = fakeLink(s);
      await createBridgeAuto({ link: g.link, on: () => true, own: () => ["Codex"], dataDir: dir(), byItself: () => true, say: (a) => said.push(a) }).tick();
      expect(g.calls).toEqual([]);
    }
    expect(said).toEqual([]);
  });

  test("the line names the agents, in the person's language, with the way to turn it off", () => {
    expect(bridgeOnWords("zh", ["Claude Code", "Codex"])).toContain("Claude Code、Codex");
    expect(bridgeOnWords("zh", [])).toContain("设置 › 和你的其他 agent 通信");
    expect(bridgeOnWords("en", ["Claude Code", "Codex", "pi"])).toStartWith("Your Claude Code, Codex and pi can reach me");
    expect(bridgeOnWords("en", ["Codex"])).toContain("Settings › Talk with your other agents");
  });
});

// D340 (research/124 F2): only the person's own home connects by itself; a scratch home waits to be asked.
describe("Which home connects by itself (D340)", () => {
  test("the default data folder, or the one the installed service runs; nothing else", () => {
    const home = dir();
    const own = join(home, ".ducter");
    mkdirSync(own);
    expect(connectsByItself(own, {}, home)).toBe(true);
    expect(connectsByItself(join(home, ".ducter", "."), {}, home)).toBe(true);
    expect(connectsByItself(join(home, "scratch"), {}, home)).toBe(false);
    expect(connectsByItself("/tmp/ducter-e2e-1", { DUCTER_DATA_DIR: "/tmp/ducter-e2e-1" }, home)).toBe(false);
    expect(connectsByItself("/srv/ducter", { [SERVICE_DATA_DIR_ENV]: "/srv/ducter" }, home)).toBe(true);
    // A home started inside the service's environment with its own folder is still not the service's.
    expect(connectsByItself("/tmp/other", { [SERVICE_DATA_DIR_ENV]: "/srv/ducter" }, home)).toBe(false);
  });

  // Over the fake nmem (the shapes of nmem 0.10.118+): what reaches it is exactly what Mem would get.
  function rig() {
    const d = dir();
    const bin = join(d, "nmem");
    writeFileSync(bin, `#!/bin/sh\nexec bun ${FAKE} "$@"\n`);
    chmodSync(bin, 0o755);
    const state = join(d, "state.json");
    writeFileSync(state, JSON.stringify({ identities: {}, messages: [], seq: 0 }));
    const argvLog = join(d, "argv.log");
    const env = { PATH: process.env.PATH ?? "", NMEM_CLI_PATH: bin, NMEM_FAKE_BRIDGE_STATE: state, NMEM_FAKE_ARGV_LOG: argvLog };
    const connects = () => (existsSync(argvLog) ? readFileSync(argvLog, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as string[]) : []).filter((c) => !c.includes("--help") && c.includes("connections") && c.includes("connect"));
    const data = join(d, "data");
    mkdirSync(data);
    return { d, data, env, bin, connects };
  }
  const build = (r: ReturnType<typeof rig>, byItself: boolean) => {
    const link = createBridgeLink({ dataDir: r.data, identity: () => "ducter", home: () => "hel", run: nmemCall({ bin: r.bin, env: r.env }), env: r.env, byItself: () => byItself });
    const said: string[][] = [];
    const auto = createBridgeAuto({ link, on: () => true, own: () => ["Codex"], dataDir: r.data, byItself: () => byItself, say: (a) => said.push(a) });
    return { link, auto, said };
  };

  test("the person's own home: connects at start without a tap, and says so once", async () => {
    const r = rig();
    const { link, auto, said } = build(r, true);
    expect((await link.view())?.asks).toBeUndefined();
    await auto.tick();
    expect(r.connects().length).toBe(1);
    expect((await link.view())?.state).toBe("connected");
    expect(said).toEqual([["Codex"]]);
  }, 30_000);

  test("any other home: never connects by itself, its ready view says it asks; the switch connects", async () => {
    const r = rig();
    const { link, auto, said } = build(r, false);
    const v = await link.view();
    expect(v?.state).toBe("ready");
    expect(v?.asks).toBe(true);
    await auto.tick();
    await auto.tick();
    expect(r.connects()).toEqual([]);
    expect(said).toEqual([]);
    await auto.switched(true);
    expect(r.connects().length).toBe(1);
    expect((await link.view())?.state).toBe("connected");
  }, 30_000);
});
