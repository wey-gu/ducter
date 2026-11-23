// D324: one partner, one mailbox, one home answering it, over the FAKE nmem (several connections in
// one state, each with its own label). Each home names its connection for itself (`<identity>-on-
// <home>-<key tag>`); a second home never connects beside the first on its own; 改由这台收 / 只留这台
// connects here and ends the others; a connection Mem won't end from here is said as stuck.
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { BRIDGE_CONNECTION_FILE, createBridgeLink, homeLabel, homeSlug, keyTag, labelHome, nmemCall } from "../src/bridge-link.ts";
import { tempDir } from "./helpers.ts";

setDefaultTimeout(30_000);
const FAKE = resolve(import.meta.dir, "../../partner/eval/fake-bridge-nmem.ts");
let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

const fpOf = (n: number) => Buffer.from(Array.from({ length: 16 }, (_, i) => (n * 37 + i) & 255)).toString("base64url");

/** One fake Mem (one state file), and a home on it per call of `at`, each with its own data folder and key. */
function homes(env: Record<string, string> = {}) {
  const t = tempDir();
  stops.push(t.cleanup);
  const bin = join(t.dir, "nmem");
  writeFileSync(bin, `#!/bin/sh\nexec bun ${FAKE} "$@"\n`);
  chmodSync(bin, 0o755);
  const state = join(t.dir, "state.json");
  writeFileSync(state, JSON.stringify({ identities: {}, messages: [], seq: 0 }));
  const argvLog = join(t.dir, "argv.log");
  const fullEnv = { PATH: process.env.PATH ?? "", NMEM_CLI_PATH: bin, NMEM_FAKE_BRIDGE_STATE: state, NMEM_FAKE_ARGV_LOG: argvLog, ...env };
  const calls = (): string[][] => (existsSync(argvLog) ? readFileSync(argvLog, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
  const writes = () => calls().filter((c) => !c.includes("--help") && c.includes("connections") && (c.includes("connect") || c.includes("revoke")));
  const conns = () => (JSON.parse(readFileSync(state, "utf8")).connections ?? []) as { client_label: string; state: string; connection_id: string }[];
  // extra: this home's own nmem settings (NMEM_FAKE_FOREIGN: connections another login made, as this home's login sees them).
  const at = (home: string, n: number, extra: Record<string, string> = {}) => {
    const data = join(t.dir, home);
    mkdirSync(data, { recursive: true });
    const e = { ...fullEnv, ...extra };
    return { data, link: createBridgeLink({ dataDir: data, identity: () => "ducter", home: () => home, homeFp: () => fpOf(n), run: nmemCall({ bin, env: e }), env: e }) };
  };
  return { state, writes, conns, at };
}

describe("D324: which home answers", () => {
  test("the label: the identity, the home, the key's tag, a generation after a revoked one", () => {
    expect(homeSlug("Weyl's MacBook Pro")).toBe("weyl-s-macbook-pro");
    expect(homeSlug("小鸭的家")).toBe("home");
    expect(keyTag(fpOf(1))).toMatch(/^[0-9a-f]{6}$/);
    const l = homeLabel("ducter", "hel", fpOf(1));
    expect(l).toBe(`ducter-on-hel-${keyTag(fpOf(1))}`);
    expect(labelHome(l, "ducter")).toEqual({ home: "hel", tag: keyTag(fpOf(1))!, gen: 1 });
    expect(labelHome(homeLabel("ducter-work", "weyl-mac", fpOf(2), 3), "ducter-work")).toEqual({ home: "weyl-mac", tag: keyTag(fpOf(2))!, gen: 3 });
    expect(labelHome("ducter", "ducter")).toBeUndefined(); // from before D324: names no computer
    expect(homeLabel("ducter", "hel")).toBe("ducter-on-hel");
    expect(homeLabel("ducter", "hel", fpOf(1)).length).toBeLessThanOrEqual(120);
  });

  test("a second home finds the first answering: elsewhere, Connect runs nothing; 改由这台收 moves it, and the first notices", async () => {
    const h = homes();
    const hel = h.at("hel", 1).link;
    await hel.view();
    await hel.connect();
    expect(hel.context()).toBe(homeLabel("ducter", "hel", fpOf(1)));
    expect((await hel.view())?.others).toBeUndefined();

    const mac = h.at("mac", 2).link;
    expect(await mac.view()).toMatchObject({ state: "elsewhere", identity: "ducter", others: [{ label: homeLabel("ducter", "hel", fpOf(1)), home: "hel" }] });
    const before = h.writes().length;
    await mac.connect(); // a plain Connect never connects beside another home
    expect(h.writes().length).toBe(before);
    expect(mac.context()).toBeUndefined();

    const helId = h.conns().find((c) => c.client_label.includes("-on-hel-"))!.connection_id;
    await mac.onlyHere(); // the person's Go: connect here first, then end hel's
    expect(mac.context()).toBe(homeLabel("ducter", "mac", fpOf(2)));
    const after = h.writes().slice(before);
    expect(after[0]).toContain("connect");
    expect(after[1]).toEqual(["--json", "bridge", "connections", "revoke", helId]);
    const v = await mac.view();
    expect(v?.state).toBe("connected");
    expect(v?.others).toBeUndefined();
    expect(h.conns().filter((c) => c.state === "active").map((c) => c.client_label)).toEqual([homeLabel("ducter", "mac", fpOf(2))]);

    await hel.recheck(); // hel's next look: its connection was ended, so its checks stop
    expect(hel.context()).toBeUndefined();
    expect(await hel.view()).toMatchObject({ state: "elsewhere", others: [{ home: "mac" }] });
  });

  test("two from before D324, both labelled `ducter`: the one here says so, and 只留这台 ends the other", async () => {
    const h = homes();
    const { link: hel, data } = h.at("hel", 1);
    const s = JSON.parse(readFileSync(h.state, "utf8"));
    s.connections = [
      { connection_id: "c-hel", agent_id: "ducter", identity_birth: "b", client_label: "ducter", state: "active", space_id: "fake-space" },
      { connection_id: "c-mac", agent_id: "ducter", identity_birth: "b", client_label: "ducter", state: "active", space_id: "fake-space" },
    ];
    s.identities.ducter = { agent: "ducter", member: "Weyl", member_id: "member-weyl", description: "" };
    writeFileSync(h.state, JSON.stringify(s));
    writeFileSync(join(data, BRIDGE_CONNECTION_FILE), JSON.stringify({ context: "ducter", agentId: "ducter", spaceId: "fake-space", spaceLabel: "Only me", connectionId: "c-hel", confirmed: true, at: "2026-11-10T00:00:00Z" }));
    const v = await hel.view();
    expect(v).toMatchObject({ state: "connected", others: [{ label: "ducter" }] });
    expect(v?.others?.[0]?.home).toBeUndefined(); // an older label names no computer
    await hel.onlyHere();
    expect(h.writes().at(-1)).toEqual(["--json", "bridge", "connections", "revoke", "c-mac"]);
    expect((await hel.view())?.others).toBeUndefined();
    expect(hel.context()).toBe("ducter"); // the old connection keeps working: nothing renamed behind the person's back
  });

  test("D494: a task's agent that set up a Bridge session as the partner is not another computer receiving", async () => {
    // hel, 2026-11-23 (read only): the home's `ducter` connection, and Codex's session made as `ducter`
    // 4 s after the babysitter task started: the pane said 「也在另一台电脑上收…只留这台」.
    const h = homes();
    const { link: hel, data } = h.at("hel", 1);
    const s = JSON.parse(readFileSync(h.state, "utf8"));
    s.connections = [
      { connection_id: "c-hel", agent_id: "ducter", identity_birth: "b", client_label: "ducter", state: "active", space_id: "fake-space" },
      { connection_id: "c-codex", agent_id: "ducter", identity_birth: "b", client_label: "codex", state: "active", space_id: "fake-space" },
    ];
    s.identities.ducter = { agent: "ducter", member: "Weyl", member_id: "member-weyl", description: "" };
    writeFileSync(h.state, JSON.stringify(s));
    writeFileSync(join(data, BRIDGE_CONNECTION_FILE), JSON.stringify({ context: "ducter", agentId: "ducter", spaceId: "fake-space", spaceLabel: "Only me", connectionId: "c-hel", confirmed: true, at: "2026-11-10T00:00:00Z" }));
    const v = await hel.view();
    expect(v?.state).toBe("connected");
    expect(v?.others).toBeUndefined();
    await hel.onlyHere();
    expect(h.writes().filter((c) => c.includes("revoke"))).toEqual([]); // never ended from here
  });

  test("Mem won't end another login's connection from here: it stays, marked stuck, and is ended on that computer", async () => {
    const h = homes();
    const hel = h.at("hel", 1).link;
    await hel.view();
    await hel.connect();
    const mac = h.at("mac", 2, { NMEM_FAKE_FOREIGN: homeLabel("ducter", "hel", fpOf(1)) }).link;
    await mac.view();
    await mac.onlyHere();
    expect(mac.context()).toBe(homeLabel("ducter", "mac", fpOf(2)));
    expect(await mac.view()).toMatchObject({ state: "connected", others: [{ home: "hel", stuck: true }] });
    expect(h.conns().filter((c) => c.state === "active").length).toBe(2);
    // On hel itself, 断开 ends it (its own login); mac then reads one reader again.
    await hel.disconnect();
    expect(await hel.view()).toMatchObject({ state: "elsewhere", others: [{ home: "mac" }] });
    await mac.onlyHere(); // nothing left to end
    expect((await mac.view())?.others).toBeUndefined();
  });

  test("connecting again after 断开: the next generation, since Mem never reopens a revoked one", async () => {
    const h = homes();
    const hel = h.at("hel", 1).link;
    await hel.view();
    await hel.connect();
    await hel.disconnect();
    expect((await hel.view())?.state).toBe("ready");
    await hel.connect();
    expect(hel.context()).toBe(homeLabel("ducter", "hel", fpOf(1), 2));
    expect(h.writes().filter((c) => c.includes("connect")).map((c) => c.at(-1))).toEqual([homeLabel("ducter", "hel", fpOf(1)), homeLabel("ducter", "hel", fpOf(1), 2)]);
  });
});
