// D332: the partner connects with the person's own agents by itself once Mem is ready, says so once,
// and the one switch connects or revokes; nothing connects for someone without agents of their own.
import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BridgeView } from "@ducter/protocol";
import { BRIDGE_SAID_FILE, bridgeOnWords, createBridgeAuto } from "../src/bridge-auto.ts";

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
    const auto = createBridgeAuto({ link: f.link, on: () => true, own: () => ["Claude Code", "Codex"], dataDir: d, say: (a) => said.push(a) });
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
    const auto = createBridgeAuto({ link: f.link, on: () => true, own: () => [], dataDir: dir(), say: (a) => said.push(a) });
    await auto.tick();
    expect(f.calls).toEqual([]);
    expect(said).toEqual([]);
  });

  test("switched off: never connects by itself; on connects (asked), off revokes", async () => {
    const f = fakeLink("ready");
    let on = false;
    const said: string[][] = [];
    const auto = createBridgeAuto({ link: f.link, on: () => on, own: () => ["Codex"], dataDir: dir(), say: (a) => said.push(a) });
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
    const auto = createBridgeAuto({ link: f.link, on: () => true, own: () => ["Codex"], dataDir: dir(), say: (a) => said.push(a) });
    await auto.tick();
    expect(said).toEqual([]);
    for (const s of ["sign_in", "install_mem", "refused", "elsewhere"] as const) {
      const g = fakeLink(s);
      await createBridgeAuto({ link: g.link, on: () => true, own: () => ["Codex"], dataDir: dir(), say: (a) => said.push(a) }).tick();
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
