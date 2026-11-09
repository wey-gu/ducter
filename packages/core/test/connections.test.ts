import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Bodies } from "@ducter/protocol";
import { openLog } from "../src/log.ts";
import { normalizeUrl, ooSource, openConnections, parseOoConnectorToml, policyAllows, summarize } from "../src/connections.ts";
import { fakeOpenConnector, fakePlainMcp, type FakeServer } from "./fake-mcp.ts";
import { tempDir } from "./helpers.ts";

const TOKEN = "oct_test_secret_123";
const actions = [
  { id: "github.list_my_prs", operationType: "read" as const, run: () => ({ pulls: [{ n: 2141 }, { n: 2150 }] }) },
  { id: "gmail.search_threads", operationType: "read" as const, run: () => ({ threads: [{ id: "t1" }] }) },
  { id: "gmail.send_email", operationType: "write" as const, run: () => ({ id: "m1" }) },
];
const noOo = ooSource({ env: {}, dir: "/nonexistent-oo", which: () => null });

let t: ReturnType<typeof tempDir>;
let oc: FakeServer;
beforeEach(() => {
  t = tempDir();
  oc = fakeOpenConnector(actions, TOKEN);
});
afterEach(() => {
  oc.stop();
  t.cleanup();
});

const setup = () => {
  const log = openLog({ path: join(t.dir, "ducter.db"), persona: "default" });
  const c = openConnections({ dataDir: t.dir, log, oo: noOo });
  return { log, c };
};
const calls = (log: ReturnType<typeof openLog>, stream = "channel") =>
  log.read({ stream, kinds: ["connection_call"], limit: 100 }).map((e) => e.body as Bodies["connection_call"]);
const P = { role: "partner" } as const;

describe("addresses and policy", () => {
  test("normalizeUrl adds /mcp, keeps https, refuses http off the local network and embedded secrets", () => {
    expect(normalizeUrl("https://connector.oomol.com")).toBe("https://connector.oomol.com/mcp");
    expect(normalizeUrl("https://x.example/oc/")).toBe("https://x.example/oc/mcp");
    expect(normalizeUrl("http://127.0.0.1:3000/mcp")).toBe("http://127.0.0.1:3000/mcp");
    expect(normalizeUrl("http://192.168.1.4:3000")).toBe("http://192.168.1.4:3000/mcp");
    expect(normalizeUrl("http://connector.example.com")).toBeUndefined();
    expect(normalizeUrl("https://u:p@x.example")).toBeUndefined();
    expect(normalizeUrl("https://x.example?token=1")).toBeUndefined();
    expect(normalizeUrl("ftp://x.example")).toBeUndefined();
    expect(normalizeUrl("not a url")).toBeUndefined();
  });
  test("policy: deny wins, allow narrows", () => {
    expect(policyAllows(undefined, "gmail.send_email")).toBe(true);
    expect(policyAllows({ deny: ["gmail.send_*"] }, "gmail.send_email")).toBe(false);
    expect(policyAllows({ allow: ["github.*"] }, "gmail.search_threads")).toBe(false);
    expect(policyAllows({ allow: ["github.*"], deny: ["github.delete_*"] }, "github.delete_repo")).toBe(false);
  });
  test("summarize never carries the content", () => {
    expect(summarize({ ok: true, data: { threads: [1, 2, 3] } })).toBe("3 threads");
    expect(summarize({ ok: false, error: { code: "denied" } })).toBe("error denied");
  });
});

describe("adding a connection", () => {
  test("wrong token is unauthorized; the right one saves, 0600, and the token is in neither the list nor any frame", async () => {
    const { c } = setup();
    expect(await c.add({ url: oc.url, token: "wrong" })).toEqual({ ok: false, reason: "unauthorized" });
    const r = await c.add({ url: oc.url, token: TOKEN });
    expect(r.ok).toBe(true);
    const view = c.view();
    expect(view).toHaveLength(1);
    expect(view[0]).toMatchObject({ name: "OpenConnector", source: "self", url: `${oc.url}/mcp`, state: "ok", via: "manual" });
    expect(JSON.stringify(view)).not.toContain(TOKEN);
    expect(readFileSync(join(t.dir, "connections.json"), "utf8")).not.toContain(TOKEN);
    expect(readFileSync(join(t.dir, "connection-tokens.json"), "utf8")).toContain(TOKEN);
    expect(statSync(join(t.dir, "connection-tokens.json")).mode & 0o777).toBe(0o600);
    expect(statSync(join(t.dir, "connections.json")).mode & 0o777).toBe(0o600);
    expect(await c.add({ url: oc.url, token: TOKEN })).toEqual({ ok: false, reason: "duplicate" });
  });
  test("unreachable, bad address, and a server that isn't MCP", async () => {
    const { c } = setup();
    expect(await c.add({ url: "http://127.0.0.1:1" })).toEqual({ ok: false, reason: "unreachable" });
    expect(await c.add({ url: "http://example.com" })).toEqual({ ok: false, reason: "bad_url" });
    const notMcp = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response("<html>hi</html>", { headers: { "content-type": "text/html" } }) });
    try {
      const r = await c.add({ url: `http://127.0.0.1:${notMcp.port}` });
      expect(r.ok).toBe(false);
    } finally {
      notMcp.stop(true);
    }
  });
  test("survives a restart, and removing forgets the token", async () => {
    const { c, log } = setup();
    const r = await c.add({ url: oc.url, token: TOKEN });
    log.close();
    const again = setup();
    expect(again.c.view()).toHaveLength(1);
    const res = await again.c.read(P, "OpenConnector", "github.list_my_prs", {});
    expect(res.ok).toBe(true);
    expect(again.c.remove((r as { id: string }).id)).toBe(true);
    expect(readFileSync(join(t.dir, "connection-tokens.json"), "utf8")).not.toContain(TOKEN);
    expect(again.c.list(P)).toEqual([]);
  });
});

describe("reads and writes", () => {
  test("a read runs, is logged without the token or the content, and returns the data", async () => {
    const { c, log } = setup();
    await c.add({ url: oc.url, token: TOKEN });
    const res = await c.read(P, "OpenConnector", "github.list_my_prs", {});
    expect(res).toEqual({ ok: true, op: "read", result: { pulls: [{ n: 2141 }, { n: 2150 }] } });
    const logged = calls(log).find((x) => x.action === "github.list_my_prs")!;
    expect(logged).toMatchObject({ op: "read", state: "done", summary: "2 pulls" });
    const all = JSON.stringify(log.read({ limit: 1000 }));
    expect(all).not.toContain(TOKEN);
    expect(all).not.toContain("2141");
    expect(oc.authSeen.every((a) => a === `Bearer ${TOKEN}` || a === "Bearer wrong")).toBe(true);
  });
  test("search lists actions; guide says read or write", async () => {
    const { c } = setup();
    await c.add({ url: oc.url, token: TOKEN });
    const s = await c.search(P, "email", { service: "gmail" });
    expect(s.ok).toBe(true);
    expect(JSON.stringify(s)).toContain("gmail.send_email");
    const g = await c.guide(P, "OpenConnector", "gmail.send_email");
    expect(g).toMatchObject({ ok: true, op: "write" });
    expect(await c.classify("OpenConnector", "gmail.search_threads")).toBe("read");
    expect(await c.classify("OpenConnector", "gmail.nope")).toBe("write");
  });
  test("a write never runs through read(); staged, it waits for Go, runs once, and Hold never runs it", async () => {
    const { c, log } = setup();
    await c.add({ url: oc.url, token: TOKEN });
    const direct = await c.read(P, "OpenConnector", "gmail.send_email", { to: "lina@example.com" });
    expect(direct).toMatchObject({ ok: false, op: "write" });
    expect(oc.executed.some((e) => e.name === "execute_action")).toBe(false);

    // The partner made the card (decision) and staged the write on it.
    const st = c.stage("OpenConnector", "gmail.send_email", { to: "lina@example.com", body: "Hi" }, "d_1");
    expect(st.ok).toBe(true);
    expect(await c.runApproved("d_1")).toMatchObject({ ok: false, error: expect.stringContaining("hasn't answered") });
    log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: "d_1", option: "go", by: "user" } });
    const ran = await c.runApproved("d_1");
    expect(ran).toEqual({ ok: true, op: "write", result: { id: "m1" } });
    expect(oc.executed.filter((e) => e.name === "execute_action")).toHaveLength(1);
    expect(oc.executed.find((e) => e.name === "execute_action")!.args).toEqual({ actionId: "gmail.send_email", input: { to: "lina@example.com", body: "Hi" } });
    expect(await c.runApproved("d_1")).toMatchObject({ ok: false, error: expect.stringContaining("never runs twice") });
    expect(oc.executed.filter((e) => e.name === "execute_action")).toHaveLength(1);

    c.stage("OpenConnector", "gmail.send_email", { to: "x@example.com" }, "d_2");
    log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: "d_2", option: "hold", by: "user" } });
    expect(await c.runApproved("d_2")).toMatchObject({ ok: false, error: expect.stringContaining("Hold") });
    expect(oc.executed.filter((e) => e.name === "execute_action")).toHaveLength(1);
    const states = calls(log).filter((x) => x.action === "gmail.send_email").map((x) => x.state);
    expect(states).toEqual(["denied", "needs_go", "done", "needs_go", "held"]);
  });
  test("tasks see nothing until granted, then read only", async () => {
    const { c, log } = setup();
    await c.add({ url: oc.url, token: TOKEN });
    const T = { role: "task", taskId: "t_1" } as const;
    expect(c.list(T)).toEqual([]);
    expect((await c.read(T, "OpenConnector", "github.list_my_prs", {})).ok).toBe(false);
    expect(c.grant("t_1", "OpenConnector").ok).toBe(true);
    expect(c.list(T)).toHaveLength(1);
    expect((await c.read(T, "OpenConnector", "github.list_my_prs", {})).ok).toBe(true);
    const w = await c.read(T, "OpenConnector", "gmail.send_email", {});
    expect(w).toMatchObject({ ok: false, op: "write" });
    expect(calls(log, "task:t_1").map((x) => x.state)).toEqual(["done", "done", "denied"]);
  });
  test("the user's hand-written rules deny an action", async () => {
    const { c, log } = setup();
    await c.add({ url: oc.url, token: TOKEN });
    const path = join(t.dir, "connections.json");
    const f = JSON.parse(readFileSync(path, "utf8"));
    f.connections[0].policy = { deny: ["github.*"] };
    writeFileSync(path, JSON.stringify(f));
    log.close();
    const again = setup();
    expect(await again.c.read(P, "OpenConnector", "github.list_my_prs", {})).toMatchObject({ ok: false });
    expect(again.c.stage("OpenConnector", "github.list_my_prs", {}, "d_9").ok).toBe(false);
  });
});

describe("other MCP servers", () => {
  test("readOnlyHint marks a read; no annotation counts as a write", async () => {
    const plain = fakePlainMcp();
    try {
      const { c } = setup();
      const r = await c.add({ url: `${plain.url}/mcp`, name: "Notes" });
      expect(r.ok).toBe(true);
      expect(c.view()[0].source).toBe("mcp");
      expect(await c.classify("Notes", "read_notes")).toBe("read");
      expect(await c.classify("Notes", "post_note")).toBe("write");
      expect(await c.read(P, "Notes", "read_notes", {})).toEqual({ ok: true, op: "read", result: { notes: ["a", "b"] } });
      expect((await c.read(P, "Notes", "post_note", {})).ok).toBe(false);
      expect(plain.executed.map((e) => e.name)).toEqual(["read_notes"]);
    } finally {
      plain.stop();
    }
  });
});

describe("the oo CLI", () => {
  test("parses connector.toml's [self_hosted]", () => {
    expect(parseOoConnectorToml(`[self_hosted]\nurl = "http://localhost:3000"\ntoken = "oct_x"\n`)).toEqual({ url: "http://localhost:3000", token: "oct_x" });
    expect(parseOoConnectorToml(`[other]\nurl = "a"\n`)).toEqual({});
  });
  test("detect reads no secret; the tap uses the self-hosted connector, env first", async () => {
    const dir = join(t.dir, "oo");
    mkdirSync(dir);
    writeFileSync(join(dir, "connector.toml"), `[self_hosted]\nurl = "${oc.url}"\ntoken = "${TOKEN}"\n`);
    writeFileSync(join(dir, "auth.toml"), `id = "acct_placeholder"\n[accounts.acct_placeholder]\nendpoint = "oomol.com"\n`);
    const src = ooSource({ env: {}, dir, which: () => "/usr/local/bin/oo" });
    const d = src.detect();
    expect(d).toEqual({ installed: true, selfHosted: { url: oc.url, hasToken: true }, account: true });
    expect(JSON.stringify(d)).not.toContain(TOKEN);
    const log = openLog({ path: join(t.dir, "ducter.db"), persona: "default" });
    const c = openConnections({ dataDir: t.dir, log, oo: src });
    const r = await c.addFromOo();
    expect(r.ok).toBe(true);
    expect(c.view()[0]).toMatchObject({ via: "oo", source: "self" });
    const envFirst = ooSource({ env: { OO_CONNECTOR_URL: "http://127.0.0.1:9" }, dir, which: () => null });
    expect(envFirst.detect().selfHosted).toEqual({ url: "http://127.0.0.1:9", hasToken: false });
    const none = openConnections({ dataDir: join(t.dir, "x"), log, oo: noOo });
    expect(await none.addFromOo()).toEqual({ ok: false, reason: "no_oo" });
  });
});
