import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Bodies } from "@ducter/protocol";
import { openLog } from "../src/log.ts";
import { appsFromV1, httpLinker, usableActions, normalizeUrl, OOMOL_HOSTED_MCP, ooSource, openConnections, parseOoConnectorToml, policyAllows, summarize } from "../src/connections.ts";
import { fakeOpenConnector, fakeOpenConnectorV2, fakePlainMcp, type FakeServer } from "./fake-mcp.ts";
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
    // OOMOL Hosted serves MCP at /v1/mcp only (research/44); /mcp there is its gateway's 401 for every path.
    for (const u of ["https://connector.oomol.com", "https://connector.oomol.com/", "https://connector.oomol.com/mcp", "https://connector.oomol.com/v1", " https://connector.oomol.com/v1/mcp "])
      expect(normalizeUrl(u)).toBe("https://connector.oomol.com/v1/mcp");
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

describe("OOMOL Hosted (D158)", () => {
  const KEY = "api_hosted_key_456";
  const gmail = { id: "a1", service: "gmail", displayName: "Gmail", accountLabel: "wei@work.example", alias: "work", authType: "oauth2", status: "active" };
  const discord = { id: "a2", service: "discord", displayName: "Discord", accountLabel: "wey", alias: null, authType: "oauth2", status: "active" };
  const virtual = [
    { id: "no_auth:hackernews", service: "hackernews", displayName: "Hacker News", accountLabel: "", authType: "no_auth", status: "active" },
    { id: "marketplace:m:x", service: "x", displayName: "X", accountLabel: "", authType: null, status: "active" },
  ];
  // A look-alike of connector.oomol.com: MCP at /v1/mcp, a plain-text 401 gateway, GET /v1/apps.
  const hosted = (apps: unknown[]) => fakeOpenConnector(actions, KEY, { path: "/v1/mcp", plain401: true, apps });
  // The real HTTP linker and fetcher, with OOMOL's origin pointed at the fake: no network in tests.
  const open = (fake: FakeServer) => {
    const to = (u: string) => u.replace("https://connector.oomol.com", fake.url);
    const log = openLog({ path: join(t.dir, "ducter.db"), persona: "default" });
    return openConnections({ dataDir: t.dir, log, oo: noOo, linker: (u, k) => httpLinker(to(u), k), fetcher: (u, i) => fetch(to(u), i) });
  };

  test("no key: nothing is sent, and it says a key is needed", async () => {
    const fake = hosted([gmail]);
    try {
      const c = open(fake);
      expect(await c.add({ url: "https://connector.oomol.com", token: "  " })).toEqual({ ok: false, reason: "no_key" });
      expect(fake.authSeen).toEqual([]);
    } finally {
      fake.stop();
    }
  });
  test("a wrong key is unauthorized, though the gateway's 401 says only 'invalid token'", async () => {
    const fake = hosted([gmail]);
    try {
      expect(await open(fake).add({ url: "https://connector.oomol.com", token: "api_wrong" })).toEqual({ ok: false, reason: "unauthorized" });
    } finally {
      fake.stop();
    }
  });
  test("the right key, pasted with spaces and a line break: added, sent as Bearer, and it lists what it can read", async () => {
    const fake = hosted([gmail, discord, ...virtual]);
    try {
      const c = open(fake);
      const r = await c.add({ url: "https://connector.oomol.com", token: `  ${KEY}\n` });
      expect(r).toMatchObject({ ok: true, apps: [{ service: "gmail", title: "Gmail", accounts: ["wei@work.example"] }, { service: "discord", title: "Discord", accounts: ["wey"] }] });
      expect(fake.authSeen.every((a) => a === `Bearer ${KEY}`)).toBe(true);
      const v = c.view()[0];
      expect(v).toMatchObject({ name: "OOMOL", source: "oomol", url: OOMOL_HOSTED_MCP, state: "ok" });
      expect(v.apps?.map((a) => a.title)).toEqual(["Gmail", "Discord"]);
      expect(JSON.stringify(c.view())).not.toContain(KEY);
    } finally {
      fake.stop();
    }
  });
  test("connected, but no account there yet: added, with an empty list", async () => {
    const fake = hosted(virtual);
    try {
      const r = await open(fake).add({ url: "https://connector.oomol.com", token: KEY });
      expect(r).toMatchObject({ ok: true, apps: [] });
    } finally {
      fake.stop();
    }
  });
  test("an MCP path that isn't there is not_mcp, not a refused key", async () => {
    const fake = fakeOpenConnector(actions, undefined, { path: "/v1/mcp" });
    try {
      const { c } = setup();
      expect(await c.add({ url: `${fake.url}/mcp` })).toEqual({ ok: false, reason: "not_mcp" });
    } finally {
      fake.stop();
    }
  });
  test("a hosted connection saved at the old /mcp address is moved to /v1/mcp", () => {
    writeFileSync(join(t.dir, "connections.json"), JSON.stringify({ connections: [{ id: "conn_old", name: "OOMOL", url: "https://connector.oomol.com/mcp", source: "oomol", addedAt: "2026-11-09T00:00:00Z", via: "manual" }] }));
    const { c } = setup();
    expect(c.view()[0].url).toBe(OOMOL_HOSTED_MCP);
  });
  test("appsFromV1 groups accounts by service and leaves out what isn't an account", () => {
    expect(appsFromV1({ data: [gmail, { ...gmail, id: "a3", accountLabel: "wei@home.example" }, { ...discord, status: "reauth_required" }, ...virtual] })).toEqual([
      { service: "gmail", title: "Gmail", accounts: ["wei@work.example", "wei@home.example"] },
    ]);
    expect(appsFromV1({ nope: 1 })).toBeUndefined();
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
  test("OOMOL's renamed catalog (connector_*, q, appId, output): found from the tool list, not by name (D180)", async () => {
    const apps = [{ id: "app_work", service: "gmail", accountLabel: "wei@work.example", alias: "work", authType: "oauth2", status: "active" }];
    for (const prefix of ["connector_", "cx_"]) {
      let onExit = () => {};
      const v2 = fakeOpenConnectorV2(actions, TOKEN, { prefix, apps });
      try {
        const { c } = setup();
        const added = await c.add({ url: v2.url, token: TOKEN });
        expect(added).toMatchObject({ ok: true });
        onExit = () => added.ok && c.remove(added.id);
        const s = await c.search(P, "email", { service: "gmail" });
        expect(JSON.stringify(s)).toContain("gmail.send_email");
        expect(v2.executed.find((e) => e.name === `${prefix}search_actions`)!.args).toMatchObject({ q: "email", service: "gmail" });
        expect(await c.classify("OpenConnector", "gmail.search_threads")).toBe("read");
        expect(await c.classify("OpenConnector", "gmail.send_email")).toBe("write");
        const r = await c.read(P, "OpenConnector", "gmail.search_threads", { query: "x" }, "wei@work.example");
        expect(r).toEqual({ ok: true, op: "read", result: { threads: [{ id: "t1" }] } });
        expect(v2.executed.find((e) => e.name === `${prefix}execute_action`)!.args).toEqual({ actionId: "gmail.search_threads", input: { query: "x" }, appId: "app_work" });
        // A label it doesn't know rides as the alias, for the server to judge.
        await c.read(P, "OpenConnector", "gmail.search_threads", { query: "y" }, "home");
        expect(v2.executed.filter((e) => e.name === `${prefix}execute_action`).at(-1)!.args).toMatchObject({ alias: "home" });
      } finally {
        onExit();
        v2.stop();
      }
    }
  });
  test("search keeps only actions that can run: never a service with no account here (hel, 2026-11-11)", async () => {
    // OOMOL's catalog answered "recent emails" with eight unconnected services first; the partner
    // picked one (porteden) and got app_not_found, though Gmail was connected.
    const apps = [{ id: "app_work", service: "gmail", accountLabel: "wei@work.example", alias: "work", authType: "oauth2", status: "active" }];
    const noise = ["porteden.search_emails", "netease_mail.search_emails", "generic_imap.search_emails"].map((id) => ({ id, operationType: "read" as const, authenticated: false, run: () => ({}) }));
    const v2 = fakeOpenConnectorV2([...noise, ...actions], TOKEN, { apps });
    try {
      const { c } = setup();
      await c.add({ url: v2.url, token: TOKEN });
      const s = JSON.stringify(await c.search(P, "search recent emails"));
      expect(s).toContain("gmail.search_threads");
      expect(s).not.toContain("porteden");
      expect(s).not.toContain("netease_mail");
    } finally {
      v2.stop();
    }
  });
  test("usableActions drops unauthenticated and unconnected services, keeps no-auth ones", () => {
    const xs = [
      { actionId: "gmail.search_threads", service: "gmail", authenticated: true },
      { actionId: "porteden.search_emails", service: "porteden", authenticated: false },
      { actionId: "slack.search", service: "slack" },
      { actionId: "hackernews.top", service: "hackernews", authenticated: true },
    ];
    expect(usableActions(xs, ["gmail"]).map((x) => x.actionId)).toEqual(["gmail.search_threads", "hackernews.top"]);
    expect(usableActions(xs, []).map((x) => x.actionId)).toEqual(["gmail.search_threads", "slack.search", "hackernews.top"]);
  });
  test("a catalog it can't read any more is used as a plain MCP server: its own tools, writes unless marked read-only", async () => {
    const { c } = setup();
    await c.add({ url: oc.url, token: TOKEN });
    const plain = fakePlainMcp(TOKEN);
    try {
      // The same connection, now answering with tools that aren't a catalog.
      const rec = JSON.parse(readFileSync(join(t.dir, "connections.json"), "utf8"));
      rec.connections[0].url = plain.url + "/mcp";
      writeFileSync(join(t.dir, "connections.json"), JSON.stringify(rec));
      const { c: again } = setup();
      const s = await again.search(P, "notes");
      expect(JSON.stringify(s)).toContain("read_notes");
      expect(await again.classify("OpenConnector", "read_notes")).toBe("read");
      expect(await again.classify("OpenConnector", "post_note")).toBe("write");
      expect(await again.read(P, "OpenConnector", "read_notes", {})).toMatchObject({ ok: true, op: "read" });
    } finally {
      plain.stop();
    }
    void c;
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
