// D299: 也在这台电脑上 / Also on this computer. The sessions the person ran by hand in their own
// AI agents (Claude Code, Codex, pi) on the home, found in Past tasks beside Ducter's own tasks,
// and carried on in Ducter: the same agent resumes the very session in its own folder, or another
// agent starts there from what it said.
//
// Shown by default, read lazily (only when Past tasks asks, or the person asks the partner, D376) and locally; one tap hides an agent's
// sessions for good (<dataDir>/outside.json). Ducter's own sessions are never listed (the Log
// knows their ids; its folders and temporary folders are left out). Nothing leaves the home.
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fill, words, type LangTag } from "@ducter/protocol/src/lang.ts";
import { harnessName, OUTSIDE_AGENTS, type Bodies, type LogEvent, type OutsideAgent, type OutsideField, type OutsideItem, type OutsideSource, type PastQuery } from "@ducter/protocol";
import type { LogStore, Runner, TaskRegistry, WorkerLinks } from "@ducter/protocol/src/internal.ts";
import type { LocalAgents, SessionSummary } from "./local-agents/index.ts";
import type { LocalSessionAnswer, LocalSessionsAnswer, WireSession } from "./worker-records.ts";
import { kindOf, queryTerms, termIn, timeWords } from "./past.ts";

export interface OutsideDeps {
  reader: LocalAgents;
  dataDir: string;
  log: LogStore;
  tasks: TaskRegistry;
  /** Ducter's own folder (worktrees, projects): sessions there are Ducter's. */
  ducterFolder?: () => string;
  home?: string;
  now?: () => number;
  /** The language the person reads in (the task's reports, what a refusal says). */
  language?: () => LangTag;
  /** D327: whether the person lets Ducter read their agents' records at all (Settings, 别再看了). */
  looks?: () => boolean;
  /** D327 (5): the home's name: whose records they are, said by name. */
  computer?: () => string;
  /** D377: the computers for tasks, whose records are read there after a yes said for that computer. */
  workers?: () => WorkerLinks | undefined;
}

/** D377: one session found for the partner, on the computer it is on ("local": the home). */
export interface OwnItem extends OutsideItem {
  device: string;
  computer: string;
  open?: "running" | "recent";
}

/** D377: what own_session_find found on every awake computer. */
export interface OwnFound {
  items: OwnItem[];
  /** The computers whose records were read for it, by device ("local" first). */
  read: { device: string; computer: string }[];
  /** Awake computers for tasks with records nobody said yes to there yet: which agents, and when each last wrote. */
  notYet: { device: string; computer: string; agents: { agent: OutsideAgent; lastAt: string }[] }[];
  /** Computers where the person said 别再看了 / Stop looking. */
  off: string[];
  /** Computers that couldn't say: a Ducter there from before D377, or no answer in time. */
  unread: string[];
}

/** D377: a computer's answer is kept this long (one find and its continue never ask twice). */
export const REMOTE_FRESH_MS = 15_000;

export interface Outside {
  /** D376: whether looking is on (Settings › 读它们留下的记录), and the computer the records are on. */
  looks(): boolean;
  computer(): string | undefined;
  /** The sessions to show for this query, best first (at most `limit`, default 40), and each agent's count. */
  list(q: PastQuery, limit?: number): { items: OutsideItem[]; sources: OutsideSource[] };
  hide(agent: OutsideAgent, hidden: boolean): void;
  hidden(): OutsideAgent[];
  /** D327: 这个文件夹别看了 / Leave this folder out, for Past tasks and the first words alike (`~/…` or absolute). */
  hideFolder(path: string, hidden: boolean): void;
  /** The folders left out, absolute. */
  hiddenFolders(): string[];
  /** Whether a session's folder is one left out (it or a folder inside it). */
  leftOut(cwd: string): boolean;
  /** `~/…` for a folder under the home folder. */
  tilde(path: string): string;
  /**
   * Carries one on as a Ducter task; the task's id. A session carried on before opens its task again.
   * D376: never one still open where the person runs it (`open` says how it knows); a session only
   * written in the last two minutes goes once the person says it is closed (`closed`). `ask`: what
   * the person asks of it now, said with its first turn (from the conversation).
   */
  adopt(runner: Runner | undefined, persona: string, agent: OutsideAgent, id: string, harness?: string, model?: string, o?: { ask?: string; closed?: boolean; device?: string }): Promise<{ ok: boolean; taskId?: string; message?: string; open?: "running" | "recent"; reused?: true }>;
  /** D376: whether a session is still open where the person ran it (the reader's openNow). */
  openNow(agent: OutsideAgent, id: string): "running" | "recent" | undefined;
  /** D376: the first time the partner looks in these records for the person: true once, then false. */
  firstLook(): boolean;
  /** D377: of these computers ("local": the home), the ones whose records the partner looks at for the first time (each said once). */
  firstLookAt(devices: string[]): string[];
  /** D377: own_session_find on every awake computer: the home's records and each computer for tasks that said yes. */
  find(q: PastQuery, limit?: number): Promise<OwnFound>;
}

const DAY = 24 * 3600_000;

/** What a refusal says, per language (D292). */
const SAY = {
  en: { noRunner: "Tasks can't run right now.", away: "I can't reach {computer} right now.", notYet: "{computer} hasn't let me look at your records yet.", old: "Ducter on {computer} is too old for this: update it first.", missing: "I can't find that session any more.", gone: "Its folder {path} isn't there any more.", running: "It's still open in {agent}. Close it there first (/exit), then carry it on here.", recent: "{agent} wrote to it a moment ago. If it's closed there, try again." },
  zh: { noRunner: "现在开不了任务。", away: "现在连不上 {computer}。", notYet: "{computer} 还没让我看你的记录。", old: "{computer} 上的 Ducter 太旧了，先更新一下。", missing: "找不到这段对话了。", gone: "它的文件夹 {path} 不在了。", running: "它还在 {agent} 里开着。先在那边退出（/exit），再在这里接着做。", recent: "{agent} 刚刚还在写它。那边关掉了的话，再试一次。" },
};
const WEIGHT: Record<OutsideField, number> = { title: 5, branch: 4, project: 4, words: 3, agent: 2.5 };

export function createOutside(d: OutsideDeps): Outside {
  const now = d.now ?? Date.now;
  const home = d.home ?? homedir();
  const file = join(d.dataDir, "outside.json");
  let hidden = new Set<OutsideAgent>();
  let folders = new Set<string>();
  // D376: the partner said once what it reads when it looks for the person's session.
  let looked = false;
  // D377: and on each computer for tasks, by device id.
  const lookedAt = new Set<string>();
  /** D376: a session refused as written a moment ago, and when: asked again within 10 min, it goes. */
  const recentWarned = new Map<string, number>();
  try {
    if (existsSync(file)) {
      const j = JSON.parse(readFileSync(file, "utf8")) as { hidden?: unknown; folders?: unknown; looked?: unknown };
      looked = j.looked === true;
      const at = (j as { lookedAt?: unknown }).lookedAt;
      if (Array.isArray(at)) for (const x of at) if (typeof x === "string") lookedAt.add(x);
      if (Array.isArray(j.hidden)) hidden = new Set(j.hidden.filter((a): a is OutsideAgent => (OUTSIDE_AGENTS as readonly string[]).includes(a)));
      if (Array.isArray(j.folders)) folders = new Set(j.folders.filter((f): f is string => typeof f === "string" && f.startsWith("/")));
    }
  } catch {
    /* a broken file shows everything */
  }
  const save = () => {
    mkdirSync(d.dataDir, { recursive: true });
    writeFileSync(`${file}.tmp`, JSON.stringify({ version: 1, hidden: [...hidden], ...(folders.size ? { folders: [...folders] } : {}), ...(looked ? { looked: true } : {}), ...(lookedAt.size ? { lookedAt: [...lookedAt] } : {}) }, null, 2));
    renameSync(`${file}.tmp`, file);
  };
  const absolute = (p: string) => resolve(p === "~" ? home : p.startsWith("~/") ? join(home, p.slice(2)) : p);
  const leftOut = (cwd: string) => {
    const c = resolve(cwd);
    for (const f of folders) if (c === f || c.startsWith(f.endsWith(sep) ? f : f + sep)) return true;
    return false;
  };

  // Ducter's own sessions: every native id a task ever ran under, kept live.
  const owned = new Set<string>();
  let watching = false;
  const note = (e: LogEvent) => {
    if (e.kind !== "task_event") return;
    const raw = (e.body as Bodies["task_event"]).raw as { sessionId?: unknown } | undefined;
    if (typeof raw?.sessionId === "string") owned.add(raw.sessionId);
  };
  const watch = () => {
    if (watching) return;
    watching = true;
    for (const e of d.log.read({ fromSeq: 0, limit: Number.MAX_SAFE_INTEGER, kinds: ["task_event"] })) note(e);
    d.log.subscribe(note);
  };
  const under = (p: string, root: string) => p === root || p.startsWith(root.endsWith(sep) ? root : root + sep);
  // Sessions in a temporary folder are experiments, not work; unless the home read is itself a
  // temporary one (a test's, the demo's).
  const read = Object.values(d.reader.roots()).map((r) => resolve(r));
  const temp = [tmpdir(), "/tmp", "/private/tmp", "/var/folders", "/private/var/folders"].map((p) => resolve(p)).filter((t) => !read.some((r) => under(r, t)));
  const ducters = () => [resolve(d.dataDir), ...(d.ducterFolder ? [resolve(d.ducterFolder())] : [])];
  const ours = (s: SessionSummary) => owned.has(s.id) || ducters().some((r) => under(resolve(s.cwd), r)) || temp.some((r) => under(resolve(s.cwd), r));

  // A folder's project name: a git worktree's own repo when it is one (another workbench's
  // worktrees are named by place), else the folder's name. Cached per folder.
  const names = new Map<string, string>();
  const projectOf = (cwd: string): string => {
    const had = names.get(cwd);
    if (had !== undefined) return had;
    let name = basename(cwd) || cwd;
    try {
      const dotgit = join(cwd, ".git");
      if (existsSync(dotgit) && statSync(dotgit).isFile()) {
        const m = /^gitdir:\s*(.+)$/m.exec(readFileSync(dotgit, "utf8"));
        // <repo>/.git/worktrees/<name>
        if (m) {
          const gd = resolve(cwd, m[1]!.trim());
          if (basename(dirname(gd)) === "worktrees") name = basename(dirname(dirname(dirname(gd)))) || name;
        }
      }
    } catch {
      /* the folder's own name */
    }
    names.set(cwd, name);
    return name;
  };
  const tilde = (p: string) => (under(p, home) ? `~${p.slice(home.length)}` : p);

  const itemOf = (s: SessionSummary): OutsideItem => {
    const title = s.title ?? s.firstPrompt ?? "";
    return {
      agent: s.agent,
      id: s.id,
      title,
      ...(s.title && s.firstPrompt && s.firstPrompt !== s.title ? { ask: s.firstPrompt } : {}),
      project: projectOf(s.cwd),
      cwd: tilde(s.cwd),
      ...(s.branch ? { branch: s.branch } : {}),
      ...(s.model ? { model: s.model } : {}),
      startedAt: s.startedAt,
      updatedAt: s.updatedAt,
      kind: kindOf(title, `${s.firstPrompt ?? ""}\n${s.lastPrompt ?? ""}`),
      ...(existsSync(s.cwd) ? {} : { gone: true as const }),
    };
  };

  /** A session as ranked: what it says (absolute folder) and the item shown for it. */
  type Cand<T extends OutsideItem> = { s: Pick<SessionSummary, "agent" | "id" | "cwd" | "branch" | "title" | "firstPrompt" | "lastPrompt" | "model" | "startedAt" | "updatedAt">; it: T };
  /** The query's sessions among these, best first, each with its best hit (Past tasks' ranking). */
  function rank<T extends OutsideItem>(cands: Cand<T>[], q: PastQuery): { it: T; score: number; at: number }[] {
    const t = now();
    const raw = String(q.q ?? "").trim().slice(0, 200);
    const tw = raw ? timeWords(raw, t) : undefined;
    const terms = queryTerms(tw ? tw.rest : raw);
    const since = Math.max(tw?.since ?? -Infinity, q.since ? Date.parse(q.since) : -Infinity);
    const before = Math.min(tw?.before ?? Infinity, q.before ? Date.parse(q.before) : Infinity);
    const scored: { it: T; score: number; at: number }[] = [];
    for (const { s, it } of cands) {
      if (hidden.has(s.agent)) continue;
      if (q.harness && q.harness !== s.agent) continue;
      const at = Date.parse(s.updatedAt);
      if (!(Date.parse(s.startedAt) < before && at >= since)) continue;
      if (q.project !== undefined && q.project !== null && it.project !== q.project) continue;
      if (!terms.length) {
        scored.push({ it, score: 1, at });
        continue;
      }
      const fields: [OutsideField, string, string][] = [
        ["title", it.title.toLowerCase(), it.title],
        ["branch", (s.branch ?? "").toLowerCase(), s.branch ?? ""],
        ["project", `${it.project} ${s.cwd}`.toLowerCase(), it.project],
        ["words", [s.firstPrompt, s.lastPrompt].filter(Boolean).join("\n").toLowerCase(), [s.firstPrompt, s.lastPrompt].filter(Boolean).join("\n")],
        ["agent", `${s.agent} ${harnessName(s.agent)} ${s.model ?? ""}`.toLowerCase(), harnessName(s.agent)],
      ];
      let score = 0;
      let matched = 0;
      let best: { f: OutsideField; w: number; shown: string } | undefined;
      for (const term of terms) {
        let top = 0;
        for (const [f, text, shown] of fields) {
          const m = termIn(term, text);
          if (!m.s) continue;
          const w = WEIGHT[f] * m.s;
          top = Math.max(top, w);
          if (f !== "title" && f !== "project" && f !== "agent" && (!best || w > best.w)) best = { f, w, shown };
        }
        if (top) matched++;
        score += top;
      }
      // Every word somewhere (the tasks' rule); outside sessions never stand in as the closest.
      if (matched < terms.length) continue;
      if (best) {
        const line = best.shown.split("\n").find((l) => terms.some((x) => l.toLowerCase().includes(x))) ?? best.shown;
        it.hit = { field: best.f, text: line.length > 90 ? `${line.slice(0, 89)}…` : line };
      }
      const ageDays = Math.max(0, (t - at) / DAY);
      scored.push({ it, score: score * (1 + 0.35 * Math.exp(-ageDays / 21)), at });
    }
    return scored.sort((x, y) => (terms.length ? y.score - x.score : 0) || y.at - x.at);
  }
  const adoptedIds = () => new Set(d.tasks.list().flatMap((c) => (c.outside ? [c.outside.sessionId] : [])));

  // D377: what each computer for tasks last answered, and on which computer a session was found.
  const remote = new Map<string, { at: number; answer: LocalSessionsAnswer | "old" | "unreached" }>();
  const foundOn = new Map<string, string>();
  const askRemote = async (link: NonNullable<ReturnType<WorkerLinks["link"]>>): Promise<LocalSessionsAnswer | "old" | "unreached"> => {
    const had = remote.get(link.id);
    if (had && now() - had.at < REMOTE_FRESH_MS && typeof had.answer !== "string") return had.answer;
    let answer: LocalSessionsAnswer | "old" | "unreached";
    try {
      answer = await link.call<LocalSessionsAnswer>("local_sessions", {}, 5000);
      if (!answer || typeof answer !== "object" || typeof (answer as { allowed?: unknown }).allowed !== "boolean") answer = "old";
    } catch (err) {
      // A Ducter there from before D377 doesn't know the op.
      answer = /unknown op/.test((err as Error).message) ? "old" : "unreached";
    }
    remote.set(link.id, { at: now(), answer });
    return answer;
  };
  /** A worker's session as an item: its folder with ~ for that computer's home folder. */
  const wireItem = (w: WireSession, whose: string): OutsideItem => {
    const title = w.title ?? w.firstPrompt ?? "";
    const cwd = under(w.cwd, whose) ? `~${w.cwd.slice(whose.length)}` : w.cwd;
    return {
      agent: w.agent,
      id: w.id,
      title,
      ...(w.title && w.firstPrompt && w.firstPrompt !== w.title ? { ask: w.firstPrompt } : {}),
      project: w.project,
      cwd,
      ...(w.branch ? { branch: w.branch } : {}),
      ...(w.model ? { model: w.model } : {}),
      startedAt: w.startedAt,
      updatedAt: w.updatedAt,
      kind: kindOf(title, `${w.firstPrompt ?? ""}\n${w.lastPrompt ?? ""}`),
      ...(w.gone ? { gone: true as const } : {}),
    };
  };

  /** D377: carried on on the computer for tasks it was found on: checked and read there (local_session). */
  async function adoptThere(runner: Runner, persona: string, device: string, agent: OutsideAgent, id: string, harness: string | undefined, model: string | undefined, o: { ask?: string; closed?: boolean }, say: (typeof SAY)["en"], lang: LangTag) {
    const link = d.workers?.()?.link(device);
    const computer = link?.name ?? device;
    if (!link || !link.online()) return { ok: false, message: fill(say.away, { computer }) };
    let r: LocalSessionAnswer;
    try {
      r = await link.call<LocalSessionAnswer>("local_session", { agent, id }, 10_000);
    } catch (err) {
      return { ok: false, message: fill(/unknown op/.test((err as Error).message) ? say.old : say.away, { computer }) };
    }
    if (!r?.allowed) return { ok: false, message: fill(say.notYet, { computer }) };
    const s = r.session;
    if (!s) return { ok: false, message: say.missing };
    if (s.gone) return { ok: false, message: fill(say.gone, { path: wireItem(s, r.home).cwd }) };
    const key = `${device}:${agent}:${id}`;
    const warned = s.open === "recent" && !o.closed && !(now() - (recentWarned.get(key) ?? -Infinity) < 10 * 60_000);
    if (warned) recentWarned.set(key, now());
    if (s.open === "running" || warned) return { ok: false, open: s.open, message: fill(s.open === "running" ? say.running : say.recent, { agent: harnessName(agent) }) };
    const to = harness && harness !== agent ? harness : agent;
    const it = wireItem(s, r.home);
    const title = [...it.title].length > 80 ? `${[...it.title].slice(0, 79).join("")}…` : it.title || harnessName(agent);
    try {
      const card = await runner.openTask({
        persona,
        title,
        brief: s.firstPrompt ?? title,
        // That computer's own folder, the very session resumed there (the worker runs its agent).
        place: { kind: "folder", device: link.id, path: s.cwd },
        project: it.project,
        harness: to,
        ...(model ? { model } : to === agent && s.model ? { model: s.model } : {}),
        language: lang,
        origin: "you",
        adopt: { agent, sessionId: id, startedAt: s.startedAt, turns: Array.isArray(r.turns) ? r.turns : [], ...(o.ask?.trim() ? { ask: o.ask.trim() } : {}) },
      });
      return { ok: true, taskId: card.taskId };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }

  const self: Outside = {
    list(q, limit = 40) {
      watch();
      // A session carried on already is a task now: it is listed as one.
      const adopted = adoptedIds();
      // D327: 别再看了 means everywhere: with looking off, nothing of the records is read or listed.
      if (d.looks && !d.looks()) return { items: [], sources: [] };
      const all = d.reader.sessions().filter((s) => !ours(s) && !adopted.has(s.id) && !leftOut(s.cwd));
      const sources: OutsideSource[] = OUTSIDE_AGENTS.map((agent) => ({ agent, n: all.filter((s) => s.agent === agent).length, hidden: hidden.has(agent) })).filter((x) => x.n > 0 || x.hidden);
      // Starred and tags are the person's marks on Ducter's tasks: an outside session has none.
      if (q.starred || q.tag) return { items: [], sources };
      return { items: rank(all.map((s) => ({ s, it: itemOf(s) })), q).slice(0, Math.max(1, limit)).map((x) => x.it), sources };
    },
    async find(q, limit = 5) {
      const out: OwnFound = { items: [], read: [], notYet: [], off: [], unread: [] };
      if (d.looks && !d.looks()) return out;
      watch();
      const adopted = adoptedIds();
      // The home's name as Outside says it (a test or the eval names it).
      const homeName = self.computer() ?? "this computer";
      const cands: Cand<OwnItem>[] = d.reader
        .sessions()
        .filter((s) => !ours(s) && !adopted.has(s.id) && !leftOut(s.cwd))
        .map((s) => ({ s, it: { ...itemOf(s), device: "local", computer: homeName } }));
      out.read.push({ device: "local", computer: homeName });
      // Every awake computer for tasks, asked at once; one that doesn't answer in time is said as such.
      const links = (d.workers?.()?.list() ?? []).filter((w) => w.online).map((w) => d.workers?.()?.link(w.id)).filter((l): l is NonNullable<typeof l> => !!l && l.online());
      const answers = await Promise.all(links.map(async (l) => ({ l, a: await askRemote(l) })));
      for (const { l, a } of answers) {
        if (a === "old" || a === "unreached") out.unread.push(l.name);
        else if (!a.allowed) {
          if (a.state === "off") out.off.push(l.name);
          else if (a.agents.length) out.notYet.push({ device: l.id, computer: l.name, agents: a.agents });
        } else {
          out.read.push({ device: l.id, computer: l.name });
          for (const w of a.sessions) {
            if (owned.has(w.id) || adopted.has(w.id)) continue;
            cands.push({ s: { ...w, title: w.title, firstPrompt: w.firstPrompt, lastPrompt: w.lastPrompt }, it: { ...wireItem(w, a.home), device: l.id, computer: l.name, ...(w.open ? { open: w.open } : {}) } });
          }
        }
      }
      out.items = rank(cands, q)
        .slice(0, Math.max(1, limit))
        .map((x) => x.it);
      for (const it of out.items) {
        if (it.device === "local") {
          const o = d.reader.openNow(it.agent, it.id);
          if (o) it.open = o;
        }
        foundOn.set(`${it.agent}:${it.id}`, it.device);
      }
      return out;
    },
    hide(agent, on) {
      if (!(OUTSIDE_AGENTS as readonly string[]).includes(agent)) return;
      if (on) hidden.add(agent);
      else hidden.delete(agent);
      save();
    },
    hidden: () => [...hidden],
    hideFolder(path, on) {
      const p = String(path ?? "").trim();
      if (!p || !(p.startsWith("/") || p.startsWith("~"))) return;
      const abs = absolute(p);
      if (abs === "/" || abs === resolve(home)) return; // never the whole computer or home folder: that is 别再看了
      if (on) folders.add(abs);
      else folders.delete(abs);
      save();
    },
    hiddenFolders: () => [...folders],
    leftOut,
    tilde,
    looks: () => !d.looks || d.looks(),
    computer: () => d.computer?.(),
    openNow: (agent, id) => d.reader.openNow(agent, id),
    firstLook() {
      if (looked) return false;
      looked = true;
      save();
      return true;
    },
    firstLookAt(devices) {
      const first = [...new Set(devices)].filter((x) => (x === "local" ? !looked : !lookedAt.has(x)));
      if (!first.length) return [];
      for (const x of first) x === "local" ? (looked = true) : lookedAt.add(x);
      save();
      return first;
    },
    async adopt(runner, persona, agent, id, harness, model, o = {}) {
      const lang = d.language?.() ?? "en";
      const say = words(SAY, lang);
      // Carried on before: that task is the one to open (the person continues it there).
      const had = d.tasks.list().find((c) => c.outside?.agent === agent && c.outside.sessionId === id);
      if (had) return { ok: true, taskId: had.taskId, reused: true };
      if (!runner) return { ok: false, message: say.noRunner };
      // D377: found on a computer for tasks: carried on there.
      const there = o.device ?? foundOn.get(`${agent}:${id}`);
      if (there && there !== "local") return adoptThere(runner, persona, there, agent, id, harness, model, o, say, lang);
      const s = d.reader.summary(agent, id);
      if (!s) return { ok: false, message: say.missing };
      if (!existsSync(s.cwd)) return { ok: false, message: fill(say.gone, { path: tilde(s.cwd) }) };
      // D376: two writers on one conversation (the terminal's and Ducter's) would garble it for both.
      const open = d.reader.openNow(agent, id);
      // A session written a moment ago: refused once; asked again (the person closed it, or a tap again) it goes.
      const key = `${agent}:${id}`;
      const warned = open === "recent" && !o.closed && !(now() - (recentWarned.get(key) ?? -Infinity) < 10 * 60_000);
      if (warned) recentWarned.set(key, now());
      if (open === "running" || warned) return { ok: false, open, message: fill(open === "running" ? say.running : say.recent, { agent: harnessName(agent) }) };
      const to = harness && harness !== agent ? harness : agent;
      const it = itemOf(s);
      const title = [...it.title].length > 80 ? `${[...it.title].slice(0, 79).join("")}…` : it.title || harnessName(agent);
      // The brief is the person's own first ask, as they typed it (what 你交给它的事 shows); where the
      // session came from goes to the agent with its first turn (the runner's).
      const brief = s.firstPrompt ?? title;
      try {
        const card = await runner.openTask({
          persona,
          title,
          brief,
          place: { kind: "folder", device: "local", path: s.cwd },
          project: it.project,
          harness: to,
          // The same agent keeps the session's own model unless the person picked one.
          ...(model ? { model } : to === agent && s.model ? { model: s.model } : {}),
          language: lang,
          origin: "you",
          adopt: { agent, sessionId: id, startedAt: s.startedAt, turns: d.reader.history(agent, id, { turns: 60 }), ...(o.ask?.trim() ? { ask: o.ask.trim() } : {}) },
        });
        return { ok: true, taskId: card.taskId };
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    },
  };
  return self;
}
