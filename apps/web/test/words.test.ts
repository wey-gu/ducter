// The web client's words, checked once for every table instead of again in each feature's test
// (design/build-and-run.md, "What a test must earn"): zh and en are written together (D36: the same
// keys, as many arguments); a table merged into the client's words isn't silently replaced there by
// a later one; every key the client's source asks for has words in both languages, or the page shows
// the raw key; and a table the Mac mirrors whole has the Mac's keys and words.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const src = join(import.meta.dir, "../src");
/** Keys the source builds from parts at run time, so no literal names them. */
const BUILT = [
  "onhand.by.state", "onhand.by.project", "onhand.walk.next", "onhand.walk.prev",
  "handset.step.allow.title", "handset.step.on.title", "handset.step.try.body", "handset.step.allow.body", "handset.step.on.body", "handset.part.try", "handset.part.allow",
  "wb.launcher.files", "wb.launcher.preview", "wb.launcher.browser", "wb.launcher.phone", "wb.launcher.made",
  "ctx.why.unsupported", "settings.look.mode.system", "effort.high", "note.switched", "note.moved",
];
type Table = { zh: Record<string, string>; en: Record<string, string> };
const isTable = (v: unknown): v is Table =>
  !!v && typeof v === "object" && "zh" in v && "en" in v && [(v as Table).zh, (v as Table).en].every((t) => !!t && typeof t === "object" && Object.values(t).every((w) => typeof w === "string"));

/** Every { zh, en } table the client's i18n modules export, by module and export name. */
async function tables(): Promise<{ name: string; table: Table }[]> {
  const out: { name: string; table: Table }[] = [];
  for (const f of readdirSync(src).filter((f) => /^i18n.*\.ts$/.test(f)).sort()) {
    const mod = await import(join(src, f));
    for (const [name, v] of Object.entries(mod)) if (name !== "TABLES" && isTable(v)) out.push({ name: `${f} ${name}`, table: v });
  }
  return out;
}

/** How many arguments a line prints: its highest %[n] index, else its count of verbs. */
const args = (s: string) => {
  const verbs = s.replace(/%%/g, "").match(/%(\[\d+\])?[-+# 0]*\d*(\.\d+)?[sdfvq]/g) ?? [];
  const at = verbs.map((v) => Number(/^%\[(\d+)\]/.exec(v)?.[1] ?? 0));
  return Math.max(at.some((n) => n) ? Math.max(...at) : 0, at.filter((n) => !n).length);
};

describe("the web client's words", () => {
  test("every table: zh and en have the same keys, each printing as many arguments", async () => {
    const all = await tables();
    expect(all.length).toBeGreaterThan(30);
    for (const { name, table } of all) {
      expect(Object.keys(table.zh).sort(), name).toEqual(Object.keys(table.en).sort());
      for (const k of Object.keys(table.zh)) expect([name, k, args(table.en[k]!)]).toEqual([name, k, args(table.zh[k]!)]);
    }
  });

  test("a table merged into the client's words isn't overwritten there by another's", async () => {
    const { TABLES } = await import("../src/i18n.ts");
    const lost: string[] = [];
    for (const { name, table } of await tables()) {
      const keys = Object.keys(table.zh);
      const merged = keys.some((k) => TABLES.zh[k] === table.zh[k] && TABLES.en[k] === table.en[k]);
      if (merged) for (const k of keys) if (TABLES.zh[k] !== table.zh[k] || TABLES.en[k] !== table.en[k]) lost.push(`${name} ${k}`);
    }
    expect(lost).toEqual([]);
  });

  test("every key the client's source asks for has words in zh and en", async () => {
    const { TABLES } = await import("../src/i18n.ts");
    const zh = new Set<string>(), en = new Set<string>();
    for (const { table } of [...(await tables()), { table: TABLES }]) {
      for (const k of Object.keys(table.zh)) zh.add(k);
      for (const k of Object.keys(table.en)) en.add(k);
    }
    const asked = new Map<string, string>();
    for (const f of readdirSync(src).filter((f) => /\.tsx?$/.test(f) && !f.startsWith("i18n"))) {
      const s = readFileSync(join(src, f), "utf8");
      for (const m of s.matchAll(/(?:^|[^\w])(?:\w+\.)?t\(\s*"([a-z][\w-]*(?:\.[\w-]+)+)"/g)) asked.set(m[1]!, f);
    }
    expect(asked.size).toBeGreaterThan(1500);
    // Keys the source builds from parts (t(`handset.step.${step}.title`)), as the features' own
    // tests used to list them; each family of built keys has at least one member.
    for (const k of BUILT) asked.set(k, "built");
    const families: string[] = [];
    for (const f of readdirSync(src).filter((f) => /\.tsx?$/.test(f) && !f.startsWith("i18n"))) {
      const s = readFileSync(join(src, f), "utf8");
      for (const m of s.matchAll(/(?:^|[^\w])(?:\w+\.)?t\(\s*`([a-z][\w.-]*)\$\{[^}]+\}([\w.-]*)`/g)) {
        const re = new RegExp(`^${m[1]!.replace(/\./g, "\\.")}[\\w-]+${m[2]!.replace(/\./g, "\\.")}$`);
        if (![...zh].some((k) => re.test(k) && en.has(k))) families.push(`${m[1]}…${m[2]} (${f})`);
      }
    }
    expect([...asked].filter(([k]) => !zh.has(k) || !en.has(k)).map(([k, f]) => `${k} (${f})`)).toEqual([]);
    expect(families).toEqual([]);
  });

  test("a table the Mac mirrors whole is the Mac's, language for language, key for key", async () => {
    // D488: one table-driven check for every mirrored table (it was also re-checked, weaker or the
    // same, in groups, asks, first-meet, voice, partners and d475's own tests).
    const mirrors: [string, string, string][] = [
      ["i18n-starts.ts", "starts", "starts.go"],
      ["i18n-rich.ts", "richWords", "rich.go"],
      ["i18n-conv.ts", "convWords", "conv.go"],
      ["i18n-updateall.ts", "updateAllWords", "updateall.go"],
      ["i18n-onhand.ts", "onhandWords", "onhand.go"],
      ["i18n-memory.ts", "memoryWords", "memory.go"],
      ["i18n-taskview.ts", "taskviewWords", "taskview.go"],
      ["i18n-groups.ts", "groupWords", "groups.go"],
      ["i18n-asks.ts", "asksWords", "asks.go"],
      ["i18n-subjects.ts", "subjectWords", "subjects.go"],
      ["i18n-first-meet.ts", "firstMeetWords", "firstmeet.go"],
      ["i18n-voice.ts", "voiceWords", "voice.go"],
      ["i18n-partners.ts", "partnersWords", "partners.go"],
      ["i18n-d475.ts", "d475Words", "settings_d475.go"],
      ["i18n-mentions.ts", "mentionWords", "mentions.go"],
    ];
    /** A Go file's zh… and en… tables, parsed as the Mac reads them. */
    const goTables = (mac: string) => {
      const out = { zh: {} as Record<string, string>, en: {} as Record<string, string> };
      for (const m of mac.matchAll(/^var (zh|en)\w* = Table\{\n([\s\S]*?)\n\}/gm))
        for (const [, k, v] of m[2]!.matchAll(/^\s*"([^"]+)":\s*("(?:[^"\\]|\\.)*"),\s*(?:\/\/.*)?$/gm)) out[m[1] as "zh" | "en"][k!] = JSON.parse(v!);
      return out;
    };
    for (const [file, name, go] of mirrors) {
      const table = (await import(join(src, file)))[name] as Table;
      const mac = goTables(readFileSync(join(import.meta.dir, "../../desktop/internal/i18n", go), "utf8"));
      expect(mac.zh, `${go} zh`).toEqual(table.zh);
      expect(mac.en, `${go} en`).toEqual(table.en);
    }
  });
});
