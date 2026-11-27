// D504: `ducter move --plan [--to <computer>]`: what moving this computer's Ducter (the home) to
// another computer would do, before anything is done. Read-only: it opens the Log and devices.db
// read-only, reads the small JSON files for counts and names (never a token, a key's value or a
// message), sizes folders, and asks the AI agents on this computer whether they are signed in (as
// `uninstall --dry-run` does). It writes nothing, starts nothing and talks to no other computer.
//
// The plan says, in the person's language:
//   goes    what is carried over (the conversation, partners, settings, keys, devices, chat apps…), with sizes;
//   redo    what is done again on the new computer, and why it can't be carried;
//   follow  what finds the new address by itself, and what must be pointed at it;
//   work    tasks under way and routines, and what happens to each;
//   stays   what stays on this computer (it can keep doing tasks for the new home);
//   risks   what to know before going.
// D621 adds the local half: `--bundle <file>` writes one encrypted archive of what goes, and
// `--receive <file>` checks it into a fresh data folder and says what is still to be redone. No
// freeze, network transfer, handover, cut-over or rollback yet: design/move.md §5.
import { Database } from "bun:sqlite";
import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { sameComputer } from "@ducter/protocol/src/computer-name.ts";
import { HARNESS_KEYS, isHarnessId } from "@ducter/protocol/src/harnesses.ts";
import { ducterFolder } from "@ducter/protocol/src/ducter-folder.ts";
import type { MsgKey, T } from "./i18n.ts";
import {
  homeHasWork,
  newPassphrase,
  readBundle,
  writeBundle,
  type BundleItem,
  type BundleNote,
  type BundleReadResult,
  type BundleWriteResult,
} from "./move-bundle.ts";
import { sizeOf } from "./uninstall.ts";

export type OsKind = "darwin" | "linux" | "other";
export interface MoveItem {
  id: string;
  what: string;
  detail?: string;
  bytes?: number;
  /** The table key and its variables, so a received home can say the same thing in its language. */
  key?: MsgKey;
  detailKey?: MsgKey;
  vars?: Record<string, string | number>;
}
export interface MoveWork {
  id: string;
  title: string;
  /** home: runs on this computer's Ducter; worker: on another computer that does tasks for it. */
  on: "home" | "worker";
  device?: string;
  /** carry: continues on the new computer; branch: its branch is pushed, then continues there;
   *  stays: its folder is on this computer, it continues here once this computer does tasks for the new home;
   *  keeps: nothing changes (its computer follows the new address). */
  then: "carry" | "branch" | "stays" | "keeps";
  line: string;
}
export interface MovePlan {
  ok: true;
  from: { computer: string; os: OsKind; partner: string };
  to?: { name: string; os: OsKind; known: boolean; assumed: boolean };
  goes: MoveItem[];
  redo: MoveItem[];
  follow: MoveItem[];
  work: MoveWork[];
  stays: MoveItem[];
  risks: MoveItem[];
  bytes: number;
}
export type MovePlanResult = MovePlan | { ok: false; error: "no_home"; dataDir: string };

export interface PlanMoveInput {
  dataDir: string;
  t: T;
  /** This computer's name (the home's display name wins when the person gave one). */
  computer: string;
  platform: NodeJS.Platform;
  to?: string;
  /** The AI agents installed here, probed by the caller; absent: not probed, no line. */
  agents?: { name: string; harness?: string; signedIn: boolean }[];
  /** GitHub's CLI is signed in on this computer (probed by the caller). */
  github?: boolean;
  now?: number;
  /** For the Ducter folder (D204): the user's home folder and environment. Default: this process's. */
  home?: string;
  env?: Record<string, string | undefined>;
}

const osOf = (p: string): OsKind => (p === "darwin" || p === "macos" || p === "mac" ? "darwin" : p === "linux" ? "linux" : "other");
const DAY = 86_400_000;
const OPEN = new Set(["queued", "working", "needs_you", "blocked", "done_claimed"]);

function json(path: string): any {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}
const exists = (p: string) => {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
};
const text = (p: string) => {
  try {
    return readFileSync(p, "utf8").trim();
  } catch {
    return "";
  }
};
const listDir = (p: string) => {
  try {
    return readdirSync(p).filter((n) => !n.startsWith("."));
  } catch {
    return [];
  }
};

/**
 * A SQLite file opened for reading only. With a -wal beside it (the home is running) it is opened
 * read-only, through the -wal and -shm the home already made. With none (a stopped home, or a
 * database closed cleanly) the main file is the whole database: it is read into memory, its header
 * set back from WAL to rollback mode in that copy only, so SQLite makes no -wal or -shm beside it
 * (a read-only open in WAL mode would). Past COPY_MAX it is opened read-only instead.
 */
const COPY_MAX = 256 * 1024 * 1024;
export function openRead(path: string): Database {
  if (existsSync(`${path}-wal`) || statSync(path).size > COPY_MAX) return new Database(path, { readonly: true });
  const bytes = new Uint8Array(readFileSync(path));
  if (bytes.length >= 20 && bytes[18] === 2 && bytes[19] === 2) bytes[18] = bytes[19] = 1;
  return Database.deserialize(bytes, true);
}

/** The data folder holds a home: its Log. A worker or a CLI that follows a home elsewhere has none. */
export function isHome(dataDir: string): boolean {
  return existsSync(join(dataDir, "ducter.db"));
}

interface LogFacts {
  events: number;
  tasks: number;
  open: { taskId: string; title: string; place: any; attention: string }[];
  routines: { active: number; paused: number; here: number };
}

/** Reads the Log read-only: event and task counts, tasks still under way, routines by state. */
export function readLog(dataDir: string): LogFacts | undefined {
  const path = join(dataDir, "ducter.db");
  let db: Database | undefined;
  try {
    db = openRead(path);
    const events = (db.query("SELECT COUNT(*) AS n FROM events").get() as { n: number }).n;
    const opens = new Map<string, any>();
    for (const r of db.query("SELECT body FROM events WHERE kind = 'task_open' ORDER BY seq").all() as { body: string }[]) {
      try {
        const b = JSON.parse(r.body);
        if (b?.taskId) opens.set(b.taskId, b);
      } catch {}
    }
    const states = new Map<string, { attention: string; residency: string }>();
    for (const r of db.query("SELECT body FROM events WHERE kind = 'task_state' ORDER BY seq").all() as { body: string }[]) {
      try {
        const b = JSON.parse(r.body);
        if (b?.taskId) states.set(b.taskId, b);
      } catch {}
    }
    const open: LogFacts["open"] = [];
    for (const [id, o] of opens) {
      const s = states.get(id);
      if (!s || !OPEN.has(s.attention) || s.residency === "archived") continue;
      open.push({ taskId: id, title: String(o.title ?? id), place: o.place ?? { kind: "none" }, attention: s.attention });
    }
    const routines = new Map<string, any>();
    for (const r of db.query("SELECT body FROM events WHERE kind = 'routine' ORDER BY seq").all() as { body: string }[]) {
      try {
        const b = JSON.parse(r.body);
        if (b?.routineId) routines.set(b.routineId, b);
      } catch {}
    }
    let active = 0;
    let paused = 0;
    let here = 0;
    for (const r of routines.values()) {
      if (r.state === "active") active++;
      else if (r.state === "paused") paused++;
      else continue;
      const d = r.place?.device;
      if (r.place && r.place.kind !== "none" && (!d || d === "local")) here++;
    }
    return { events, tasks: opens.size, open, routines: { active, paused, here } };
  } catch {
    return undefined;
  } finally {
    db?.close();
  }
}

interface Dev {
  name: string;
  platform: string;
  computer: string;
  /** A Ducter app or the command line (they race the home's ways); else a web page on one address. */
  app: boolean;
  lastSeen?: number;
}
interface DeviceFacts {
  clients: Dev[];
  workers: Dev[];
}

/** devices.db read-only: the paired devices that are still connected (not disconnected). */
export function readDevices(dataDir: string): DeviceFacts {
  const out: DeviceFacts = { clients: [], workers: [] };
  const path = join(dataDir, "devices.db");
  if (!existsSync(path)) return out;
  let db: Database | undefined;
  try {
    db = openRead(path);
    const cols = new Set((db.query("PRAGMA table_info(devices)").all() as { name: string }[]).map((c) => c.name));
    const extra = ["computer", "form"].filter((c) => cols.has(c));
    const rows = db.query(`SELECT name, kind, platform, last_seen_at${extra.map((c) => `, ${c}`).join("")} FROM devices WHERE revoked_at IS NULL`).all() as any[];
    for (const r of rows) {
      const platform = String(r.platform ?? "");
      const app = platform.endsWith("-app") || r.form === "app" || r.form === "cli" || /^CLI on /.test(String(r.name));
      const d: Dev = { name: String(r.name), platform, computer: String(r.computer ?? ""), app, ...(r.last_seen_at != null ? { lastSeen: Number(r.last_seen_at) } : {}) };
      (r.kind === "worker" ? out.workers : out.clients).push(d);
    }
  } catch {
  } finally {
    db?.close();
  }
  return out;
}

/** Names of the keys in keys.env (never their values). */
export function keyNames(dataDir: string): string[] {
  const t = text(join(dataDir, "keys.env"));
  return t
    .split("\n")
    .map((l) => /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/.exec(l)?.[1])
    .filter((x): x is string => Boolean(x));
}

const isHomeDevice = (d: string | undefined, homeNames: string[]) => !d || d === "local" || homeNames.some((n) => sameComputer(n, d));

export function planMove(i: PlanMoveInput): MovePlanResult {
  const { dataDir, t } = i;
  if (!isHome(dataDir)) return { ok: false, error: "no_home", dataDir };
  const now = i.now ?? Date.now();
  const from = osOf(i.platform);
  const at = (f: string) => join(dataDir, f);
  const size = (...fs: string[]) => fs.reduce((n, f) => n + (exists(at(f)) ? sizeOf(at(f)) : 0), 0);
  const persona = json(at("persona.json")) ?? {};
  const partner = typeof persona.name === "string" && persona.name.trim() ? persona.name.trim() : "Ducter";
  const computer = text(at("device-name")) || i.computer;
  const homeNames = [computer, i.computer];
  const devices = readDevices(dataDir);
  const log = readLog(dataDir);

  // Where it goes: a computer that already does tasks for this home is known (its system too).
  let to: MovePlan["to"];
  if (i.to) {
    const w = devices.workers.find((d) => sameComputer(d.name, i.to) || sameComputer(d.computer, i.to));
    to = w ? { name: w.name, os: osOf(w.platform), known: true, assumed: false } : { name: i.to, os: "linux", known: false, assumed: true };
  }
  const target = to?.name ?? t("move.to.new");
  const sameOs = to ? to.os === from : undefined;

  const sep = t("move.sep");
  const goes: MoveItem[] = [];
  const redo: MoveItem[] = [];
  const follow: MoveItem[] = [];
  const stays: MoveItem[] = [];
  const risks: MoveItem[] = [];

  // ---------- what goes with it ----------
  goes.push({ id: "log", what: t("move.goes.log"), detail: log ? t("move.goes.log.detail", { events: log.events, tasks: log.tasks }) : t("move.goes.log.unread"), bytes: size("ducter.db", "ducter.db-wal") });
  const others = Array.isArray(json(at("partners.json"))?.others) ? (json(at("partners.json")).others as any[]).map((p) => String(p?.name ?? "")).filter(Boolean) : [];
  goes.push({ id: "partners", what: t("move.goes.partners"), detail: [partner, ...others].join(sep), bytes: size("persona.json", "partners.json", "partners") });
  goes.push({ id: "settings", what: t("move.goes.settings"), bytes: size("settings.json", "projects.json", "marks.json", "ambient.json", "outside.json", "mem-plugins.json", "paused.json", "records.json", "app-offers.json", "web-look") });
  if (log && log.routines.active + log.routines.paused) goes.push({ id: "routines", what: t("move.goes.routines"), detail: t("move.goes.routines.detail", { active: log.routines.active, paused: log.routines.paused }) });
  const keys = keyNames(dataDir);
  if (keys.length) goes.push({ id: "keys", what: t("move.goes.keys", { n: keys.length }), detail: keys.join(sep), bytes: size("keys.env") });
  const conns = json(at("connection-tokens.json"));
  const nConns = conns && typeof conns === "object" ? Object.keys(conns).length : 0;
  if (nConns) goes.push({ id: "connections", what: t("move.goes.connections", { n: nConns }), bytes: size("connection-tokens.json") });
  if (exists(at("saved"))) goes.push({ id: "autofill", what: t("move.goes.autofill"), detail: t(from === "darwin" ? "move.goes.autofill.keychain" : "move.goes.autofill.file"), bytes: size("saved") });
  const paired = devices.clients.length + devices.workers.length;
  goes.push({ id: "devices", what: t("move.goes.devices", { n: paired }), detail: t("move.goes.devices.detail"), bytes: size("devices.db", "home-key.pem") });
  const ch = json(at("channels.json")) ?? {};
  const chats = (["telegram", "slack", "wechat"] as const).filter((k) => ch[k]?.token || ch[k]?.ctx || ch[k]?.base);
  const chatNames = chats.map((k) => t(`move.chat.${k}`)).join(sep);
  if (chats.length) goes.push({ id: "chats", what: t("move.goes.chats"), detail: chatNames, bytes: size("channels.json") });
  const push = json(at("push.json"));
  const subs = Array.isArray(push?.subs) ? push.subs.length : 0;
  if (subs || exists(at("apns.json"))) goes.push({ id: "push", what: t("move.goes.push", { n: subs }), bytes: size("push.json", "apns.json") });
  const mem = persona.mem && typeof persona.mem.agentId === "string" ? persona.mem.agentId : undefined;
  if (mem) goes.push({ id: "mem", what: t("move.goes.mem"), detail: mem });
  const helpers = Array.isArray(json(at("helpers.json"))?.helpers) ? (json(at("helpers.json")).helpers as any[]) : [];
  if (helpers.length) goes.push({ id: "helpers", what: t("move.goes.helpers", { n: helpers.length }), detail: helpers.map((h) => String(h?.name ?? "")).filter(Boolean).join(sep), bytes: size("helpers.json") });
  const made = size("media", "media-in", "apps", "evidence", "snapshots");
  if (made) goes.push({ id: "made", what: t("move.goes.made"), bytes: made });
  const tunnel = json(at(join("anywhere", "state.json")));
  if (tunnel?.on && tunnel.hostname) goes.push({ id: "tunnel", what: t("move.goes.tunnel"), detail: String(tunnel.hostname), bytes: size("anywhere") });
  // Ducter's own browser: its sign-ins (cookies) are locked with a key Chrome keeps per system.
  const profiles = listDir(at("browser-profiles"));
  const browserBytes = size("browser-profiles");
  if (profiles.length && sameOs === true) goes.push({ id: "browser", what: t("move.goes.browser", { n: profiles.length }), detail: t("move.goes.browser.sameOs"), bytes: browserBytes });

  // ---------- what is done again there ----------
  for (const a of i.agents ?? []) {
    if (!a.signedIn) continue;
    // An agent that signs in with a key in keys.env goes with it (the registry says which keys are whose).
    const viaKey = a.harness !== undefined && isHarnessId(a.harness) && HARNESS_KEYS[a.harness].some((k) => keys.includes(k));
    if (!viaKey) redo.push({ id: `agent:${a.name}`, what: t("move.redo.agent", { agent: a.name }), detail: t("move.redo.agent.why"), key: "move.redo.agent", detailKey: "move.redo.agent.why", vars: { agent: a.name, computer } });
  }
  if (i.github) redo.push({ id: "github", what: t("move.redo.github"), detail: t("move.redo.github.why", { computer }), key: "move.redo.github", detailKey: "move.redo.github.why", vars: { computer } });
  if (mem || exists(at("bridge-connection.json"))) redo.push({ id: "mem-signin", what: t("move.redo.mem"), detail: t("move.redo.mem.why"), key: "move.redo.mem", detailKey: "move.redo.mem.why" });
  if (profiles.length && sameOs !== true)
    redo.push({
      id: "browser",
      what: t("move.redo.browser", { n: profiles.length }),
      detail: t(sameOs === false ? "move.redo.browser.why" : "move.redo.browser.unknown"),
      key: "move.redo.browser",
      detailKey: sameOs === false ? "move.redo.browser.why" : "move.redo.browser.unknown",
      vars: { n: profiles.length },
    });

  // ---------- what follows the new address ----------
  const appClients = devices.clients.filter((d) => d.app);
  const webClients = devices.clients.length - appClients.length;
  if (appClients.length) follow.push({ id: "apps", what: t("move.follow.apps", { n: appClients.length }), detail: t("move.follow.apps.how") });
  if (webClients) follow.push({ id: "web", what: t("move.follow.web", { n: webClients }), detail: t(tunnel?.on && tunnel.hostname ? "move.follow.web.tunnel" : "move.follow.web.how") });
  if (devices.workers.length) follow.push({ id: "workers", what: t("move.follow.workers", { n: devices.workers.length }), detail: t("move.follow.workers.how") });
  if (chats.length) follow.push({ id: "chats", what: t("move.follow.chats", { apps: chatNames }), detail: t("move.follow.chats.how") });
  if (exists(at("bridge-connection.json"))) follow.push({ id: "bridge", what: t("move.follow.bridge"), detail: t("move.follow.bridge.how") });
  const linked = helpers.filter((h) => h?.link);
  if (linked.length) follow.push({ id: "helpers", what: t("move.follow.helpers", { n: linked.length }), detail: t("move.follow.helpers.how") });
  if (subs) follow.push({ id: "push", what: t("move.follow.push"), detail: t("move.follow.push.how") });
  const ways = json(at("reach.json"))?.ways;
  const wayKinds = Array.isArray(ways) ? ways.map((w: any) => String(w?.kind ?? "")) : [];
  if (wayKinds.includes("domain")) follow.push({ id: "domain", what: t("move.follow.domain"), detail: t("move.follow.domain.how") });
  if (wayKinds.includes("tailnet")) follow.push({ id: "tailnet", what: t("move.follow.tailnet"), detail: t("move.follow.tailnet.how") });
  if (from === "darwin") follow.push({ id: "imessage", what: t("move.follow.imessage"), detail: t("move.follow.imessage.how", { computer }) });

  // ---------- work under way ----------
  const work: MoveWork[] = [];
  for (const o of log?.open ?? []) {
    const p = o.place ?? { kind: "none" };
    const onHome = isHomeDevice(p.device, homeNames);
    if (!onHome) {
      work.push({ id: o.taskId, title: o.title, on: "worker", device: p.device, then: "keeps", line: t("move.work.keeps", { device: p.device }) });
      continue;
    }
    if (p.kind === "folder") work.push({ id: o.taskId, title: o.title, on: "home", then: "stays", line: t("move.work.stays", { computer, target }) });
    else if (p.kind === "repo") work.push({ id: o.taskId, title: o.title, on: "home", then: p.hasRemote === false ? "stays" : "branch", line: t(p.hasRemote === false ? "move.work.noRemote" : "move.work.branch", { computer, target }) });
    else work.push({ id: o.taskId, title: o.title, on: "home", then: "carry", line: t("move.work.carry", { target }) });
  }

  // ---------- what stays on this computer ----------
  const folder = join(ducterFolder({ ...(i.home ? { home: i.home } : {}), dataDir, env: i.env ?? process.env }).path, "worktrees");
  const hereTasks = work.filter((w) => w.then === "stays").length + (log?.routines.here ?? 0);
  if (hereTasks) stays.push({ id: "local-work", what: t("move.stays.local", { n: hereTasks }), detail: t("move.stays.local.why", { computer }), key: "move.stays.local", detailKey: "move.stays.local.why", vars: { n: hereTasks, computer } });
  if (exists(folder)) stays.push({ id: "worktrees", what: t("move.stays.worktrees"), detail: t("move.stays.worktrees.why"), bytes: sizeOf(folder), key: "move.stays.worktrees", detailKey: "move.stays.worktrees.why" });
  if (from === "darwin" && to?.os !== "darwin") stays.push({ id: "mac", what: t("move.stays.mac"), detail: t("move.stays.mac.why", { computer, target }), key: "move.stays.mac", detailKey: "move.stays.mac.why", vars: { computer, target } });
  if (exists(at("phone"))) stays.push({ id: "phone", what: t("move.stays.phone"), detail: t("move.stays.phone.why", { computer, target }), key: "move.stays.phone", detailKey: "move.stays.phone.why", vars: { computer, target } });

  // ---------- worth knowing ----------
  const busy = work.filter((w) => w.on === "home").length;
  if (busy) risks.push({ id: "busy", what: t("move.risk.busy", { n: busy }) });
  const quiet = [...devices.clients, ...devices.workers].filter((d) => d.lastSeen !== undefined && now - d.lastSeen > 30 * DAY);
  if (quiet.length) risks.push({ id: "quiet", what: t("move.risk.quiet", { n: quiet.length, names: quiet.map((d) => d.name).join(sep) }) });
  if (chats.length) risks.push({ id: "chats", what: t("move.risk.chats") });
  if (exists(at("saved")) && to && to.os !== "darwin" && from === "darwin") risks.push({ id: "autofill", what: t("move.risk.autofill") });
  if (to?.assumed) risks.push({ id: "assumed", what: t("move.risk.assumed", { name: to.name }) });
  const bytes = goes.reduce((n, g) => n + (g.bytes ?? 0), 0);
  risks.push({ id: "space", what: t("move.risk.space", { size: human(bytes) }) });
  risks.push({ id: "back", what: t("move.risk.back", { computer }) });

  return { ok: true, from: { computer, os: from, partner }, ...(to ? { to } : {}), goes, redo, follow, work, stays, risks, bytes };
}

export function human(n: number): string {
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let k = 0;
  while (v >= 1024 && k < u.length - 1) (v /= 1024), k++;
  return `${v >= 10 ? Math.round(v) : v.toFixed(1)} ${u[k]}`;
}

interface RenderableItem {
  id: string;
  what: string;
  detail?: string;
  bytes?: number;
  key?: MsgKey;
  detailKey?: MsgKey;
  vars?: Record<string, string | number>;
}

const isAgentSignIn = (it: RenderableItem): boolean => it.key === "move.redo.agent" && it.detailKey === "move.redo.agent.why" && typeof it.vars?.agent === "string";

/** The names in a sentence, with the table's own separator and final "and" (zh uses 、 for both). */
function joinedNames(names: string[], t: T): string {
  if (names.length <= 1) return names[0] ?? "";
  return names.slice(0, -1).join(t("move.list.sep")) + t("move.list.and") + names[names.length - 1]!;
}

/**
 * One renderer for every list of move items: the plan, the bundle and the received home. Sign-ins
 * that share one reason are one line (D621); GitHub keeps its own (another reason, a command).
 */
function renderedItems<I extends RenderableItem>(items: I[], t: T): { what: string; detail?: string; bytes?: number }[] {
  const firstAgent = items.findIndex((it) => isAgentSignIn(it));
  const agents = items.filter((it) => isAgentSignIn(it));
  const out: { what: string; detail?: string; bytes?: number }[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    if (isAgentSignIn(it)) {
      if (i !== firstAgent) continue;
      if (agents.length > 1) {
        const names = agents.map((a) => String(a.vars?.agent ?? "")).filter(Boolean);
        out.push({ what: t("move.redo.agents", { agents: joinedNames(names, t) }), detail: t("move.redo.agents.why", { computer: String(agents[0]?.vars?.computer ?? "") }) });
      } else {
        out.push({
          what: it.key ? t(it.key, it.vars ?? {}) : it.what,
          ...(it.detailKey ? { detail: t(it.detailKey, it.vars ?? {}) } : it.detail ? { detail: it.detail } : {}),
        });
      }
      continue;
    }
    out.push({
      what: it.key ? t(it.key, it.vars ?? {}) : it.what,
      ...(it.detailKey ? { detail: t(it.detailKey, it.vars ?? {}) } : it.detail ? { detail: it.detail } : {}),
      ...(it.bytes ? { bytes: it.bytes } : {}),
    });
  }
  return out;
}

export function formatMovePlan(p: MovePlan, t: T): string {
  const out: string[] = [];
  out.push(p.to ? t("move.head.to", { name: p.from.partner, from: p.from.computer, to: p.to.name }) : t("move.head", { name: p.from.partner, from: p.from.computer }));
  if (p.to?.known) out.push("  " + t("move.to.known", { to: p.to.name }));
  const section = (title: string, items: MoveItem[]) => {
    if (!items.length) return;
    out.push("", title);
    for (const it of renderedItems(items, t)) {
      out.push(`  ${it.what}${it.bytes ? `  (${human(it.bytes)})` : ""}`);
      if (it.detail) out.push(`    ${it.detail}`);
    }
  };
  section(t("move.section.goes", { size: human(p.bytes) }), p.goes);
  section(t("move.section.redo"), p.redo);
  section(t("move.section.follow"), p.follow);
  if (p.work.length) {
    out.push("", t("move.section.work"));
    for (const w of p.work) out.push(`  ${w.title}`, `    ${w.line}`);
  }
  section(t("move.section.stays"), p.stays);
  section(t("move.section.risks"), p.risks);
  out.push("", t("move.footer"));
  return out.join("\n");
}

export interface MoveCtx {
  t: T;
  dataDir: string;
  json: boolean;
  plan: boolean;
  bundle?: string;
  receive?: string;
  passphraseStdin?: boolean;
  to?: string;
  computer: string;
  platform: NodeJS.Platform;
  /** Test seams for the passphrase and this home's Autofill lock. */
  stdin?: () => Promise<string>;
  stdinIsTTY?: boolean;
  env?: Record<string, string | undefined>;
  now?: number;
  probe?: () => Promise<{ agents?: { name: string; harness?: string; signedIn: boolean }[]; github?: boolean }>;
  print?: (s: string) => void;
}

/** The items that stay behind or are redone, carried into the bundle so the new home can say them. */
function bundleItem(it: MoveItem): BundleItem {
  return {
    id: it.id,
    what: it.what,
    ...(it.detail ? { detail: it.detail } : {}),
    ...(it.key ? { key: it.key } : {}),
    ...(it.detailKey ? { detailKey: it.detailKey } : {}),
    ...(it.vars ? { vars: it.vars } : {}),
    ...(it.bytes ? { bytes: it.bytes } : {}),
  };
}

/** Plain words that travel with the bundle and are printed on both sides. */
function bundleNotes(dataDir: string): BundleNote[] {
  const at = (f: string) => join(dataDir, f);
  const notes: BundleNote[] = [];
  if (existsSync(at("kept-keys"))) notes.push({ id: "kept-keys", key: "move.bundle.notes.keptKeys" });
  if (existsSync(at("task-keys"))) notes.push({ id: "task-keys", key: "move.bundle.notes.taskKeys" });
  if (existsSync(at("key-grants.json"))) notes.push({ id: "grants", key: "move.bundle.notes.grants" });
  notes.push({ id: "caches", key: "move.bundle.notes.caches" });
  notes.push({ id: "running", key: "move.bundle.notes.running" });
  notes.push({ id: "next", key: "move.bundle.notes.next" });
  return notes;
}

function itemLines(items: BundleItem[], t: T): string[] {
  const out: string[] = [];
  for (const it of renderedItems(items, t)) {
    out.push(`  ${it.what}${it.bytes ? `  (${human(it.bytes)})` : ""}`);
    if (it.detail) out.push(`    ${it.detail}`);
  }
  return out;
}

function noteLines(notes: BundleNote[], t: T): string[] {
  return notes.map((n) => `  ${t(n.key, n.vars ?? {})}`);
}

function counts(t: T, files: number, entries: number): { files: string; entries: string } {
  return {
    files: t(files === 1 ? "move.count.file.one" : "move.count.file.many", { n: files }),
    entries: t(entries === 1 ? "move.count.entry.one" : "move.count.entry.many", { n: entries }),
  };
}

export function formatBundleResult(r: Extract<BundleWriteResult, { ok: true }>, t: T, file: string, passphrase: string, shown: boolean): string {
  const m = r.manifest;
  const out: string[] = [];
  out.push(t("move.bundle.head", { name: m.from.partner, computer: m.from.computer }));
  out.push(`  ${file}`);
  out.push(`  ${t("move.bundle.contents", { ...counts(t, r.files, r.events), size: human(r.bytes) })}`);
  out.push("");
  if (shown) {
    out.push(t("move.bundle.passphrase"));
    out.push(`  ${passphrase}`);
    out.push(t("move.bundle.passphrase.once"));
  } else {
    out.push(t("move.bundle.passphrase.stdin"));
  }
  out.push("");
  out.push(t("move.bundle.next", { file }));
  out.push("");
  if (m.redo.length) {
    out.push(t("move.section.redo"));
    out.push(...itemLines(m.redo, t));
    out.push("");
  }
  if (m.stays.length) {
    out.push(t("move.section.stays"));
    out.push(...itemLines(m.stays, t));
    out.push("");
  }
  if (m.notes.length) {
    out.push(t("move.section.risks"));
    out.push(...noteLines(m.notes, t));
    out.push("");
  }
  out.push(t("move.bundle.footer"));
  return out.join("\n");
}

export function formatReceiveResult(r: Extract<BundleReadResult, { ok: true }>, t: T, dir: string): string {
  const m = r.manifest;
  const out: string[] = [];
  out.push(t("move.receive.head", { name: m.from.partner, computer: m.from.computer, dir }));
  out.push(`  ${t("move.receive.checked", counts(t, r.files, r.events))}`);
  if (r.relocked) out.push(`  ${t("move.receive.autofill")}`);
  out.push(`  ${t("move.receive.notRunning", { computer: m.from.computer })}`);
  if (m.redo.length) {
    out.push("", t("move.section.redo"));
    out.push(...itemLines(m.redo, t));
  }
  if (m.stays.length) {
    out.push("", t("move.receive.section.stays", { computer: m.from.computer }));
    out.push(...itemLines(m.stays, t));
  }
  out.push("", t("move.section.risks"));
  out.push(`  ${t("move.receive.devices")}`);
  out.push(`  ${t("move.receive.mem")}`);
  out.push(...noteLines(m.notes.filter((n) => n.id === "caches" || n.id === "kept-keys" || n.id === "task-keys" || n.id === "grants"), t));
  out.push("");
  out.push(t("move.receive.next", { computer: m.from.computer }));
  out.push(t("move.receive.delete"));
  return out.join("\n");
}

function bundleError(e: Extract<BundleWriteResult, { ok: false }>, t: T, file: string): string {
  switch (e.error) {
    case "no_home":
      return t("move.noHome", { dir: "" });
    case "exists":
      return t("move.bundle.exists", { file });
    case "inside":
      return t("move.bundle.inside", { file });
    case "no_dir":
      return t("move.bundle.noDir", { file });
    case "no_autofill_key":
      return t("move.bundle.noAutofillKey");
    case "autofill_damaged":
      return t("move.bundle.autofillDamaged");
    case "changed":
      return t("move.bundle.changed", { file: e.detail ?? "" });
    case "passphrase":
      return t("move.passphrase.empty");
    default:
      return t("move.bundle.write", { file, detail: e.detail ?? "" });
  }
}

function receiveError(e: Extract<BundleReadResult, { ok: false }>, t: T, file: string, dir: string): string {
  switch (e.error) {
    case "not_empty":
      return t("move.receive.notEmpty", { dir });
    case "bad_file":
      return t("move.receive.badFile", { file });
    case "wrong_passphrase":
      return t("move.receive.wrongPassphrase");
    case "tampered":
      return t("move.receive.tampered");
    case "no_space":
      return t("move.receive.noSpace", { size: human(e.need ?? 0), free: human(e.free ?? 0), dir });
    case "autofill_key":
      return t("move.receive.autofillKey");
    case "passphrase":
      return t("move.passphrase.empty");
    default:
      return t("move.receive.write", { dir, detail: e.detail ?? "" });
  }
}

/** A typed passphrase without echo on a terminal; stdin otherwise. Never an argument, never a file. */
async function readPassphrase(c: MoveCtx, prompt: string): Promise<string> {
  if (c.stdin) return (await c.stdin()).trim();
  if (c.passphraseStdin || c.stdinIsTTY === false || !process.stdin.isTTY) return (await Bun.stdin.text()).split(/\r?\n/)[0]!.trim();
  return (await readHidden(prompt)).trim();
}

function readHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    stdin.setRawMode?.(true);
    stdin.resume();
    let s = "";
    const done = (v: string) => {
      stdin.off("data", on);
      stdin.setRawMode?.(false);
      stdin.pause();
      process.stdout.write("\n");
      resolve(v);
    };
    const on = (b: Buffer) => {
      for (const ch of b.toString("utf8")) {
        if (ch === "\r" || ch === "\n") return done(s);
        if (ch === "\u0003") return done("");
        if (ch === "\u007f" || ch === "\b") s = s.slice(0, -1);
        else s += ch;
      }
    };
    stdin.on("data", on);
  });
}

async function cmdBundle(c: MoveCtx, file: string): Promise<number> {
  const print = c.print ?? ((s: string) => console.log(s));
  if (!isHome(c.dataDir)) {
    print(c.json ? JSON.stringify({ ok: false, error: "no_home", dataDir: c.dataDir }) : c.t("move.noHome", { dir: c.dataDir }));
    return 1;
  }
  const facts = (await c.probe?.().catch(() => ({}))) ?? {};
  const p = planMove({ dataDir: c.dataDir, t: c.t, computer: c.computer, platform: c.platform, ...(c.to ? { to: c.to } : {}), ...facts, ...(c.now ? { now: c.now } : {}) });
  if (!p.ok) return 1;
  const fromStdin = Boolean(c.passphraseStdin || c.stdin);
  const passphrase = fromStdin ? await readPassphrase(c, c.t("move.receive.passphrasePrompt")) : newPassphrase();
  if (!passphrase) {
    print(c.json ? JSON.stringify({ ok: false, error: "passphrase" }) : c.t("move.passphrase.empty"));
    return 1;
  }
  const r = await writeBundle({
    dataDir: c.dataDir,
    out: file,
    passphrase,
    from: { computer: p.from.computer, os: p.from.os, partner: p.from.partner },
    goes: p.goes.map(bundleItem),
    redo: p.redo.map(bundleItem),
    stays: p.stays.map(bundleItem),
    notes: bundleNotes(c.dataDir),
    includeBrowser: p.goes.some((g) => g.id === "browser"),
    platform: c.platform,
    env: c.env ?? process.env,
    ...(c.now ? { now: c.now } : {}),
  });
  if (!r.ok) {
    print(c.json ? JSON.stringify({ ok: false, error: r.error, file }) : bundleError(r, c.t, file));
    return 1;
  }
  if (c.json) print(JSON.stringify({ ok: true, file, bytes: r.bytes, files: r.files, events: r.events, passphrase: fromStdin ? undefined : passphrase, manifest: r.manifest }, null, 2));
  else print(formatBundleResult(r, c.t, file, passphrase, !fromStdin));
  return 0;
}

async function cmdReceive(c: MoveCtx, file: string): Promise<number> {
  const print = c.print ?? ((s: string) => console.log(s));
  if (homeHasWork(c.dataDir)) {
    print(c.json ? JSON.stringify({ ok: false, error: "not_empty", dataDir: c.dataDir }) : c.t("move.receive.notEmpty", { dir: c.dataDir }));
    return 1;
  }
  if (!existsSync(file)) {
    print(c.json ? JSON.stringify({ ok: false, error: "bad_file", file }) : c.t("move.receive.badFile", { file }));
    return 1;
  }
  const passphrase = await readPassphrase(c, c.t("move.receive.passphrasePrompt"));
  if (!passphrase) {
    print(c.json ? JSON.stringify({ ok: false, error: "passphrase" }) : c.t("move.passphrase.empty"));
    return 1;
  }
  const r = await readBundle({ file, dataDir: c.dataDir, passphrase, platform: c.platform, env: c.env ?? process.env });
  if (!r.ok) {
    print(c.json ? JSON.stringify({ ok: false, error: r.error, file, dataDir: c.dataDir, detail: r.detail }) : receiveError(r, c.t, file, c.dataDir));
    return 1;
  }
  if (c.json) print(JSON.stringify({ ok: true, dataDir: c.dataDir, files: r.files, events: r.events, relocked: r.relocked, manifest: r.manifest }, null, 2));
  else print(formatReceiveResult(r, c.t, c.dataDir));
  return 0;
}

export async function cmdMove(c: MoveCtx): Promise<number> {
  const print = c.print ?? ((s: string) => console.log(s));
  if (c.bundle && c.receive) {
    print(c.t("move.oneAtATime"));
    return 2;
  }
  if (c.bundle) return cmdBundle(c, c.bundle);
  if (c.receive) return cmdReceive(c, c.receive);
  if (!c.plan) {
    print(c.t("move.usage"));
    return 2;
  }
  if (!isHome(c.dataDir)) {
    print(c.json ? JSON.stringify({ ok: false, error: "no_home", dataDir: c.dataDir }) : c.t("move.noHome", { dir: c.dataDir }));
    return 1;
  }
  const facts = (await c.probe?.().catch(() => ({}))) ?? {};
  const p = planMove({ dataDir: c.dataDir, t: c.t, computer: c.computer, platform: c.platform, ...(c.to ? { to: c.to } : {}), ...facts, ...(c.now ? { now: c.now } : {}) });
  if (!p.ok) return 1;
  print(c.json ? JSON.stringify(p, null, 2) : formatMovePlan(p, c.t));
  return 0;
}
