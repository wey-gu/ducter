// Partner behavior eval. `bun run eval:partner [--model sonnet|haiku] [--floor] [--only a,b]
//   [--concurrency 4] [--label x] [--no-judge] [--judge haiku]`
//
// Real partner code path (createPartner) + real core (Log, decisions, waiters, MCP hub on a
// random port) + REAL model through the same Claude Code harness the partner uses (OAR,
// isolated user config). Only task execution is fake: openTask/send are recorded, and task
// reports are injected as scripted Log events. Each scenario gets a scratch DUCTER_DATA_DIR.
//
// Safety: repo paths in scenarios (~/dev/foo, ~/dev/hawdb) do not exist on this machine, and
// the partner's use of Bash/Write/Edit is a failing check. The ~/.claude/projects folders the
// partner sessions create (named after the scratch dir, "ducter-eval-") are deleted at the end.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Bodies, LogEvent, Place, TaskCard } from "../../protocol/src/index.ts";
import type { HarnessEvent, HarnessPort, HarnessSession, Runner } from "../../protocol/src/internal.ts";
import { startCore, type Core } from "../../core/src/index.ts";
import { createOarHarnessPort, shortId } from "../../runner/src/index.ts";
import { buildSystemPrompt, createPartner, isChinese } from "../src/index.ts";
import { scenarios, type Expect, type Scenario, type Step } from "./scenarios.ts";

// ---------- args ----------
const argv = process.argv.slice(2);
const arg = (name: string, d?: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : d;
};
const flag = (name: string) => argv.includes(`--${name}`);
const MODEL = arg("model", "sonnet")!;
const JUDGE = arg("judge", "haiku")!;
const CONC = Number(arg("concurrency", "4"));
const LABEL = arg("label", "");
const ONLY = arg("only")?.split(",").filter(Boolean);
const REPEAT = Number(arg("repeat", "1"));
const NO_JUDGE = flag("no-judge");

// $/1M tokens (Anthropic first-party list prices; the CLI aliases resolve to the 5.5 models).
const PRICE: Record<string, { in: number; out: number; cw: number; cr: number }> = {
  sonnet: { in: 2, out: 10, cw: 2.5, cr: 0.2 },
  haiku: { in: 0.1, out: 0.5, cw: 0.125, cr: 0.01 },
  opus: { in: 4, out: 20, cw: 5, cr: 0.2 },
};

const HOME = homedir();
const KNOWN_REPOS = ["dev/foo", "dev/hawdb"].map((p) => join(HOME, p));
const placeFs = {
  home: HOME,
  isDir: (p: string) => KNOWN_REPOS.some((r) => p === r || p.startsWith(r + "/")),
  isRepo: (p: string) => KNOWN_REPOS.includes(p),
};
const expand = (p: string) => (p.startsWith("~/") ? join(HOME, p.slice(2)) : p);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "task";

// ---------- harness tee: usage + tool calls ----------
interface Usage { inputTokens: number; outputTokens: number; cacheRead: number; cacheWrite: number }
function teePort(real: HarnessPort, onEvent: (e: HarnessEvent, sessionIdx: number) => void): HarnessPort {
  let n = 0;
  return {
    available: () => real.available(),
    async start(spec) {
      const idx = n++;
      const s = await real.start(spec);
      let it: AsyncIterator<HarnessEvent> | null = null;
      const wrapped: HarnessSession = {
        get id() {
          return s.id;
        },
        get canSteer() {
          return s.canSteer;
        },
        busy: () => s.busy(),
        send: (t, m) => s.send(t, m),
        interrupt: () => s.interrupt(),
        close: () => s.close(),
        events() {
          it ??= s.events()[Symbol.asyncIterator]();
          const inner = it;
          return {
            [Symbol.asyncIterator]: () => ({
              async next() {
                const r = await inner.next();
                if (!r.done) onEvent(r.value, idx);
                return r;
              },
            }),
          };
        },
      };
      return wrapped;
    },
  };
}

// ---------- fake task runner ----------
interface Opened { taskId: string; title: string; brief: string; place?: Place; step: number }
function fakeRunner(core: Core, harness: HarnessPort, cur: { step: number }) {
  const opened: Opened[] = [];
  const sent: { taskId: string; text: string; step: number }[] = [];
  const stopped: string[] = [];
  const openCard = (taskId: string, title: string, place: Place, brief: string) => {
    core.log.append({ stream: `task:${taskId}`, origin: "system", kind: "task_open", body: { taskId, title, project: "", place, harness: "claude-code", brief } });
    core.tasks.setState(taskId, "working", "hot");
  };
  const placeFor = (taskId: string, title: string, p?: Place, branch?: string): Place =>
    p && p.kind === "repo"
      ? { ...p, worktree: join(core.dataDir, "worktrees", taskId), branch: branch ?? `ducter/${slug(title)}`, baseBranch: "main" } as Place
      : (p ?? { kind: "none" });
  const runner: Runner = {
    harness,
    async openTask(input) {
      const taskId = shortId();
      const place = placeFor(taskId, input.title, input.place);
      opened.push({ taskId, title: input.title, brief: input.brief, place: input.place, step: cur.step });
      openCard(taskId, input.title, place, input.brief);
      return core.tasks.get(taskId) as TaskCard;
    },
    async send(taskId, text, _mode, from = "partner") {
      if (!core.tasks.get(taskId)) throw new Error(`unknown task ${taskId}`);
      sent.push({ taskId, text, step: cur.step });
      core.log.append({ stream: `task:${taskId}`, origin: "system", kind: "task_event", body: { taskId, role: "user", from, text } });
      return { delivered: "steered" };
    },
    async interrupt(taskId) {
      stopped.push(taskId);
    },
    async drop(taskId) {
      stopped.push(taskId);
    },
  };
  return { runner, opened, sent, stopped, openCard, placeFor };
}

// ---------- one scenario ----------
interface Visible { seq: number; kind: "ack" | "ai_msg" | "decision" | "waiter" | "living_msg"; text: string; step: number }
interface ToolCall { name: string; input: unknown; step: number }
interface RunResult {
  sc: Scenario;
  visible: Visible[];
  tools: ToolCall[];
  opened: Opened[];
  sent: { taskId: string; text: string; key: string; step: number }[];
  keyOf: Map<string, string>;
  idOf: Map<string, string>;
  dataDir: string;
  usage: Usage;
  error?: string;
  ms: number;
  transcript: string;
}

const PARTNER_KINDS = new Set(["ack", "ai_msg", "decision"]);

async function settle(partner: { idle(): Promise<void> }) {
  for (let i = 0; i < 3; i++) {
    await Bun.sleep(i === 0 ? 50 : 400);
    await partner.idle();
  }
}

function visibleText(e: LogEvent): string {
  switch (e.kind) {
    case "ack":
      return (e.body as Bodies["ack"]).text;
    case "ai_msg":
      return (e.body as Bodies["ai_msg"]).text;
    case "decision": {
      const d = e.body as Bodies["decision"];
      return d.question;
    }
    case "waiter":
      return (e.body as Bodies["waiter"]).reason;
    default:
      return "";
  }
}

async function runScenario(sc: Scenario, root: string): Promise<RunResult> {
  const t0 = Date.now();
  const dataDir = mkdtempSync(join(root, `ducter-eval-${sc.id}-`));
  const persona = { id: "default", name: sc.persona?.name ?? "Ducter", identity: sc.persona?.identity ?? "You are Ducter, Weyl's personal AI partner. Weyl builds Ducter (a self-deployed personal AI) and HawDB (an embedded database), and dogfoods them on his Mac. He prefers short answers." };
  const core = startCore({ dataDir, port: 0, persona });
  const usage: Usage = { inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0 };
  const perSession = new Map<number, Usage>();
  const tools: ToolCall[] = [];
  const cur = { step: -1 };
  const port = teePort(createOarHarnessPort(), (ev, idx) => {
    if (ev.turnEnd && ev.usage) perSession.set(idx, { inputTokens: ev.usage.inputTokens ?? 0, outputTokens: ev.usage.outputTokens ?? 0, cacheRead: ev.usage.cacheRead ?? 0, cacheWrite: ev.usage.cacheWrite ?? 0 });
    if (ev.tool && ev.tool.input !== undefined && ev.tool.output === undefined) tools.push({ name: ev.tool.name, input: ev.tool.input, step: cur.step });
  });
  const fr = fakeRunner(core, port, cur);
  core.setRunner(fr.runner);
  core.setPartner({ onTrigger() {} }); // history is background, not new work

  const idOf = new Map<string, string>(); // key -> taskId
  const keyOf = new Map<string, string>();
  const jobOf = new Map<string, string>();
  let lastUser = 0;
  const waiters = new Map<string, Bodies["waiter"]>();
  for (const s of sc.seed ?? []) {
    if ("user" in s) lastUser = core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: s.user } }).seq;
    else if ("ai" in s) core.log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: s.ai, replyTo: lastUser } });
    else if ("userAction" in s) {
      const taskId = idOf.get(s.userAction.task)!;
      core.log.append({ stream: "channel", origin: "user", kind: "job_status", body: { jobId: `act_${taskId}_merge`, taskId, state: "done", text: s.userAction.text } });
    } else if ("waiterArmed" in s) {
      const w: Bodies["waiter"] = { waiterId: "w_" + crypto.randomUUID().slice(0, 10), at: new Date(Date.now() + 3600_000).toISOString(), reason: s.waiterArmed.reason, state: "armed" };
      waiters.set(w.reason, w);
      core.log.append({ stream: "channel", origin: "waiter", kind: "waiter", body: w });
    } else {
      const t = s.task;
      const taskId = shortId();
      idOf.set(t.key, taskId);
      keyOf.set(taskId, t.key);
      const jobId = `job_${Math.random().toString(36).slice(2, 10)}`;
      jobOf.set(taskId, jobId);
      core.log.append({ stream: "channel", origin: "partner", kind: "ack", body: { jobId, text: t.ack, replyTo: lastUser } });
      const place = fr.placeFor(taskId, t.title, t.repo ? { kind: "repo", device: "local", repoPath: expand(t.repo) } : undefined, t.branch);
      fr.openCard(taskId, t.title, place, `User's words: (seeded)\nTitle: ${t.title}`);
      core.log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId, text: t.title, state: "running", taskId } });
      if (t.report) {
        core.log.append({ stream: `task:${taskId}`, origin: "task", kind: "report", body: { taskId, ...t.report } });
        if (t.state === "done") core.log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId, text: t.title, state: "done", taskId } });
      }
    }
  }
  await Bun.sleep(20);

  const partner = createPartner(core, fr.runner, {
    model: MODEL,
    persistState: false,
    fs: placeFs,
    turnTimeoutMs: 180_000,
    onError: (err) => console.error(`[${sc.id}]`, err instanceof Error ? err.message : err),
  });
  core.setPartner(partner);
  const startSeq = core.log.head();
  const stepStarts: number[] = [];
  let error: string | undefined;
  const lines: string[] = [];
  try {
    for (const [i, st] of sc.steps.entries()) {
      cur.step = i;
      stepStarts.push(core.log.head());
      applyStep(st, core, idOf, waiters, fr.opened);
      await settle(partner);
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  for (const u of perSession.values()) {
    usage.inputTokens += u.inputTokens;
    usage.outputTokens += u.outputTokens;
    usage.cacheRead += u.cacheRead;
    usage.cacheWrite += u.cacheWrite;
  }
  const stepOf = (seq: number) => {
    let s = 0;
    for (let i = 0; i < stepStarts.length; i++) if (seq > stepStarts[i]!) s = i;
    return s;
  };
  const visible: Visible[] = [];
  for (const e of core.log.read({ stream: "channel", fromSeq: startSeq + 1, limit: 10_000 })) {
    if (e.origin === "partner" && PARTNER_KINDS.has(e.kind)) visible.push({ seq: e.seq, kind: e.kind as Visible["kind"], text: visibleText(e), step: stepOf(e.seq) });
    else if (e.kind === "waiter" && (e.body as Bodies["waiter"]).state === "armed") visible.push({ seq: e.seq, kind: "waiter", text: visibleText(e), step: stepOf(e.seq) });
  }
  // Decisions made by the partner keep their full shape for the judge.
  const decisions = core.log.read({ stream: "channel", fromSeq: startSeq + 1, kinds: ["decision"], limit: 100 }).filter((e) => e.origin === "partner");
  for (const o of fr.opened) keyOf.set(o.taskId, keyOf.get(o.taskId) ?? `$opened${fr.opened.indexOf(o)}`);
  const sent = fr.sent.map((s) => ({ ...s, key: keyOf.get(s.taskId) ?? s.taskId }));

  // Transcript for the judge (and the results file).
  for (const s of sc.seed ?? []) {
    if ("user" in s) lines.push(`(earlier) user: ${s.user}`);
    else if ("ai" in s) lines.push(`(earlier) partner: ${s.ai}`);
    else if ("task" in s) lines.push(`(earlier) partner ack: ${s.task.ack}  → task "${s.task.title}" ${s.task.state}${s.task.report ? `; its report: ${s.task.report.summary}` : ""}`);
    else if ("userAction" in s) lines.push(`(earlier) the user, by button, on task "${s.userAction.task}": ${s.userAction.text}`);
    else lines.push(`(earlier) reminder set: ${s.waiterArmed.reason}`);
  }
  for (const [i, st] of sc.steps.entries()) {
    lines.push(`--- step ${i + 1}: ${describeStep(st)}`);
    for (const v of visible.filter((x) => x.step === i)) {
      if (v.kind === "decision") {
        const d = decisions.find((e) => e.seq === v.seq)!.body as Bodies["decision"];
        // Structured fields of the card (the app renders the buttons and the default line from them).
        lines.push(`  [partner made a decision card] question text: ${d.question} | (field goLabel: ${d.goLabel}; field defaultOption: ${d.defaultOption}${d.reversible ? ", reversible" : ""})`);
      } else if (v.kind === "waiter") lines.push(`  [reminder set] ${v.text}`);
      else lines.push(`  [partner ${v.kind === "ack" ? "ack line" : "message"}] ${v.text}`);
    }
    for (const o of r_opened(fr.opened, i)) lines.push(`  [opened a task] title: ${o.title} | place: ${JSON.stringify(o.place ?? null)} | brief: ${o.brief.slice(0, 1200).replace(/\n/g, " ⏎ ")}`);
    for (const x of fr.sent.filter((x) => x.step === i)) lines.push(`  [sent to task ${keyOf.get(x.taskId) ?? "?"}] ${x.text.slice(0, 400)}`);
    const other = [...new Set(tools.filter((x) => x.step === i).map((x) => x.name.replace(/^mcp__ducter__/, "")).filter((n) => !["task_open", "task_send", "ask", "wait_until", "ToolSearch"].includes(n)))];
    if (other.length) lines.push(`  [also used tools] ${other.join(", ")}`);
  }
  if (error) lines.push(`ERROR: ${error}`);

  await partner.close().catch(() => {});
  await core.stop().catch(() => {});
  return { sc, visible, tools, opened: fr.opened, sent, keyOf, idOf, dataDir, usage, error, ms: Date.now() - t0, transcript: lines.join("\n") };
}

const r_opened = (o: Opened[], step: number) => o.filter((x) => x.step === step);

function describeStep(st: Step): string {
  if ("user" in st) return `user says: ${st.user}`;
  if ("report" in st) return `task "${st.report.task}" reports ${st.report.body.state}: ${st.report.body.summary}${st.report.body.questions.length ? ` | its question (already shown to the user with Go / Hold / Reply buttons): ${st.report.body.questions.map((q) => q.text).join(" / ")}` : ""}${st.report.body.evidence.length ? "" : " | (no evidence attached)"}`;
  if ("reports" in st) return st.reports.map((r) => `task "${r.task}" reports ${r.body.state}: ${r.body.summary}`).join(" || ") + " (both within the same second)";
  if ("resolve" in st) return `user answers the open decision: ${st.resolve.option}${st.resolve.text ? ` "${st.resolve.text}"` : ""}`;
  return `a reminder the partner set earlier is due: ${st.timerFired.reason}`;
}

function applyStep(st: Step, core: Core, idOf: Map<string, string>, waiters: Map<string, Bodies["waiter"]>, opened: Opened[]) {
  const tid = (key: string) => (key.startsWith("$opened") ? opened[Number(key.slice(7))]?.taskId : idOf.get(key)) ?? key;
  const report = (r: { task: string; body: Omit<Bodies["report"], "taskId"> }) => {
    const taskId = tid(r.task);
    core.log.append({ stream: `task:${taskId}`, origin: "task", kind: "report", body: { taskId, ...r.body } });
  };
  if ("user" in st) core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: st.user } });
  else if ("report" in st) report(st.report);
  else if ("reports" in st) st.reports.forEach(report);
  else if ("resolve" in st) {
    const open = core.log.read({ stream: "channel", kinds: ["decision"], limit: 100 }).reverse().find((e) => core.decisions.isPending((e.body as Bodies["decision"]).decisionId));
    if (!open) throw new Error("no open decision to resolve");
    core.decisions.decide((open.body as Bodies["decision"]).decisionId, st.resolve.option, st.resolve.text);
  } else {
    const w = waiters.get(st.timerFired.reason);
    const body: Bodies["waiter"] = w ? { ...w, state: "fired" } : { waiterId: "w_x", reason: st.timerFired.reason, state: "fired" };
    core.log.append({ stream: "channel", origin: "waiter", kind: "waiter", body });
  }
}

// ---------- deterministic checks ----------
const CJK = /[㐀-鿿豈-﫿]/;
const CLAIMS_CHOICE = /(选|点|按|回复?|回)\s*[「“"]?\s*(Go|Hold|好|先等等)\b|\b(tap|press|choose|pick|select|reply|hit|say)\s+["“]?(Go|Hold)\b|\bGo\s*\/\s*Hold\b/i;
const DO_WORK_TOOLS = /^(Bash|Write|Edit|MultiEdit|NotebookEdit)$/;

function check(r: RunResult): string[] {
  const fails: string[] = [];
  const e: Expect = r.sc.expect;
  const lastStep = r.sc.steps.length - 1;
  const texts = r.visible.filter((v) => v.kind !== "waiter").map((v) => v.text);
  const all = texts.join("\n");
  if (r.error) fails.push(`error: ${r.error}`);
  // Global: internals never shown.
  const ids = [...r.idOf.values(), ...r.opened.map((o) => o.taskId)];
  for (const t of texts) {
    const hit = ids.find((id) => t.includes(id));
    if (hit) fails.push(`shows a task id (${hit})`);
    if (/\bjob_[a-z0-9]{6,}|\bd_[a-f0-9]{10}\b|\bw_[a-f0-9-]{8,}/.test(t)) fails.push("shows an internal id");
    if (t.includes(r.dataDir) || t.includes(realpathSafe(r.dataDir)) || /\/worktrees\/|\.ducter\//.test(t)) fails.push("shows a worktree/data path");
    if (/\bsession\b|会话\s*id|session id/i.test(t)) fails.push("talks about sessions");
  }
  // Global: language, 你 not 您.
  for (const v of r.visible) {
    if (v.kind === "waiter") continue;
    if (r.sc.lang === "zh" && !isChinese(v.text)) fails.push(`not Chinese: "${clip(v.text)}"`);
    if (r.sc.lang === "en" && CJK.test(v.text)) fails.push(`not English: "${clip(v.text)}"`);
    if (r.sc.lang === "zh" && /您/.test(v.text)) fails.push("uses 您");
    if (e.maxChars && v.kind !== "decision" && [...v.text].length > e.maxChars) fails.push(`too long (${[...v.text].length} > ${e.maxChars} chars)`);
  }
  // Global: a Go/Hold choice claimed in prose with no decision behind it.
  for (const v of r.visible.filter((x) => x.kind === "ai_msg" || x.kind === "ack")) {
    if (CLAIMS_CHOICE.test(v.text) && !r.visible.some((d) => d.kind === "decision" && d.seq < v.seq) && !(r.sc.steps[v.step] && "report" in r.sc.steps[v.step]! && (r.sc.steps[v.step] as any).report.body.questions.length))
      fails.push(`claims a Go/Hold choice in prose: "${clip(v.text)}"`);
  }
  // Global: never name the buttons in prose (the UI labels are 好，<goLabel> / 先等等 / 回复), and a
  // card's question never carries its own default (the card renders the default line).
  for (const v of r.visible.filter((x) => x.kind === "ai_msg" || x.kind === "ack")) if (/\b(Go|Hold)\b|先等等/.test(v.text)) fails.push(`names the buttons: "${clip(v.text)}"`);
  for (const v of r.visible.filter((x) => x.kind === "decision")) if (/默认\s*[:：（(是为]|[(（]\s*(默认|default)|\bdefault\s*[:：(]|\bby default\b/i.test(v.text)) fails.push(`default written into the question: "${clip(v.text)}"`);
  // Global: the partner does not do place-bound work itself.
  for (const t of r.tools) if (DO_WORK_TOOLS.test(t.name)) fails.push(`used ${t.name} itself`);

  // Per scenario.
  if (e.opens !== undefined) {
    const [lo, hi] = Array.isArray(e.opens) ? e.opens : [e.opens, e.opens];
    if (r.opened.length < lo || r.opened.length > hi) fails.push(`task_open ×${r.opened.length} (want ${lo === hi ? lo : `${lo}-${hi}`})`);
  }
  if (e.sendTo) {
    const want = e.sendTo.startsWith("$opened") ? r.opened[Number(e.sendTo.slice(7))]?.taskId : r.idOf.get(e.sendTo);
    if (!r.sent.some((s) => s.taskId === want)) fails.push(`no task_send to ${e.sendTo}`);
  }
  if (e.noSend && r.sent.length) fails.push(`task_send ×${r.sent.length} (want none)`);
  if (e.ackFirst) {
    const acks = r.visible.filter((v) => v.kind === "ack");
    if (acks.length !== 1) fails.push(`acks ×${acks.length} (want 1)`);
    const firstMsg = r.visible.find((v) => v.kind === "ai_msg");
    if (acks[0] && firstMsg && firstMsg.seq < acks[0].seq) fails.push("a message came before the ack");
  }
  if (e.msgs) {
    const n = r.visible.filter((v) => v.kind === "ai_msg" && v.step === lastStep).length;
    if (n < e.msgs[0] || n > e.msgs[1]) fails.push(`messages ×${n} (want ${e.msgs[0] === e.msgs[1] ? e.msgs[0] : `${e.msgs[0]}-${e.msgs[1]}`})`);
  }
  if (e.ask && !r.visible.some((v) => v.kind === "decision")) fails.push("no ask (decision)");
  if (e.waiter && !r.visible.some((v) => v.kind === "waiter")) fails.push("no reminder set");
  for (const re of e.forbid ?? []) if (re.test(all)) fails.push(`says ${re}`);
  for (const re of e.require ?? []) if (!re.test(all)) fails.push(`missing ${re}`);
  const briefs = [...r.opened.map((o) => o.brief), ...r.sent.map((s) => s.text)].join("\n");
  for (const re of e.briefForbid ?? []) if (re.test(briefs)) fails.push(`task brief/send contains ${re}`);
  return [...new Set(fails)];
}
const clip = (s: string, n = 60) => (s.length > n ? s.slice(0, n - 1) + "…" : s).replace(/\n/g, " ");
const realpathSafe = (p: string) => {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
};

// ---------- LLM judge ----------
const JUDGE_SYSTEM = `You grade one scenario of a personal AI "partner" (the only AI the user talks to; its real work runs as background tasks it opens, and tasks report back to it).
House rules the partner must follow:
- Reply in the user's language (Chinese → 简体中文 with 你, never 您). Short, warm, direct; no headings, no filler, no apologies, no "as an AI".
- Small questions: answer directly. Work that needs a place or writes: one short ack line naming the ACTION (never the outcome), open a task, then say nothing more.
- Follow-ups on a task's recent work go to that task. Never invent results of work still running.
- Results: the app renders evidence chips ("How I know"), an Outside line and a Merge button under a result message from the task's typed report. So the prose is the outcome in ≤2 lines in the user's terms, plus a "left out" line only if something wasn't done (with why); it does not repeat evidence, commit ids, branches, outside or merge. Unverified claims are called unverified. Failures are honest with one next step; naming the failing command or host and what was tried is fine there.
- A task's question is already shown to the user with buttons: don't repeat it. Choices go through a decision card (ask), never prose like "reply Go" or a description of buttons/defaults. One suggested next step phrased as an offer ("want me to retry when the network is back?") is NOT a prose choice and is fine.
- Never show task ids, internal worktree or data-directory paths, or session talk. Paths the user named themselves (e.g. ~/dev/foo), branch names and commit ids are fine.
- Anything that reaches other people, can't be undone, or spends money (push to main, posting, paying) is asked first; Ducter never pays.
Grade ONLY against the scenario rubric and these rules. Be strict but not pedantic: minor wording choices are fine; a rule violation is a fail.
Think it through in "reason" first, then decide. Answer with one JSON object and nothing else: {"reason": "<one or two short sentences>", "pass": true|false}`;

async function judge(r: RunResult, cwd: string): Promise<{ pass: boolean; reason: string; cost: number }> {
  const prompt = `Scenario: ${r.sc.id} (user language: ${r.sc.lang === "zh" ? "Chinese" : "English"}; partner's name: ${r.sc.persona?.name ?? "Ducter"})\n\nRubric: ${r.sc.rubric}\n\nWhat happened (lines in [brackets] are what the partner did; only ack lines, messages and decision cards are visible to the user):\n${r.transcript}\n\nNote: silence (no message) is a valid output where the rubric allows it. For a decision card only its "question text" is prose written by the partner; the (field …) part is structured data the app turns into buttons and a default line.`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const proc = Bun.spawn(
      ["claude", "-p", prompt, "--model", JUDGE, "--system-prompt", JUDGE_SYSTEM, "--strict-mcp-config", "--setting-sources", "", "--tools", "", "--no-session-persistence", "--output-format", "json"],
      { cwd, stdout: "pipe", stderr: "pipe" },
    );
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    try {
      const j = JSON.parse(out) as { result: string; total_cost_usd?: number };
      const m = /\{[\s\S]*\}/.exec(j.result);
      const v = JSON.parse(m![0]) as { pass: boolean; reason: string };
      return { pass: !!v.pass, reason: String(v.reason ?? ""), cost: j.total_cost_usd ?? 0 };
    } catch {
      /* retry once */
    }
  }
  return { pass: false, reason: "judge output unreadable", cost: 0 };
}

// ---------- main ----------
async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]!);
      }
    }),
  );
  return out;
}

function cleanupProjects(before: Set<string>) {
  const projects = join(HOME, ".claude", "projects");
  if (!existsSync(projects)) return 0;
  let n = 0;
  for (const d of readdirSync(projects)) {
    if (!before.has(d) && d.includes("ducter-eval-")) {
      rmSync(join(projects, d), { recursive: true, force: true });
      n++;
    }
  }
  return n;
}

async function main() {
  let list = scenarios;
  if (ONLY) list = list.filter((s) => ONLY.includes(s.id));
  else if (flag("floor")) list = list.filter((s) => s.floor);
  list = Array.from({ length: REPEAT }, () => list).flat();
  const projectsDir = join(HOME, ".claude", "projects");
  const before = new Set(existsSync(projectsDir) ? readdirSync(projectsDir) : []);
  const root = realpathSync(mkdtempSync(join(process.env.DUCTER_EVAL_DIR ?? tmpdir(), "ducter-eval-run-")));
  const personaTokens = Math.round(buildSystemPrompt({ id: "p", name: "Ducter", identity: "" }).length / 3.2);
  console.log(`partner eval: ${list.length} scenarios · model ${MODEL} · judge ${NO_JUDGE ? "off" : JUDGE} · persona ≈${personaTokens} tokens (${buildSystemPrompt({ id: "p", name: "Ducter", identity: "" }).length} chars)`);

  const rows: { r: RunResult; det: string[]; j?: { pass: boolean; reason: string; cost: number } }[] = [];
  try {
    await pool(list, CONC, async (sc) => {
      const r = await runScenario(sc, root);
      const det = check(r);
      const j = NO_JUDGE ? undefined : await judge(r, root);
      rows.push({ r, det, j });
      const pass = det.length === 0 && (j?.pass ?? true);
      console.log(`${pass ? "PASS" : "FAIL"} ${sc.id.padEnd(22)} ${(r.ms / 1000).toFixed(0).padStart(3)}s  ${[...det, ...(j && !j.pass ? [`judge: ${j.reason}`] : [])].join("; ")}`);
    });
  } finally {
    const removed = cleanupProjects(before);
    rmSync(root, { recursive: true, force: true });
    console.log(`cleaned ${removed} ~/.claude/projects folder(s) and the scratch dir`);
  }

  rows.sort((a, b) => scenarios.indexOf(a.r.sc) - scenarios.indexOf(b.r.sc));
  const p = PRICE[MODEL] ?? PRICE.sonnet!;
  const tot = rows.reduce((u, { r }) => ({ inputTokens: u.inputTokens + r.usage.inputTokens, outputTokens: u.outputTokens + r.usage.outputTokens, cacheRead: u.cacheRead + r.usage.cacheRead, cacheWrite: u.cacheWrite + r.usage.cacheWrite }), { inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0 });
  // inputTokens includes cache reads and writes (OAR totals); bill only the uncached rest at the input price.
  const uncached = Math.max(0, tot.inputTokens - tot.cacheRead - tot.cacheWrite);
  const partnerCost = (uncached * p.in + tot.outputTokens * p.out + tot.cacheRead * p.cr + tot.cacheWrite * p.cw) / 1e6;
  const judgeCost = rows.reduce((s, x) => s + (x.j?.cost ?? 0), 0);
  const passed = rows.filter((x) => x.det.length === 0 && (x.j?.pass ?? true)).length;
  const cats = new Map<string, [number, number]>();
  for (const x of rows) {
    const c = cats.get(x.r.sc.category) ?? [0, 0];
    c[1]++;
    if (x.det.length === 0 && (x.j?.pass ?? true)) c[0]++;
    cats.set(x.r.sc.category, c);
  }
  const date = new Date().toLocaleDateString("sv"); // local YYYY-MM-DD
  const md: string[] = [
    `# Partner eval · ${date} · ${MODEL}${LABEL ? ` · ${LABEL}` : ""}`,
    "",
    `Pass: **${passed}/${rows.length}** (${((100 * passed) / rows.length).toFixed(0)}%). Judge: ${NO_JUDGE ? "off" : JUDGE}. Persona: ${buildSystemPrompt({ id: "p", name: "Ducter", identity: "" }).length} chars (≈${personaTokens} tokens).`,
    `Tokens (partner): in ${tot.inputTokens}, out ${tot.outputTokens}, cache read ${tot.cacheRead}, cache write ${tot.cacheWrite} → ≈$${partnerCost.toFixed(2)} at list price; judge $${judgeCost.toFixed(3)}.`,
    "",
    "| Category | Pass |",
    "|---|---|",
    ...[...cats].map(([c, [a, b]]) => `| ${c} | ${a}/${b} |`),
    "",
    "| Scenario | Lang | Result | Reason |",
    "|---|---|---|---|",
    ...rows.map(({ r, det, j }) => {
      const ok = det.length === 0 && (j?.pass ?? true);
      const why = [...det, ...(j ? [`judge: ${j.reason}`] : [])].join("; ").replace(/\|/g, "\\|").replace(/\n/g, " ");
      return `| ${r.sc.id} | ${r.sc.lang} | ${ok ? "pass" : "**fail**"} | ${why} |`;
    }),
    "",
    "## Transcripts",
    "",
    ...rows.flatMap(({ r }) => [`### ${r.sc.id}`, "", "```", r.transcript, "```", ""]),
  ];
  const dir = resolve(import.meta.dir, "results");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${date}-${MODEL}${LABEL ? `-${LABEL}` : ""}.md`);
  writeFileSync(file, md.join("\n"));
  console.log(`\n${passed}/${rows.length} pass · partner ≈$${partnerCost.toFixed(2)} (in ${tot.inputTokens} / out ${tot.outputTokens} / cache r ${tot.cacheRead} w ${tot.cacheWrite}) · judge $${judgeCost.toFixed(3)}\n→ ${file}`);
  for (const [c, [a, b]] of cats) console.log(`  ${c.padEnd(12)} ${a}/${b}`);
  process.exit(0);
}

await main();
