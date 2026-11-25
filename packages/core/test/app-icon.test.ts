// D562: an app's own icon and Home Screen manifest: drawn by the home (its mark pressed into its clay),
// served under a key only this home can make, saying nothing the app keeps.
import { afterEach, expect, test } from "bun:test";
import { inflateSync } from "node:zlib";
import { appIconPng, appIconResponse, drawAppIcon, flattenPath } from "../src/app-icon.ts";
import { openApps } from "../src/apps.ts";
import { tempDir } from "./helpers.ts";

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((f) => f()));
const dir = () => {
  const t = tempDir();
  cleanups.push(t.cleanup);
  return t.dir;
};
const KIT_APP = `<main class="k-app"><section class="k-sum"><span class="k-sum-value">¥0</span></section></main>`;

test("a path's arcs, curves and lines flatten inside the 20 grid", () => {
  const lines = flattenPath("M4 7h12a1.5 1.5 0 0 1 1.5 1.5V15a1.5 1.5 0 0 1-1.5 1.5H4zM7 7c0-2 6-2 6 0");
  expect(lines.length).toBe(2);
  for (const pl of lines) for (const [x, y] of pl) expect(x >= 2 && x <= 18 && y >= 2 && y <= 18).toBe(true);
  // The rounded corner passes through its quarter: (17.06, 7.44) lies on the arc from (16,7) to (17.5,8.5).
  expect(lines[0]!.some(([x, y]) => Math.hypot(x - 16, y - 8.5) > 1.45 && Math.hypot(x - 16, y - 8.5) < 1.55 && x > 16.5 && y < 8)).toBe(true);
});

test("the icon: clay all over for a Home Screen, the macOS grid with a clear margin for the Dock, the ink in the middle", () => {
  const n = 128;
  const full = drawAppIcon("suitcase", "clay", n, "full");
  const at = (px: Uint8Array, x: number, y: number) => [...px.subarray((y * n + x) * 4, (y * n + x) * 4 + 4)];
  expect(at(full, 0, 0)[3]).toBe(255);
  expect(at(full, 2, 64)[0]).toBeGreaterThan(200); // clay at the edge
  const mac = drawAppIcon("suitcase", "clay", n, "mac");
  expect(at(mac, 0, 0)[3]).toBe(0); // the grid's margin
  expect(at(mac, 64, 30)[3]).toBe(255);
  // Somewhere on the mark the ink is dark.
  let darkest = 255;
  for (let x = 30; x < 98; x++) darkest = Math.min(darkest, at(full, x, 64)[0]!);
  expect(darkest).toBeLessThan(90);
  const png = appIconPng("suitcase", "clay", 64, "full");
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  // Its IDAT inflates to 64 rows of 64 RGBA pixels and a filter byte each.
  const idat = png.indexOf(0x49, 33); // "I" of IDAT
  const len = new DataView(png.buffer, png.byteOffset + idat - 4, 4).getUint32(0);
  expect(inflateSync(png.subarray(idat + 4, idat + 4 + len)).length).toBe(64 * (64 * 4 + 1));
});

test("served under a key only this home makes: the manifest opens straight into the app, standalone, as its own app", async () => {
  const d = dir();
  const apps = openApps({ dataDir: d });
  const r = apps.make("default", { name: "北京出差 11/20–21", html: KIT_APP, icon: "suitcase", data: { expenses: [{ what: "高铁 G1", yuan: 662 }] } });
  if (!r.ok) throw new Error(r.error);
  const m = apps.list("default")[0]!;
  expect(m.home).toMatch(new RegExp(`^/app-icon/${m.id}/[A-Za-z0-9_-]{22}/$`));
  const key = m.home!.split("/")[3]!;
  expect(apps.byIconKey(m.id, key)?.id).toBe(m.id);
  expect(apps.byIconKey(m.id, key.slice(0, -1) + (key.endsWith("A") ? "B" : "A"))).toBeUndefined();
  // The same key after the home restarts (its secret is kept); another home's differs.
  expect(openApps({ dataDir: d }).iconKey(m.id)).toBe(key);
  expect(openApps({ dataDir: dir() }).iconKey(m.id)).toBeUndefined();
  // The kept meta carries no path (worked out on every list).
  expect(apps.get(m.id)!.home).toBeUndefined();
  const res = appIconResponse(m, undefined, 0, m.home!);
  const man = (await res.json()) as Record<string, unknown>;
  expect(man).toMatchObject({ id: `/app?app=${m.id}`, name: "北京出差 11/20–21", start_url: `/app?app=${m.id}#app=${m.id}`, display: "standalone", scope: "/" });
  expect(JSON.stringify(man)).not.toContain("662");
  expect((await appIconResponse(m, "icon", 180, m.home!).arrayBuffer()).byteLength).toBeGreaterThan(500);
  expect(appIconResponse(m, "mac", 300, m.home!).status).toBe(404);
});
