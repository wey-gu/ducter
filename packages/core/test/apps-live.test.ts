// D422: an app's state, one truth each: the task that keeps it (Ongoing, through keptBy), the
// person's words about it not yet answered, its page breaking on a version, a file from before the
// kit. The list carries it (never kept on disk); a new version clears what belonged to the old one.
import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { appState } from "@ducter/protocol";
import { openApps } from "../src/apps.ts";
import { startCore } from "../src/index.ts";
import { tempDir } from "./helpers.ts";

const cleanups: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const f of cleanups.splice(0)) await f();
});
const dir = () => {
  const t = tempDir();
  cleanups.push(t.cleanup);
  return t.dir;
};
const KIT = `<main class="k-app"><section class="k-sum"><span class="k-sum-value">¥0</span></section></main>`;
const OLD = `<h2>记一笔</h2><select><option>交通</option></select><input type="number"><button>保存</button>`;

test("an app made before the kit says so; the new look clears it", () => {
  const apps = openApps({ dataDir: dir() });
  const r = apps.make("default", { name: "出差花销", html: OLD });
  if (!r.ok) throw new Error(r.error);
  const one = () => apps.list("default").find((m) => m.id === r.app.id)!;
  expect(one().live).toEqual({ old: true });
  expect(appState(one())).toBe("old");
  expect(apps.change(r.app.id, { html: KIT }).ok).toBe(true);
  expect(one().live).toBeUndefined();
  expect(appState(one())).toBe("plain");
});

test("a page that broke is kept on its version only, never written as live", () => {
  const d = dir();
  const apps = openApps({ dataDir: d });
  const r = apps.make("default", { name: "每日习惯", html: KIT });
  if (!r.ok) throw new Error(r.error);
  const id = r.app.id;
  expect(apps.broke(id, 7, "stale version")).toBe(false);
  expect(apps.broke(id, 1, "  Cannot read properties of null\n(reading 'streak') ")).toBe(true);
  expect(apps.broke(id, 1, "again")).toBe(false);
  const m = apps.list("default")[0]!;
  expect(m.live?.broke?.text).toBe("Cannot read properties of null (reading 'streak')");
  expect(appState(m)).toBe("broke");
  const disk = JSON.parse(readFileSync(join(d, "apps", id, "meta.json"), "utf8"));
  expect(disk.broke.version).toBe(1);
  expect(disk.live).toBeUndefined();
  expect(apps.change(id, { html: KIT + " " }).ok).toBe(true);
  expect(apps.list("default")[0]!.live).toBeUndefined();
});

test("being changed: on until the partner answers, at most ten minutes", () => {
  let now = Date.parse("2026-11-20T10:00:00Z");
  const apps = openApps({ dataDir: dir(), now: () => new Date(now) });
  const r = apps.make("default", { name: "宝宝喝奶", html: KIT });
  if (!r.ok) throw new Error(r.error);
  apps.changing(r.app.id, true);
  expect(appState(apps.list("default")[0]!)).toBe("changing");
  apps.answeredAll();
  expect(appState(apps.list("default")[0]!)).toBe("plain");
  apps.changing(r.app.id, true);
  now += 11 * 60_000;
  expect(appState(apps.list("default")[0]!)).toBe("plain");
});

test("kept current: the task's state from keptBy, failed before running before next", () => {
  const apps = openApps({ dataDir: dir() });
  const r = apps.make("default", { name: "东京机票", html: KIT, task: { id: "t_fare", title: "看机票" } });
  if (!r.ok) throw new Error(r.error);
  let state: "running" | "resting" | "paused" | "failed" = "resting";
  apps.keptBy((id) => (id === "t_fare" ? { task: id, title: "看机票", state, next: "2026-11-21T01:00:00Z", of: { kind: "task", id } } : undefined));
  expect(appState(apps.list("default")[0]!)).toBe("kept_next");
  state = "failed";
  expect(appState(apps.list("default")[0]!)).toBe("kept_failed");
  state = "paused";
  expect(appState(apps.list("default")[0]!)).toBe("kept_paused");
  apps.changing(r.app.id, true);
  expect(appState(apps.list("default")[0]!)).toBe("changing");
});

test("through the core: the person's words about an app mark it changing; the partner's reply clears it", async () => {
  const core = startCore({ dataDir: dir(), port: 0, push: false });
  cleanups.push(() => core.stop());
  const r = core.apps.make(core.persona.id, { name: "宝宝喝奶", html: KIT });
  if (!r.ok) throw new Error(r.error);
  core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "加个按钮", app: { id: r.app.id, name: "宝宝喝奶" } } });
  expect(appState(core.apps.list(core.persona.id)[0]!)).toBe("changing");
  // An app's own ask is not a change asked for.
  core.log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: "好了" } });
  expect(appState(core.apps.list(core.persona.id)[0]!)).toBe("plain");
  core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "多少了？", app: { id: r.app.id, name: "宝宝喝奶", ask: "a1" } } });
  expect(appState(core.apps.list(core.persona.id)[0]!)).toBe("plain");
});
