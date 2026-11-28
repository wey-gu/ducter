// D663: 找设置 / Find a setting. The index is the panes' own words: every pane in the list has
// findable settings, every entry's title key (or brand) is drawn by its pane's source, and a
// pane's switch or titled row that is neither indexed nor named here as not a setting fails. The
// match reads both languages whatever the screens speak, the synonyms and the pane's name; a
// choice opens its pane with the landing set; ⌘K offers the settings the words name.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setFindWords } from "../src/i18n-setfind.ts";
import { TABLES } from "../src/i18n.ts";

const src = (f: string) => readFileSync(join(import.meta.dir, "../src", f), "utf8");

/** The files that draw each pane (views.tsx's SettingsSheet renders these). */
const PANE_FILES: Record<string, string[]> = {
  partner: ["views.tsx", "partner-story.tsx", "partners.tsx", "settings-more.tsx", "memory.tsx"],
  memory: ["memory.tsx", "mem-plugin.tsx", "mem-keep.tsx"],
  peers: ["memory.tsx"],
  notify: ["views.tsx", "accounts.tsx", "settings-delight.tsx"],
  accounts: ["views.tsx", "accounts.tsx", "own-phone.tsx", "phone.tsx"],
  todos: ["todos.tsx"],
  import: ["imports.tsx"],
  chats: ["channels.tsx"],
  autofill: ["autofill.tsx"],
  devices: ["devcard.tsx", "folder-row.tsx", "updateall.tsx", "views.tsx"],
  phone: ["views.tsx", "settings-more.tsx", "voice.tsx", "app-update.tsx", "settings-delight.tsx", "plugins.tsx"],
  plugins: ["plugins.tsx"],
};

/**
 * A pane's switches and titled rows that are not settings a person comes looking for, each with
 * why: a step in a flow, a row that is a thing the person has (an agent, an account), or the
 * same setting under another key. A new switch or row in a pane must be indexed or named here.
 */
const NOT_SETTINGS: Record<string, string> = {
  "loadout.default.errand": "a line that says who errands go to, under Who does the tasks",
  "loadout.default.rest": "the same, for everything else",
  "loadout.rule.add": "the rule field, under Who does the tasks",
  "newtasks.where": "a row of New tasks start, found by it",
  "newtasks.who": "a row of New tasks start, found by it",
  "partners.add": "indexed as partners",
  "mem.find.label": "a search field, not a setting",
  "mem.about.empty": "an empty state",
  "mem.find.failed": "a failure line",
  "mem.find.title": "the results' heading",
  "mem.check.clear": "a state of Mem's asks",
  "mem.app.kept.title": "a fact about Mem",
  "mem.app.name.title": "a fact about Mem",
  "mem.app.learn": "a link out",
  "memfile.row": "a Mem plugin's option, shown only with the plugin",
  "peers.rules.own.title": "a row of Who may ask me what, found by it",
  "peers.rules.team.title": "a row of Who may ask me what, found by it",
  "voice.settings.readback": "indexed as readback",
  "settings.versions.night": "indexed as autoupdate",
  "upall.auto": "the same setting offered once after Update all",
  "af.keys.ask": "indexed as keys",
  "records.look": "indexed as records",
  "handoff.row": "indexed as handoff",
  "partner.notify.on": "indexed as notify",
  "partner.quiet": "indexed as quiet",
  "settings.lang.title": "indexed as uilang",
  "settings.details.title": "indexed as details2",
  "partner.default.line": "indexed as wait",
  "settings.look.mode": "indexed as theme",
  "density.title": "indexed as density",
  "loadout.brain.model": "indexed as model",
  "newtask.effort": "indexed as effort",
  "key.settings.row": "indexed as key",
  "loadout.acct.tasks": "an agent's own switch on its device card",
  "own.prefer": "a step of calling from your own number",
  "own.away.how": "a step of calling from your own number",
  "kept.title": "the keys on a computer's card",
  "reach.how": "a fact on a computer's card",
  "reach.ways.short": "a fact on a computer's card",
  "settings.folder.toMac": "a step of moving the folder",
  "chats.link.title": "a step of linking a chat app",
  "chats.sl.re.title": "Slack's own update ask",
  "chats.wx.linked": "a state of WeChat",
  "todos.see": "a link to Tasks",
  "call.voice.use": "a call's own choice, on a call card",
  "call.voice.title": "a call's own choice, on a call card",
  "call.card.cap": "a call card",
  "about.title": "a computer's About card",
  "notify.done": "this phone's push, a row of Notifications found by it",
  "mem.health.plugin": "a plugin's state on a computer",
  "mem.peers.row": "a link to Agent messaging",
  "peers.twice.title": "a state of Agent messaging",
  "peers.none": "a state of Agent messaging",
  "peers.stuck.title": "a state of Agent messaging",
  "peers.notices.title": "a state of Agent messaging",
  "imports.consent.online.unreviewed": "a step in installing an importer (its consent tick)",
};

describe("找设置 / Find a setting (D663)", () => {
  test("every pane in the list has findable settings, and every entry lives in a pane of the list", async () => {
    const { SECTIONS } = await import("../src/set-sections.ts");
    const { SET_INDEX } = await import("../src/setfind.ts");
    const pages = SECTIONS.map((s) => s.page);
    for (const p of pages) expect(SET_INDEX.filter((e) => e.page === p).length, `no settings findable on ${p}`).toBeGreaterThan(0);
    for (const e of SET_INDEX) expect(pages, e.id).toContain(e.page);
    expect(Object.keys(PANE_FILES).sort()).toEqual([...pages].sort());
    expect(new Set(SET_INDEX.map((e) => e.id)).size).toBe(SET_INDEX.length);
  });

  test("each entry's words are its pane's own: the key is drawn by the pane's source, in both tables", async () => {
    const { SET_INDEX } = await import("../src/setfind.ts");
    for (const e of SET_INDEX) {
      const files = PANE_FILES[e.page]!.map(src).join("\n");
      for (const k of [e.key, ...(e.alt ?? []), e.near].filter((x): x is string => !!x)) {
        expect(TABLES.zh[k], `${e.id}: ${k} in zh`).toBeTruthy();
        expect(TABLES.en[k], `${e.id}: ${k} in en`).toBeTruthy();
        expect(files.includes(`"${k}"`), `${e.id}: ${e.page}'s source never draws ${k}`).toBe(true);
      }
      // An import source's name is the home's (protocol/imports.ts), never the pane's source.
      if (e.brandFrom === "home") expect(readFileSync(join(import.meta.dir, "../../../packages/protocol/src/imports.ts"), "utf8")).toContain(`"${e.brand}"`);
      if (e.brand && !e.brandFrom) expect(files.includes(e.brand), `${e.id}: ${e.page}'s source never draws ${e.brand}`).toBe(true);
      expect(!!e.key || !!e.brand, e.id).toBe(true);
      // A few true synonyms per setting, in both languages.
      expect(TABLES.zh[`setfind.syn.${e.id}`], `${e.id}: zh synonyms`).toBeTruthy();
      expect(TABLES.en[`setfind.syn.${e.id}`], `${e.id}: en synonyms`).toBeTruthy();
    }
  });

  test("a pane's switch or titled row is indexed or named as not a setting", async () => {
    const { SET_INDEX } = await import("../src/setfind.ts");
    const indexed = new Set(SET_INDEX.flatMap((e) => [e.key, ...(e.alt ?? []), e.near].filter(Boolean)));
    const loose: string[] = [];
    for (const [page, files] of Object.entries(PANE_FILES)) {
      for (const f of files) {
        const s = src(f);
        for (const m of s.matchAll(/<(?:Toggle|GRow)\b[^>]*?(?:label|title)=\{t\("([^"]+)"/g)) {
          const k = m[1]!;
          if (!indexed.has(k) && !NOT_SETTINGS[k]) loose.push(`${page}: ${f}: ${k}`);
        }
      }
    }
    expect(loose, "a switch or row no one can find; add it to SET_INDEX (setfind.ts) or NOT_SETTINGS here").toEqual([]);
  });

  test("zh and en hold the same words, and the Mac's table the same keys and words", () => {
    expect(Object.keys(setFindWords.zh).sort()).toEqual(Object.keys(setFindWords.en).sort());
    const go = readFileSync(join(import.meta.dir, "../../desktop/internal/i18n/setfind.go"), "utf8");
    for (const lang of ["zh", "en"] as const) {
      const body = go.slice(go.indexOf(`var ${lang}SetFind = Table{`));
      const table = body.slice(0, body.indexOf("\n}\n"));
      for (const [k, v] of Object.entries(setFindWords[lang])) expect(table, `${lang} ${k}`).toContain(`${JSON.stringify(k)}:`);
      for (const [k, v] of Object.entries(setFindWords[lang])) expect(table.includes(JSON.stringify(v)), `${lang} ${k} words`).toBe(true);
    }
    for (const v of [...Object.values(setFindWords.zh), ...Object.values(setFindWords.en)]) expect(v).not.toContain(" · ");
  });
});

async function boot(lang: "zh" | "en") {
  const { A } = await import("../src/app.ts");
  const { strings } = await import("../src/i18n.ts");
  A.L = strings(lang);
  A.send = () => {};
  A.S.welcomed = true;
  A.settings = { notify: true, quiet: { start: "23:00", end: "08:00", tz: "Asia/Shanghai" }, defaultAfterMin: 60, memory: true, language: "auto", proactive: "three", autoUpdate: false } as never;
  const f = await import("../src/setfind.ts");
  return { A, f };
}

describe("matching (D663)", () => {
  const ids = (hits: { e: { id: string } }[]) => hits.map((h) => h.e.id);

  test("either language's words find it, whatever the screens speak", async () => {
    for (const lang of ["zh", "en"] as const) {
      const { f } = await boot(lang);
      expect(ids(f.setFind("quiet"))[0], `${lang}: quiet`).toBe("quiet");
      expect(ids(f.setFind("免打扰"))[0], `${lang}: 免打扰`).toBe("quiet");
      expect(ids(f.setFind("安静"))[0], `${lang}: 安静`).toBe("quiet");
      expect(ids(f.setFind("Telegram"))[0], `${lang}: Telegram`).toBe("telegram");
      expect(ids(f.setFind("telegram"))[0], `${lang}: telegram`).toBe("telegram");
      expect(ids(f.setFind("深色")), `${lang}: 深色`).toContain("theme");
      expect(ids(f.setFind("dark"))[0], `${lang}: dark`).toBe("theme");
    }
  });

  test("true synonyms: 勿扰, dnd, do not disturb, 推理, budget words", async () => {
    const { f } = await boot("en");
    expect(ids(f.setFind("勿扰"))[0]).toBe("quiet");
    expect(ids(f.setFind("dnd"))[0]).toBe("quiet");
    expect(ids(f.setFind("do not disturb"))[0]).toBe("quiet");
    expect(ids(f.setFind("推理"))[0]).toBe("effort");
    expect(ids(f.setFind("quota"))[0]).toBe("handoff");
    expect(ids(f.setFind("飞书"))[0]).toBe("feishu");
    expect(ids(f.setFind("wechat"))[0]).toBe("wechat");
  });

  test("a pane's name finds what lives there, its own title first", async () => {
    const { f } = await boot("zh");
    const hits = ids(f.setFind("通知"));
    expect(hits[0]).toBe("notify");
    for (const id of ["quiet", "proactive", "wait"]) expect(hits).toContain(id);
  });

  test("forgives one slip in a longer Latin word, finds nothing for nonsense", async () => {
    const { f } = await boot("en");
    expect(ids(f.setFind("telgram"))[0]).toBe("telegram");
    expect(f.setFind("xyzzyq")).toEqual([]);
    expect(f.setFind("   ")).toEqual([]);
  });

  test("a row says the setting's words, its pane apart, and its value", async () => {
    const { f } = await boot("zh");
    const q = f.SET_INDEX.find((e) => e.id === "quiet")!;
    expect(f.entryTitle(q)).toBe("免打扰");
    expect(f.entryPane(q)).toBe("通知");
    expect(q.value!()).toBe("23:00 到 08:00");
    const w = f.SET_INDEX.find((e) => e.id === "wait")!;
    expect(w.value!()).toBe(TABLES.zh["partner.default.hour"]!.replace("%d", "1").replace("%s", "1"));
    const { f: g } = await boot("en");
    expect(g.entryPane(q)).toBe("Notifications");
    expect(q.value!()).toBe("23:00 to 08:00");
    expect(g.entryTitle(g.SET_INDEX.find((e) => e.id === "notify")!)).toBe("Notifications");
    expect(g.SET_INDEX.find((e) => e.id === "notify")!.value!()).toBe("On");
  });

  test("choosing one opens its pane, landing on the row's own words, then its group's heading", async () => {
    const { A, f } = await boot("zh");
    A.sheet = { kind: "settings", page: "" };
    f.jumpTo(f.SET_INDEX.find((e) => e.id === "quiet")!);
    expect(A.sheet).toEqual({ kind: "settings", page: "notify" });
    expect(f.SFState.land).toMatchObject({ id: "quiet", page: "notify", own: ["免打扰"], near: "什么时候找你" });
    f.jumpTo(f.SET_INDEX.find((e) => e.id === "telegram")!);
    expect(A.sheet).toEqual({ kind: "settings", page: "chats" });
    expect(f.SFState.land).toMatchObject({ page: "chats", own: ["telegram"] });
    f.SFState.land = undefined;
  });

  test("⌘K offers the settings the words name, before the places, never for a pane's name alone", async () => {
    const { A } = await boot("en");
    A.S.tasks.clear();
    const k = await import("../src/palette.tsx");
    k.resetPalette();
    const g = k.paletteGroups("quiet hours");
    const set = g.find((x) => x.key === "set");
    expect(set?.rows.map((r) => r.id)).toEqual(["set:quiet"]);
    expect(g.findIndex((x) => x.key === "set")).toBeLessThan(g.findIndex((x) => x.key === "on"));
    expect(k.paletteGroups("Accounts").find((x) => x.key === "set")).toBeUndefined();
  });
});

describe("the view (D663)", () => {
  const views = src("views.tsx");
  const view = src("setfind-view.tsx");
  const css = readFileSync(join(import.meta.dir, "../static/app.css"), "utf8");

  test("the field sits under Settings' title, and with words the found settings stand in place of the brief and the list", () => {
    const list = views.slice(views.indexOf('<h2>{t("settings.title")}</h2>'));
    expect(list.indexOf("<SetFindBox />")).toBeGreaterThan(0);
    expect(list.indexOf("<SetFindBox />")).toBeLessThan(list.indexOf("<SetBrief go={go} />"));
    expect(views).toContain("SF.q.trim() ? (");
    expect(views).toContain("<SetLanding page={page} />");
    // ⌘F in Settings.
    expect(views).toContain("setFindKey(e, go)");
  });

  test("only shared controls: the find field, the option rows, the button, the chevron", () => {
    expect(view).toContain("<FindField");
    expect(view).toContain("<OptionRow");
    expect(view).toContain("<Btn");
    expect(view).not.toMatch(/<input|<button/);
    expect(view).not.toMatch(/lang === "zh"|uiLang === "zh"/);
  });

  test("a landing respects reduced motion and never focuses a text field under a finger", () => {
    expect(view).toContain('behavior: still() ? "auto" : "smooth"');
    expect(view).toContain("coarse() && x.matches(");
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.sf-found \{\s*animation: none;/);
  });

  test("a found row is at least 44 tall and the field 44 under a finger", () => {
    expect(css).toMatch(/\.sf-list \.sf-row \{[^}]*min-height: 64px;/);
    expect(css).toMatch(/@media \(pointer: coarse\) \{\s*\.find-field \{\s*height: max\(44px, 2\.75rem\);/);
  });
});
