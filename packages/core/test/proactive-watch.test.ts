// D165 step 1: the watchers. Code polling, no model; mail every 10 min, calendars every 15;
// a checkpoint per app; nothing before the person said yes; reads only, on the "watch" stream.
import { afterEach, expect, test } from "bun:test";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FakeClock } from "../src/clock.ts";
import { openConnections, ooSource } from "../src/connections.ts";
import { openLog } from "../src/log.ts";
import { ooCli, ooEnv, ooExec } from "../src/oo-link.ts";
import { createWatchers, WATCH_FILE } from "../src/proactive/watch.ts";
import type { Item } from "../src/proactive/items.ts";
import { fakeAccounts } from "./fake-accounts.ts";
import { fakeOo } from "./fake-oo.ts";
import { busyWeek, MORNING, ZONE } from "./fixtures/inbox.ts";
import { tempDir } from "./helpers.ts";

const dirs: (() => void)[] = [];
afterEach(() => dirs.splice(0).forEach((f) => f()));
const scratch = () => {
  const t = tempDir();
  dirs.push(t.cleanup);
  return t.dir;
};
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

test("watching starts only when it's on, then looks by code: mail every 10 min, calendar every 15", async () => {
  const dir = scratch();
  const clock = new FakeClock(MORNING - 3 * 86_400_000);
  const acc = fakeAccounts(busyWeek());
  let on = false;
  const got: Item[] = [];
  const w = createWatchers({ dataDir: dir, connections: acc.store, clock, enabled: () => on, zone: () => ZONE, onItems: (_a, items) => void got.push(...items) });
  w.sync();
  clock.advance(60 * 60_000);
  await flush();
  expect(acc.calls).toHaveLength(0); // connecting is not consent to watch

  on = true;
  w.sync();
  clock.advance(10 * 60_000);
  await flush();
  const at10 = acc.calls.map((c) => c.action).sort();
  expect(at10).toEqual(["discord.list_mentions", "github.list_notifications", "gmail.search_threads"]);
  clock.advance(5 * 60_000);
  await flush();
  expect(acc.calls.filter((c) => c.action === "googlecalendar.list_events")).toHaveLength(1);
  expect(acc.calls.every((c) => c.who === "watch")).toBe(true);
  // Every 10 minutes over the three days the fixture's mail arrives in: each new item once.
  for (let i = 0; i < 3 * 24 * 6; i++) {
    clock.advance(10 * 60_000);
    await flush();
  }
  const ids = got.filter((i) => i.kind === "mail").map((i) => i.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids).toContain("m_lina2");
  // Each look asks only for what is newer than the last one.
  const mailLooks = acc.calls.filter((c) => c.action === "gmail.search_threads").map((c) => Number(/after:(\d+)/.exec(String(c.input.query))![1]));
  for (let i = 1; i < mailLooks.length; i++) expect(mailLooks[i]!).toBeGreaterThanOrEqual(mailLooks[i - 1]!);
  // Chat: only @-mentions and DMs.
  expect(got.filter((i) => i.kind === "chat").map((i) => i.id)).toEqual(["c_1"]);
  expect(acc.writes()).toHaveLength(0);
  expect((statSync(join(dir, WATCH_FILE)).mode & 0o777).toString(8)).toBe("600");
  w.stop();
});

test("自己留意 off and 不让 Ducter 看这个 stop an app's looks; the rest go on", async () => {
  const dir = scratch();
  const clock = new FakeClock(MORNING);
  const acc = fakeAccounts(busyWeek());
  const w = createWatchers({ dataDir: dir, connections: acc.store, clock, enabled: () => true, zone: () => ZONE, onItems: () => {} });
  acc.store.setApp(acc.id, "discord", "wey", { watch: false });
  acc.store.setApp(acc.id, "github", "wey", { excluded: true });
  w.sync();
  clock.advance(10 * 60_000);
  await flush();
  expect(acc.calls.map((c) => c.action)).toEqual(["gmail.search_threads"]);
  w.stop();
});

test("看了哪些: today's reads, one line each, newest first; never what they said", async () => {
  const dir = scratch();
  const clock = new FakeClock(MORNING);
  const acc = fakeAccounts(busyWeek());
  const w = createWatchers({ dataDir: dir, connections: acc.store, clock, enabled: () => true, zone: () => ZONE, onItems: () => {} });
  const back = await w.lookBack(3, { kinds: ["mail"] });
  expect(back.apps).toBe(1);
  const reads = w.reads(acc.id);
  expect(reads[0]).toMatchObject({ service: "gmail", account: "wey@example.com", what: "new" });
  expect(reads[0]!.items).toBeGreaterThan(0);
  expect(JSON.stringify(reads)).not.toContain("再问一下");
  expect(w.readToday(acc.id)).toBe(reads[0]!.items);
  w.stop();
});

test("oo can be watched by polling through the real broker: the watch caller reads, never writes, and logs on its own stream", async () => {
  const dir = scratch();
  const bin = join(dir, "bin");
  mkdirSync(bin);
  const oo = fakeOo(bin, {
    signedIn: true,
    apps: [{ service: "gmail", connectionName: "work", accountLabel: "wey@example.com", authType: "oauth2", isDefault: true }],
    actions: [
      { service: "gmail", name: "search_threads", description: "Search threads" },
      { service: "gmail", name: "send_email", description: "Send" },
    ],
    results: { "gmail.search_threads": { threads: busyWeek().mail.slice(0, 3) } },
  });
  const env = { ...process.env, ...oo.env, PATH: `${bin}:${process.env.PATH}` };
  const log = openLog({ path: join(dir, "ducter.db"), persona: "default" });
  const cli = ooCli({ exec: ooExec(oo.bin, ooEnv(env, oo.bin)) });
  writeFileSync(join(dir, "x"), "");
  const conns = openConnections({ dataDir: dir, log, oo: ooSource({ env, dir: join(dir, "oo-config"), which: () => oo.bin, cli }) });
  const added = await conns.addFromOo();
  expect(added.ok).toBe(true);
  const id = (added as { id: string }).id;
  expect(conns.watchable(id).ok).toBe(false); // no triggers: watched by looking instead
  const apps = conns.apps(id);
  expect(apps).toMatchObject([{ service: "gmail", label: "wey@example.com", watch: true, excluded: false }]);

  const clock = new FakeClock(MORNING);
  const got: Item[] = [];
  const w = createWatchers({ dataDir: dir, connections: conns, clock, enabled: () => true, zone: () => ZONE, onItems: (_a, items) => void got.push(...items) });
  const items = await w.look(apps[0]!, MORNING - 30 * 86_400_000);
  expect(items?.map((i) => i.id).sort()).toEqual(["m_ca", "m_cf", "m_hotel"]);
  // The broker refuses a write for the watch caller, whatever the action.
  const write = await conns.read({ role: "watch" }, id, "gmail.send_email", { to: "x@example.com" });
  expect(write.ok).toBe(false);
  expect(oo.calls().some((c) => c.argv.includes("send_email"))).toBe(false);
  // Its reads are on the "watch" stream: the conversation and the partner never see them.
  const calls = log.read({ kinds: ["connection_call"] });
  expect(calls.length).toBeGreaterThan(0);
  expect(calls.every((e) => e.stream === "watch" && e.origin === "system")).toBe(true);
  // 不让 Ducter 看这个: nothing reads it, the partner included.
  conns.setApp(id, "gmail", "work", { excluded: true });
  expect(conns.apps(id)[0]!.excluded).toBe(true);
  const refused = await conns.read({ role: "partner" }, id, "gmail.search_threads", {});
  expect(refused.ok).toBe(false);
  w.stop();
  log.close();
});
