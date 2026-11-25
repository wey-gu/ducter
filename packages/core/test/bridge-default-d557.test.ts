// D557: Bridge is on by default (D170 (9), met by the live trial of 2026-11-25). Wherever the home's
// Mem is ready and it is the person's own home (D332, D340), the home connects by itself and the
// partner's Bridge is on with no flag; DUCTER_BRIDGE=0 keeps it off; a Mem that isn't ready connects
// nothing. Over the fake nmem (the shapes of nmem 0.10.118+): nothing reaches Mem.
import { describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { bridgeContextFor } from "../../partner/src/bridge.ts";
import { createBridgeAuto } from "../src/bridge-auto.ts";
import { createBridgeLink, nmemCall } from "../src/bridge-link.ts";

const FAKE = resolve(import.meta.dir, "../../partner/eval/fake-bridge-nmem.ts");

function rig(extra: Record<string, string> = {}) {
  const d = mkdtempSync(join(tmpdir(), "ducter-bridge-d557-"));
  const bin = join(d, "nmem");
  writeFileSync(bin, `#!/bin/sh\nexec bun ${FAKE} "$@"\n`);
  chmodSync(bin, 0o755);
  const state = join(d, "state.json");
  writeFileSync(state, JSON.stringify({ identities: {}, messages: [], seq: 0 }));
  const argvLog = join(d, "argv.log");
  const env: Record<string, string> = { PATH: process.env.PATH ?? "", NMEM_CLI_PATH: bin, NMEM_FAKE_BRIDGE_STATE: state, NMEM_FAKE_ARGV_LOG: argvLog, ...extra };
  const connects = () =>
    (existsSync(argvLog) ? readFileSync(argvLog, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as string[]) : []).filter(
      (c) => !c.includes("--help") && c.includes("connections") && c.includes("connect"),
    );
  const data = join(d, "data");
  mkdirSync(data);
  const link = createBridgeLink({ dataDir: data, identity: () => "ducter", home: () => "hel", run: nmemCall({ bin, env }), env, byItself: () => true });
  const said: string[][] = [];
  const auto = createBridgeAuto({ link, on: () => true, own: () => ["Claude Code"], dataDir: data, byItself: () => true, say: (a) => said.push(a) });
  /** The partner's Bridge, as partner.ts decides it: the environment and the home's connection. */
  const partnerContext = () => bridgeContextFor(env, link.context());
  return { link, auto, said, connects, partnerContext, env };
}

describe("D557: Bridge on by default where Mem is ready", () => {
  test("Mem ready on the person's own home: connects by itself, and the partner's Bridge is on with no flag", async () => {
    const r = rig();
    expect(r.env.DUCTER_BRIDGE).toBeUndefined();
    expect(r.partnerContext()).toBeUndefined();
    await r.auto.tick();
    expect(r.connects().length).toBe(1);
    expect((await r.link.view())?.state).toBe("connected");
    expect(r.partnerContext()).toBe(r.link.context()!);
    expect(r.said).toEqual([["Claude Code"]]);
  }, 30_000);

  test("DUCTER_BRIDGE=0: nothing connects, nothing is shown, and the partner's Bridge stays off", async () => {
    const r = rig({ DUCTER_BRIDGE: "0" });
    expect(await r.link.view()).toBeUndefined();
    await r.auto.tick();
    expect(r.connects()).toEqual([]);
    expect(r.said).toEqual([]);
    // Even a connection saved before stays unused while the switch is off.
    expect(bridgeContextFor({ DUCTER_BRIDGE: "0" }, "ducter")).toBeUndefined();
  }, 30_000);

  test("Mem not ready (signed out, no personal place, too old, not installed): nothing connects, Bridge stays off", async () => {
    for (const extra of [{ NMEM_FAKE_SIGNED_OUT: "1" }, { NMEM_FAKE_SPACES: "none" }, { NMEM_FAKE_VERSION: "0.10.116" }]) {
      const r = rig(extra);
      expect((await r.link.view())?.state).not.toBe("ready");
      await r.auto.tick();
      expect(r.connects()).toEqual([]);
      expect(r.partnerContext()).toBeUndefined();
      expect(r.said).toEqual([]);
    }
    const none = rig({ NMEM_CLI_PATH: "/nonexistent/nmem" });
    const gone = createBridgeLink({ dataDir: mkdtempSync(join(tmpdir(), "ducter-bridge-d557-")), identity: () => "ducter", home: () => "hel", run: nmemCall({ bin: "/nonexistent/nmem", env: none.env }), env: none.env, byItself: () => true });
    const said: string[][] = [];
    await createBridgeAuto({ link: gone, on: () => true, own: () => ["Codex"], dataDir: mkdtempSync(join(tmpdir(), "ducter-bridge-d557-")), byItself: () => true, say: (a) => said.push(a) }).tick();
    expect(gone.context()).toBeUndefined();
    expect(bridgeContextFor({}, gone.context())).toBeUndefined();
    expect(said).toEqual([]);
  }, 60_000);
});
