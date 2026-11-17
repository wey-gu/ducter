// D344: after Ducter updates, the partner says so once, the first time the person is back: one
// line in the conversation with the release's two what's-new lines and a link to its full notes
// ("更新到 0.0.72 了：…。看看都改了什么"). Once per version per person, never twice; not at all when
// the person opened that version's notes from an update card the same day (they've read it).
//
// What counts as an update: this home starting on a newer version than it last ran (its own
// update, or the Mac app's, which carries the home), or an app the person uses (the Android app,
// a Mac app on another computer) saying in its hello that it now runs a newer version than it did.
// A fresh install says nothing. The notes come from the CHANGELOG built into this Ducter, else
// from the latest release the home read; none: the line says only the version and the link.
//
// State: <dataDir>/updates/told.json.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bareVersion, changelogUrl, compareVersions, isVersion } from "@ducter/protocol/src/version.ts";
import { fill, words, type LangTag } from "@ducter/protocol";
import changelogText from "../../../CHANGELOG.md" with { type: "text" };
import { whatsNew, type ReleaseNotes } from "./release.ts";

interface Told {
  /** The version this home last ran. */
  ran?: string;
  /** An update not said yet. */
  pending?: string;
  /** Versions said (or skipped because the person read them), oldest first. */
  told: string[];
  /** When the person opened a version's notes from a card: the day, in their zone (YYYY-MM-DD). */
  seen: Record<string, string>;
  /** The version each app last said it runs, by device. */
  apps: Record<string, string>;
}

export interface UpdatedLine {
  /** An app said in its hello that it runs v (key: its device). */
  sawApp(key: string, v: string | undefined): void;
  /** The person opened v's notes from an update card. */
  sawNotes(v: string, tz?: string): void;
  /** The person is back: the line to say now, once, in their language (undefined: nothing to say). */
  due(o: { lang: LangTag; tz?: string }): string | undefined;
  /** The update waiting to be said, if any. */
  pending(): string | undefined;
}

/** A version's what's-new lines from a CHANGELOG ("## 0.0.72 - 2026-11-17" sections). */
export function notesIn(changelog: string, v: string): ReleaseNotes {
  for (const s of changelog.split(/^## /m).slice(1)) {
    const head = (s.split("\n")[0] ?? "").trim().split(/\s+/)[0]!.replace(/^\[|\]$/g, "");
    if (bareVersion(head) === bareVersion(v)) return whatsNew(s);
  }
  return {};
}

const dayIn = (d: Date, tz?: string): string => {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz || undefined, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
};

const trimEnd = (l: string) => l.replace(/[。．.！!；;，,\s]+$/u, "");

/** The line itself: one message, glossary words, the notes in the person's language only. */
const WORDS = {
  zh: { notes: "更新到 {v} 了：{lines}。{link}", bare: "更新到 {v} 了。{link}", join: "；", link: "看看都改了什么" },
  en: { notes: "Updated to {v}: {lines}. {link}", bare: "Updated to {v}. {link}", join: "; ", link: "See what changed" },
};

export function updatedWords(v: string, notes: ReleaseNotes, lang: LangTag): string {
  const w = words(WORDS, lang);
  // The lines in the language the words are in, never the other one's (D172).
  const lines = words({ en: notes.en || [], zh: notes.zh || [] }, lang);
  const link = `[${w.link}](${changelogUrl(v)})`;
  return fill(lines.length ? w.notes : w.bare, { v, lines: lines.map(trimEnd).join(w.join), link });
}

export function createUpdatedLine(o: {
  dataDir: string;
  version: string;
  /** Someone has used this home before (a fresh install has nothing to say). */
  existing: () => boolean;
  /** Notes the home read for a release (the latest), when the built-in CHANGELOG has none. */
  released?: (v: string) => ReleaseNotes | undefined;
  changelog?: string;
  now?: () => Date;
}): UpdatedLine {
  const file = join(o.dataDir, "updates", "told.json");
  const now = o.now ?? (() => new Date());
  const changelog = o.changelog ?? changelogText;
  let st: Told = { told: [], seen: {}, apps: {} };
  let had = false;
  try {
    if (existsSync(file)) {
      const j = JSON.parse(readFileSync(file, "utf8"));
      st = { told: Array.isArray(j.told) ? j.told.filter(isVersion) : [], seen: j.seen && typeof j.seen === "object" ? j.seen : {}, apps: j.apps && typeof j.apps === "object" ? j.apps : {}, ...(isVersion(j.ran) ? { ran: j.ran } : {}), ...(isVersion(j.pending) ? { pending: j.pending } : {}) };
      had = true;
    }
  } catch {}

  const save = () => {
    try {
      mkdirSync(join(o.dataDir, "updates"), { recursive: true });
      writeFileSync(file + ".tmp", JSON.stringify(st, null, 2));
      renameSync(file + ".tmp", file);
    } catch (err) {
      console.warn("[updated] could not save:", (err as Error).message);
    }
  };

  const newest = () => st.told.reduce<string | undefined>((m, v) => (!m || compareVersions(v, m) > 0 ? v : m), undefined);
  /** v is news: never said, and newer than everything said. */
  const news = (v: string) => !st.told.includes(v) && (!newest() || compareVersions(v, newest()!) > 0);
  const want = (v: string) => {
    if (!news(v)) return;
    if (!st.pending || compareVersions(v, st.pending) > 0) st.pending = v;
  };
  const tell = (v: string) => {
    if (!st.told.includes(v)) st.told.push(v);
    st.told = st.told.slice(-20);
    if (st.pending && compareVersions(st.pending, v) <= 0) delete st.pending;
    for (const k of Object.keys(st.seen)) if (compareVersions(k, v) < 0) delete st.seen[k];
  };

  // This home: newer than it last ran is an update. No record yet: an update only when someone
  // used this home before (the first Ducter with this file, updated from one without it).
  const v = bareVersion(o.version);
  if (isVersion(v)) {
    if (st.ran ? compareVersions(v, st.ran) > 0 : !had && o.existing()) want(v);
    if (st.ran !== v) {
      st.ran = v;
      save();
    }
  }

  return {
    sawApp(key, raw) {
      const av = raw ? bareVersion(raw) : "";
      if (!key || !isVersion(av)) return;
      const prev = st.apps[key];
      if (prev === av) return;
      st.apps[key] = av;
      if (prev && compareVersions(av, prev) > 0) want(av);
      save();
    },
    sawNotes(raw, tz) {
      const nv = bareVersion(raw);
      if (!isVersion(nv)) return;
      st.seen[nv] = dayIn(now(), tz);
      save();
    },
    due({ lang, tz }) {
      const p = st.pending;
      if (!p) return;
      if (!news(p)) {
        delete st.pending;
        save();
        return;
      }
      const read = st.seen[p] === dayIn(now(), tz);
      tell(p);
      save();
      if (read) return;
      let notes = notesIn(changelog, p);
      if (!notes.zh?.length && !notes.en?.length) notes = o.released?.(p) ?? {};
      return updatedWords(p, notes, lang);
    },
    pending: () => st.pending,
  };
}
