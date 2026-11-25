// D405: 小应用 / Apps, on the home (design/apps.md). Each app is a folder under apps/ in the data
// folder: meta.json, index.html (the partner's file as it is now), data.json (what the app keeps
// through ducter.set, the same on every device), and v<n>.html for the last few versions (改回去 /
// Undo the change). The partner makes and changes them (the app tool); clients open them (the
// document composed with its bridge, appDocument) and write their keys; an app's ask goes into
// the conversation as the person's message from that app, rate-limited here.
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  APP_ASKS_PER_HOUR,
  APP_DATA_MAX,
  APP_HTML_MAX,
  APP_TASK_KEYS_PER_CALL,
  APP_TASK_WRITES_PER_HOUR,
  APP_REMOVED_DAYS,
  APP_VERSIONS_KEPT,
  appDocument,
  appKitIssues,
  appLiftItems,
  appRowsInMarkup,
  type AppLive,
  appSummary,
  appTint,
  type AppIcon,
  type AppTint,
  appKeyOk,
  appName,
  APPS_MAX,
  type AppMeta,
  type AppTask,
  type AppOpen,
} from "@ducter/protocol";

export type AppChange = { kind: "list" } | { kind: "data"; id: string; key: string; value: unknown; by: "app" | "partner" | "task" } | { kind: "give"; id: string; task?: AppTask };

export interface AppsStore {
  /** Newest change first, one partner's. */
  list(persona: string): AppMeta[];
  get(id: string): AppMeta | undefined;
  html(id: string): string | undefined;
  data(id: string): Record<string, unknown>;
  /** The document a client runs, with its data. */
  open(id: string, o: { transport: "message" | "fetch"; dark?: boolean; lang?: string }): AppOpen | undefined;
  make(persona: string, a: { name: string; html: string; ask?: string; note?: string; task?: AppTask; kind?: AppMeta["kind"]; data?: Record<string, unknown>; summary?: string; icon?: AppIcon; tint?: AppTint }): { ok: true; app: AppMeta; lifted?: string[] } | { ok: false; error: string };
  /** D410: the shelf's 「⋯」: a new name, pinned or not, no task keeping it current any more. */
  set(id: string, c: { name?: string; pinned?: boolean; untask?: boolean; icon?: AppIcon }): { ok: true; app: AppMeta } | { ok: false; error: string };
  /** D410: the app's own line for its tile (ducter.summary, or the partner's). */
  summarize(id: string, text: string): boolean;
  /** D410: a deleted app comes back (within APP_REMOVED_DAYS), its data with it. */
  restore(id: string): { ok: true; app: AppMeta } | { ok: false; error: string };
  /** D410: deleted and still restorable. */
  removed(id: string): AppMeta | undefined;
  /** D407: the routine task that keeps this app current (undefined: none any more). */
  give(id: string, task: AppTask | undefined): boolean;
  /** D407: the apps a task fills. */
  byTask(taskId: string): AppMeta[];
  /**
   * D407: a task's round written into an app it fills (app_data): keys set (null removes) in one
   * write, validated, capped (APP_TASK_KEYS_PER_CALL keys, APP_DATA_MAX in all) and rate-limited
   * (APP_TASK_WRITES_PER_HOUR an hour per app). Data only: a task never touches the file.
   */
  fill(id: string, taskId: string, set: Record<string, unknown>): { ok: true; keys: string[] } | { ok: false; error: string };
  /** D407: Ducter offered once to keep this task's rounds on a board (never asked twice). */
  offered(taskId: string): boolean;
  markOffered(taskId: string): void;
  /** A new version: the whole file, or edits (each find must match exactly once). */
  change(id: string, c: { html?: string; edits?: { find: string; replace: string }[]; name?: string; note?: string }): { ok: true; app: AppMeta; lifted?: string[] } | { ok: false; error: string };
  /** 改回去: the version before comes back as a new one. */
  back(id: string): { ok: true; app: AppMeta } | { ok: false; error: string };
  remove(id: string): boolean;
  /** A key written (null deletes); by the app on a device, or by the partner. */
  put(id: string, key: string, value: unknown, by: "app" | "partner" | "task"): { ok: true } | { ok: false; error: string };
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
  /** D422: its page threw on this version: kept until the next version, shown with a fix. */
  broke(id: string, version: number, text: string): boolean;
  /** D422: the person asked for a change and the partner hasn't answered yet (on), or it answered (off). */
  changing(id: string, on: boolean): void;
  /** D422: every app being changed now goes back to plain (the partner answered). */
  answeredAll(): void;
  /** D422: how a repeating task keeps an app current (from Ongoing); core wires it once Ongoing exists. */
  keptBy(fn: (taskId: string) => AppLive["kept"] | undefined): void;
  /** D422: Ongoing moved: the list goes out again when an app is kept by a task. */
  liveMoved(): void;
  onChange(fn: (c: AppChange) => void): () => void;
  /**
   * D562: the key in an app's icon and Home Screen paths (`/app-icon/<id>/<key>/…`): a keyed hash of
   * its id with this home's own secret, so a Home Screen or Dock icon keeps working and nobody guesses
   * another app's name from its id. Undefined for an app that isn't there.
   */
  iconKey(id: string): string | undefined;
  /** D562: the app behind an icon path, when its key is right. */
  byIconKey(id: string, key: string): AppMeta | undefined;
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
  const fills = new Map<string, number[]>();
  const offersPath = join(o.dataDir, "app-offers.json");
  let offers: Record<string, string> = {};
  try {
    const raw = JSON.parse(readFileSync(offersPath, "utf8"));
    if (raw && typeof raw === "object" && !Array.isArray(raw)) offers = raw as Record<string, string>;
  } catch {
    /* none yet */
  }
  if (existsSync(root)) {
    for (const id of readdirSync(root)) {
      if (id.startsWith(".")) continue;
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
  /** D431: lifted items written into an app's data at once (every device with it open hears each key). */
  const putAll = (id: string, d: Record<string, unknown>, keys: string[]) => {
    datas.set(id, d);
    write(join(dir(id), "data.json"), JSON.stringify(d));
    for (const k of keys) emit({ kind: "data", id, key: k, value: d[k] ?? null, by: "partner" });
  };
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
  // D410: deleted apps wait in apps/.removed/<id>/ (meta with removedAt) for APP_REMOVED_DAYS.
  const bin = join(root, ".removed");
  const removedMeta = (id: string): (AppMeta & { removedAt?: string }) | undefined => {
    if (!/^a[0-9a-f]{1,15}$/.test(id)) return undefined;
    try {
      const m = JSON.parse(readFileSync(join(bin, id, "meta.json"), "utf8")) as AppMeta & { removedAt?: string };
      if (!m || m.id !== id) return undefined;
      if (m.removedAt && now().getTime() - Date.parse(m.removedAt) > APP_REMOVED_DAYS * 86_400_000) {
        rmSync(join(bin, id), { recursive: true, force: true });
        return undefined;
      }
      return m;
    } catch {
      return undefined;
    }
  };
  if (existsSync(bin)) for (const id of readdirSync(bin)) removedMeta(id);
  // D422: what each app is doing now, worked out on every list from one truth each: Ongoing for the
  // task that keeps it, the person's words not yet answered, its own page, its file's look.
  const changing = new Map<string, number>();
  const looks = new Map<string, { version: number; old: boolean; rows: number }>();
  let kept: (taskId: string) => AppLive["kept"] | undefined = () => undefined;
  const liveOf = (m: AppMeta): AppLive | undefined => {
    const l: AppLive = {};
    const k = m.task ? kept(m.task.id) : undefined;
    if (k) l.kept = k;
    const since = changing.get(m.id);
    // A change nobody answered stops showing after 10 minutes (the partner failed quietly).
    if (since !== undefined && now().getTime() - since < 10 * 60_000) l.changing = { since: new Date(since).toISOString() };
    if (m.broke && m.broke.version === m.version) l.broke = { text: m.broke.text };
    let look = looks.get(m.id);
    if (!look || look.version !== m.version) {
      const h = html(m.id) ?? "";
      look = { version: m.version, old: !m.kind && appKitIssues(h).length > 0, rows: m.kind ? 0 : appRowsInMarkup(h) };
      looks.set(m.id, look);
    }
    if (look.old) l.old = true;
    if (look.rows >= 2) l.inFile = look.rows;
    return Object.keys(l).length ? l : undefined;
  };
  // D562: this home's secret for icon paths, made once and kept beside the apps.
  let iconSecret: Buffer | undefined;
  const secret = () => {
    if (iconSecret) return iconSecret;
    const p = join(root, ".icon-key");
    try {
      const kept = Buffer.from(readFileSync(p, "utf8").trim(), "hex");
      if (kept.length >= 16) return (iconSecret = kept);
    } catch {
      /* none yet */
    }
    mkdirSync(root, { recursive: true });
    iconSecret = randomBytes(32);
    write(p, iconSecret.toString("hex"));
    return iconSecret;
  };
  const keyOf = (id: string) => createHmac("sha256", secret()).update(`app-icon:${id}`).digest("base64url").slice(0, 22);
  const store: AppsStore = {
    list: (persona) =>
      [...metas.values()]
        .filter((m) => m.persona === persona)
        .sort((a, b) => b.updated.localeCompare(a.updated))
        .map((m) => {
          const live = liveOf(m);
          return { ...m, ...(live ? { live } : {}), home: `/app-icon/${m.id}/${keyOf(m.id)}/` };
        }),
    iconKey: (id) => (metas.has(id) ? keyOf(id) : undefined),
    byIconKey(id, key) {
      const m = metas.get(id);
      if (!m) return undefined;
      const want = Buffer.from(keyOf(id));
      const got = Buffer.from(key);
      return got.length === want.length && timingSafeEqual(got, want) ? m : undefined;
    },
    get: (id) => metas.get(id),
    html,
    data: (id) => (metas.has(id) ? data(id) : {}),
    open(id, t) {
      const m = metas.get(id);
      let h = html(id);
      if (!m || h === undefined) return undefined;
      // D431: an app made before its items went into data: lifted now, where it changes nothing they
      // see (appLiftItems), as a version of its own so 改回去 still brings the file back as it was.
      const lift = m.kind ? undefined : appLiftItems(h, data(id));
      if (lift && !sizeOk(lift.html) && JSON.stringify(lift.data).length <= APP_DATA_MAX) {
        keepOld(m);
        write(join(dir(id), "index.html"), lift.html);
        putAll(id, lift.data, lift.keys);
        Object.assign(m, { version: m.version + 1, size: lift.html.length, back: true as const });
        saveMeta(m);
        emit({ kind: "list" });
        h = lift.html;
      }
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
      let seed: Record<string, unknown> | undefined;
      if (a.data && typeof a.data === "object" && !Array.isArray(a.data)) {
        seed = {};
        for (const [k, v] of Object.entries(a.data).slice(0, 40)) if (appKeyOk(k) && v !== null && v !== undefined) seed[k] = JSON.parse(JSON.stringify(v));
        if (JSON.stringify(seed).length > APP_DATA_MAX) return { ok: false, error: `its data is over ${APP_DATA_MAX} characters` };
      }
      // D431: the person's items written into the file as a list go into its data, read back from there.
      const lift = a.kind ? undefined : appLiftItems(a.html, seed ?? {});
      const file = lift?.html ?? a.html;
      if (lift) seed = lift.data;
      const summary = a.summary ? appSummary(a.summary) : "";
      const m: AppMeta = { id, name, persona, made: at, updated: at, version: 1, size: file.length, ...(a.ask ? { ask: a.ask.slice(0, 300) } : {}), ...(a.note ? { note: a.note.slice(0, 120) } : {}), ...(a.task ? { task: { id: a.task.id, title: appName(a.task.title) || a.task.id } } : {}), ...(a.kind ? { kind: a.kind } : {}), ...(summary ? { summary } : {}), ...(a.icon ? { icon: a.icon } : {}), tint: appTint({ id, ...(a.tint ? { tint: a.tint } : {}) }) };
      write(join(dir(id), "index.html"), file);
      if (seed && Object.keys(seed).length) {
        write(join(dir(id), "data.json"), JSON.stringify(seed));
        datas.set(id, seed);
      }
      metas.set(id, m);
      saveMeta(m);
      emit({ kind: "list" });
      if (m.task) emit({ kind: "give", id, task: m.task });
      return { ok: true, app: m, ...(lift ? { lifted: lift.keys } : {}) };
    },
    give(id, task) {
      const m = metas.get(id);
      if (!m) return false;
      if (task) m.task = { id: task.id, title: appName(task.title) || task.id };
      else delete m.task;
      saveMeta(m);
      emit({ kind: "list" });
      emit({ kind: "give", id, ...(m.task ? { task: m.task } : {}) });
      return true;
    },
    byTask: (taskId) => [...metas.values()].filter((m) => m.task?.id === taskId),
    fill(id, taskId, set) {
      const m = metas.get(id);
      if (!m || m.task?.id !== taskId) return { ok: false, error: "This app isn't one this task fills: use an id the task was given." };
      if (m.kind) return { ok: false, error: "Ducter keeps this app's data from your review_report; nothing to write here." };
      const entries = set && typeof set === "object" && !Array.isArray(set) ? Object.entries(set) : [];
      if (!entries.length) return { ok: false, error: "set needs at least one key: {key: value} (null removes a key)." };
      if (entries.length > APP_TASK_KEYS_PER_CALL) return { ok: false, error: `at most ${APP_TASK_KEYS_PER_CALL} keys a call` };
      for (const [k, v] of entries) {
        if (!appKeyOk(k)) return { ok: false, error: `${JSON.stringify(k)}: a key is 1–64 printable characters` };
        try {
          if (v !== null && JSON.stringify(v) === undefined) return { ok: false, error: `${k}: not JSON` };
        } catch {
          return { ok: false, error: `${k}: not JSON` };
        }
      }
      const t = now().getTime();
      const times = (fills.get(id) ?? []).filter((x) => t - x < 3600_000);
      if (times.length >= APP_TASK_WRITES_PER_HOUR) return { ok: false, error: `this app took ${APP_TASK_WRITES_PER_HOUR} writes this hour; write once a round` };
      const d = data(id);
      const next: Record<string, unknown> = { ...d };
      for (const [k, v] of entries) {
        if (v === null || v === undefined) delete next[k];
        else next[k] = JSON.parse(JSON.stringify(v));
      }
      if (JSON.stringify(next).length > APP_DATA_MAX) return { ok: false, error: `the app's data would be over ${APP_DATA_MAX} characters; keep only what stands now` };
      fills.set(id, [...times, t]);
      for (const k of Object.keys(d)) delete d[k];
      Object.assign(d, next);
      write(join(dir(id), "data.json"), JSON.stringify(d));
      for (const [k] of entries) emit({ kind: "data", id, key: k, value: d[k] ?? null, by: "task" });
      return { ok: true, keys: entries.map(([k]) => k) };
    },
    offered: (taskId) => !!offers[taskId],
    markOffered(taskId) {
      offers[taskId] = now().toISOString();
      const ks = Object.keys(offers);
      for (const k of ks.slice(0, Math.max(0, ks.length - 200))) delete offers[k];
      write(offersPath, JSON.stringify(offers));
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
      // D431: a list of the person's items the new file writes in goes into its data instead.
      const lift = m.kind ? undefined : appLiftItems(next, data(id));
      if (lift) next = lift.html;
      const bad = sizeOk(next);
      if (bad) return { ok: false, error: bad };
      if (lift && JSON.stringify(lift.data).length > APP_DATA_MAX) return { ok: false, error: `its data would be over ${APP_DATA_MAX} characters` };
      keepOld(m);
      write(join(dir(id), "index.html"), next);
      if (lift) putAll(id, lift.data, lift.keys);
      Object.assign(m, { name: name || m.name, updated: now().toISOString(), version: m.version + 1, size: next.length, back: true as const });
      delete m.broke;
      changing.delete(id);
      if (c.note) m.note = c.note.slice(0, 120);
      else delete m.note;
      saveMeta(m);
      emit({ kind: "list" });
      return { ok: true, app: m, ...(lift ? { lifted: lift.keys } : {}) };
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
      delete m.broke;
      delete m.note;
      if (olds(id).length) m.back = true;
      else delete m.back;
      saveMeta(m);
      emit({ kind: "list" });
      return { ok: true, app: m };
    },
    remove(id) {
      const m = metas.get(id);
      if (!m) return false;
      metas.delete(id);
      datas.delete(id);
      asks.delete(id);
      // D410: kept a while to bring back (撤销 / Undo), then gone for good.
      try {
        mkdirSync(bin, { recursive: true, mode: 0o700 });
        rmSync(join(bin, id), { recursive: true, force: true });
        renameSync(dir(id), join(bin, id));
        write(join(bin, id, "meta.json"), JSON.stringify({ ...m, removedAt: now().toISOString() }, null, 2) + "\n");
      } catch {
        rmSync(dir(id), { recursive: true, force: true });
      }
      emit({ kind: "list" });
      return true;
    },
    removed: (id) => {
      const m = removedMeta(id);
      if (!m) return undefined;
      const { removedAt: _, ...meta } = m;
      return meta;
    },
    restore(id) {
      const m = store.removed(id);
      if (!m || metas.has(id)) return { ok: false, error: "it can't be brought back any more" };
      if ([...metas.values()].filter((x) => x.persona === m.persona).length >= APPS_MAX) return { ok: false, error: `${APPS_MAX} apps already` };
      renameSync(join(bin, id), dir(id));
      metas.set(id, m);
      saveMeta(m);
      emit({ kind: "list" });
      return { ok: true, app: m };
    },
    set(id, c) {
      const m = metas.get(id);
      if (!m) return { ok: false, error: "gone" };
      if (c.name !== undefined) {
        const name = appName(c.name);
        if (!name) return { ok: false, error: "an app needs a short name" };
        m.name = name;
      }
      if (c.icon) m.icon = c.icon;
      if (c.pinned === true) m.pinned = true;
      else if (c.pinned === false) delete m.pinned;
      const untask = c.untask && m.task;
      if (untask) delete m.task;
      saveMeta(m);
      emit({ kind: "list" });
      if (untask) emit({ kind: "give", id });
      return { ok: true, app: m };
    },
    summarize(id, text) {
      const m = metas.get(id);
      if (!m) return false;
      const s = appSummary(text);
      if ((m.summary ?? "") === s) return true;
      if (s) m.summary = s;
      else delete m.summary;
      saveMeta(m);
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
    broke(id, version, text) {
      const m = metas.get(id);
      const t = String(text ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
      if (!m || version !== m.version || !t || m.broke?.version === version) return false;
      m.broke = { text: t, at: now().toISOString(), version };
      saveMeta(m);
      emit({ kind: "list" });
      return true;
    },
    changing(id, on) {
      if (!metas.has(id)) return;
      if (on === changing.has(id)) return;
      if (on) changing.set(id, now().getTime());
      else changing.delete(id);
      emit({ kind: "list" });
    },
    answeredAll() {
      if (!changing.size) return;
      changing.clear();
      emit({ kind: "list" });
    },
    keptBy(fn) {
      kept = fn;
    },
    liveMoved() {
      if ([...metas.values()].some((m) => m.task)) emit({ kind: "list" });
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  return store;
}
