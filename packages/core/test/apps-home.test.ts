// D410: 你的小应用 / Your apps: the store's shelf parts (made with its data, its line, a mark and a
// tint; renamed, pinned, a routine let go; deleted and brought back, then gone after 30 days), the
// kit in every document and its lint, and the empty shelf's ideas from what the home noted.
import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { APP_KIT_CSS, APP_TINTS, appDocument, appLint, appTint } from "@ducter/protocol";
import { openApps } from "../src/apps.ts";
import { appIdeas } from "../src/app-ideas.ts";
import { tempDir } from "./helpers.ts";

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((f) => f()));
const dir = () => {
  const t = tempDir();
  cleanups.push(t.cleanup);
  return t.dir;
};
const KIT_APP = `<main class="k-app"><section class="k-sum"><span class="k-sum-value">¥0</span></section></main>`;

test("made with what the partner already knows: its data, its line, its mark; a tint that stays the same", () => {
  const apps = openApps({ dataDir: dir() });
  const r = apps.make("default", { name: "北京出差 11/20–21", html: KIT_APP, note: "高铁和两晚酒店，来自你的预订", summary: "2 笔，合计 ¥1,698", icon: "coins", data: { expenses: [{ what: "高铁 G1", yuan: 662, from: "booking" }], bad: null } });
  if (!r.ok) throw new Error(r.error);
  expect(r.app).toMatchObject({ summary: "2 笔，合计 ¥1,698", icon: "coins", note: "高铁和两晚酒店，来自你的预订" });
  expect(APP_TINTS).toContain(r.app.tint!);
  expect(r.app.tint).toBe(appTint({ id: r.app.id }));
  expect(apps.data(r.app.id)).toEqual({ expenses: [{ what: "高铁 G1", yuan: 662, from: "booking" }] });
  expect(apps.summarize(r.app.id, "3 笔，\n合计 ¥1,744")).toBe(true);
  expect(apps.get(r.app.id)!.summary).toBe("3 笔， 合计 ¥1,744");
});

test("the shelf's 「⋯」: rename, pin and unpin, stop a routine updating it", () => {
  const apps = openApps({ dataDir: dir() });
  const r = apps.make("default", { name: "审查看板", html: KIT_APP, task: { id: "t_rev", title: "看 PR" } });
  if (!r.ok) throw new Error(r.error);
  const id = r.app.id;
  const seen: string[] = [];
  apps.onChange((c) => seen.push(c.kind));
  expect(apps.set(id, { name: "  PR 看板 " })).toMatchObject({ ok: true, app: { name: "PR 看板" } });
  expect(apps.set(id, { name: " " }).ok).toBe(false);
  expect(apps.set(id, { pinned: true }).ok && apps.get(id)!.pinned).toBe(true);
  apps.set(id, { pinned: false });
  expect(apps.get(id)!.pinned).toBeUndefined();
  apps.set(id, { untask: true });
  expect(apps.get(id)!.task).toBeUndefined();
  expect(apps.byTask("t_rev")).toEqual([]);
  expect(seen).toContain("give");
});

test("deleted: gone from the shelf with its data, back on 撤销 within 30 days, gone for good after", () => {
  const d = dir();
  let now = Date.parse("2026-11-20T10:00:00+08:00");
  const apps = openApps({ dataDir: d, now: () => new Date(now) });
  const r = apps.make("default", { name: "这周要买的", html: KIT_APP, data: { items: ["牛奶"] } });
  if (!r.ok) throw new Error(r.error);
  const id = r.app.id;
  expect(apps.remove(id)).toBe(true);
  expect(apps.list("default")).toEqual([]);
  expect(existsSync(join(d, "apps", id))).toBe(false);
  expect(apps.removed(id)?.name).toBe("这周要买的");
  // A restart still has it to bring back, and never lists it.
  const again = openApps({ dataDir: d, now: () => new Date(now) });
  expect(again.list("default")).toEqual([]);
  expect(again.restore(id)).toMatchObject({ ok: true, app: { name: "这周要买的" } });
  expect(again.data(id)).toEqual({ items: ["牛奶"] });
  expect(again.remove(id)).toBe(true);
  now += 31 * 86_400_000;
  const later = openApps({ dataDir: d, now: () => new Date(now) });
  expect(later.restore(id).ok).toBe(false);
  expect(existsSync(join(d, "apps", ".removed", id))).toBe(false);
});

test("every app runs with the kit and ducter.summary; the lint turns away the system's grey controls", () => {
  const doc = appDocument({ id: "a1", name: "x", html: KIT_APP, data: {} }, { transport: "message" });
  expect(doc).toContain(APP_KIT_CSS);
  expect(doc.indexOf(APP_KIT_CSS)).toBeLessThan(doc.indexOf(KIT_APP));
  expect(doc).toContain('post({t:"summary",text:s})');
  expect(appLint(KIT_APP)).toEqual([]);
  const generic = `<h2>记一笔</h2><select><option>交通</option></select><input type="number" id="amt">`;
  const said = appLint(generic).join("\n");
  expect(said).toContain("k-chips");
  expect(said).toContain("k-num");
  expect(said).toContain("k-app");
});

test("the empty shelf's ideas: the trip the home noted first (北京南 read as 北京), then everyday ones; three at most", () => {
  const now = Date.parse("2026-11-19T22:00:00+08:00");
  const facts = [
    { type: "booking", what: "train", name: "G1", place: "北京南", start: "2026-11-20T07:00:00+08:00" },
    { type: "booking", what: "hotel", name: "亚朵酒店（望京）", place: "北京", start: "2026-11-20T15:00:00+08:00", end: "2026-11-22T12:00:00+08:00" },
    { type: "booking", what: "other", name: "agibar 分享（北京）", place: "北京", start: "2026-11-20T09:00:00+08:00" },
  ];
  const ideas = appIdeas(facts, now, "Asia/Shanghai");
  expect(ideas).toHaveLength(3);
  expect(ideas[0]!.say.zh).toBe("做个小应用，记一下这趟北京出差的花销");
  expect(ideas[0]!.why?.zh).toBe("你 11/20 去北京");
  expect(ideas.filter((i) => i.icon === "coins")).toHaveLength(1);
  // Nothing noted, or a trip long past: everyday ones only.
  expect(appIdeas([], now).map((i) => i.icon)).toEqual(["coins", "check", "list"]);
  expect(appIdeas(facts, now + 30 * 86_400_000).every((i) => !i.why)).toBe(true);
});
