// D424: Settings read at a glance. Every row is a title and at most one short line; an explanation
// a careful person may want sits behind 怎么做到的 / How it works. Both clients say the same words
// under the same keys, the trust lists stay short, and the tap never lives inside a switch's label.
import { expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { strings } from "../src/i18n.ts";

const dir = (p: string) => new URL(p, import.meta.url);
const read = (base: string, ok: (f: string) => boolean) =>
  readdirSync(dir(base)).filter(ok).map((f) => readFileSync(dir(base + f), "utf8")).join("\n");
const web = read("../src/", (f) => /^i18n.*\.ts$/.test(f));
const mac = read("../../desktop/internal/i18n/", (f) => f.endsWith(".go") && !f.endsWith("_test.go"));

// The values under a key, zh first then en, as each file writes them.
const values = (text: string, key: string) =>
  [...text.matchAll(new RegExp(`"${key.replace(/\./g, "\\.")}"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*")`, "g"))].map((m) => JSON.parse(m[1]!) as string);

const KEYS = [
  "how.more", "how.less", "partner.trust.note", "records.look.help", "records.past.note", "handoff.help", "loadout.tasks.how",
  "chats.goes", "chats.goes.how", "chats.wx.rule", "chats.wx.rule.how", "chats.wx.who", "af.lede", "af.kept.short", "af.kept.keychain", "af.kept.file",
  "af.d.note", "af.d.how", "af.card.why", "af.keys.ask.help", "settings.versions.night.quiet", "settings.versions.night.note",
  "settings.versions.night.how", "settings.details.note", "mem.first.body", "peers.invite", "peers.mem.what", "settings.lede.peers",
  "bridge.mem.install.need", "bridge.mem.install.need.how", "cal.first", "own.away.nodial", "todos.own",
  ...[1, 2, 3, 4].flatMap((i) => [`partner.trust.own.${i}`, `partner.trust.asks.${i}`]),
];

test("the Mac and the phone say the same words under the same keys", () => {
  for (const k of KEYS) {
    const w = values(web, k);
    expect(w.length, k).toBe(2);
    expect(values(mac, k), k).toEqual(w);
  }
});

test("the trust lists are short phrases, and no row line runs on", () => {
  const zh = strings("zh");
  for (const i of [1, 2, 3, 4])
    for (const k of [`partner.trust.own.${i}`, `partner.trust.asks.${i}`]) expect([...zh.t(k)].length, k).toBeLessThanOrEqual(8);
  // A shown line is one short sentence; the long words are only the ones behind How it works.
  for (const k of KEYS.filter((k) => !/\.how$|records\.look\.help|af\.kept\.(keychain|file)/.test(k))) expect([...zh.t(k, "hel", "23:00", "08:00")].length, k).toBeLessThanOrEqual(40);
});

test("the retired lines are gone from both clients", () => {
  for (const k of ["partner.talk.auto.note", "partner.talk.fixed.note", "settings.look.mode.help", "standing.where.any"]) {
    expect(values(web, k), k).toEqual([]);
    expect(values(mac, k), k).toEqual([]);
  }
});

test("How sits outside a switch's label, so the tap never flips it", () => {
  const c = readFileSync(dir("../src/controls.tsx"), "utf8");
  const toggle = c.slice(c.indexOf("export function Toggle"), c.indexOf("export function How"));
  expect(toggle).toMatch(/<\/label>\s*\);[\s\S]*<How /);
});
