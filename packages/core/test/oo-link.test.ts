// The oo CLI as a connection (D122): a fake `oo` binary on a temp PATH stands in for OOMOL's CLI.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies } from "@ducter/protocol";
import { LinkError, OO_NOT_WATCHABLE, ooSource, openConnections } from "../src/connections.ts";
import { ooCli, ooEnv, ooExec, ooLinker, ooOp } from "../src/oo-link.ts";
import { openLog } from "../src/log.ts";
import { fakeOo, type FakeOoState } from "./fake-oo.ts";
import { tempDir } from "./helpers.ts";

const HARNESS_KEY = "sk-ant-harness-secret-should-never-reach-oo";
const SECRET_BODY = "the quarterly numbers are attached";

const state = (over: Partial<FakeOoState> = {}): FakeOoState => ({
  signedIn: true,
  apps: [
    { service: "gmail", connectionName: "work", accountLabel: "wei@work.example", authType: "oauth2", isDefault: true },
    { service: "gmail", connectionName: "home", accountLabel: "wei@home.example", authType: "oauth2", isDefault: false },
    { service: "slack", connectionName: "team", accountLabel: "Team", authType: "oauth2", isDefault: true },
    { service: "arxiv", connectionName: null, accountLabel: "arXiv Public", authType: "no_auth" },
    { service: "kling", connectionName: "kling-1", accountLabel: "Kling", authType: "marketplace" },
  ],
  actions: [
    { service: "gmail", name: "fetch_emails", description: "List Gmail messages with optional query.", inputSchema: { type: "object", properties: { query: { type: "string" }, maxResults: { type: "integer" } } } },
    { service: "gmail", name: "get_message", description: "Get a Gmail message by id." },
    { service: "gmail", name: "send_email", description: "Send an email." },
    { service: "gmail", name: "create_email_draft", description: "Create a Gmail draft." },
    { service: "slack", name: "search_messages", description: "Search Slack messages." },
    { service: "kling", name: "generate_video", description: "Make a video (billed)." },
  ],
  results: {
    "gmail.fetch_emails": { messages: [{ id: "m1", subject: "Renewal" }, { id: "m2", subject: "Invoice" }] },
    "gmail.send_email": { messageId: "s1" },
    "slack.search_messages": { messages: [] },
  },
  ...over,
});

let t: ReturnType<typeof tempDir>;
let fake: ReturnType<typeof fakeOo>;
let env: Record<string, string>;
beforeEach(() => {
  t = tempDir();
  fake = fakeOo(t.dir, state());
  env = { PATH: "/usr/bin:/bin", HOME: t.dir, ANTHROPIC_API_KEY: HARNESS_KEY, CLAUDE_CODE_OAUTH_TOKEN: HARNESS_KEY, ...fake.env };
});
afterEach(() => t.cleanup());

const cliFor = (o: { timeoutMs?: number } = {}) => ooCli({ exec: ooExec(fake.bin, ooEnv(env, fake.bin)), ...o });
const P = { role: "partner" } as const;

describe("read or write from the action's name", () => {
  test("only a clear read verb, with nothing changing after it, is a read", () => {
    const reads = ["gmail.fetch_emails", "gmail.get_message", "gmail.list_labels", "gmail.search_threads", "gmail.get_draft", "gmail.list_drafts", "gmail.get_vacation_settings", "gmail.fetch_message_by_thread_id", "gmail.list_history", "github.listOpenPulls", "calendar.find_free_slots", "slack.count_unread", "notion.query_database", "jira.lookup_user", "gmail.read_message", "drive.describe_file"];
    const writes = [
      "gmail.send_email", "gmail.reply_email", "gmail.reply_to_thread", "gmail.create_email_draft", "gmail.modify_thread_labels", "gmail.add_label_to_email", "gmail.batch_modify_messages",
      "gmail.move_to_trash", "gmail.move_thread_to_trash", "gmail.untrash_message", "gmail.delete_draft", "gmail.send_draft", "gmail.create_filter", "gmail.patch_label", "gmail.stop_watch",
      "gmail.download_attachment", "gmail.settings_get_imap", "gmail.get_or_create_label", "gmail.fetch_and_archive", "gmail.list_and_delete", "gmail.mark_as_read", "gmail.archive_thread",
      "github.updateIssue", "slack.post_message", "gmail.watch", "x.", "", "gmail.weird_thing",
    ];
    for (const a of reads) expect([a, ooOp(a)]).toEqual([a, "read"]);
    for (const a of writes) expect([a, ooOp(a)]).toEqual([a, "write"]);
  });
});

describe("the oo link", () => {
  test("tools(): only services with an account, read/write per action, a connection choice when there are several", async () => {
    const link = await ooLinker(cliFor())("oo:");
    const tools = await link.tools();
    const names = tools.map((x) => x.name).sort();
    expect(names).toEqual(["gmail.create_email_draft", "gmail.fetch_emails", "gmail.get_message", "gmail.send_email", "slack.search_messages"]);
    const fetch = tools.find((x) => x.name === "gmail.fetch_emails")!;
    expect(fetch.annotations?.readOnlyHint).toBe(true);
    expect(tools.find((x) => x.name === "gmail.send_email")!.annotations?.readOnlyHint).toBe(false);
    const props = (fetch.inputSchema as { properties: Record<string, { enum?: string[] }> }).properties;
    expect(props.query).toBeDefined();
    expect(props.connection.enum).toEqual(["work", "home"]); // oo's default first
    const slack = tools.find((x) => x.name === "slack.search_messages")!;
    expect((slack.inputSchema as { properties: Record<string, unknown> }).properties.connection).toBeUndefined();
    // Cached: a second listing runs no oo.
    const n = fake.calls().length;
    await link.tools();
    expect(fake.calls().length).toBe(n);
  });

  test("call(): input through a 0600 file that is gone after, never argv; a minimal environment", async () => {
    const link = await ooLinker(cliFor())("oo:");
    const r = await link.call("gmail.fetch_emails", { query: SECRET_BODY, maxResults: 3 });
    expect(r).toEqual({ isError: false, data: { messages: [{ id: "m1", subject: "Renewal" }, { id: "m2", subject: "Invoice" }] } });
    const run = fake.calls().find((c) => c.argv[1] === "run")!;
    expect(run.argv.slice(0, 5)).toEqual(["connector", "run", "gmail", "-a", "fetch_emails"]);
    expect(run.argv.join(" ")).not.toContain(SECRET_BODY);
    expect(run.argv).not.toContain("--connection-name"); // the default account
    expect(run.file).toEqual({ mode: 0o600, input: { query: SECRET_BODY, maxResults: 3 } });
    const file = run.argv[run.argv.indexOf("-d") + 1].slice(1);
    expect(existsSync(file)).toBe(false);
    expect(readdirSync(tmpdir()).some((d) => d.startsWith("ducter-oo-") && existsSync(join(tmpdir(), d, "input.json")))).toBe(false);
    for (const c of fake.calls()) {
      expect(c.env).not.toContain("ANTHROPIC_API_KEY");
      expect(c.env).not.toContain("CLAUDE_CODE_OAUTH_TOKEN");
      expect(c.env).toContain("OO_FAKE_STATE");
      expect(c.env).toContain("HOME");
    }
  });

  test("another account by its name or its label; an unknown one is refused before oo runs", async () => {
    const link = await ooLinker(cliFor())("oo:");
    await link.call("gmail.fetch_emails", { connection: "home" });
    await link.call("gmail.fetch_emails", { connection: "wei@home.example" });
    const runs = fake.calls().filter((c) => c.argv[1] === "run");
    expect(runs.map((c) => c.argv.slice(-2))).toEqual([["--connection-name", "home"], ["--connection-name", "home"]]);
    expect(runs[0].file?.input).toEqual({}); // `connection` is Ducter's, not the action's
    const bad = await link.call("gmail.fetch_emails", { connection: "--team=evil" });
    expect(bad.isError).toBe(true);
    const notThere = await link.call("kling.generate_video", {});
    expect(notThere).toMatchObject({ isError: true, data: { error: { code: "not_connected" } } });
    expect(fake.calls().filter((c) => c.argv[1] === "run").length).toBe(2);
  });

  test("an action's own error comes back as an error result; signed out and missing are link errors", async () => {
    const link = await ooLinker(cliFor())("oo:");
    expect((await link.call("gmail.get_message", { id: "m1" })).isError).toBe(true);
    fake.set(state({ signedIn: false }));
    const out = await ooLinker(cliFor())("oo:");
    const e1 = await out.tools().catch((e) => e);
    expect(e1).toBeInstanceOf(LinkError);
    expect((e1 as LinkError).reason).toBe("unauthorized");
    const gone = await ooLinker(ooCli({ exec: ooExec(join(t.dir, "no-such-oo"), ooEnv(env)) }))("oo:");
    const e2 = await gone.tools().catch((e) => e);
    expect((e2 as LinkError).reason).toBe("unreachable");
  });

  test("a run that takes too long is stopped and is unreachable", async () => {
    fake.set(state({ sleepMs: 3000 }));
    const link = await ooLinker(cliFor({ timeoutMs: 300 }))("oo:");
    const started = Date.now();
    const e = await link.call("gmail.fetch_emails", {}).catch((x) => x);
    expect(Date.now() - started).toBeLessThan(2500);
    expect((e as LinkError).reason).toBe("unreachable");
  });

  test("search: oo's own, only services with an account, deduped", async () => {
    const link = await ooLinker(cliFor())("oo:");
    const hits = await link.search!("video email");
    expect(hits.map((h) => h.name).sort()).toEqual(["gmail.create_email_draft", "gmail.fetch_emails", "gmail.send_email"]);
  });
});

describe("the one tap, through the broker", () => {
  const setup = () => {
    const log = openLog({ path: join(t.dir, "ducter.db"), persona: "default" });
    const src = ooSource({ env, dir: join(t.dir, "oo-config"), which: () => fake.bin, cli: cliFor() });
    const c = openConnections({ dataDir: t.dir, log, oo: src });
    return { log, c, src };
  };
  const calls = (log: ReturnType<typeof openLog>) => log.read({ stream: "channel", kinds: ["connection_call"], limit: 100 }).map((e) => e.body as Bodies["connection_call"]);

  test("detect shows what oo has; the tap adds it with no key; reads run and are logged; a write waits for Go", async () => {
    const { log, c, src } = setup();
    await src.probe!();
    const d = c.oo();
    expect(d.account).toBe(true);
    expect(d.apps).toEqual([
      { service: "gmail", title: "Gmail", accounts: ["wei@work.example", "wei@home.example"] },
      { service: "slack", title: "Slack", accounts: ["Team"] },
    ]);
    const r = await c.addFromOo();
    expect(r.ok).toBe(true);
    expect(await c.addFromOo()).toEqual({ ok: false, reason: "duplicate" });
    expect(c.view()[0]).toMatchObject({ name: "oo", source: "oo", via: "oo", state: "ok" });
    expect(c.view()[0].apps?.[0].accounts.length).toBe(2);
    expect(c.list(P)[0].services?.[0]).toEqual({ service: "gmail", accounts: [{ name: "work", label: "wei@work.example", default: true }, { name: "home", label: "wei@home.example", default: false }] });
    expect(existsSync(join(t.dir, "connection-tokens.json")) ? JSON.parse(await Bun.file(join(t.dir, "connection-tokens.json")).text()) : {}).toEqual({});

    const found = (await c.search(P, "email")) as { ok: true; result: { kind: string; actions: { id: string; op: string }[] }[] };
    expect(found.result[0].kind).toBe("oo");
    expect(found.result[0].actions.find((a) => a.id === "gmail.send_email")?.op).toBe("write");
    const guide = (await c.guide(P, "oo", "gmail.fetch_emails")) as { ok: true; result: { op: string; inputSchema: { properties: Record<string, unknown> } } };
    expect(guide.result.op).toBe("read");
    expect(guide.result.inputSchema.properties.connection).toBeDefined();

    const read = await c.read(P, "oo", "gmail.fetch_emails", { query: SECRET_BODY }, "home");
    expect(read.ok).toBe(true);
    const last = calls(log).at(-1)!;
    expect(last).toMatchObject({ action: "gmail.fetch_emails", op: "read", state: "done", summary: "2 messages" });
    expect(JSON.stringify(calls(log))).not.toContain("Renewal");
    expect(fake.calls().filter((x) => x.argv[1] === "run").at(-1)!.argv.slice(-2)).toEqual(["--connection-name", "home"]);

    expect(await c.classify("oo", "gmail.send_email")).toBe("write");
    const refused = await c.read(P, "oo", "gmail.send_email", { to: "lina@example.com" });
    expect(refused).toMatchObject({ ok: false, op: "write" });
    const runsBefore = fake.calls().filter((x) => x.argv[1] === "run").length;
    expect(c.stage("oo", "gmail.send_email", { to: "lina@example.com" }, "dec_1").ok).toBe(true);
    expect(await c.runApproved("dec_1")).toMatchObject({ ok: false }); // not answered yet
    expect(fake.calls().filter((x) => x.argv[1] === "run").length).toBe(runsBefore);
    log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: "dec_1", option: "go", by: "user" } });
    expect(await c.runApproved("dec_1")).toMatchObject({ ok: true, op: "write" });
    expect(await c.runApproved("dec_1")).toMatchObject({ ok: false });
    expect(fake.calls().filter((x) => x.argv[1] === "run").length).toBe(runsBefore + 1);
  });

  test("a task reads only when shared, and never writes", async () => {
    const { c } = setup();
    await c.addFromOo();
    const T = { role: "task", taskId: "t1" } as const;
    expect((await c.read(T, "oo", "gmail.fetch_emails", {})).ok).toBe(false);
    c.grant("t1", "oo");
    expect((await c.read(T, "oo", "gmail.fetch_emails", {})).ok).toBe(true);
    expect(await c.read(T, "oo", "gmail.send_email", {})).toMatchObject({ ok: false, op: "write" });
  });

  test("an oo account can't be watched: refused with the way out, nothing is fetched", async () => {
    const { c } = setup();
    await c.addFromOo();
    const w = c.watchable("oo");
    expect(w).toEqual({ ok: false, error: OO_NOT_WATCHABLE });
    expect(OO_NOT_WATCHABLE).toContain("Use a check instead");
    const before = fake.calls().length;
    expect(await c.readTrigger("oo", "gmail", "new_email", {}, null)).toEqual({ ok: false, error: OO_NOT_WATCHABLE });
    expect(fake.calls().length).toBe(before);
  });

  test("signed out: the tap says so; an added one goes unauthorized", async () => {
    const { c } = setup();
    await c.addFromOo();
    fake.set(state({ signedIn: false }));
    const r = await c.read(P, "oo", "gmail.fetch_emails", {});
    // The services list is cached; the run itself is refused by oo.
    expect(r.ok).toBe(false);
    expect(c.view()[0].state).toBe("unauthorized");
    const fresh = openConnections({ dataDir: join(t.dir, "fresh"), log: openLog({ path: join(t.dir, "fresh.db"), persona: "default" }), oo: ooSource({ env, dir: join(t.dir, "none"), which: () => fake.bin, cli: cliFor() }) });
    expect(await fresh.addFromOo()).toEqual({ ok: false, reason: "oo_signed_out" });
  });
});
