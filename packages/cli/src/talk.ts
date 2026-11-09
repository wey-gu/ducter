// Talking to the running Ducter from a terminal (D128): `ducter task` opens a task with your
// own words (the New task card's path), `ducter say` talks to the partner and waits for its
// reply, `ducter tail` follows the conversation or one task, `ducter answer` answers a
// decision, `ducter open <task>` shows a task in the app. Each speaks the apps' protocol over
// the client WebSocket (client.ts), so a lead agent can work Ducter without anyone relaying.
import { basename, resolve } from "node:path";
import type { Bodies, Candidate, LogEvent, Place, ServerFrame, TaskCard } from "@ducter/protocol";
import { harnessName } from "@ducter/protocol";
import { realGit, repoTop, type GitRun } from "@ducter/core/src/newtask.ts";
import { connect, type Conn } from "./client.ts";
import { plainStyle, type Style } from "./doctor.ts";
import type { T } from "./i18n.ts";
import { openDecisions, pickTask } from "./status.ts";
import { homeJson, whyUnreached, type Target } from "./home.ts";
import { hostname } from "node:os";

export interface TalkCtx {
  t: T;
  style?: Style;
  port: number;
  /** Where these commands go (D146); absent: this machine on `port`. */
  target?: Target;
  json: boolean;
  rest: string[];
  repo?: string;
  agent?: string;
  base?: string;
  timeoutS?: number;
  cwd?: string;
  /** The commands the hints name, with this run's --port / --data-dir. */
  cmd: (sub: string) => string;
  git?: GitRun;
  print?: (s: string) => void;
  /** tail: stop after this many ms (tests); default: until Ctrl-C or Ducter stops. */
  followMs?: number;
}

const out = (c: TalkCtx) => c.print ?? ((s: string) => console.log(s));
const st = (c: TalkCtx) => c.style ?? plainStyle;
const newClientId = () => `cli_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const one = (s: string, n = 160) => {
  const l = s.replace(/\s+/g, " ").trim();
  return l.length > n ? l.slice(0, n - 1) + "…" : l;
};

const targetOf = (c: TalkCtx): Target => c.target ?? { kind: "local", port: c.port };
/** `home` in --json output (D146). */
const withHome = (c: TalkCtx, o: object) => ({ ...o, home: homeJson(targetOf(c)) });

/** Why nothing answered, in words that say what to do: this machine's Ducter isn't running, or
 *  the home is unreachable / no longer takes this command line's token (D146). */
export async function notReached(t: T, target: Target): Promise<string> {
  if (target.kind === "local") return t("status.notRunning", { port: target.port });
  const why = await whyUnreached(target);
  const vars = { name: target.name, address: target.address };
  return t(why === "revoked" ? "home.revoked" : why === "unreachable" ? "home.unreachable" : "home.noGreeting", vars);
}

async function conn(c: TalkCtx, cursor?: number): Promise<Conn | undefined> {
  const k = await connect(targetOf(c), { ...(cursor != null ? { cursor } : {}) });
  if (!k) out(c)(await notReached(c.t, targetOf(c)));
  return k;
}

/** "Claude Code · haiku" */
export function agentLabel(h: { harness: string; model?: string }): string {
  return `${harnessName(h.harness)}${h.model ? ` · ${h.model}` : ""}`;
}

/**
 * What `--agent` names: harness/model ("claude-code/haiku"), a harness id or its name
 * ("codex", "Claude Code"), or a model a candidate runs ("sonnet"). Candidates first; a
 * harness/model the list doesn't offer is passed on as written (the runner says if it can't).
 */
export function resolveAgent(name: string, candidates: Candidate[]): { harness: string; model?: string } | undefined {
  const n = name.trim().toLowerCase();
  if (!n) return undefined;
  const [h, m] = n.includes("/") ? (n.split("/", 2) as [string, string]) : [n, undefined];
  const norm = (s: string) => s.toLowerCase().replace(/[\s_]+/g, "-");
  const isH = (c: { harness: string }) => norm(c.harness) === norm(h) || norm(harnessName(c.harness)) === norm(h) || norm(c.harness).startsWith(norm(h) + "-");
  const ok = candidates.filter((c) => !c.blocked);
  if (m) return ok.find((c) => isH(c) && c.model?.toLowerCase() === m) ?? (candidates.find(isH) ? { harness: candidates.find(isH)!.harness, model: m } : { harness: h, model: m });
  const byH = ok.find(isH) ?? candidates.find(isH);
  if (byH) return { harness: byH.harness };
  const byModel = ok.find((c) => c.model?.toLowerCase() === n);
  if (byModel) return { harness: byModel.harness, model: byModel.model };
  return undefined;
}

/** `ducter task "<words>" [--repo <dir>|none] [--agent <name>] [--base <branch>]` */
export async function cmdTask(c: TalkCtx): Promise<number> {
  const { t } = c;
  const p = out(c);
  const words = c.rest.join(" ").trim();
  if (!words) return p(t("task.usage")), 2;
  const git = c.git ?? realGit;
  let place: Place = { kind: "none" };
  // A Ducter on a server can't see this Mac's folders: with no --repo the task has no folder; a
  // --repo here names this Mac as the device (it works when this Mac does tasks for it).
  const remote = targetOf(c).kind === "remote";
  if (c.repo !== "none" && !(remote && !c.repo)) {
    const dir = resolve(c.cwd ?? process.cwd(), c.repo ?? ".");
    const top = await repoTop(dir, git);
    if (!top) return p(t(c.repo ? "task.notRepo" : "task.notRepoHere", { dir })), 2;
    place = { kind: "repo", device: remote ? hostname().replace(/\.local$/, "") : "local", repoPath: top, ...(c.base ? { baseBranch: c.base } : {}) };
  } else if (c.base) return p(t("task.baseNoRepo")), 2;
  const k = await conn(c);
  if (!k) return 1;
  try {
    let pick: { harness: string; model?: string } | undefined;
    if (c.agent) {
      k.send({ t: "task_new_options", place });
      const opts = await k.next((f): f is Extract<ServerFrame, { t: "task_new_options" }> => f.t === "task_new_options", 10_000);
      const list = opts?.candidates ?? [];
      pick = resolveAgent(c.agent, list);
      if (!pick) {
        const names = [...new Set(list.filter((x) => !x.blocked).map((x) => (x.model ? `${x.harness}/${x.model}` : x.harness)))].join(", ");
        return p(t("task.noAgent", { name: c.agent, names: names || "—" })), 2;
      }
    }
    const clientId = newClientId();
    k.send({ t: "task_new", words, place, clientId, ...(pick ? { harness: pick.harness, ...(pick.model ? { model: pick.model } : {}) } : {}) });
    const r = await k.next((f): f is Extract<ServerFrame, { t: "task_new_result" }> => f.t === "task_new_result" && f.clientId === clientId, 60_000);
    if (!r) return p(t("task.noAnswer")), 1;
    if (c.json) return p(JSON.stringify(withHome(c, r), null, 2)), r.ok ? 0 : 1;
    if (!r.ok || !r.card) return p(t("task.failed", { reason: r.message ?? r.reason ?? "?" })), 1;
    const card = r.card;
    const where = card.place.kind === "repo" ? `${basename(card.place.repoPath)}${card.place.baseBranch ? ` (${card.place.baseBranch})` : ""}` : t("task.noPlace");
    const body = card.body ?? { harness: card.harness, ...(card.model ? { model: card.model } : {}), why: { kind: "default" as const } };
    const who = agentLabel(body) + (body.why.kind === "you" ? t("task.yourPick") : "");
    p(t("task.opened", { title: card.title, where, who }));
    p(st(c).dim(t("task.next", { tail: c.cmd(`tail ${card.taskId}`), open: c.cmd(`open ${card.taskId}`) })));
    return 0;
  } finally {
    k.close();
  }
}

type Said = { seq: number; text: string; kind: "ack" | "ai_msg" };

/** `ducter say "<words>"`: one user message, then the partner's words until its turn settles. */
export async function cmdSay(c: TalkCtx): Promise<number> {
  const { t } = c;
  const p = out(c);
  const words = c.rest.join(" ").trim();
  if (!words) return p(t("say.usage")), 2;
  const k = await conn(c, Number.MAX_SAFE_INTEGER);
  if (!k) return 1;
  const name = k.personaName;
  const timeoutMs = (c.timeoutS ?? 300) * 1000;
  const clientId = newClientId();
  const said: Said[] = [];
  const asked: Bodies["decision"][] = [];
  let mine: number | undefined;
  let started = false; // the partner's turn showed activity
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  let finish!: (why: "settled" | "timeout" | "closed") => void;
  const done = new Promise<"settled" | "timeout" | "closed">((r) => (finish = r));
  // A turn has settled once activity ends; a partner that never shows activity (a stub) settles
  // a moment after its last words.
  const settleIn = (ms: number) => {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => finish("settled"), ms);
  };
  const onEvent = (e: LogEvent) => {
    if (e.kind === "user_msg" && (e.body as Bodies["user_msg"]).clientId === clientId) return void (mine = e.seq);
    if (mine == null || e.seq <= mine) return;
    if ((e.kind === "ai_msg" || e.kind === "ack") && e.origin === "partner") {
      const text = (e.body as { text: string }).text;
      said.push({ seq: e.seq, text, kind: e.kind });
      if (!c.json) p(`${st(c).bold(name)}  ${text}`);
      if (!started) settleIn(4000);
    } else if (e.kind === "decision") {
      const d = e.body as Bodies["decision"];
      asked.push(d);
      if (!c.json) p(decisionLine(d, t));
    } else if (e.kind === "memory_noted" && !c.json) p(st(c).dim(t("say.noted", { title: (e.body as Bodies["memory_noted"]).title })));
  };
  const off = k.on((f) => {
    if (f.t === "events") f.events.forEach(onEvent);
    else if (f.t === "activity" && mine != null) {
      if (f.activity) (started = true), clearTimeout(settleTimer);
      else if (started || said.length) settleIn(800); // stragglers (a noted line) land right behind it
    }
  });
  const timer = setTimeout(() => finish("timeout"), timeoutMs);
  void k.closed.then(() => finish("closed"));
  k.send({ t: "send", text: words, clientId });
  const why = await done;
  clearTimeout(timer);
  clearTimeout(settleTimer);
  off();
  k.close();
  if (c.json) {
    p(JSON.stringify(withHome(c, { seq: mine, settled: why === "settled", replies: said, decisions: asked }), null, 2));
  } else if (why === "timeout") p(st(c).dim(t("say.timeout", { s: Math.round(timeoutMs / 1000), tail: c.cmd("tail") })));
  else if (why === "closed") p(t("say.closed"));
  else if (asked.length) p(st(c).dim(t("say.answerHint", { answer: c.cmd("answer") })));
  return why === "settled" ? 0 : 1;
}

export function decisionLine(d: Bodies["decision"], t: T): string {
  return `  ? ${d.question}  [${t("status.go")}: ${d.goLabel}] [${t("status.hold")}]  ${d.decisionId}`;
}

/** One line of the conversation for `ducter tail`, or null to skip. */
export function channelLine(e: LogEvent, name: string, t: T, title: (id: string) => string | undefined): string | null {
  const b = e.body as any;
  switch (e.kind) {
    case "user_msg":
      return `${t("tail.you")}  ${b.text}`;
    case "ai_msg":
    case "ack":
      return e.origin === "peer" ? null : `${name}  ${b.text}`;
    case "job_status": {
      // The note for the partner when you opened a task yourself (D128): said here as what you did.
      if (e.origin === "user" && typeof b.jobId === "string" && b.jobId.endsWith("_opened") && b.taskId) return `· ${t("tail.youOpened", { title: title(b.taskId) ?? b.taskId })}`;
      if (e.origin !== "partner" || !b.taskId) return null;
      return `· ${t(b.state === "running" ? "tail.started" : b.state === "done" ? "tail.finished" : "tail.failedJob", { title: one(b.text, 80) })}`;
    }
    case "decision":
      return decisionLine(b, t);
    case "decision_resolved":
      return `  ✓ ${t("tail.answered", { option: b.option === "go" ? t("status.go") : b.option === "hold" ? t("status.hold") : one(b.text ?? "", 80) })}${b.by === "default" ? ` (${t("tail.byDefault")})` : ""}`;
    case "memory_noted":
      return `  ${t("say.noted", { title: b.title })}`;
    default:
      return null;
  }
}

const shortInput = (input: unknown): string => {
  if (input == null) return "";
  if (typeof input === "string") return one(input, 100);
  const o = input as Record<string, unknown>;
  for (const k of ["command", "file_path", "path", "url", "pattern", "query", "description"]) if (typeof o[k] === "string") return one(String(o[k]), 100);
  const first = Object.values(o).find((v) => typeof v === "string");
  return typeof first === "string" ? one(first, 100) : "";
};

/**
 * One step of a task as one line (the opened task's compact form, as text). Ducter's own
 * plumbing never shows: its MCP tools, the runner's kickoff, turn ends that went fine (D124).
 */
export function taskLine(e: LogEvent, t: T): string | null {
  const b = e.body as any;
  switch (e.kind) {
    case "task_event": {
      if (b.role === "assistant") return b.text?.trim() ? `  ${one(b.text, 200)}` : null;
      if (b.role === "tool" && b.tool) {
        if (/^mcp__ducter__/.test(b.tool.name)) return null;
        const arg = shortInput(b.tool.input);
        return `${b.tool.ok === false ? "×" : "·"} ${b.tool.name}${arg ? `  ${arg}` : ""}`;
      }
      if (b.role === "user") return b.from === "runner" ? null : `→ ${one(b.text ?? "", 200)}`;
      if (b.role === "system") {
        if (/^turn (completed|aborted)/.test(b.text ?? "")) return null;
        return b.text ? `! ${one(b.text, 200)}` : null;
      }
      return null;
    }
    case "task_open": {
      // The brief shows once, as the words it was given (a retitle logs another task_open).
      return null;
    }
    case "task_state":
      return `— ${t(`tail.state.${b.attention}` as never) || b.attention}${b.reason ? `: ${one(b.reason, 120)}` : ""}`;
    case "report":
      return `■ ${t(`tail.report.${b.state}` as never)}  ${one(b.summary ?? "", 300)}`;
    case "checkpoint":
      return `◆ ${one(b.text ?? "", 200)}`;
    case "decision":
      return decisionLine(b, t);
    default:
      return null;
  }
}

/** `ducter tail [task]`: follows the conversation, or one task's steps. Ctrl-C stops. */
export async function cmdTail(c: TalkCtx): Promise<number> {
  const { t } = c;
  const p = out(c);
  const name = c.rest.join(" ").trim();
  const k = await conn(c);
  if (!k) return 1;
  const titles = new Map(k.onHand.tasks.map((x) => [x.taskId, x.title]));
  const titleOf = (id: string) => k.onHand.tasks.find((x) => x.taskId === id)?.title ?? titles.get(id);
  const emit = (e: LogEvent, line: string | null) => {
    if (c.json) p(JSON.stringify(e));
    else if (line) p(line);
  };
  let stream = "channel";
  if (name) {
    const found = pickTask(k.onHand.tasks, name);
    if (!found.length) return k.close(), p(t("tail.none", { name })), 1;
    if (found.length > 1) return k.close(), p(t("merge.many", { name, titles: found.map((x) => x.title).join(" · ") })), 1;
    const card = found[0]!;
    stream = `task:${card.taskId}`;
    k.send({ t: "task_history", taskId: card.taskId, limit: 300 });
    const h = await k.next((f): f is Extract<ServerFrame, { t: "task_history" }> => f.t === "task_history" && f.taskId === card.taskId, 10_000);
    if (!c.json) p(st(c).bold(`${card.title}`) + st(c).dim(`  ${card.taskId}`));
    const brief = (h?.events ?? []).filter((e) => e.kind === "task_open").at(-1)?.body as Bodies["task_open"] | undefined;
    if (brief?.brief && !c.json) p(st(c).dim(one(brief.brief, 300)));
    for (const e of h?.events ?? []) emit(e, taskLine(e, t));
  } else {
    for (const e of k.replayed.slice(-12)) emit(e, channelLine(e, k.personaName, t, titleOf));
  }
  if (!c.json) p(st(c).dim(t("tail.following")));
  const off = k.on((f) => {
    if (f.t !== "events") return;
    for (const e of f.events) {
      if (e.stream !== stream) continue;
      emit(e, stream === "channel" ? channelLine(e, k.personaName, t, titleOf) : taskLine(e, t));
    }
  });
  const stop = new Promise<void>((r) => {
    process.once("SIGINT", () => r());
    if (c.followMs != null) setTimeout(r, c.followMs);
  });
  await Promise.race([stop, k.closed]);
  off();
  k.close();
  return 0;
}

/** `ducter answer <decision id | part of its question> go|hold|"<reply>"` */
export async function cmdAnswer(c: TalkCtx): Promise<number> {
  const { t } = c;
  const p = out(c);
  if (c.rest.length < 2) return p(t("answer.usage")), 2;
  const reply = c.rest[c.rest.length - 1]!;
  const which = c.rest.slice(0, -1).join(" ").trim().toLowerCase();
  const k = await conn(c);
  if (!k) return 1;
  try {
    // Partner-level asks from the recent conversation; each task's open one from On hand (older than the replay too).
    const open = new Map(openDecisions(k.replayed).map((d) => [d.decisionId, d]));
    for (const x of k.onHand.tasks) if (x.pendingDecision) open.set(x.pendingDecision.decisionId, x.pendingDecision);
    const all = [...open.values()];
    const byId = all.filter((d) => d.decisionId.toLowerCase() === which);
    const found = byId.length ? byId : all.filter((d) => d.question.toLowerCase().includes(which));
    if (!found.length) return p(t("answer.none", { what: which })), 1;
    if (found.length > 1) return p(t("answer.many", { what: which, questions: found.map((d) => `${d.question} (${d.decisionId})`).join(" · ") })), 1;
    const d = found[0]!;
    const word = reply.trim().toLowerCase();
    const option: "go" | "hold" | "reply" = ["go", "好", "yes"].includes(word) ? "go" : ["hold", "等等", "no"].includes(word) ? "hold" : "reply";
    k.send({ t: "decide", decisionId: d.decisionId, option, ...(option === "reply" ? { text: reply } : {}) });
    const r = await k.next(
      (f) => (f.t === "events" && f.events.some((e) => e.kind === "decision_resolved" && (e.body as Bodies["decision_resolved"]).decisionId === d.decisionId)) || f.t === "error",
      10_000,
    );
    if (!r || r.t === "error") return p(t("answer.failed", { reason: r && r.t === "error" ? r.message : "no answer" })), 1;
    if (c.json) p(JSON.stringify(withHome(c, { decisionId: d.decisionId, option, ...(option === "reply" ? { text: reply } : {}) })));
    else p(t(option === "go" ? "answer.go" : option === "hold" ? "answer.hold" : "answer.reply", { label: d.goLabel, question: d.question }));
    return 0;
  } finally {
    k.close();
  }
}

/** Where a task is, for `ducter open <task>` when no app is open. */
export function whereLine(card: TaskCard, t: T): string {
  const pl = card.place;
  if (pl.kind === "repo") return t("open.whereRepo", { path: pl.worktree ?? pl.repoPath, branch: pl.branch ?? "—", base: pl.baseBranch ?? "—" });
  if (pl.kind === "folder") return t("open.whereFolder", { path: pl.path });
  if (pl.kind === "browser") return t("open.whereBrowser");
  return t("open.whereNone");
}

/** `ducter open <part of a title or id>`: the app shows that task; with no app open, where it is. */
export async function cmdOpenTask(c: TalkCtx): Promise<number> {
  const { t } = c;
  const p = out(c);
  const name = c.rest.join(" ").trim();
  const k = await conn(c);
  if (!k) return 1;
  try {
    const found = pickTask(k.onHand.tasks, name);
    if (!found.length) return p(t("tail.none", { name })), 1;
    if (found.length > 1) return p(t("merge.many", { name, titles: found.map((x) => x.title).join(" · ") })), 1;
    const card = found[0]!;
    k.send({ t: "open_task", taskId: card.taskId });
    const r = await k.next((f): f is Extract<ServerFrame, { t: "open_result" }> => f.t === "open_result" && f.taskId === card.taskId, 5000);
    if (c.json) return p(JSON.stringify(withHome(c, { taskId: card.taskId, title: card.title, apps: r?.apps ?? 0, place: card.place }))), 0;
    if (r?.ok && r.apps > 0) p(t("open.shown", { title: card.title }));
    else {
      p(st(c).bold(card.title) + st(c).dim(`  ${card.taskId}`));
      p("  " + whereLine(card, t));
      p(st(c).dim(t("open.noApp", { tail: c.cmd(`tail ${card.taskId}`) })));
    }
    return 0;
  } finally {
    k.close();
  }
}
