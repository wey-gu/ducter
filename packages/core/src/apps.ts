// D405: 小应用 / Apps, on the home (design/apps.md). Each app is a folder under apps/ in the data
// folder: meta.json, index.html (the partner's file as it is now), data.json (what the app keeps
// through ducter.set, the same on every device), and v<n>.html for the last few versions (改回去 /
// Undo the change). The partner makes and changes them (the app tool); clients open them (the
// document composed with its bridge, appDocument) and write their keys; an app's ask goes into
// the conversation as the person's message from that app, rate-limited here.
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import {
  APP_ASKS_PER_HOUR,
  APP_DATA_MAX,
  APP_HTML_MAX,
  APP_VERSIONS_KEPT,
  appDocument,
  appKeyOk,
  appName,
  APPS_MAX,
  type AppMeta,
  type AppOpen,
} from "@ducter/protocol";

export type AppChange = { kind: "list" } | { kind: "data"; id: string; key: string; value: unknown; by: "app" | "partner" };

export interface AppsStore {
  /** Newest change first, one partner's. */
  list(persona: string): AppMeta[];
  get(id: string): AppMeta | undefined;
  html(id: string): string | undefined;
  data(id: string): Record<string, unknown>;
  /** The document a client runs, with its data. */
  open(id: string, o: { transport: "message" | "fetch"; dark?: boolean; lang?: string }): AppOpen | undefined;
  make(persona: string, a: { name: string; html: string; ask?: string; note?: string }): { ok: true; app: AppMeta } | { ok: false; error: string };
  /** A new version: the whole file, or edits (each find must match exactly once). */
  change(id: string, c: { html?: string; edits?: { find: string; replace: string }[]; name?: string; note?: string }): { ok: true; app: AppMeta } | { ok: false; error: string };
  /** 改回去: the version before comes back as a new one. */
  back(id: string): { ok: true; app: AppMeta } | { ok: false; error: string };
  remove(id: string): boolean;
  /** A key written (null deletes); by the app on a device, or by the partner. */
  put(id: string, key: string, value: unknown, by: "app" | "partner"): { ok: true } | { ok: false; error: string };
  /**
   * The web's frame: a one-app capability (a random token, 30 minutes) for GET /app-frame/<token>,
   * since the page's own policy forbids inline scripts in a srcdoc frame.
   */
  frameToken(id: string, o: { dark?: boolean; lang?: string }): string | undefined;
  /** The document behind a frame token, composed now (its data as it is now). */
  frameDoc(token: string): string | undefined;
  /** Seen opened on a device now. */
  touch(id: string): void;
  /** An ask may go now (one waiting at a time; at most APP_ASKS_PER_HOUR an hour). */
  mayAsk(id: string): "ok" | "busy" | "limit" | "gone";
  asked(id: string, ref: string): void;
  answered(id: string, ref?: string): void;
  /** The ask still waiting, if any. */
  waiting(id: string): string | undefined;
  onChange(fn: (c: AppChange) => void): () => void;
}

const write = (path: string, text: string) => {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, text, { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, path);
};

export function openApps(o: { dataDir: string; now?: () => Date }): AppsStore {
  const now = o.now ?? (() => new Date());
  const root = join(o.dataDir, "apps");
  const metas = new Map<string, AppMeta>();
  const datas = new Map<string, Record<string, unknown>>();
  const asks = new Map<string, { waiting?: string; since?: number; times: number[] }>();
  const frames = new Map<string, { id: string; dark?: boolean; lang?: string; until: number }>();
  if (existsSync(root)) {
    for (const id of readdirSync(root)) {
      try {
        const m = JSON.parse(readFileSync(join(root, id, "meta.json"), "utf8")) as AppMeta;
        if (m && m.id === id && typeof m.name === "string" && existsSync(join(root, id, "index.html"))) metas.set(id, m);
      } catch (err) {
        console.warn(`[apps] ${id} is unreadable; left out:`, (err as Error).message);
      }
    }
  }
  const listeners = new Set<(c: AppChange) => void>();
  const emit = (c: AppChange) =>
    listeners.forEach((fn) => {
      try {
        fn(c);
      } catch (err) {
        console.warn("[apps] listener:", (err as Error).message);
      }
    });
  const dir = (id: string) => join(root, id);
  const saveMeta = (m: AppMeta) => write(join(dir(m.id), "meta.json"), JSON.stringify(m, null, 2) + "\n");
  const html = (id: string) => {
    try {
      return metas.has(id) ? readFileSync(join(dir(id), "index.html"), "utf8") : undefined;
    } catch {
      return undefined;
    }
  };
  const data = (id: string): Record<string, unknown> => {
    const had = datas.get(id);
    if (had) return had;
    let d: Record<string, unknown> = {};
    try {
      const raw = JSON.parse(readFileSync(join(dir(id), "data.json"), "utf8"));
      if (raw && typeof raw === "object" && !Array.isArray(raw)) d = raw as Record<string, unknown>;
    } catch {
      /* none yet */
    }
    datas.set(id, d);
    return d;
  };
  const sizeOk = (h: string) => (h.trim() ? (h.length <= APP_HTML_MAX ? undefined : `the file is ${h.length} characters; an app is at most ${APP_HTML_MAX}`) : "the file is empty");
  /** Keep the file it replaces as v<old version>.html; drop the oldest past APP_VERSIONS_KEPT. */
  const keepOld = (m: AppMeta) => {
    const cur = html(m.id);
    if (cur === undefined) return;
    write(join(dir(m.id), `v${m.version}.html`), cur);
    const vs = readdirSync(dir(m.id))
      .map((f) => /^v(\d+)\.html$/.exec(f))
      .filter((x): x is RegExpExecArray => !!x)
      .map((x) => Number(x[1]))
      .sort((a, b) => a - b);
    for (const v of vs.slice(0, Math.max(0, vs.length - APP_VERSIONS_KEPT))) rmSync(join(dir(m.id), `v${v}.html`), { force: true });
  };
  const olds = (id: string) =>
    existsSync(dir(id))
      ? readdirSync(dir(id))
          .map((f) => /^v(\d+)\.html$/.exec(f))
          .filter((x): x is RegExpExecArray => !!x)
          .map((x) => Number(x[1]))
          .sort((a, b) => b - a)
      : [];
  const store: AppsStore = {
    list: (persona) => [...metas.values()].filter((m) => m.persona === persona).sort((a, b) => b.updated.localeCompare(a.updated)),
    get: (id) => metas.get(id),
    html,
    data: (id) => (metas.has(id) ? data(id) : {}),
    open(id, t) {
      const m = metas.get(id);
      const h = html(id);
      if (!m || h === undefined) return undefined;
      const d = data(id);
      return { ...m, doc: appDocument({ id, name: m.name, html: h, data: d }, t), data: d };
    },
    make(persona, a) {
      const name = appName(a.name);
      if (!name) return { ok: false, error: "an app needs a short name" };
      const bad = sizeOk(a.html);
      if (bad) return { ok: false, error: bad };
      if ([...metas.values()].filter((m) => m.persona === persona).length >= APPS_MAX) return { ok: false, error: `the user has ${APPS_MAX} apps already; change one of them instead` };
      let id = "";
      do id = "a" + randomBytes(5).toString("hex").slice(0, 8);
      while (metas.has(id));
      mkdirSync(dir(id), { recursive: true, mode: 0o700 });
      const at = now().toISOString();
      const m: AppMeta = { id, name, persona, made: at, updated: at, version: 1, size: a.html.length, ...(a.ask ? { ask: a.ask.slice(0, 300) } : {}), ...(a.note ? { note: a.note.slice(0, 120) } : {}) };
      write(join(dir(id), "index.html"), a.html);
      metas.set(id, m);
      saveMeta(m);
      emit({ kind: "list" });
      return { ok: true, app: m };
    },
    change(id, c) {
      const m = metas.get(id);
      const cur = html(id);
      if (!m || cur === undefined) return { ok: false, error: "no such app: use an id from [apps]" };
      let next = c.html;
      if (next === undefined && c.edits?.length) {
        next = cur;
        for (const [i, e] of c.edits.entries()) {
          if (typeof e?.find !== "string" || !e.find) return { ok: false, error: `edit ${i + 1}: find is empty` };
          const at = next.indexOf(e.find);
          if (at < 0) return { ok: false, error: `edit ${i + 1}: find not in the file (read it with read: true, and copy the text exactly)` };
          if (next.indexOf(e.find, at + 1) >= 0) return { ok: false, error: `edit ${i + 1}: find matches more than once; include more of the text around it` };
          next = next.slice(0, at) + String(e.replace ?? "") + next.slice(at + e.find.length);
        }
      }
      const name = c.name !== undefined ? appName(c.name) : m.name;
      if (next === undefined) {
        if (name === m.name || !name) return { ok: false, error: "nothing to change: give html, edits or a new name" };
        Object.assign(m, { name, updated: now().toISOString() });
        saveMeta(m);
        emit({ kind: "list" });
        return { ok: true, app: m };
      }
      const bad = sizeOk(next);
      if (bad) return { ok: false, error: bad };
      keepOld(m);
      write(join(dir(id), "index.html"), next);
      Object.assign(m, { name: name || m.name, updated: now().toISOString(), version: m.version + 1, size: next.length, back: true as const });
      if (c.note) m.note = c.note.slice(0, 120);
      else delete m.note;
      saveMeta(m);
      emit({ kind: "list" });
      return { ok: true, app: m };
    },
    back(id) {
      const m = metas.get(id);
      if (!m) return { ok: false, error: "gone" };
      const v = olds(id)[0];
      if (v === undefined) return { ok: false, error: "nothing to go back to" };
      const prev = readFileSync(join(dir(id), `v${v}.html`), "utf8");
      rmSync(join(dir(id), `v${v}.html`), { force: true });
      write(join(dir(id), "index.html"), prev);
      Object.assign(m, { updated: now().toISOString(), version: m.version + 1, size: prev.length });
      delete m.note;
      if (olds(id).length) m.back = true;
      else delete m.back;
      saveMeta(m);
      emit({ kind: "list" });
      return { ok: true, app: m };
    },
    remove(id) {
      if (!metas.delete(id)) return false;
      datas.delete(id);
      asks.delete(id);
      rmSync(dir(id), { recursive: true, force: true });
      emit({ kind: "list" });
      return true;
    },
    put(id, key, value, by) {
      if (!metas.has(id)) return { ok: false, error: "gone" };
      if (!appKeyOk(key)) return { ok: false, error: "a key is 1–64 printable characters" };
      const d = data(id);
      const prev = d[key];
      if (value === null || value === undefined) delete d[key];
      else d[key] = value;
      const s = JSON.stringify(d);
      if (s.length > APP_DATA_MAX) {
        if (prev === undefined) delete d[key];
        else d[key] = prev;
        return { ok: false, error: `the app's data would be over ${APP_DATA_MAX} characters` };
      }
      write(join(dir(id), "data.json"), s);
      emit({ kind: "data", id, key, value: value ?? null, by });
      return { ok: true };
    },
    frameToken(id, f) {
      if (!metas.has(id)) return undefined;
      const t = now().getTime();
      for (const [k, v] of frames) if (v.until < t) frames.delete(k);
      const token = randomBytes(18).toString("base64url");
      frames.set(token, { id, ...(f.dark ? { dark: true } : {}), ...(f.lang ? { lang: f.lang } : {}), until: t + 30 * 60_000 });
      return token;
    },
    frameDoc(token) {
      const f = frames.get(token);
      if (!f || f.until < now().getTime()) return undefined;
      return store.open(f.id, { transport: "message", ...(f.dark ? { dark: true } : {}), ...(f.lang ? { lang: f.lang } : {}) })?.doc;
    },
    touch(id) {
      const m = metas.get(id);
      if (!m) return;
      m.opened = now().toISOString();
      saveMeta(m);
    },
    mayAsk(id) {
      if (!metas.has(id)) return "gone";
      const a = asks.get(id);
      const t = now().getTime();
      // A wait the partner never answered stops holding the app after 5 minutes.
      if (a?.waiting && t - (a.since ?? 0) < 5 * 60_000) return "busy";
      if (a && a.times.filter((x) => t - x < 3600_000).length >= APP_ASKS_PER_HOUR) return "limit";
      return "ok";
    },
    asked(id, ref) {
      const t = now().getTime();
      const a = asks.get(id) ?? { times: [] };
      a.times = [...a.times.filter((x) => t - x < 3600_000), t];
      a.waiting = ref;
      a.since = t;
      asks.set(id, a);
    },
    answered(id, ref) {
      const a = asks.get(id);
      if (a && (!ref || a.waiting === ref)) delete a.waiting;
    },
    waiting: (id) => asks.get(id)?.waiting,
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  return store;
}
