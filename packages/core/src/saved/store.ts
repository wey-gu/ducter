// 自动填充 / Autofill's store (D191, design/autofill.md): the owner's saved sign-ins, cards and
// details, on the home only, one encrypted file per persona (<dataDir>/saved/<persona>.enc,
// AES-256-GCM, the key apart from it: key.ts). Nothing here is ever logged, sent to a client in
// clear or put in a model's context: views carry names, handles, the last four digits and the
// details the owner lets Ducter read. Secrets leave only through `secret()`, which the browser's
// fill (fill.ts) calls to type one value into one field, and (D233) `grantsFor()`, which writes a
// task's key file (keys.ts).
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  cardBrand,
  cardLabel,
  DETAIL_CLASS,
  DETAIL_KEYS,
  digits,
  luhn,
  KEY_ENV,
  KEY_ENV_DENIED,
  siteOf,
  type DetailKey,
  type DetailView,
  type KeyView,
  type SavedInput,
  type SavedUse,
  type SavedView,
} from "@ducter/protocol/src/saved.ts";
import { HIDDEN, redactWith } from "@ducter/protocol/src/redact.ts";
import { keySource, type KeptIn, type KeySource } from "./key.ts";

interface SignIn {
  id: string;
  handle: string;
  site: string;
  username: string;
  password: string;
  label?: string;
  addedAt: string;
  usedAt?: string;
  okSites: string[];
}

interface Card {
  id: string;
  handle: string;
  label?: string;
  name: string;
  number: string;
  expMonth: number;
  expYear: number;
  postcode?: string;
  addedAt: string;
  usedAt?: string;
  paidSites: string[];
}

interface Detail {
  value: string;
  okSites: string[];
  usedAt?: string;
}

/** D233: 密钥 / Keys: a key a task reads from an environment variable. */
interface Key {
  id: string;
  env: string;
  name: string;
  value: string;
  addedAt: string;
  usedAt?: string;
}

/**
 * D233: a key given to one task, until the task ends. keyId: a kept key (its value is read from
 * there, so an edit or a removal reaches the task too); value: one given just this once (kept
 * nowhere else, gone with the grant).
 */
export interface Grant {
  taskId: string;
  env: string;
  keyId?: string;
  value?: string;
  at: string;
}

interface Vault {
  v: 1;
  signins: SignIn[];
  cards: Card[];
  details: Partial<Record<DetailKey, Detail>>;
  uses: SavedUse[];
  keys: Key[];
  grants: Grant[];
  /** D233: 让任务向我要密钥 / Let tasks ask me for keys; absent = on. */
  askKeys?: boolean;
}

const empty = (): Vault => ({ v: 1, signins: [], cards: [], details: {}, uses: [], keys: [], grants: [] });

/** D233: a key's hint per D152: a recognisable head ("dop_v1_") then ••••••; none for a key without one. */
export function keyHint(value: string): string | undefined {
  let head: string | undefined;
  redactWith(value, (k) => {
    if (k.kind === "prefixed" && head === undefined && value.startsWith(k.head)) head = k.head;
    return undefined;
  }, { strict: true });
  return head ? `${head}${HIDDEN}` : undefined;
}

/** D233: a key's variable name, checked. */
export function checkEnv(raw: unknown): string {
  const env = String(raw ?? "").trim();
  if (!KEY_ENV.test(env)) throw new SavedError("invalid", "a key's name is an environment variable in capitals, like DO_TOKEN");
  if (KEY_ENV_DENIED.test(env)) throw new SavedError("invalid", `${env} changes how a shell or a program starts, so it can't hold a key; use another name (like ${env.replace(/^_+/, "")}_KEY)`);
  return env;
}
const USES_KEPT = 300;

/** What a handle names, with its secrets: for the fill only. */
export type Resolved =
  | { kind: "signin"; handle: string; label: string; site: string; item: SignIn }
  | { kind: "card"; handle: string; label: string; item: Card }
  | { kind: "detail"; handle: string; label: string; key: DetailKey; item: Detail };

/** The parts a fill may name, per kind. */
export const SIGNIN_PARTS = ["username", "password"] as const;
export const CARD_PARTS = ["number", "exp", "exp_month", "exp_year", "cvc", "name", "postcode"] as const;

export class SavedError extends Error {
  constructor(
    public reason: "invalid" | "not_found" | "failed",
    message: string,
  ) {
    super(message);
  }
}

export interface SavedStore {
  keptIn: KeptIn;
  view(): { items: SavedView[]; details: DetailView[]; uses: SavedUse[]; keys: KeyView[]; askKeys: boolean };
  put(input: SavedInput, now?: Date): SavedView | DetailView[] | KeyView;
  /** D233: the kept key a task may read under this variable. */
  keyFor(env: string): KeyView | undefined;
  /** D233: give a key to a task (a kept one by id, or a value just this once) and list the use. */
  grant(o: { taskId: string; env: string; keyId?: string; value?: string; task?: string; name: string }, now?: Date): void;
  /** D233: the keys a task was given, with their values: for its key file only. */
  grantsFor(taskId: string): { env: string; value: string }[];
  /** D233: every task holding a key. */
  grantedTasks(): string[];
  /** D233: a task ended: what it was given goes (a once value with it). */
  endGrants(taskId: string): void;
  askKeys(): boolean;
  setAskKeys(on: boolean): void;
  /** D233: every key value (kept or given once), to keep out of the Log. */
  keyValues(): string[];
  remove(id: string): void;
  forgetSite(id: string, site: string): void;
  resolve(handle: string): Resolved | undefined;
  /** One value to type into one field. */
  secret(handle: string, part?: string): string;
  okOn(handle: string, site: string): boolean;
  allow(handle: string, site: string): void;
  paidOn(handle: string, site: string): boolean;
  record(use: Omit<SavedUse, "at"> & { at?: string }): void;
  /** Every saved value long enough to scrub from what a model reads (D191: belt and braces). */
  scrubList(): string[];
  onChange(fn: () => void): () => void;
}

const DETAIL_LABEL: Record<DetailKey, string> = {
  name: "Full name",
  email: "Email",
  phone: "Phone",
  address: "Home address",
  birthday: "Date of birth",
  passport_number: "Passport number",
  passport_country: "Passport country",
  passport_expiry: "Passport expiry",
  known_traveler: "Known traveler number",
  loyalty: "Loyalty numbers",
  seat: "Seat",
  meal: "Meal",
};

export function detailLabel(k: DetailKey): string {
  return DETAIL_LABEL[k];
}

const newId = () => crypto.randomUUID().replaceAll("-", "").slice(0, 12);
const exp2 = (m: number, y: number) => `${String(m).padStart(2, "0")}/${String(y % 100).padStart(2, "0")}`;

export function openSaved(o: { dataDir: string; persona: string; key?: KeySource; platform?: string; env?: Record<string, string | undefined> }): SavedStore {
  const dir = join(o.dataDir, "saved");
  const path = join(dir, `${o.persona.replace(/[^A-Za-z0-9_-]+/g, "_") || "default"}.enc`);
  const key = o.key ?? keySource({ dataDir: o.dataDir, dir, ...(o.platform ? { platform: o.platform } : {}), ...(o.env ? { env: o.env } : {}) });
  const fns = new Set<() => void>();
  let cache: Vault | undefined;

  const load = (): Vault => {
    if (cache) return cache;
    if (!existsSync(path)) return (cache = empty());
    const k = key.get(false);
    if (!k) throw new SavedError("failed", "the Autofill key is missing, so what was saved can't be opened");
    const f = JSON.parse(readFileSync(path, "utf8")) as { v: 1; iv: string; tag: string; data: string };
    const d = createDecipheriv("aes-256-gcm", k, Buffer.from(f.iv, "base64"));
    d.setAuthTag(Buffer.from(f.tag, "base64"));
    const plain = Buffer.concat([d.update(Buffer.from(f.data, "base64")), d.final()]).toString("utf8");
    const v = JSON.parse(plain) as Vault;
    // A vault from before D233 has no keys or grants.
    return (cache = { ...empty(), ...v, keys: v.keys ?? [], grants: v.grants ?? [] });
  };

  const save = (v: Vault) => {
    const k = key.get(true)!;
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", k, iv);
    const data = Buffer.concat([c.update(JSON.stringify(v), "utf8"), c.final()]);
    const body = JSON.stringify({ v: 1, iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), data: data.toString("base64") });
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, body, { mode: 0o600 });
    renameSync(tmp, path);
    chmodSync(path, 0o600);
    cache = v;
    fns.forEach((f) => f());
  };

  const signinView = (s: SignIn): SavedView => ({
    id: s.id,
    handle: s.handle,
    kind: "signin",
    label: s.label || s.site,
    site: s.site,
    username: s.username,
    addedAt: s.addedAt,
    ...(s.usedAt ? { usedAt: s.usedAt } : {}),
    okSites: [...s.okSites],
  });
  const cardView = (c: Card): SavedView => {
    const brand = cardBrand(c.number);
    const last4 = c.number.slice(-4);
    return {
      id: c.id,
      handle: c.handle,
      kind: "card",
      label: c.label || cardLabel(brand, last4),
      brand,
      last4,
      exp: exp2(c.expMonth, c.expYear),
      name: c.name,

      addedAt: c.addedAt,
      ...(c.usedAt ? { usedAt: c.usedAt } : {}),
      okSites: [...c.paidSites],
    };
  };
  const detailView = (k: DetailKey, d: Detail | undefined): DetailView => {
    const read = DETAIL_CLASS[k] === "read";
    const v = d?.value ?? "";
    return {
      key: k,
      handle: `me.${k}`,
      kept: !!v,
      ...(v && read ? { value: v } : {}),
      ...(v && !read && (k === "passport_number" || k === "known_traveler") && v.length > 4 ? { hint: `•••${v.slice(-3)}` } : {}),
      ...(d?.okSites.length ? { okSites: [...d.okSites] } : {}),
    };
  };

  const keyView = (k: Key): KeyView => {
    const hint = keyHint(k.value);
    return { id: k.id, kind: "key", handle: `key:${k.env}`, env: k.env, name: k.name, ...(hint ? { hint } : {}), addedAt: k.addedAt, ...(k.usedAt ? { usedAt: k.usedAt } : {}) };
  };
  /** A pasted key keeps its own characters; only the line breaks and spaces around it go. */
  const keyValue = (raw: unknown) => String(raw ?? "").replace(/^\s+|\s+$/g, "");

  const unique = (v: Vault, base: string) => {
    const taken = new Set([...v.signins.map((s) => s.handle), ...v.cards.map((c) => c.handle)]);
    if (!taken.has(base)) return base;
    for (let n = 2; ; n++) if (!taken.has(`${base}#${n}`)) return `${base}#${n}`;
  };

  const store: SavedStore = {
    keptIn: key.keptIn,
    view() {
      const v = load();
      return {
        items: [...v.signins.map(signinView), ...v.cards.map(cardView)],
        details: DETAIL_KEYS.map((k) => detailView(k, v.details[k])),
        uses: [...v.uses].reverse(),
        keys: v.keys.map(keyView),
        askKeys: v.askKeys !== false,
      };
    },
    put(input, now = new Date()) {
      const v = structuredClone(load());
      const at = now.toISOString();
      if (input.kind === "key") {
        const env = checkEnv(input.env);
        const name = String(input.name ?? "").trim().slice(0, 120) || env;
        const value = keyValue(input.value);
        if (value.length > 16_384) throw new SavedError("invalid", "that key is too long to keep");
        if (/[\r\n\0]/.test(value)) throw new SavedError("invalid", "a key is one line: paste just the key");
        // An edit by id, or the key already kept under this name (one value per variable).
        const was = input.id ? v.keys.find((k) => k.id === input.id) : v.keys.find((k) => k.env === env);
        if (input.id && !was) throw new SavedError("not_found", "that key is gone");
        if (!was && !value) throw new SavedError("invalid", "paste the key to keep it");
        if (was && was.env !== env && v.keys.some((k) => k.env === env && k.id !== was.id)) throw new SavedError("invalid", `a key named ${env} is kept already`);
        const k: Key = was ? { ...was, env, name, ...(value ? { value } : {}) } : { id: newId(), env, name, value, addedAt: at };
        v.keys = was ? v.keys.map((x) => (x.id === was.id ? k : x)) : [...v.keys, k];
        // Renamed: a task holding it under the old name keeps it under the new one.
        if (was && was.env !== env) for (const g of v.grants) if (g.keyId === was.id) g.env = env;
        save(v);
        return keyView(k);
      }
      if (input.kind === "signin") {
        const site = siteOf(input.site);
        const username = String(input.username ?? "").trim();
        const password = String(input.password ?? "");
        if (!site) throw new SavedError("invalid", "a sign-in needs its site (github.com)");
        if (!username) throw new SavedError("invalid", "a sign-in needs the user name or email");
        const was = input.id ? v.signins.find((s) => s.id === input.id) : undefined;
        if (input.id && !was) throw new SavedError("not_found", "that sign-in is gone");
        if (!was && !password) throw new SavedError("invalid", "a sign-in needs its password");
        const s: SignIn = was
          ? { ...was, site, username, ...(password ? { password } : {}), ...(input.label?.trim() ? { label: input.label.trim() } : { label: undefined }) }
          : { id: newId(), handle: unique(v, `signin:${site}`), site, username, password, ...(input.label?.trim() ? { label: input.label.trim() } : {}), addedAt: at, okSites: [] };
        // A sign-in moved to another site keeps no OK from the old one.
        if (was && was.site !== site) (s.okSites = []), (s.handle = unique({ ...v, signins: v.signins.filter((x) => x.id !== was.id) }, `signin:${site}`));
        v.signins = was ? v.signins.map((x) => (x.id === was.id ? s : x)) : [...v.signins, s];
        save(v);
        return signinView(s);
      }
      if (input.kind === "card") {
        const was = input.id ? v.cards.find((c) => c.id === input.id) : undefined;
        if (input.id && !was) throw new SavedError("not_found", "that card is gone");
        const number = input.number ? digits(input.number) : was?.number ?? "";
        if (!luhn(number)) throw new SavedError("invalid", "that card number doesn't look right");
        const expMonth = Math.trunc(Number(input.expMonth));
        let expYear = Math.trunc(Number(input.expYear));
        if (expYear < 100) expYear += 2000;
        if (!(expMonth >= 1 && expMonth <= 12) || !(expYear >= 2000 && expYear < 2100)) throw new SavedError("invalid", "the expiry date doesn't look right");
        if (expYear * 12 + expMonth < now.getUTCFullYear() * 12 + now.getUTCMonth() + 1) throw new SavedError("invalid", "that card has expired");
        // D191: the security code is never kept (PCI DSS 3.3.1.2; research/54): each Go asks for it.
        const name = String(input.name ?? "").trim();
        if (!name) throw new SavedError("invalid", "a card needs the name on it");
        const brand = cardBrand(number);
        const base: Card = was
          ? { ...was }
          : { id: newId(), handle: unique(v, `card:${brand}-${number.slice(-4)}`), name, number, expMonth, expYear, addedAt: at, paidSites: [] };
        const c: Card = { ...base, name, number, expMonth, expYear };
        if (input.postcode?.trim()) c.postcode = input.postcode.trim();
        else delete c.postcode;
        if (input.label?.trim()) c.label = input.label.trim();
        else delete c.label;
        if (was && was.number !== number) (c.paidSites = []), (c.handle = unique({ ...v, cards: v.cards.filter((x) => x.id !== was.id) }, `card:${brand}-${number.slice(-4)}`));
        v.cards = was ? v.cards.map((x) => (x.id === was.id ? c : x)) : [...v.cards, c];
        save(v);
        return cardView(c);
      }
      if (input.kind === "detail") {
        for (const [k, raw] of Object.entries(input.values ?? {})) {
          if (!(k in DETAIL_CLASS)) throw new SavedError("invalid", `unknown detail ${k}`);
          const value = String(raw ?? "").trim().slice(0, 500);
          const key = k as DetailKey;
          if (!value) delete v.details[key];
          else if (v.details[key]?.value !== value) v.details[key] = { value, okSites: [] };
        }
        save(v);
        return DETAIL_KEYS.map((k) => detailView(k, v.details[k]));
      }
      throw new SavedError("invalid", "unknown kind");
    },
    remove(id) {
      const v = structuredClone(load());
      const k = id.replace(/^me\./, "") as DetailKey;
      if (k in DETAIL_CLASS) delete v.details[k];
      else {
        const n = v.signins.length + v.cards.length + v.keys.length;
        v.signins = v.signins.filter((s) => s.id !== id);
        v.cards = v.cards.filter((c) => c.id !== id);
        v.keys = v.keys.filter((x) => x.id !== id);
        // D233: a removed key is gone from every task holding it too (their key files are rewritten).
        v.grants = v.grants.filter((g) => g.keyId !== id);
        if (v.signins.length + v.cards.length + v.keys.length === n) throw new SavedError("not_found", "nothing saved by that name");
      }
      save(v);
    },
    keyFor(env) {
      const k = load().keys.find((x) => x.env === env);
      return k ? keyView(k) : undefined;
    },
    grant(o, now = new Date()) {
      const v = structuredClone(load());
      const at = now.toISOString();
      const env = checkEnv(o.env);
      const kept = o.keyId ? v.keys.find((k) => k.id === o.keyId) : undefined;
      if (o.keyId && !kept) throw new SavedError("not_found", "that key is gone");
      const value = o.keyId ? undefined : keyValue(o.value);
      if (!o.keyId && !value) throw new SavedError("invalid", "paste the key to give it");
      if (value && /[\r\n\0]/.test(value)) throw new SavedError("invalid", "a key is one line: paste just the key");
      v.grants = [...v.grants.filter((g) => !(g.taskId === o.taskId && g.env === env)), { taskId: o.taskId, env, ...(kept ? { keyId: kept.id } : { value: value! }), at }];
      if (kept) kept.usedAt = at;
      v.uses.push({ at, handle: `key:${env}`, label: o.name, site: "", what: "given", taskId: o.taskId, ...(o.task ? { task: o.task } : {}), ...(kept ? {} : { once: true }) });
      if (v.uses.length > USES_KEPT) v.uses = v.uses.slice(-USES_KEPT);
      save(v);
    },
    grantsFor(taskId) {
      const v = load();
      return v.grants.flatMap((g) => {
        if (g.taskId !== taskId) return [];
        const value = g.keyId ? v.keys.find((k) => k.id === g.keyId)?.value : g.value;
        return value ? [{ env: g.env, value }] : [];
      });
    },
    grantedTasks() {
      return [...new Set(load().grants.map((g) => g.taskId))];
    },
    endGrants(taskId) {
      const v = load();
      if (!v.grants.some((g) => g.taskId === taskId)) return;
      const w = structuredClone(v);
      w.grants = w.grants.filter((g) => g.taskId !== taskId);
      save(w);
    },
    askKeys: () => load().askKeys !== false,
    setAskKeys(on) {
      const v = structuredClone(load());
      if (on) delete v.askKeys;
      else v.askKeys = false;
      save(v);
    },
    keyValues() {
      if (!existsSync(path) && !cache) return [];
      const v = load();
      return [...new Set([...v.keys.map((k) => k.value), ...v.grants.flatMap((g) => (g.value ? [g.value] : []))])];
    },
    forgetSite(id, site) {
      const v = structuredClone(load());
      const s = siteOf(site);
      const k = id.replace(/^me\./, "") as DetailKey;
      for (const x of v.signins) if (x.id === id) x.okSites = x.okSites.filter((y) => y !== s);
      for (const x of v.cards) if (x.id === id) x.paidSites = x.paidSites.filter((y) => y !== s);
      if (k in DETAIL_CLASS && v.details[k]) v.details[k]!.okSites = v.details[k]!.okSites.filter((y) => y !== s);
      save(v);
    },
    resolve(handle) {
      const h = String(handle ?? "").trim();
      const v = load();
      if (h.startsWith("me.")) {
        const key = h.slice(3) as DetailKey;
        const d = v.details[key];
        if (!(key in DETAIL_CLASS) || !d) return undefined;
        return { kind: "detail", handle: h, label: DETAIL_LABEL[key], key, item: d };
      }
      const s = v.signins.find((x) => x.handle === h);
      if (s) return { kind: "signin", handle: h, label: `${s.label || s.site} (${s.username})`, site: s.site, item: s };
      const c = v.cards.find((x) => x.handle === h);
      if (c) return { kind: "card", handle: h, label: c.label || cardLabel(cardBrand(c.number), c.number.slice(-4)), item: c };
      return undefined;
    },
    secret(handle, part) {
      const r = store.resolve(handle);
      if (!r) throw new SavedError("not_found", `nothing saved as ${handle}`);
      if (r.kind === "detail") return r.item.value;
      if (r.kind === "signin") {
        if (part === "password") return r.item.password;
        if (part === "username" || !part) return r.item.username;
        throw new SavedError("invalid", `a sign-in fills username or password, not ${part}`);
      }
      const c = r.item;
      switch (part ?? "number") {
        case "number":
          return c.number;
        case "exp":
          return exp2(c.expMonth, c.expYear);
        case "exp_month":
          return String(c.expMonth).padStart(2, "0");
        case "exp_year":
          return String(c.expYear);
        case "cvc":
          throw new SavedError("not_found", "the security code is never kept: it comes with the owner's Go");
        case "name":
          return c.name;
        case "postcode":
          if (!c.postcode) throw new SavedError("not_found", "no postcode is kept for this card");
          return c.postcode;
      }
      throw new SavedError("invalid", `a card fills ${CARD_PARTS.join(", ")}, not ${part}`);
    },
    okOn(handle, site) {
      const r = store.resolve(handle);
      const s = siteOf(site);
      if (!r || !s) return false;
      if (r.kind === "detail") return DETAIL_CLASS[r.key] === "read" || r.item.okSites.includes(s);
      if (r.kind === "signin") return r.item.okSites.includes(s);
      return false; // a card: every payment asks
    },
    allow(handle, site) {
      const v = structuredClone(load());
      const s = siteOf(site);
      if (!s) return;
      const add = (list: string[]) => (list.includes(s) ? list : [...list, s]);
      if (handle.startsWith("me.")) {
        const d = v.details[handle.slice(3) as DetailKey];
        if (d) d.okSites = add(d.okSites);
      }
      for (const x of v.signins) if (x.handle === handle) x.okSites = add(x.okSites);
      for (const x of v.cards) if (x.handle === handle) x.paidSites = add(x.paidSites);
      save(v);
    },
    paidOn(handle, site) {
      const r = store.resolve(handle);
      return r?.kind === "card" && r.item.paidSites.includes(siteOf(site));
    },
    record(use) {
      const v = structuredClone(load());
      const at = use.at ?? new Date().toISOString();
      const last = v.uses[v.uses.length - 1];
      // One line per fill run: the same thing filled on the same site by the same task.
      if (last && use.what === "filled" && last.what === "filled" && last.handle === use.handle && last.site === use.site && last.taskId === use.taskId) last.at = at;
      else v.uses.push({ ...use, at });
      if (v.uses.length > USES_KEPT) v.uses = v.uses.slice(-USES_KEPT);
      const mark = (x: { usedAt?: string }) => (x.usedAt = at);
      if (use.what === "filled") {
        for (const x of v.signins) if (x.handle === use.handle) mark(x);
        for (const x of v.cards) if (x.handle === use.handle) mark(x);
        if (use.handle.startsWith("me.")) {
          const d = v.details[use.handle.slice(3) as DetailKey];
          if (d) mark(d);
        }
      }
      save(v);
    },
    scrubList() {
      if (!existsSync(path) && !cache) return [];
      const v = load();
      const out = new Set<string>();
      for (const s of v.signins) out.add(s.password);
      for (const c of v.cards) {
        out.add(c.number);
        out.add(c.number.replace(/(\d{4})(?=\d)/g, "$1 "));
        out.add(c.number.replace(/(\d{4})(?=\d)/g, "$1-"));
        if (c.number.length === 15) out.add(`${c.number.slice(0, 4)} ${c.number.slice(4, 10)} ${c.number.slice(10)}`);
      }
      for (const k of DETAIL_KEYS) if (DETAIL_CLASS[k] === "fill" && v.details[k]) out.add(v.details[k]!.value);
      // D233: keys, kept or given once.
      for (const k of v.keys) out.add(k.value);
      for (const g of v.grants) if (g.value) out.add(g.value);
      return [...out].filter((x) => x && x.length >= 6).sort((a, b) => b.length - a.length);
    },
    onChange(fn) {
      fns.add(fn);
      return () => fns.delete(fn);
    },
  };
  return store;
}

/** Hide every saved value in a text a model or a client is about to read. */
export function scrub(text: string, list: string[]): string {
  if (!text || !list.length) return text;
  let out = text;
  for (const s of list) if (out.includes(s)) out = out.split(s).join("••••••");
  return out;
}
