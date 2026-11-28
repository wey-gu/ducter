// D663: 找设置 / Find a setting. The index of what can be set, built from the panes' own words: each
// entry names the pane it lives in (set-sections.ts) and the i18n key that pane draws as the
// setting's title (or a brand the pane draws as itself: Telegram, GitHub), never a copy of the
// words. apps/web/test/setfind.test.ts fails when an entry's key is no longer in its pane's source,
// when a pane has no entry, or when a pane's switch or row is neither indexed nor named as not a
// setting. The match reads both languages whatever the screens speak (安静 or quiet), the
// synonyms in i18n-setfind.ts, and the pane's own name; it is deterministic and instant (D391's
// rule for finding: never a model). The Mac's twin is views/setfind.go.
import type { SettingsPage } from "./app.ts";
import { A } from "./app.ts";
import { autonym } from "@ducter/protocol/src/lang.ts";
import { looseMatch } from "@ducter/protocol/src/fuzzy.ts";
import { TABLES } from "./i18n.ts";
import { SECTIONS, sectionKey } from "./set-sections.ts";
import { homeThinks } from "./settings-home.tsx";
import { savedDensity, savedPaper } from "./settings-more.tsx";
import { peersPageShown } from "./memory.tsx";

type Page = Exclude<SettingsPage, "">;

/** One setting: where it lives, the words its pane draws for it, and what it is set to now. */
export type SetEntry = {
  id: string;
  page: Page;
  /** The pane's own title key for the setting; its first key is the words shown. */
  key?: string;
  /** Other title keys the pane may draw for the same setting (a first-time or many-partner title). */
  alt?: string[];
  /** A name the pane draws as itself in every language (Telegram, GitHub). */
  brand?: string;
  /** The brand's name comes from the home's own list (an import source), not the pane's source. */
  brandFrom?: "home";
  /** The group heading over it, landed on when the row itself isn't drawn (quiet hours with notifications off). */
  near?: string;
  /** The title's arguments (the partner's name). */
  args?: () => unknown[];
  /** What it is set to now, in the screens' language; "" when it has no one value. */
  value?: () => string;
};

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);
const onOff = (v: boolean | undefined) => t(v ? "setfind.on" : "setfind.off");
const S = () => A.settings;
const waitWords = (m: number) => (m < 60 ? t("partner.default.min", m) : t("partner.default.hour", m / 60));
const name = () => [A.speakerFor().name];

/** Every setting a person may come looking for, pane by pane in the list's order. */
export const SET_INDEX: SetEntry[] = [
  // 伙伴 / Partner
  { id: "name", page: "partner", key: "partner.rename", value: () => A.speakerFor().name },
  { id: "thinks", page: "partner", key: "loadout.brain.title", alt: ["loadout.brain.title.default"], value: () => homeThinks() },
  { id: "model", page: "partner", key: "loadout.brain.model", near: "loadout.brain.title" },
  { id: "effort", page: "partner", key: "newtask.effort", near: "loadout.brain.title" },
  { id: "tasks", page: "partner", key: "loadout.tasks.title" },
  { id: "newtasks", page: "partner", key: "newtasks.title" },
  { id: "add", page: "partner", key: "loadout.add.title", alt: ["loadout.add.title.first"] },
  { id: "key", page: "partner", key: "key.settings.row", near: "loadout.add.title" },
  { id: "handoff", page: "partner", key: "handoff.row", near: "handoff.title", value: () => (S() ? onOff(S()!.limitHandoff) : "") },
  { id: "talk", page: "partner", key: "settings.talk.row", near: "partner.talk.title", value: () => (!S() ? "" : S()!.language === "auto" ? t("partner.talk.auto") : autonym(S()!.language)) },
  { id: "records", page: "partner", key: "records.look", near: "records.title" },
  { id: "trust", page: "partner", key: "partner.trust.title" },
  { id: "partners", page: "partner", key: "partners.add", alt: ["partners.title"] },
  // 记忆 / Memory
  { id: "memory", page: "memory", key: "partner.memory.switch", value: () => (S() ? onOff(!!S()!.memory) : "") },
  { id: "about", page: "memory", key: "mem.about.title" },
  { id: "rules", page: "memory", key: "mem.rules.title" },
  // Agent 通信 / Agent messaging
  { id: "peers", page: "peers", key: "peers.switch.title", args: name },
  { id: "peerrules", page: "peers", key: "peers.rules.title" },
  // 通知 / Notifications
  { id: "notify", page: "notify", key: "partner.notify.on", value: () => (S() ? onOff(S()!.notify) : "") },
  {
    id: "quiet",
    page: "notify",
    key: "partner.quiet",
    near: "partner.notify.title",
    value: () => {
      const s = S();
      if (!s) return "";
      return s.notify && s.quiet ? t("setfind.range", s.quiet.start, s.quiet.end) : onOff(false);
    },
  },
  { id: "proactive", page: "notify", key: "proactive.title", near: "proactive.group", value: () => (S()?.proactive ? t(`proactive.${S()!.proactive}`) : "") },
  { id: "wait", page: "notify", key: "partner.default.line", near: "partner.default.title", value: () => (S() ? waitWords(S()!.defaultAfterMin) : "") },
  // 账号 / Accounts
  { id: "read", page: "accounts", key: "acct.sec.read" },
  { id: "calls", page: "accounts", key: "acct.sec.calls" },
  { id: "own", page: "accounts", key: "own.title", near: "acct.sec.calls" },
  // 待办来源 / To-do sources
  { id: "github", page: "todos", brand: "GitHub" },
  { id: "obsidian", page: "todos", brand: "Obsidian" },
  // 导入 / Import
  { id: "lody", page: "import", brand: "Lody", brandFrom: "home" },
  // 聊天软件 / Chat apps
  { id: "telegram", page: "chats", brand: "Telegram" },
  { id: "slack", page: "chats", brand: "Slack" },
  { id: "feishu", page: "chats", key: "chats.feishu" },
  { id: "wechat", page: "chats", key: "chats.wechat" },
  { id: "imessage", page: "chats", brand: "iMessage" },
  // 密码和银行卡 / Passwords & cards
  { id: "signins", page: "autofill", key: "af.signins" },
  { id: "cards", page: "autofill", key: "af.cards" },
  { id: "details", page: "autofill", key: "af.details" },
  { id: "keys", page: "autofill", key: "af.keys.ask", near: "af.keys", value: () => (A.saved ? onOff(A.saved.askKeys !== false) : "") },
  { id: "uses", page: "autofill", key: "af.uses" },
  // 你的设备 / Your devices
  { id: "autoupdate", page: "devices", key: "settings.versions.night", near: "settings.versions.title", value: () => (S() ? onOff(!!S()!.autoUpdate) : "") },
  { id: "versions", page: "devices", key: "settings.versions.title" },
  { id: "folder", page: "devices", key: "settings.folder.row" },
  // 这台手机 / This phone
  { id: "theme", page: "phone", key: "settings.look.mode", value: () => t(`settings.look.mode.${savedPaper()}`) },
  { id: "density", page: "phone", key: "density.title", value: () => t(`density.${savedDensity()}`) },
  { id: "uilang", page: "phone", key: "settings.lang.title", value: () => t(`settings.lang.${A.uiLang}`) },
  { id: "details2", page: "phone", key: "settings.details.title", value: () => t(`settings.details.${A.details}`) },
  { id: "readback", page: "phone", key: "voice.settings.readback" },
];

// ---------- matching ----------

const ZW = /[​⁠­]/g;
/** Words as compared: NFKC, lower case, no zero-width joins, a printf verb as a gap. */
export const norm = (s: string) => s.normalize("NFKC").toLowerCase().replace(ZW, "").replace(/%(\[\d+\])?[sd]/g, " ").trim();
const han = (s: string) => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(s);
const compact = (s: string) => s.replace(/[\s\p{P}\p{S}]/gu, "");
const wordsOf = (s: string) => s.split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** How well one typed term matches a field: 2 a word starts with it (or, in Chinese, it is in it), 1 a loose match, 0 none. */
function termIn(term: string, field: string): number {
  if (!field) return 0;
  if (han(term)) return compact(field).includes(compact(term)) ? 2 : 0;
  const ws = wordsOf(field);
  if (ws.some((w) => w.startsWith(term))) return 2;
  if (term.length >= 3 && compact(field).includes(compact(term))) return 2;
  // D456's forgiveness: a Latin word of five letters or more, one slip off.
  if (term.length >= 5 && ws.some((w) => looseMatch(term, w, field))) return 1;
  return 0;
}

/** The words the entry is found by, in both languages: its titles (weight 3), synonyms (2), its pane's name (1). */
function fieldsOf(e: SetEntry): { text: string; w: number }[] {
  const out: { text: string; w: number }[] = [];
  const sec = SECTIONS.find((s) => s.page === e.page)!;
  for (const lang of ["zh", "en"] as const) {
    const tb = TABLES[lang];
    if (e.brand) out.push({ text: norm(e.brand), w: 3 });
    for (const k of [e.key, ...(e.alt ?? [])]) if (k && tb[k]) out.push({ text: norm(tb[k]!), w: 3 });
    const syn = tb[`setfind.syn.${e.id}`];
    if (syn) for (const s of syn.split(/[、,，]/)) if (s.trim()) out.push({ text: norm(s), w: 2 });
    const pane = tb[sectionKey(sec)] ?? "";
    if (pane) out.push({ text: norm(pane), w: 1 });
    // A pane's long name too (和你的其他 agent 通信 as well as Agent 通信).
    if (sec.title !== sectionKey(sec) && tb[sec.title]) out.push({ text: norm(tb[sec.title]!), w: 1 });
  }
  return out;
}

/** The words a setting goes by on screen now. */
export const entryTitle = (e: SetEntry) => (e.brand ? e.brand : t(e.key!, ...(e.args?.() ?? [])));

/** The pane's name as the list says it. */
export const entryPane = (e: SetEntry) => t(sectionKey(SECTIONS.find((s) => s.page === e.page)!));

/** A pane shown in the list now (Agent messaging only once it means something, D257). */
const paneShown = (p: Page) => p !== "peers" || peersPageShown();

/** A found setting: its score, and whether every word named it (a title or a synonym, not only its pane). */
export type SetHit = { e: SetEntry; score: number; named: boolean };

/** The settings the words find, best first: every term somewhere, a title before a synonym before a pane's name, then the list's order. */
export function setFind(q: string, index: SetEntry[] = SET_INDEX): SetHit[] {
  const terms = norm(q).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const out: SetHit[] = [];
  index.forEach((e, i) => {
    if (!paneShown(e.page)) return;
    const fields = fieldsOf(e);
    let score = 0;
    let named = true;
    for (const term of terms) {
      let best = 0;
      let byName = false;
      for (const f of fields) {
        const s = termIn(term, f.text) * f.w;
        if (s > best) best = s;
        if (s && f.w > 1) byName = true;
      }
      if (!best) return;
      score += best;
      named &&= byName;
    }
    // The words as typed starting the title shown leads (免打扰 for 免).
    if (norm(entryTitle(e)).startsWith(norm(q))) score += 2;
    out.push({ e, score: score * 1000 - i, named });
  });
  return out.sort((a, b) => b.score - a.score);
}

// ---------- the jump ----------

/** Where a jump is landing: the pane, the words its row draws, and its group's heading. */
export type Landing = { id: string; page: Page; own: string[]; near?: string; at: number };

export const SFState: { land?: Landing } = {};

/** The words a found setting's row draws (any of its titles), as compared. */
export function landingTexts(e: SetEntry): string[] {
  const out: string[] = [];
  if (e.brand) out.push(e.brand);
  for (const k of [e.key, ...(e.alt ?? [])]) if (k) out.push(t(k, ...(e.args?.() ?? [])));
  return out.map(norm).filter(Boolean);
}

/** Choosing a found setting: its pane opens, landing on the row. */
export function jumpTo(e: SetEntry) {
  SFState.land = { id: e.id, page: e.page, own: landingTexts(e), ...(e.near ? { near: norm(t(e.near)) } : {}), at: Date.now() };
  A.sheet = { kind: "settings", page: e.page };
  A.changed();
}
