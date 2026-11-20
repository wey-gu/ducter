// D431: an app's things live in its data. A list of the person's items written into the file is
// lifted into its data when the app is made or changed, and when an app made before this opens (a
// version of its own, so 改回去 brings the file back); rows written into the markup are said to the
// partner. Only where nothing they see changes.
import { afterEach, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { appDocument, appLiftItems, appLint, appRowsInMarkup, jsLiteral } from "@ducter/protocol";
import { openApps } from "../src/apps.ts";
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

// What haiku wrote for "make that a little page I can keep and tick off" (the D422 eval, run 2), cut short.
const PRS = `<main class="k-app"><section class="k-sum"><div class="k-sum-value" id="count">4</div></section><div class="k-list" id="list"></div></main>
<script>
const PRS = [
  { id: "wey-gu/ducter#412", title: "Compaction cut", wait: "Waiting on Weizhen's review since Monday" },
  { id: "nowledge-co/mem#10287", title: "Retry on 502", wait: 'CI is failing' }, // red since Tuesday
  { id: "nowledge-co/hawdb#1592", title: \`Flaky compaction test\`, wait: "Waiting on Alice", n: -1.5, ok: true, x: null },
];
const CATS = [{ k: "go", label: "Travel" }, { k: "eat", label: "Food" }];
let done = ducter.get("done") || {};
document.getElementById("count").textContent = PRS.filter((p) => !done[p.id]).length;
</script>`;

test("a literal list of items: lifted into data under its name, the file reads it back", () => {
  const r = appLiftItems(PRS, {});
  expect(r?.keys).toEqual(["prs"]);
  expect((r!.data.prs as { id: string }[]).map((p) => p.id)).toEqual(["wey-gu/ducter#412", "nowledge-co/mem#10287", "nowledge-co/hawdb#1592"]);
  expect((r!.data.prs as Record<string, unknown>[])[2]).toEqual({ id: "nowledge-co/hawdb#1592", title: "Flaky compaction test", wait: "Waiting on Alice", n: -1.5, ok: true, x: null });
  expect(r!.html).toContain(`const PRS = ducter.get("prs") || [];`);
  expect(r!.html).not.toContain("10287");
  // The app's own settings stay in the file.
  expect(r!.html).toContain(`const CATS = [{ k: "go"`);
  expect(r!.data).not.toHaveProperty("cats");
});

test("nothing is lifted where it could change what they see", () => {
  // A key the data already has, or the file names.
  expect(appLiftItems(PRS, { prs: [] })).toBeUndefined();
  expect(appLiftItems(PRS.replace(`ducter.get("done")`, `ducter.get("prs")`), {})).toBeUndefined();
  // Not a pure literal: a name, a call, a template with a value in it.
  expect(appLiftItems(`<script>const items = [{ a: 1 }, { a: x }];</script>`, {})).toBeUndefined();
  expect(appLiftItems(`<script>const items = [{ a: 1 }, { a: f() }];</script>`, {})).toBeUndefined();
  expect(appLiftItems("<script>const items = [{ a: `${1}` }, { a: 2 }];</script>", {})).toBeUndefined();
  // One item, or a list of words, is the app's, not a list of things.
  expect(appLiftItems(`<script>const items = [{ a: 1 }];</script>`, {})).toBeUndefined();
  expect(appLiftItems(`<script>const items = ["Food", "Travel"];</script>`, {})).toBeUndefined();
  // A script loaded by src is not read.
  expect(appLiftItems(`<script src="x.js">const items = [{ a: 1 }, { a: 2 }];</script>`, {})).toBeUndefined();
});

test("a fallback list for a key the data lacks goes into the data; the file stays", () => {
  const h = `<script>var feeds = ducter.get("feeds") || [{ at: "6:10", ml: 120 }, { at: "9:05", ml: 90 }];</script>`;
  const r = appLiftItems(h, {});
  expect(r?.keys).toEqual(["feeds"]);
  expect(r!.html).toBe(h);
  expect(r!.data.feeds).toEqual([{ at: "6:10", ml: 120 }, { at: "9:05", ml: 90 }]);
  expect(appLiftItems(h, { feeds: [{ at: "7:00", ml: 60 }] })).toBeUndefined();
});

test("jsLiteral reads JSON-like literals and stops at anything else", () => {
  expect(jsLiteral(`[1, 'a\\'b', "\\u4e2d", { k: [true, false, null], "q": .5, }, ] rest`, 0)?.v).toEqual([1, "a'b", "中", { k: [true, false, null], q: 0.5 }]);
  expect(jsLiteral(`[1, two]`, 0)).toBeUndefined();
  expect(jsLiteral(`[1, 2`, 0)).toBeUndefined();
  expect(jsLiteral(`["a\nb"]`, 0)).toBeUndefined();
});

test("made with its items in the file: they open from its data, and the partner hears where", () => {
  const apps = openApps({ dataDir: dir() });
  const r = apps.make("default", { name: "PRs waiting", html: PRS, data: { done: {} } });
  if (!r.ok) throw new Error(r.error);
  expect(r.lifted).toEqual(["prs"]);
  expect(apps.html(r.app.id)).toContain(`ducter.get("prs") || []`);
  expect((apps.data(r.app.id).prs as unknown[]).length).toBe(3);
  expect(apps.data(r.app.id).done).toEqual({});
  expect(r.app.version).toBe(1);
});

test("changed with a list written in: lifted on that version, every open device hears the keys", () => {
  const apps = openApps({ dataDir: dir() });
  const r = apps.make("default", { name: "PRs waiting", html: `<main class="k-app"></main>` });
  if (!r.ok) throw new Error(r.error);
  const heard: string[] = [];
  apps.onChange((c) => c.kind === "data" && heard.push(c.key));
  const c = apps.change(r.app.id, { html: PRS });
  if (!c.ok) throw new Error(c.error);
  expect(c.lifted).toEqual(["prs"]);
  expect(heard).toEqual(["prs"]);
  expect(apps.html(r.app.id)).not.toContain("10287");
});

test("an app from before opens with its list lifted, as a version of its own that 改回去 undoes", () => {
  const d = dir();
  const apps = openApps({ dataDir: d });
  const r = apps.make("default", { name: "PRs waiting", html: `<main class="k-app"></main>` });
  if (!r.ok) throw new Error(r.error);
  // Its file as an older home wrote it (no lift then).
  writeFileSync(join(d, "apps", r.app.id, "index.html"), PRS);
  const again = openApps({ dataDir: d });
  const updated = again.get(r.app.id)!.updated;
  const o = again.open(r.app.id, { transport: "message" });
  expect(o?.version).toBe(2);
  expect(o?.back).toBe(true);
  expect((o?.data.prs as unknown[]).length).toBe(3);
  expect(o?.doc).toContain(`ducter.get("prs") || []`);
  // The shelf's order doesn't jump for it.
  expect(again.get(r.app.id)!.updated).toBe(updated);
  // A second open changes nothing.
  expect(again.open(r.app.id, { transport: "message" })?.version).toBe(2);
  const b = again.back(r.app.id);
  if (!b.ok) throw new Error(b.error);
  expect(again.html(r.app.id)).toBe(PRS);
  // Its data keeps the list; the old file shows its own copy, the same values.
  expect((again.data(r.app.id).prs as unknown[]).length).toBe(3);
});

test("rows written into the markup: the lint says so, the [apps] state carries how many", () => {
  const h = `<main class="k-app"><ul class="k-list"><li class="k-row"><span class="k-row-main">牛奶</span></li><li class="k-row is-done">鸡蛋</li></ul></main><script>const r = '<li class="k-row">x</li>';</script>`;
  expect(appRowsInMarkup(h)).toBe(2);
  expect(appLint(h).some((x) => x.includes("2 rows into the markup"))).toBe(true);
  const apps = openApps({ dataDir: dir() });
  const r = apps.make("default", { name: "这周要买的", html: h });
  if (!r.ok) throw new Error(r.error);
  expect(apps.list("default")[0]!.live).toEqual({ inFile: 2 });
});

test("the kit's first state: the bridge marks an empty app and opens its add", () => {
  const doc = appDocument({ id: "a1", name: "x", html: `<main class="k-app"></main>`, data: {} }, { transport: "message" });
  expect(doc).toContain(`setAttribute("data-empty","")`);
  expect(doc).toContain(`a.setAttribute("data-first","")`);
  // Empty shells fold away; [hidden] wins over the kit's display.
  expect(doc).toContain("[hidden]{display:none!important}");
  expect(doc).toContain(".k-card:has(>.k-list:only-child:empty){display:none}");
  expect(doc).toContain(".k-none{");
});
