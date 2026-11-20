// D433: when Nowledge Mem last saw the other home that receives the partner's mail. nmem 0.10.121's
// `bridge connections list --include-activity` (help VERIFIED; the answer's fields INFERRED, research/183)
// is asked only when the list's help offers it, and its `last_seen_at_ms` rides on BridgeView.others as
// seenAt. The FAKE nmem only (packages/partner/eval/fake-bridge-nmem.ts, NMEM_FAKE_SEEN).
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createBridgeLink, homeLabel, nmemCall, seenAtOf } from "../src/bridge-link.ts";
import { tempDir } from "./helpers.ts";

setDefaultTimeout(30_000);
const FAKE = resolve(import.meta.dir, "../../partner/eval/fake-bridge-nmem.ts");
let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});
const fpOf = (n: number) => Buffer.from(Array.from({ length: 16 }, (_, i) => (n * 37 + i) & 255)).toString("base64url");

function homes(env: Record<string, string>) {
  const t = tempDir();
  stops.push(t.cleanup);
  const bin = join(t.dir, "nmem");
  writeFileSync(bin, `#!/bin/sh\nexec bun ${FAKE} "$@"\n`);
  chmodSync(bin, 0o755);
  const state = join(t.dir, "state.json");
  writeFileSync(state, JSON.stringify({ identities: {}, messages: [], seq: 0 }));
  const argvLog = join(t.dir, "argv.log");
  const calls = (): string[][] => (existsSync(argvLog) ? readFileSync(argvLog, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
  const at = (home: string, n: number, extra: Record<string, string> = {}) => {
    const data = join(t.dir, home);
    mkdirSync(data, { recursive: true });
    const e = { PATH: process.env.PATH ?? "", NMEM_CLI_PATH: bin, NMEM_FAKE_BRIDGE_STATE: state, NMEM_FAKE_ARGV_LOG: argvLog, ...env, ...extra };
    return createBridgeLink({ dataDir: data, identity: () => "ducter", home: () => home, homeFp: () => fpOf(n), run: nmemCall({ bin, env: e }), env: e });
  };
  return { at, calls };
}

describe("D433: when the other home was last seen", () => {
  test("Mem's last_seen_at_ms, read tolerantly, never guessed", () => {
    expect(seenAtOf({ last_seen_at_ms: 1_700_000_000_000 })).toBe(1_700_000_000_000);
    expect(seenAtOf({ activity: { last_seen_at_ms: 1_700_000_000_000 } })).toBe(1_700_000_000_000);
    expect(seenAtOf({ activity_available: false, last_seen_at_ms: 1 })).toBeUndefined();
    expect(seenAtOf({ last_seen_at_ms: "yesterday" })).toBeUndefined();
    expect(seenAtOf({})).toBeUndefined();
  });

  test("on 0.10.121 the list asks for activity, and another home's last-seen rides on others", async () => {
    const seen = Date.UTC(2026, 10, 17, 6, 0, 0);
    const label = homeLabel("ducter", "hel", fpOf(1));
    const h = homes({ NMEM_FAKE_VERSION: "0.10.121", NMEM_FAKE_SEEN: `${label}=${seen}` });
    const hel = h.at("hel", 1);
    await hel.view();
    await hel.connect();
    const mac = h.at("mac", 2);
    expect(await mac.view()).toMatchObject({ state: "elsewhere", others: [{ home: "hel", seenAt: seen }] });
    expect(h.calls().some((c) => c.includes("list") && c.includes("--include-activity"))).toBe(true);
  });

  test("an nmem whose list doesn't offer it is never asked: no seenAt", async () => {
    const h = homes({ NMEM_FAKE_VERSION: "0.10.120" });
    const hel = h.at("hel", 1);
    await hel.view();
    await hel.connect();
    const v = await h.at("mac", 2).view();
    expect(v?.state).toBe("elsewhere");
    expect(v?.others?.[0]?.seenAt).toBeUndefined();
    expect(h.calls().some((c) => c.includes("--include-activity"))).toBe(false);
  });
});
