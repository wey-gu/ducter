// Partner behavior eval. `bun run eval:partner [--harness claude-code|codex|pi|deepseek-harness]
//   [--model sonnet|haiku|...] [--floor] [--only a,b] [--concurrency 4] [--label x] [--no-judge] [--judge haiku]`
//
// Real partner code path (createPartner) + real core (Log, decisions, waiters, MCP hub on a
// random port) + REAL model through the harness the partner runs on (OAR, its clean setup per
// harness, D85). Only task execution is fake: openTask/send are recorded, and task
// reports are injected as scripted Log events. Each scenario gets a scratch DUCTER_DATA_DIR.
//
// Safety: repo paths in scenarios (~/dev/foo, ~/dev/hawdb) do not exist on this machine, and
// the partner's use of Bash/Write/Edit (or of a web tool, D378) is a failing check. The ~/.claude/projects folders the
// partner sessions create (named after the scratch dir, "ducter-eval-") are deleted at the end.
// Memory is a FAKE Mem per scenario (scenario.memories, test/fakes.ts fakeMemory): the eval
// never reads or writes the user's real Nowledge Mem.
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { HARNESSES, HARNESS_IDS, isHarnessId, type Bodies, type HarnessId, type LogEvent, type Place, type ReplyWant, type TaskCard, type TaskNeeds } from "../../protocol/src/index.ts";
import type { HarnessEvent, HarnessPort, HarnessSession, Runner } from "../../protocol/src/internal.ts";
import { startCore, type Core } from "../../core/src/index.ts";
import { chooseBody, kindOf, type Computer } from "../../core/src/candidates.ts";
import { saidPick } from "../../core/src/loadout.ts";
import { createLocalAgents } from "../../core/src/local-agents/index.ts";
import { createWorkerRecords } from "../../core/src/worker-records.ts";
import { writeSession } from "../../core/test/fixtures-agents.ts";
import { writeDotsFacts } from "./noticed-facts.ts";
import { logUserMessage } from "../../core/src/reply.ts";
import { createOarHarnessPort, shortId } from "../../runner/src/index.ts";
import { buildSystemPrompt, createNmemBridge, createPartner } from "../src/index.ts";
import { inLanguage, langName } from "../../protocol/src/lang.ts";
import { wordsOnly, type RichUi } from "../../protocol/src/rich.ts";
import { scenarios, type Expect, type Scenario, type Step } from "./scenarios.ts";
import { fakeMemory } from "../test/fakes.ts";
import { fakeTuwa } from "../../core/test/fake-tuwa.ts";
import { fakeOoCalendar } from "../../core/test/fake-oo-calendar.ts";
import { fakeGh } from "../../core/test/fake-gh-issues.ts";

/** D341: the issues assigned to the user in the eval's fake GitHub. */
const TODO_ISSUES = [
  { repo: "nowledge-co/hawdb", number: 1592, title: "Compaction test is flaky on CI", body: "TestCompactionMerge fails about 1 in 20 runs on Linux CI.", labels: ["bug"], updated: "2026-11-17T09:00:00Z" },
  { repo: "wey-gu/ducter", number: 6, title: "feat: task abstraction", body: "- built-in task abstraction\n- syncing with task services (GitHub issue per task binding?)", updated: "2026-11-17T08:00:00Z" },
  { repo: "wey-gu/ducter", number: 9, title: "Typo in docs/install.md", body: "'recieve' should be 'receive'.", labels: ["docs"], updated: "2026-11-16T08:00:00Z" },
];
/**
 * D385: a heavy developer's pile (scenario.todosPile): memory distillation in acme/mem, English titles
 * with two Chinese ones and one found only by its label, among unrelated web and api issues.
 */
const PILE_ISSUES = [
  [412, "acme/mem", "Distillation: fall back to a smaller result instead of failing", ["component/distillation"]],
  [398, "acme/mem", "Automatic distillation: the error says nothing useful", []],
  [377, "acme/mem", "Distillation gets slow on very long threads", []],
  [351, "acme/mem", "Newer facts should replace older ones by when they were said", ["component/distillation"]],
  [340, "acme/mem", "Distillation's first try often fails on long threads", []],
  [322, "acme/mem", "Show when automatic distillation has paused", []],
  [405, "acme/mem", "Retry a failed automatic distillation once?", []],
  [366, "acme/mem", "长对话的自动提炼总是失败", []],
  [331, "acme/mem", "提炼出来的记忆有重复", []],
  [290, "acme/mem", "Distillation as a tool loop", []],
  [12, "acme/web", "Login redirect drops the return path", ["bug"]],
  [14, "acme/web", "Footer links overflow on small phones", []],
  [31, "acme/api", "Rate limiter counts retries twice", []],
  [44, "acme/api", "Docs: the install page still says Node 18", ["docs"]],
  [52, "acme/web", "Dark mode: the date picker stays white", []],
].map(([number, repo, title, labels], k) => ({ repo: repo as string, number: number as number, title: title as string, labels: labels as string[], updated: new Date(Date.parse("2026-11-18T09:00:00Z") - k * 3_600_000).toISOString() }));

/** D385: the fake cheapest model for scenario.todosPile: sorts with a subject, finds by meaning (never a real model). */
const pileAsk = async (prompt: string): Promise<{ text: string; tokens: number }> => {
  const rows = JSON.parse(/<todos>\n([\s\S]*)\n<\/todos>/.exec(prompt)?.[1] ?? "[]") as { id: number; title: string }[];
  const mem = (t: string) => /istill|提炼|facts/i.test(t);
  if (prompt.includes("<query>")) {
    const q = /<query>([\s\S]*?)<\/query>/.exec(prompt)?.[1] ?? "";
    const about = /distill|memory|提炼|记忆/i.test(q);
    return { text: JSON.stringify({ subject: about ? "记忆提炼" : q, ids: about ? rows.filter((r) => mem(r.title)).map((r) => r.id) : [] }), tokens: 2000 };
  }
  return {
    text: JSON.stringify(
      rows.map((r) =>
        /\?$/.test(r.title) ? { id: r.id, group: "decide", why: "要不要重试是产品上的选择", ask: "要不要给失败的自动提炼一次有限的重试？", pick: "hand", subject: "记忆提炼" }
        : /tool loop|长对话/.test(r.title) ? { id: r.id, group: "later", why: "改动大，得先拆开", size: "large", subject: "记忆提炼" }
        : mem(r.title) ? { id: r.id, group: "do", why: "说得清楚，改动小", size: "small", subject: "记忆提炼" }
        : { id: r.id, group: "do", why: "说得清楚，改动小", size: "small", subject: /Login/.test(r.title) ? "登录" : "网页界面" },
      ),
    ),
    tokens: 1000,
  };
};
import { seedDidDay } from "../../core/test/did-day.ts";
import { seedMade } from "./seed-made.ts";
import { seedHistory } from "./seed-history.ts";
import { realClock } from "../../core/src/clock.ts";
import { partnerFingerprint } from "../test/fingerprint.ts";
import type { MemoryAdd } from "../src/memory.ts";

// ---------- args ----------
const argv = process.argv.slice(2);
const arg = (name: string, d?: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : d;
};
const flag = (name: string) => argv.includes(`--${name}`);
// D85: the partner on any first-wave harness (`--harness codex --model gpt-6-luna`). The judge
// stays on Claude Code. Model defaults: sonnet on Claude Code, the table's cheap model elsewhere.
const HARNESS_ARG = arg("harness", "claude-code")!;
if (!isHarnessId(HARNESS_ARG)) throw new Error(`--harness: one of ${HARNESS_IDS.join(", ")}`);
const HARNESS: HarnessId = HARNESS_ARG;
const MODEL = arg("model", HARNESS === "claude-code" ? "sonnet" : (HARNESSES[HARNESS].cheapModel ?? ""))!;
const JUDGE = arg("judge", "haiku")!;
const CONC = Number(arg("concurrency", "4"));
const LABEL = arg("label", "");
const ONLY = arg("only")?.split(",").filter(Boolean);
const REPEAT = Number(arg("repeat", "1"));
// D191: Autofill's key goes to a file in each scratch data folder, never the user's keychain.
process.env.DUCTER_SAVED_KEY = "file";
const NO_JUDGE = flag("no-judge");

// $/1M tokens (Anthropic first-party list prices; the CLI aliases resolve to the 5.5 models).
const PRICE: Record<string, { in: number; out: number; cw: number; cr: number }> = {
  sonnet: { in: 2, out: 10, cw: 2.5, cr: 0.2 },
  haiku: { in: 0.1, out: 0.5, cw: 0.125, cr: 0.01 },
  opus: { in: 4, out: 20, cw: 5, cr: 0.2 },
  // DeepSeek's list price is in CNY (api-docs.deepseek.com/zh-cn/quick_start/pricing, read
  // 2026-11-09): flash peak 2 / 0.04 (cache hit) / 8 元 per 1M; here at ≈7.1 元 per $.
  "deepseek-official/deepseek-flash": { in: 0.28, out: 1.13, cw: 0.28, cr: 0.0056 },
  // The same model through pi's own deepseek provider (D177).
  "deepseek/deepseek-flash": { in: 0.28, out: 1.13, cw: 0.28, cr: 0.0056 },
  // Plan-metered (a ChatGPT plan, MiniMax's coding plan): no per-token price to show.
  "gpt-6-luna": { in: 0, out: 0, cw: 0, cr: 0 },
  "minimax-coding-plan/MiniMax-M3": { in: 0, out: 0, cw: 0, cr: 0 },
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
        send: (t, m, i) => s.send(t, m, i),
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
interface Opened { taskId: string; title: string; brief: string; place?: Place; step: number; needs?: Record<string, unknown>; harness?: string; group?: string; workKind?: string }
const SAID_HOME = [
  { harness: "claude-code", installed: true, loggedIn: true, canBePartner: true, billing: "plan" as const, models: [{ id: "opus", label: "Opus" }, { id: "sonnet", label: "Sonnet" }] },
  { harness: "codex", installed: true, loggedIn: true, canBePartner: true, billing: "plan" as const },
];

function fakeRunner(core: Core, harness: HarnessPort, cur: { step: number }, firstErrand = false) {
  const opened: Opened[] = [];
  // D372: who does it, as core's ranking would pick on a home with Claude Code (Opus, Sonnet) and
  // Codex: an errand on Sonnet by the default. The first one on a home is marked (Ducter then says
  // one line) only where the scenario is about that moment: on a real home it happens once ever.
  const routed = new Set<string>(firstErrand ? [] : ["errand"]);
  const bodyFor = (taskId: string, input: { workKind?: string; needs?: unknown; place?: Place; harness?: string; model?: string }) => {
    const kind = kindOf(input.workKind, input.needs as TaskNeeds | undefined, input.place);
    // D379: what the person said and never saved, as core's choose reads it (the same home: Claude
    // Code with Opus and Sonnet, Codex): when it changes who does it, the pick says so.
    const said = core.said.rulesFor(kind);
    if (said.length) {
      const inp = { work: { title: "", ...(kind ? { kind } : {}) }, harnesses: SAID_HOME, settings: { brain: { harness: "claude-code" as const, model: "opus" } } };
      const pin = input.harness ? { pinned: { harness: input.harness, ...(input.model ? { model: input.model } : {}) } } : {};
      const p = saidPick(chooseBody({ ...inp, ...pin, rules: [...core.rules.list(), ...said] }), () => chooseBody({ ...inp, rules: core.rules.list() }), said);
      if (p && !("problem" in p) && p.why.kind === "said") {
        core.log.append({ stream: `task:${taskId}`, origin: "system", kind: "body_selected", body: { taskId, harness: p.harness, ...(p.model ? { model: p.model } : {}), why: p.why } });
        return;
      }
    }
    const errand = kind === "errand" && !input.harness;
    const first = errand && !routed.has("errand");
    if (errand) routed.add("errand");
    const body: Bodies["body_selected"] = errand
      ? { taskId, harness: "claude-code", model: "sonnet", why: { kind: "kind", work: "errand", keeps: { harness: "claude-code", model: "opus" }, ...(first ? { first: true as const } : {}) } }
      : { taskId, harness: input.harness ?? "claude-code", ...(input.harness ? (input.model ? { model: input.model } : {}) : { model: "opus" }), why: { kind: input.harness ? "partner" : "default" } };
    core.log.append({ stream: `task:${taskId}`, origin: "system", kind: "body_selected", body });
  };
  const sent: { taskId: string; text: string; step: number; from?: string }[] = [];
  const stopped: string[] = [];
  const openCard = (taskId: string, title: string, place: Place, brief: string, harness = "claude-code") => {
    core.log.append({ stream: `task:${taskId}`, origin: "system", kind: "task_open", body: { taskId, title, project: "", place, harness, brief } });
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
      opened.push({ taskId, title: input.title, brief: input.brief, place: input.place, step: cur.step, ...(input.needs ? { needs: input.needs as Record<string, unknown> } : {}), ...(input.harness ? { harness: input.harness } : {}), ...(input.workKind ? { workKind: input.workKind } : {}) });
      openCard(taskId, input.title, place, input.brief);
      bodyFor(taskId, input);
      return core.tasks.get(taskId) as TaskCard;
    },
    // D120: the partner opens from the call's head; the task counts as opened once briefed.
    async openTaskEarly(input, brief) {
      const taskId = shortId();
      const place = placeFor(taskId, input.title, input.place);
      const step = cur.step;
      openCard(taskId, input.title, place, "");
      bodyFor(taskId, input);
      brief.then(
        (b) => {
          opened.push({ taskId, title: input.title, brief: b, place: input.place, step, ...(input.needs ? { needs: input.needs as Record<string, unknown> } : {}), ...(input.harness ? { harness: input.harness } : {}), ...(input.workKind ? { workKind: input.workKind } : {}) });
          core.log.append({ stream: `task:${taskId}`, origin: "system", kind: "task_open", body: { taskId, title: input.title, project: "", place, harness: "claude-code", brief: b } });
        },
        () => core.tasks.setState(taskId, "dropped", "archived", "not started"),
      );
      return core.tasks.get(taskId) as TaskCard;
    },
    async send(taskId, text, _mode, from = "partner") {
      if (!core.tasks.get(taskId)) throw new Error(`unknown task ${taskId}`);
      sent.push({ taskId, text, step: cur.step, from });
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
interface Visible { seq: number; kind: "ack" | "ai_msg" | "decision" | "waiter" | "living_msg"; text: string; step: number; relays?: string }
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
  recalls: { query: string; step: number }[];
  threadSearches: { query: string; step: number }[];
  remembered: MemoryAdd[]; // saved (accepted by the fake Mem)
  memAttempts: { input: unknown; step: number }[]; // every memory_add call, refused ones too
  sources: (Bodies["memory_recalled"] & { step: number })[]; // D304: the 想起了 lines
  /** Work over time (D112-D114): a keep-going loop started, a routine proposed. */
  work?: { until: boolean; routine: boolean; asks?: { reversible: boolean; go: boolean; timed: boolean }[] };
  retitles: { key: string; title: string; step: number }[]; // task_retitle, as new task_open events
  bridgeSent: FakeMsg[]; // what Ducter sent through the fake Bridge
  /** D222: day cards under messages, and the kinds of calendar change cards made. */
  dayCards?: { step: number; seq: number; cal: NonNullable<Bodies["ai_msg"]["cal"]> }[];
  calKinds?: string[];
  /** D341: to-do write-back cards made, and the to-do each task is bound to. */
  todoCards?: number;
  boundRefs?: Map<string, string>;
  /** D303: the blocks drawn in messages (ducter-ui), and how many written ones weren't valid. */
  blocks?: { step: number; seq: number; ui: RichUi }[];
  /** D383: the files and pictures put under the partner's messages (their names). */
  shown?: string[];
  dropped?: number;
}

// ---------- fake Bridge (scenario.bridge): the fake nmem CLI over one JSON mailbox file ----------
interface FakeMsg { id: string; from: string; to: string; body: string; in_reply_to?: string; created_at: string; pending?: boolean; space?: string }
// D334 (scenario.spaces): the person's own place and one team Space; the home reads both.
const SPACES = [
  { id: "fake-space", label: "Only me", kind: "personal" },
  { id: "ws-everyone", label: "Everyone", kind: "team" },
];
const HOME_CONTEXTS = ["ducter-main", "ducter-main-in-everyone"];
const BRIDGE_IDENTITIES = {
  "ducter-main": { agent: "Ducter", member: "Weyl", member_id: "m-weyl", description: "Weyl's personal AI partner (always on)" },
  "terminal-claude": { agent: "terminal-claude", member: "Weyl", member_id: "m-weyl", description: "Weyl's Claude Code in a terminal, ~/dev/ducter" },
  "alex-reviewer": { agent: "reviewer", member: "Alex", member_id: "m-alex", description: "Alex's long-running code reviewer" },
  "codex-mem": { agent: "codex-mem", member: "Weyl", member_id: "m-weyl", description: "Weyl's Codex in another app on the Mac" },
};
function fakeBridge(dir: string, spaces = false) {
  const bin = join(dir, "nmem");
  writeFileSync(bin, `#!/bin/sh\nexec bun ${resolve(import.meta.dir, "fake-bridge-nmem.ts")} "$@"\n`);
  chmodSync(bin, 0o755);
  const state = join(dir, "bridge-state.json");
  const identities = spaces ? { ...BRIDGE_IDENTITIES, "ducter-main-in-everyone": { ...BRIDGE_IDENTITIES["ducter-main"], space: "ws-everyone" }, "alex-reviewer": { ...BRIDGE_IDENTITIES["alex-reviewer"], space: "ws-everyone" } } : BRIDGE_IDENTITIES;
  writeFileSync(state, JSON.stringify({ seq: 0, messages: [], identities, ...(spaces ? { spaces: SPACES, everywhere: ["Ducter"] } : {}) }));
  // "named": senders carry agent and member (teammates, D162), which nmem 0.10.118 doesn't show yet (D249).
  const env = { ...process.env, NMEM_FAKE_BRIDGE_STATE: state, DUCTER_BRIDGE_MEMBER: "m-weyl", NMEM_FAKE_SHAPE: "named" } as Record<string, string>;
  const read = () => JSON.parse(readFileSync(state, "utf8")) as { seq: number; messages: FakeMsg[]; identities: Record<string, { space?: string }> };
  const places = SPACES.map((sp, i) => ({ context: HOME_CONTEXTS[i]!, spaceId: sp.id, spaceLabel: sp.label, kind: sp.kind }));
  return {
    client: createNmemBridge({ context: "ducter-main", bin, env, ...(spaces ? { places } : {}) }),
    // What Ducter sent, with the Space it went out in (D334).
    sent: () => {
      const s = read();
      return s.messages.filter((m) => HOME_CONTEXTS.includes(m.from)).map((m) => ({ ...m, space: m.space ?? s.identities[m.to]?.space ?? "fake-space" }));
    },
    deliver(from: string, text: string, answer?: boolean, space?: string) {
      const s = read() as any;
      const last = [...s.messages].reverse().find((m: FakeMsg) => HOME_CONTEXTS.includes(m.from) && m.to === from);
      s.messages.push({ id: `msg-${String(++s.seq).padStart(3, "0")}`, op: `op-${s.seq}`, from, to: "ducter-main", body: text, ...(answer && last ? { in_reply_to: last.id } : {}), created_at: new Date().toISOString(), ...(space ? { space } : {}) });
      writeFileSync(state, JSON.stringify(s));
    },
  };
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
    case "ai_msg": {
      // D303: what the partner said around its blocks; the blocks are graded on their own.
      const b = e.body as Bodies["ai_msg"];
      return wordsOnly(b.text, b.ui);
    }
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
  // D193: a calling connection is the fake Tuwa (never the real one), imported with its token.
  const tuwa = sc.phone ? fakeTuwa() : undefined;
  if (sc.quietNow) {
    // Quiet hours around now in this machine's zone: a call waits for the morning.
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const hm = (ms: number) => new Date(Date.now() + ms).toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    writeFileSync(join(dataDir, "push.json"), JSON.stringify({ subs: [], settings: { quiet: { start: hm(-3600_000), end: hm(4 * 3600_000), tz }, done: false } }));
  }
  // D217: Ducter's phone added here: a stand-in install (the files the home checks), never started.
  if (sc.ownPhone) {
    const ph = join(dataDir, "phone");
    for (const f of ["sdk/platform-tools/adb", "sdk/emulator/emulator"]) {
      mkdirSync(join(ph, f, ".."), { recursive: true });
      writeFileSync(join(ph, f), "");
    }
    writeFileSync(join(ph, "installed.json"), JSON.stringify({ packages: [{ path: "emulator", version: "stand-in" }], licenses: [], at: new Date().toISOString() }));
  }
  // D243: what Ducter noted by itself on dots' day (synthetic facts around now).
  if (sc.noticed === "dots") writeDotsFacts(dataDir);
  // D222: two Google Calendar accounts (and Gmail) in a fake oo, on today's date here; never the real oo.
  const calOo = sc.calendar ? fakeOoCalendar({ day: new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()), ...(sc.calendarDown ? { listFails: true } : {}) }) : undefined;
  // D312: the partner under test is a second partner (its own conversation, channel:p2); the seed is the default's.
  const conv = sc.second ? "channel:p2" : "channel";
  const todoGh = sc.todos ? fakeGh(sc.todosPile ? PILE_ISSUES : TODO_ISSUES, { login: "wey-gu" }) : undefined;
  // D368: the person's Working Memory from a fake nmem (never the author's real Mem): the scenario's, or none.
  const wmOut = JSON.stringify(
    sc.workingMemory
      ? { exists: true, date: new Date().toISOString().slice(0, 10), parsed: { focus_areas: sc.workingMemory.focus, flags: [], briefing: sc.workingMemory.briefing ?? "", awaiting_rulings: sc.workingMemory.rulings ?? [], awaiting_rulings_more: 0 } }
      : { exists: false },
  );
  // D376: the person's own Claude Code / Codex sessions, from a scratch home beside the data folder
  // (never this machine's ~/.claude or ~/.codex): the scenario's, or none.
  const ownHome = mkdtempSync(join(root, `own-home-${sc.id}-`));
  for (const s of sc.ownSessions ?? []) {
    const cwd = join(ownHome, s.folder);
    mkdirSync(cwd, { recursive: true });
    const updatedAt = new Date(Date.now() - s.minutesAgo * 60_000);
    writeSession(ownHome, { agent: s.agent, id: s.id, cwd, turns: s.turns, ...(s.title ? { title: s.title } : {}), ...(s.branch ? { branch: s.branch } : {}), startedAt: new Date(updatedAt.getTime() - 3600_000), updatedAt });
  }
  // D380: a quick web look answers from the scenario's fake (never the web), a beat later.
  const look = sc.webLook;
  const webLook = {
    can: () => true,
    look: async () => {
      await Bun.sleep(40);
      return !look || "unsettled" in look
        ? { state: "unsettled" as const, why: look?.unsettled ?? ("page" as const), harness: "claude-code", model: "haiku", ms: 40 }
        : { state: "found" as const, answer: look.answer, sources: look.sources, confidence: look.confidence ?? "high", harness: "claude-code", model: "haiku", ms: 40 };
    },
  };
  // D383: the core's clock can be set back while what was made weeks ago is logged (seed-made.ts).
  const back = { ms: 0 };
  const clock = { ...realClock, now: () => Date.now() - back.ms };
  // D390: a redo opens a repo task on fake repos: git answers as a checkout with main (never the machine's own repos).
  const fakeGit = async (cwd: string, args: string[]) => (args.includes("--show-toplevel") ? { ok: true, out: cwd } : args[0] === "for-each-ref" || args[0] === "branch" ? { ok: true, out: "main" } : args[0] === "symbolic-ref" ? { ok: true, out: "origin/main" } : { ok: true, out: "" });
  const core = startCore({ dataDir, port: 0, persona, webLook, clock, ...(sc.history ? { git: fakeGit } : {}), localAgents: createLocalAgents({ home: ownHome, env: {}, uid: null }), workingMemory: { run: async () => ({ code: 0, out: wmOut, err: "" }) }, // D341: never the machine's own gh (the person's real issues) nor its Obsidian vault list.
    taskSources: { ghRun: todoGh?.run ?? (async () => ({ code: 127, out: "", err: "", missing: true as const })), ghEnv: {}, home: join(dataDir, "no-home"), pollMs: 3_600_000, ask: sc.todosPile ? pileAsk : async () => ({ text: "[]", tokens: 1 }) }, ...(sc.second ? { partners: true } : {}), ownPhone: { platform: "darwin", arch: "arm64" }, ...(calOo ? { ooSource: calOo.source } : sc.phone ? { ooSource: { detect: () => ({ installed: false, account: false }), read: () => undefined } } : {}) });
  // D376: the home's name as the records' computer: a fixed fake one, never this machine's own name.
  (core.outside as { computer: () => string | undefined }).computer = () => sc.homeName ?? "Weyl's Mac";
  // D377: a computer for tasks with the person's own sessions: its own scratch home and records ops,
  // reached through a pretend link (never this machine's records).
  if (sc.workerSessions) {
    const ws = sc.workerSessions;
    const macHome = mkdtempSync(join(root, `worker-home-${sc.id}-`));
    for (const s of ws.sessions) {
      const cwd = join(macHome, s.folder);
      mkdirSync(cwd, { recursive: true });
      const updatedAt = new Date(Date.now() - s.minutesAgo * 60_000);
      writeSession(macHome, { agent: s.agent, id: s.id, cwd, turns: s.turns, ...(s.title ? { title: s.title } : {}), ...(s.branch ? { branch: s.branch } : {}), startedAt: new Date(updatedAt.getTime() - 3600_000), updatedAt });
    }
    const records = createWorkerRecords({ dataDir: join(macHome, ".ducter-worker"), reader: createLocalAgents({ home: macHome, env: {}, uid: null, alive: () => false }), home: macHome });
    if (ws.allowed) records.set(true);
    const ops = records.ops as Record<string, (a: unknown) => Promise<unknown>>;
    const link = { id: "w-own", name: ws.name, online: () => true, call: async (op: string, a: unknown) => { const fn = ops[op]; if (!fn) throw new Error(`unknown op ${op}`); return JSON.parse(JSON.stringify(await fn(a ?? {}))); }, onSession: () => () => {}, onOnline: () => () => {} };
    const w = core.workers as { list: () => unknown[]; link: (d: string) => unknown };
    const list0 = w.list.bind(w);
    const link0 = w.link.bind(w);
    w.list = () => [...list0(), { id: "w-own", name: ws.name, online: true, os: "macOS", harnesses: [{ id: "claude-code", installed: true, loggedIn: true }, { id: "codex", installed: true, loggedIn: true }] }];
    w.link = (d: string) => (d === "w-own" || d === ws.name ? link : link0(d));
  }
  if (calOo && !(await core.connections.addFromOo()).ok) throw new Error("fake oo calendar: not added");
  if (todoGh && !(await core.taskSources.add("github")).ok) throw new Error("fake GitHub: not added");
  // D385: the pile sorted before the conversation (subjects and groups by the fake cheapest model).
  if (sc.todosPile) {
    await core.taskSources.look();
    await core.taskSources.pile.sort("daily");
  }
  if (sc.second && !core.partners.add({ name: sc.second.name }).ok) throw new Error("second partner: not added");
  if (tuwa) {
    const added = await core.connections.add({ url: tuwa.url, token: JSON.stringify({ accessToken: tuwa.access(), refreshToken: tuwa.refresh(), expires_in: 3600 }) });
    if (!added.ok) throw new Error(`fake Tuwa: ${JSON.stringify(added)}`);
  }
  for (const item of sc.saved ?? []) core.autofill.store.put(item);
  // D381: what the person pinned: the partner's earlier list, pinned by a tap, ticked on a phone.
  for (const p of sc.pinned ?? []) {
    const plain = [p.title, ...p.items.map((x) => `- ${x}`)].join("\n");
    const e = core.log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: plain, ui: [{ type: "checklist", title: p.title, items: p.items, plain }] } });
    const r = core.pins.pin(e.seq, 0);
    if (!r.ok) throw new Error(`pinned seed: ${r.error}`);
    for (const x of p.ticks ?? []) core.pins.tick(r.pin.id, x, true);
  }
  // D300: a day of things Ducter did for the person (a mail, a payment, a call, a merge…), logged now.
  if (sc.did) seedDidDay(core, { zh: sc.lang.startsWith("zh") });
  // D383: what Ducter made over the last weeks (files, a PDF, a CSV, a table), at their own times.
  if (sc.made) seedMade(core as never, back, sc.lang.startsWith("zh"));
  const usage: Usage = { inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0 };
  const perSession = new Map<number, Usage>();
  const tools: ToolCall[] = [];
  const cur = { step: -1 };
  // A call is counted once: from its early head (a streamed title, D120) when it has one, else
  // from its end event, which carries the whole input. Before D177 only the early events were
  // counted, so a call with no `title` field (rule_save, notice_rule) was never seen on any harness.
  const early = new Set<string>();
  const port = teePort(createOarHarnessPort({ dataDir }), (ev, idx) => {
    if (ev.turnEnd && ev.usage) perSession.set(idx, { inputTokens: ev.usage.inputTokens ?? 0, outputTokens: ev.usage.outputTokens ?? 0, cacheRead: ev.usage.cacheRead ?? 0, cacheWrite: ev.usage.cacheWrite ?? 0 });
    if (!ev.tool || ev.tool.input === undefined) return;
    const callId = `${idx}:${(ev.raw as { callId?: string } | undefined)?.callId ?? ""}`;
    if (ev.tool.output === undefined) {
      tools.push({ name: ev.tool.name, input: ev.tool.input, step: cur.step });
      early.add(callId);
    } else if (!early.has(callId)) tools.push({ name: ev.tool.name, input: ev.tool.input, step: cur.step });
  });
  const fr = fakeRunner(core, port, cur, !!sc.firstErrand);
  // D376: other computers (the [devices] line), and task_switch's move to one recorded, not made.
  if (sc.computers) {
    const others = sc.computers;
    (core.workers as { list: () => unknown[] }).list = () => others.map((c, i) => ({ id: `w${i + 1}`, name: c.name, online: true, os: "macOS", web: c.web, harnesses: c.harnesses.map((id) => ({ id, installed: true, loggedIn: true })) }));
    const comps: Computer[] = [
      { id: "local", name: "local", home: true, state: "awake", alwaysOn: true, mac: false, harnesses: [], web: { on: true, where: "ducter" } },
      ...others.map((c, i) => ({ id: `w${i + 1}`, name: c.name, home: false, state: "awake" as const, alwaysOn: false, mac: true, harnesses: [], web: { on: true, where: c.web } })),
    ];
    core.loadout.computers = async () => comps;
    core.loadout.switchTask = async (taskId, harness, _m, _r, device) => {
      const to = comps.find((c) => c.id === device);
      if (to) {
        const open = core.log.read({ stream: `task:${taskId}`, kinds: ["task_open"], limit: 1000 }).at(-1)!.body as Bodies["task_open"];
        core.log.append({ stream: `task:${taskId}`, origin: "user", kind: "task_open", body: { ...open, place: { ...(open.place as Place), device: to.name } as Place, harness } });
      }
      return { ok: true };
    };
  }
  const mem = fakeMemory(sc.memories ?? [], { down: sc.memoryDown, ...(sc.threads ? { threads: sc.threads } : {}) });
  const recalls: { query: string; step: number }[] = [];
  const threadSearches: { query: string; step: number }[] = [];
  const memAttempts: { input: unknown; step: number }[] = [];
  const memWrapped = {
    search: (q: string, n: number) => (recalls.push({ query: q, step: cur.step }), mem.memory.search(q, n)),
    add: (m: MemoryAdd) => mem.memory.add(m),
    threads: (q: string, n: number) => (threadSearches.push({ query: q, step: cur.step }), mem.memory.threads!(q, n)),
  };
  core.setRunner(fr.runner);
  core.setPartner({ onTrigger() {} }); // history is background, not new work
  const fb = sc.bridge ? fakeBridge(dataDir, !!sc.spaces) : undefined;

  const idOf = new Map<string, string>(); // key -> taskId
  const keyOf = new Map<string, string>();
  const jobOf = new Map<string, string>();
  let lastUser = 0;
  const waiters = new Map<string, Bodies["waiter"]>();
  // D390: earlier tasks over six weeks, found by task_find and redone by task_fork; their keys as seeded tasks'.
  if (sc.history) for (const [k, id] of seedHistory(core as never, back, sc.lang.startsWith("zh"))) idOf.set(k, id), keyOf.set(id, k);
  for (const s of sc.seed ?? []) {
    if ("user" in s) lastUser = core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: s.user } }).seq;
    else if ("ai" in s) core.log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: s.ai, replyTo: lastUser } });
    else if ("userAction" in s) {
      const taskId = idOf.get(s.userAction.task)!;
      core.log.append({ stream: "channel", origin: "user", kind: "job_status", body: { jobId: `act_${taskId}_merge`, taskId, state: "done", text: s.userAction.text } });
    } else if ("callQuestion" in s) {
      const q = s.callQuestion;
      const conn = core.connections.view()[0]?.id ?? "conn";
      const decisionId = "d_callq";
      const plan = { to: q.to, name: q.name, goal: "", say: [], mustNot: [], voice: "ducter" as const, from: "provider" as const, provider: "Tuwa", minutes: 4, costUsd: 1.6, perMinUsd: 0.4, calleeZone: "Asia/Tokyo" };
      core.log.append({ stream: "channel", origin: "system", kind: "phone_call", body: { callId: "call_q", connectionId: conn, state: "question", plan, placedAt: new Date(Date.now() - 90_000).toISOString(), talkingSince: new Date(Date.now() - 60_000).toISOString(), question: { text: q.question, choices: [], yesNo: true, askedAt: new Date().toISOString(), decisionId } } });
      core.log.append({ stream: "channel", origin: "system", kind: "decision", body: { decisionId, question: q.question, goLabel: "yes", defaultOption: "hold", reversible: false, call: { callId: "call_q", kind: "question", choices: [], yesNo: true } } });
    } else if ("finds" in s) {
      // D236: a note Ducter said by itself; each find with a next step has its card (default Hold).
      const n = `n_${shortId()}`;
      const finds = s.finds.finds.map((f, i) => ({ findId: `${n}_f${i}`, kind: f.kind, text: f.text, how: [], ...(f.goLabel ? { goLabel: f.goLabel, decisionId: `${n}_d${i}` } : {}) }));
      core.log.append({ stream: "channel", origin: "partner", kind: "finds", body: { noteId: n, rung: "morning", opening: s.finds.opening, finds } as Bodies["finds"] });
      for (const f of finds) if (f.decisionId) core.log.append({ stream: "channel", origin: "partner", kind: "decision", body: { decisionId: f.decisionId, question: f.text, goLabel: f.goLabel!, defaultOption: "hold", reversible: false, findId: f.findId } });
    } else if ("chatter" in s) {
      const said = ["收到", "好", "嗯，记着了", "行"];
      for (let i = 0; i < s.chatter; i++) {
        const u = core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: `第 ${i + 1} 条：今天的站会改到 ${9 + (i % 8)} 点半` } });
        core.log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: said[i % said.length]!, replyTo: u.seq } });
      }
      lastUser = core.log.head() - 1;
    } else if ("todoSet" in s) {
      await core.taskSources.handover!.set({ query: s.todoSet.query });
      core.log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: s.todoSet.ai } });
    } else if ("handSet" in s) {
      const set = core.log.read({ stream: "channel", kinds: ["todo_set"], limit: 20 }).at(-1)?.body as Bodies["todo_set"] | undefined;
      if (!set) throw new Error("handSet: no set seeded");
      const r = await core.taskSources.handover!.hand({ refs: set.ticked, setId: set.setId, bySubject: true, ...(s.handSet.note ? { note: s.handSet.note } : {}), ...(s.handSet.subject ? { subject: s.handSet.subject } : {}) });
      if (!r.ok) throw new Error(`handSet: ${r.error}`);
    } else if ("bound" in s) {
      const it = await core.taskSources.item(s.bound.ref);
      if (!it) throw new Error(`fake GitHub: no ${s.bound.ref}`);
      core.taskSources.bind(idOf.get(s.bound.task)!, it, "partner");
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
      const place = fr.placeFor(taskId, t.title, t.repo ? { kind: "repo", device: "local", repoPath: expand(t.repo) } : t.browser ? { kind: "browser", device: "local", profile: "default" } : undefined, t.branch);
      fr.openCard(taskId, t.title, place, `User's words: (seeded)\nTitle: ${t.title}`, t.harness);
      core.log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId, text: t.title, state: "running", taskId } });
      if (t.report) {
        core.log.append({ stream: `task:${taskId}`, origin: "task", kind: "report", body: { taskId, ...t.report } });
        if (t.state === "done") core.log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId, text: t.title, state: "done", taskId } });
      }
    }
  }
  await Bun.sleep(20);

  const partner = createPartner(sc.second ? core.partnerView("p2") : core, fr.runner, {
    ...(sc.second ? { dir: join(dataDir, "partners", "p2") } : {}),
    harness: HARNESS,
    ...(MODEL ? { model: MODEL } : {}),
    persistState: false,
    fs: placeFs,
    turnTimeoutMs: 180_000,
    memory: memWrapped,
    // The eval's mailbox starts empty by construction: no start mark (B14), so a peer step can't race it.
    ...(fb ? { bridge: fb.client, bridgeIntervalMs: 0, bridgeStartMark: false } : { bridge: null }),
    onError: (err) => console.error(`[${sc.id}]`, err instanceof Error ? err.message : err),
  });
  if (sc.second) core.setPartnerFactory(() => partner);
  else core.setPartner(partner);
  const startSeq = core.log.head();
  const stepStarts: number[] = [];
  let error: string | undefined;
  const lines: string[] = [];
  try {
    // D333: the check Bridge makes when it comes on, over before any step (an `unchecked` message stays unread).
    if (fb) await partner.checkBridge();
    for (const [i, st] of sc.steps.entries()) {
      cur.step = i;
      stepStarts.push(core.log.head());
      if ("peer" in st) {
        if (!fb) throw new Error("a peer step needs scenario.bridge");
        fb.deliver(st.peer.from, st.peer.text, st.peer.answer, st.peer.space);
        if (!st.peer.unchecked) await partner.checkBridge();
      } else applyStep(st, core, idOf, waiters, fr.opened, conv);
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
  const dayCards: { step: number; seq: number; cal: NonNullable<Bodies["ai_msg"]["cal"]> }[] = [];
  const blocks: { step: number; seq: number; ui: RichUi }[] = [];
  const shown: string[] = [];
  let dropped = 0;
  for (const e of core.log.read({ stream: conv, fromSeq: startSeq + 1, limit: 10_000 })) {
    if (e.kind === "ai_msg") {
      const b = e.body as Bodies["ai_msg"];
      for (const ui of b.ui ?? []) blocks.push({ step: stepOf(e.seq), seq: e.seq, ui });
      for (const m of b.media ?? []) shown.push(m.name ?? m.id);
      dropped += b.uiDropped ?? 0;
    }
    // D222: a day card with no words of its own is a card, not a message.
    if (e.kind === "ai_msg" && (e.body as Bodies["ai_msg"]).cal) dayCards.push({ step: stepOf(e.seq), seq: e.seq, cal: (e.body as Bodies["ai_msg"]).cal! });
    if (e.kind === "ai_msg" && !(e.body as Bodies["ai_msg"]).text.trim()) continue;
    if (e.origin === "partner" && PARTNER_KINDS.has(e.kind)) visible.push({ seq: e.seq, kind: e.kind as Visible["kind"], text: visibleText(e), step: stepOf(e.seq), relays: (e.body as { decisionId?: string }).decisionId });
    else if (e.kind === "waiter" && (e.body as Bodies["waiter"]).state === "armed") visible.push({ seq: e.seq, kind: "waiter", text: visibleText(e), step: stepOf(e.seq) });
  }
  const work = {
    until: core.log.read({ fromSeq: startSeq + 1, kinds: ["until"], limit: 100 }).some((e) => (e.body as Bodies["until"]).state === "on"),
    routine: core.log.read({ fromSeq: startSeq + 1, kinds: ["routine"], limit: 100 }).some((e) => (e.body as Bodies["routine"]).state === "proposed"),
  };
  // Decisions made by the partner keep their full shape for the judge.
  const decisions = core.log.read({ stream: conv, fromSeq: startSeq + 1, kinds: ["decision"], limit: 100 }).filter((e) => e.origin === "partner");
  const calKinds = decisions.map((e) => (e.body as Bodies["decision"]).cal?.kind).filter((k): k is NonNullable<typeof k> => !!k);
  const todoCards = decisions.filter((e) => (e.body as Bodies["decision"]).src?.kind === "write").length;
  const asks = decisions.map((e) => e.body as Bodies["decision"]).map((d) => ({ reversible: d.reversible, go: d.defaultOption === "go", timed: Boolean(d.defaultAt) }));
  const looks = core.log
    .read({ stream: conv, fromSeq: startSeq + 1, kinds: ["web_look"], limit: 100 })
    .filter((e) => (e.body as Bodies["web_look"]).state !== "looking")
    .map((e) => ({ b: e.body as Bodies["web_look"], seq: e.seq, step: stepOf(e.seq) }));
  const retitles = core.log
    .read({ fromSeq: startSeq + 1, kinds: ["task_open"], limit: 1000 })
    .filter((e) => e.origin === "partner")
    .map((e) => {
      const b = e.body as Bodies["task_open"];
      return { key: keyOf.get(b.taskId) ?? b.taskId, title: b.title, step: stepOf(e.seq) };
    });
  for (const t of tools) if (/(^|__)memory_add$/.test(t.name)) memAttempts.push({ input: t.input, step: t.step });
  const notedByStep = core.log
    .read({ stream: conv, fromSeq: startSeq + 1, kinds: ["memory_noted"], limit: 100 })
    .map((e) => ({ title: (e.body as Bodies["memory_noted"]).title, step: stepOf(e.seq) }));
  // D304: the source lines under the replies.
  const sources = core.log
    .read({ stream: conv, fromSeq: startSeq + 1, kinds: ["memory_recalled"], limit: 100 })
    .map((e) => ({ ...(e.body as Bodies["memory_recalled"]), step: stepOf(e.seq) }));
  for (const o of fr.opened) keyOf.set(o.taskId, keyOf.get(o.taskId) ?? `$opened${fr.opened.indexOf(o)}`);
  const sent = fr.sent.map((s) => ({ ...s, key: keyOf.get(s.taskId) ?? s.taskId }));

  // Transcript for the judge (and the results file).
  for (const s of sc.seed ?? []) {
    if ("user" in s) lines.push(`(earlier) user: ${s.user}`);
    else if ("ai" in s) lines.push(`(earlier) partner: ${s.ai}`);
    else if ("task" in s) lines.push(`(earlier) partner ack: ${s.task.ack}  → task "${s.task.title}" ${s.task.state}${s.task.report ? `; its report: ${s.task.report.summary}` : ""}`);
    else if ("userAction" in s) lines.push(`(earlier) the user, by button, on task "${s.userAction.task}": ${s.userAction.text}`);
    else if ("callQuestion" in s) lines.push(`(earlier) a call to ${s.callQuestion.name} is live; the other side asked "${s.callQuestion.question}" and that question's card (Yes / No / reply) is on screen`);
    else if ("finds" in s) lines.push(`(earlier) Ducter's own note from the user's accounts: ${s.finds.opening} ${s.finds.finds.map((f) => `[${f.kind}] ${f.text}${f.goLabel ? ` (next step offered: ${f.goLabel})` : ""}`).join(" | ")}`);
    else if ("chatter" in s) lines.push(`(earlier) ${s.chatter} short exchanges about moving the stand-up (filler)`);
    else if ("bound" in s) lines.push(`(earlier) Ducter bound task "${s.bound.task}" to the GitHub issue ${s.bound.ref} (the user took it from their to-dos)`);
    else if ("todoSet" in s) lines.push(`(earlier) the partner found the to-dos about "${s.todoSet.query}" and said: ${s.todoSet.ai} (a set card under it shows them, the takeable ones ticked)`);
    else if ("handSet" in s) lines.push(`(earlier) that set was handed over as one group; a plan is being made first (nothing else started)${s.handSet.note ? `; the user's note: ${s.handSet.note}` : ""}`);
    else lines.push(`(earlier) reminder set: ${s.waiterArmed.reason}`);
  }
  if (sc.second)
    lines.push(`(the earlier lines, if any, were the user's conversation with their other partner, ${persona.name}. The partner under test is a second partner named ${sc.second.name}, in its own conversation; it never sees ${persona.name}'s. Every step below is the user talking to ${sc.second.name}.)`);
  for (const [i, st] of sc.steps.entries()) {
    lines.push(`--- step ${i + 1}: ${describeStep(st)}`);
    // D380: a quick web look's line goes where it landed among the messages (its answer comes after it).
    const lookLine = (l: (typeof looks)[number]) =>
      `  [Ducter's quick web look came back (not a task; the app showed "${sc.lang.startsWith("zh") ? "在网上查…" : "Looking it up on the web…"}" while it ran)] "${l.b.question}" → ${l.b.state === "found" ? `found: ${l.b.answer} (from ${(l.b.sources ?? []).join(", ")})` : `not settled: ${l.b.why}`}`;
    const looksLeft = looks.filter((x) => x.step === i);
    for (const v of visible.filter((x) => x.step === i)) {
      while (looksLeft.length && looksLeft[0]!.seq < v.seq) lines.push(lookLine(looksLeft.shift()!));
      if (v.kind === "decision") {
        const d = decisions.find((e) => e.seq === v.seq)!.body as Bodies["decision"];
        // Structured fields of the card (the app renders the buttons and the default line from them).
        lines.push(`  [partner made a decision card] question text: ${d.question} | (field goLabel: ${d.goLabel}; field defaultOption: ${d.defaultOption}${d.reversible ? ", reversible" : ""})`);
        // D193: a call's Go card shows its whole plan (the app renders it under the question).
        // D215: a call sheet: the user calls it themselves (the app shows 自己打 / Call it yourself, a tel: link).
        const sh = d.call?.plan?.sheet;
        if (d.call?.plan && sh) lines.push(`    [the call sheet shows, for the user to call themselves] number ${d.call.plan.to} · what for: ${d.call.plan.goal} · open with: ${sh.open} · ask: ${sh.ask.join(" / ") || "-"} · may say: ${d.call.plan.say.join(", ") || "-"} · don't share: ${sh.dont.join(", ") || "-"} · note down: ${sh.note.join(" / ") || "-"} · buttons: 自己打 / Call it yourself (dials on their phone), 打完了 / Done calling, 先不打 / Not now · Ducter dials nothing`);
        else if (d.call?.plan) lines.push(`    [the call card shows] number ${d.call.plan.to} · what for: ${d.call.plan.goal} · may say: ${d.call.plan.say.join(", ") || "-"} · won't say: ${d.call.plan.keep ?? "-"} · voice: ${d.call.plan.voice} · about ${d.call.plan.minutes} min, $${d.call.plan.costUsd} · when: ${d.call.plan.at ? `not now; it dials at ${d.call.plan.at} (an allowed hour)` : "right after Go"} · nothing is dialed before Go`);
        // D222: a calendar change's card.
        if (d.src) lines.push(`    [this decision card IS the to-do write-back card (made by the todos tool), and shows] ${d.src.kind} · ${d.src.item.where ?? ""}${d.src.item.label} "${d.src.item.title}"${d.src.text ? ` · the comment, whole: ${d.src.text}` : ""}${d.src.close ? " · and closes it" : ""} · goes out only on the user's tap`);
        if (d.cal) lines.push(`    [this decision card IS the calendar change card (one card, made by the calendar tool), and shows] ${d.cal.kind}${d.cal.response ? ` (${d.cal.response})` : ""} · ${d.cal.title} · ${d.cal.allDay ? d.cal.start : `${d.cal.start.slice(0, 16)}–${d.cal.end.slice(11, 16)}`}${d.cal.was ? ` (was ${d.cal.was.start.slice(0, 16)})` : ""} · in ${[d.cal.calendar || "main calendar", d.cal.account].filter(Boolean).join(" · ")} · notifies: ${d.cal.notify.join(", ") || "nobody"}${d.cal.clash ? ` · overlaps "${d.cal.clash}"` : ""}${d.cal.theirZone ? ` · their zone ${d.cal.theirZone}` : ""} · runs only on the user's tap, then the card shows it done`);
      } else if (v.kind === "waiter") lines.push(`  [reminder set] ${v.text}`);
      else lines.push(`  [partner ${v.kind === "ack" ? "ack line" : "message"}] ${v.text}`);
    }
    // D385: the set card a find put under the reply, and a hand-over's group (as the app shows them).
    for (const e of core.log.read({ stream: conv, fromSeq: startSeq + 1, kinds: ["todo_set"], limit: 50 }).filter((x) => stepOf(x.seq) === i)) {
      const s = e.body as Bodies["todo_set"];
      const num = (r: string) => r.replace(/^.*(?=#)/, "");
      if (s.groupId) {
        const g = core.taskGroups.get(s.groupId);
        lines.push(`  [Ducter handed the set over as one group] ${g?.name ?? s.groupId} | shape: ${g?.hand?.shape ?? "?"}${g?.hand?.plan ? " (a plan is being made first; nothing else starts until the user says go)" : ""} | to-dos: ${(g?.hand?.items ?? []).map((x) => x.label).join(" ")}${g?.hand?.note ? ` | the user's note, quoted in every task: ${g.hand.note}` : ""}${g?.hand?.where ? ` | where: ${g.hand.where.name}` : ""}`);
      } else lines.push(`  [the app shows a set card under the reply] ${s.found.n} about "${s.subject ?? s.query ?? ""}" | ticked: ${s.ticked.map(num).join(" ")} | not ticked: ${s.refs.filter((r) => !s.ticked.includes(r)).map(num).join(" ")} | button: hand these over…`);
    }
    for (const x of tools.filter((x) => x.step === i && /(^|__)todos$/.test(x.name) && (x.input as { do?: string } | undefined)?.do === "hand" && (x.input as { group?: string }).group))
      lines.push(`  [Ducter added to the group "${(x.input as { group?: string }).group}"] ${JSON.stringify((x.input as { refs?: unknown }).refs ?? [])}`);
    for (const c of dayCards.filter((x) => x.step === i)) lines.push(`  [the app shows a day card under the message] ${c.cal.days.map((d) => `${d.date}: ${d.events.map((x) => `${x.allDay ? "all day" : `${x.start.slice(11, 16)}–${x.end.slice(11, 16)}`} ${x.title}${x.me && x.me !== "accepted" ? ` (their answer: ${x.me})` : ""}${x.free ? " (shown as free)" : ""}`).join("; ") || "nothing"}`).join(" | ")}${c.cal.clashes?.length ? ` (overlaps drawn: ${c.cal.clashes.length})` : ""}`);
    for (const b of blocks.filter((x) => x.step === i)) lines.push(`  [the message also shows a ${b.ui.type === "chart" ? `${b.ui.kind} chart` : b.ui.type} block the partner wrote] ${JSON.stringify({ ...b.ui, plain: undefined })}`);
    for (const q of recalls.filter((x) => x.step === i)) lines.push(`  [searched long-term memory (invisible to the user)] ${q.query}`);
    for (const q of threadSearches.filter((x) => x.step === i)) lines.push(`  [also searched their past conversations with other AI tools (invisible to the user)] ${q.query}`);
    for (const a of memAttempts.filter((x) => x.step === i)) {
      // The stream's tool input can be partial (title first); the saved record is the truth.
      const m = a.input as { title?: string; content?: string };
      const saved = mem.added.find((x) => x.title === m.title);
      lines.push(`  [${saved ? "saved to long-term memory" : "tried to save to memory (refused by the tool)"}] ${m.title ?? ""}: ${String(saved?.content ?? m.content ?? "").slice(0, 300)}`);
    }
    for (const n of notedByStep.filter((x) => x.step === i)) lines.push(`  [the app shows a small line: "Noted · ${n.title}"]`);
    for (const s of sources.filter((x) => x.step === i)) lines.push(`  [the app shows a quiet source line under the reply: "Remembered from what ${s.by === "tool" ? `${s.from} saved` : s.by === "said" ? "you said" : "you saved"}${s.date ? ` on ${s.date}` : ""}" (the memory "${s.title}")]`);
    // D360: the group a task is in on On hand, when it is in one.
    const groupOf = (id: string) => core.taskGroups.of(id)?.name;
    for (const o of fr.opened) if (groupOf(o.taskId)) o.group = groupOf(o.taskId);
    // D379: who it went to, and why when the person's own words decided it.
    const wentTo = (id: string) => {
      const b = core.log.read({ stream: `task:${id}`, kinds: ["body_selected"], limit: 50 }).at(-1)?.body as Bodies["body_selected"] | undefined;
      return b ? ` | Ducter gave it to: ${b.harness}${b.model ? ` (${b.model})` : ""}${b.why.kind === "said" ? ` because the user said earlier "${b.why.text}"` : ""}` : "";
    };
    for (const o of r_opened(fr.opened, i)) lines.push(`  [opened a task] title: ${o.title}${groupOf(o.taskId) ? ` | group: ${groupOf(o.taskId)}` : ""} | place: ${JSON.stringify(o.place ?? null)}${wentTo(o.taskId)} | brief: ${o.brief.slice(0, 1200).replace(/\n/g, " ⏎ ")}`);
    // D360: a later part of a split is held by Ducter (not a task yet), shown so the judge sees all parts.
    const openedTitles = new Set(r_opened(fr.opened, i).map((o) => o.title));
    for (const x of tools.filter((x) => x.step === i && /(^|__)task_open$/.test(x.name)))
      if ((x.input as { group?: unknown } | undefined)?.group && !openedTitles.has(String((x.input as { title?: unknown }).title ?? "")))
        lines.push(`  [held in line by Ducter, opens when the part before it is done] title: ${String((x.input as { title?: unknown }).title ?? "")} | group: ${String((x.input as { group?: unknown }).group)}`);
    for (const x of fr.sent.filter((x) => x.step === i)) lines.push(`  [${x.from === "user" || x.from === "ducter" ? "Ducter passed the user's answer to task" : "sent to task"} ${keyOf.get(x.taskId) ?? "?"}] ${x.text.slice(0, 400)}`);
    for (const x of retitles.filter((x) => x.step === i)) lines.push(`  [retitled task ${x.key}] ${x.title}`);
    for (const l of looksLeft) lines.push(lookLine(l));
    const other = [...new Set(tools.filter((x) => x.step === i).map((x) => x.name.replace(/^mcp__ducter__/, "")).filter((n) => !["task_open", "task_send", "task_retitle", "ask", "wait_until", "ToolSearch", "memory_search", "memory_add"].includes(n)))];
    if (other.length) lines.push(`  [also used tools] ${other.join(", ")}`);
  }
  const bridgeSent = fb?.sent() ?? [];
  if (fb) {
    lines.push("--- what Ducter sent through Bridge (other agents see this, the user doesn't):");
    for (const m of bridgeSent) lines.push(`  [to ${m.to}${m.in_reply_to ? " (a reply)" : ""}] ${m.body.replace(/\n/g, " ⏎ ").slice(0, 600)}`);
  }
  if (error) lines.push(`ERROR: ${error}`);

  const bodies = core.log.read({ kinds: ["body_selected"], fromSeq: startSeq + 1, limit: 1000 }).map((e) => e.body as Bodies["body_selected"]);
  const saidAsks = core.log.read({ kinds: ["decision"], fromSeq: startSeq + 1, limit: 1000 }).filter((e) => (e.body as Bodies["decision"]).saying).length;
  await partner.close().catch(() => {});
  await core.stop().catch(() => {});
  tuwa?.stop();
  const boundRefs = new Map(core.tasks.list().filter((c) => c.source).map((c) => [c.taskId, c.source!.ref] as [string, string]));
  return { sc, visible, dayCards, calKinds, todoCards, boundRefs, blocks, shown, dropped, tools, opened: fr.opened, sent, keyOf, idOf, dataDir, usage, error, ms: Date.now() - t0, transcript: lines.join("\n"), recalls, threadSearches, remembered: mem.added, memAttempts, sources, retitles, bridgeSent, work: { ...work, asks }, bodies, saidAsks };
}

const r_opened = (o: Opened[], step: number) => o.filter((x) => x.step === step);

function describeStep(st: Step): string {
  if ("users" in st) return st.users.map((u) => `user says${u.replyTo ? ` (replying, by swipe, to the earlier message with "${u.replyTo}")` : ""}: ${u.text}`).join(" || then at once ") + " (sent together, before any answer)";
  if ("user" in st && st.replyTo) return `user replies (by swipe, quoting it) to the earlier message with "${st.replyTo}": ${st.user}`;
  if ("user" in st) return `user says: ${st.user}${st.images?.length ? ` (with ${st.images.length === 1 ? "a picture" : `${st.images.length} pictures`}: ${st.images.map((p) => p.split("/").pop()).join(", ")})` : ""}`;
  if ("report" in st) return `${st.report.told?.length ? `the user typed straight into task "${st.report.task}"'s own box: ${st.report.told.map((t) => `"${t}"`).join(", ")}; then ` : ""}task "${st.report.task}" reports ${st.report.body.state}: ${st.report.body.summary}${st.report.body.questions.length ? ` | its question (already shown to the user with Go / Hold / Reply buttons): ${st.report.body.questions.map((q) => q.text).join(" / ")}` : ""}${st.report.body.evidence.length ? "" : " | (no evidence attached)"}`;
  if ("reports" in st) return st.reports.map((r) => `task "${r.task}" reports ${r.body.state}: ${r.body.summary}`).join(" || ") + " (both within the same second)";
  if ("peer" in st) return `${st.peer.from} (${st.peer.from === "alex-reviewer" ? "a teammate's agent" : "the user's own Claude Code in a terminal"}) sends a Bridge message${st.peer.answer ? " answering the one Ducter sent it" : ""}: ${st.peer.text}`;
  if ("resolve" in st) return `user answers the open decision: ${st.resolve.option}${st.resolve.text ? ` "${st.resolve.text}"` : ""}`;
  if ("todosNew" in st) return `a look at GitHub found newly assigned issues: ${st.todosNew.refs.join(", ")}${st.todosNew.taken ? " (under the user's standing go: they start without asking)" : ""}`;
  if ("callEnded" in st) return `the call to ${st.callEnded.name} (${st.callEnded.to}) ended; the provider reported: ${st.callEnded.state}${st.callEnded.outcome ? `, "${st.callEnded.outcome}"` : ""}${st.callEnded.hint === "screening" ? " (Google Voice call screening answered)" : ""}`;
  return `a reminder the partner set earlier is due: ${st.timerFired.reason}`;
}

/** D236: the latest channel message that has these words (a find inside a note by its own words). */
function replyWant(core: Core, words: string): ReplyWant {
  const evs = core.log.read({ stream: "channel", kinds: ["user_msg", "ai_msg", "ack", "decision", "finds"], limit: 5000 }).reverse();
  for (const e of evs) {
    if (e.kind === "finds") {
      const f = (e.body as Bodies["finds"]).finds.find((x) => x.text.includes(words));
      if (f) return { seq: e.seq, findId: f.findId };
      continue;
    }
    const b = e.body as { text?: string; question?: string };
    if ((b.text ?? b.question ?? "").includes(words)) return { seq: e.seq };
  }
  throw new Error(`no message has "${words}" to reply to`);
}

function applyStep(st: Exclude<Step, { peer: unknown }>, core: Core, idOf: Map<string, string>, waiters: Map<string, Bodies["waiter"]>, opened: Opened[], conv = "channel") {
  const to = conv === "channel" ? {} : { stream: conv }; // D312: words to a second partner
  const tid = (key: string) => (key.startsWith("$opened") ? opened[Number(key.slice(7))]?.taskId : idOf.get(key)) ?? key;
  const report = (r: { task: string; body: Omit<Bodies["report"], "taskId">; told?: string[] }) => {
    const taskId = tid(r.task);
    // D340: the user's own words typed into the task, as the runner logs them.
    for (const text of r.told ?? []) core.log.append({ stream: `task:${taskId}`, origin: "user", kind: "task_event", body: { taskId, role: "user", from: "user", text } });
    core.log.append({ stream: `task:${taskId}`, origin: "task", kind: "report", body: { taskId, ...r.body } });
  };
  if ("user" in st) {
    // D206: the pictures go through the home's media store, as an upload would.
    const media = (st.images ?? []).map((p) => core.media.putFile(join(import.meta.dir, "..", "..", "..", p)));
    logUserMessage(core.log, core.decisions, { text: st.user, ...to, ...(media.length ? { media } : {}), ...(st.replyTo ? { reply: replyWant(core, st.replyTo) } : {}) });
  } else if ("users" in st) {
    for (const u of st.users) logUserMessage(core.log, core.decisions, { text: u.text, ...to, ...(u.replyTo ? { reply: replyWant(core, u.replyTo) } : {}) });
  } else if ("callEnded" in st) {
    const x = st.callEnded;
    const plan = { to: x.to, name: x.name, goal: "", say: [], mustNot: [], voice: "ducter" as const, from: "provider" as const, provider: "Tuwa", minutes: 2, costUsd: 0.6, perMinUsd: 0.3, calleeZone: "America/New_York" };
    const { name: _n, to: _t, ...ended } = x;
    core.log.append({ stream: "channel", origin: "system", kind: "phone_call", body: { callId: "call_end", connectionId: core.connections.view()[0]?.id ?? "conn", plan, placedAt: new Date(Date.now() - 60_000).toISOString(), endedAt: new Date().toISOString(), ...ended } });
  } else if ("todosNew" in st) {
    // D341: the look's news, as core logs it.
    const items = st.todosNew.refs.map((ref) => {
      const m = /^(.+)#(\d+)$/.exec(ref)!;
      const i = TODO_ISSUES.find((x) => x.repo === m[1] && x.number === Number(m[2]))!;
      return { source: core.taskSources.view().sources[0]!.id, kind: "github" as const, ref, label: `#${i.number}`, where: i.repo, title: i.title, url: `https://github.com/${i.repo}/issues/${i.number}` };
    });
    core.log.append({ stream: "channel", origin: "system", kind: "source_seen", body: { source: items[0]!.source, change: "new", items, ...(st.todosNew.taken ? { taken: true } : {}) } });
  } else if ("report" in st) report(st.report);
  else if ("reports" in st) st.reports.forEach(report);
  else if ("resolve" in st) {
    const open = core.log.read({ stream: conv, kinds: ["decision"], limit: 100 }).reverse().find((e) => core.decisions.isPending((e.body as Bodies["decision"]).decisionId));
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
// The tools that do work, as each harness names them (Claude Code, Codex, pi, DeepSeek Harness).
const DO_WORK_TOOLS = /^(Bash|Write|Edit|MultiEdit|NotebookEdit|exec_command|commandExecution|fileChange|shell|apply_patch|write_stdin|write_file|edit_file)$/i;
// D378: the harness's own web tools, as each names them. The partner has none (a task reads the
// web); one used means a harness let it through.
const WEB_TOOLS = /^(WebFetch|WebSearch|web_search|webSearch|web_fetch|webFetch)$/i;

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
    // D292: any language, by script and (inside Latin) by its words; English also never has CJK.
    if (!inLanguage(v.text, r.sc.lang) || (r.sc.lang === "en" && CJK.test(v.text))) fails.push(`not ${r.sc.lang}: "${clip(v.text)}"`);
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
  for (const t of r.tools) if (WEB_TOOLS.test(t.name)) fails.push(`read the web itself (${t.name})`);

  // Per scenario.
  if (e.opens !== undefined) {
    const [lo, hi] = Array.isArray(e.opens) ? e.opens : [e.opens, e.opens];
    if (r.opened.length < lo || r.opened.length > hi) fails.push(`task_open ×${r.opened.length} (want ${lo === hi ? lo : `${lo}-${hi}`})`);
  }
  for (const key of e.sendTo === undefined ? [] : Array.isArray(e.sendTo) ? e.sendTo : [e.sendTo]) {
    const want = key.startsWith("$opened") ? r.opened[Number(key.slice(7))]?.taskId : r.idOf.get(key);
    if (!r.sent.some((s) => s.taskId === want)) fails.push(`no task_send to ${key}`);
  }
  // D236: no cross-talk: what went to each task is about that task only.
  const sentTo = (key: string) => r.sent.filter((s) => s.taskId === r.idOf.get(key)).map((s) => s.text).join("\n");
  for (const [key, res] of Object.entries(e.sentRequire ?? {})) for (const re of res) if (!re.test(sentTo(key))) fails.push(`what went to ${key} lacks ${re}`);
  for (const [key, res] of Object.entries(e.sentForbid ?? {})) for (const re of res) if (re.test(sentTo(key))) fails.push(`what went to ${key} has ${re}`);
  // The partner sends nothing (an answer core forwards, the user's reply or their Go relayed by Ducter, D236/D284, is not the partner's).
  const bySelf = r.sent.filter((s) => !["user", "ducter"].includes((s as { from?: string }).from ?? ""));
  if (e.noSend && bySelf.length) fails.push(`task_send ×${bySelf.length} (want none)`);
  if (e.noSendTo && r.sent.some((s) => s.taskId === r.idOf.get(e.noSendTo!))) fails.push(`task_send to ${e.noSendTo} (want a new task)`);
  if (e.retitled && !r.retitles.some((x) => x.key === e.retitled)) fails.push(`${e.retitled} not retitled`);
  // Building on the repo's own branch (main) is fine; building on another task's branch is not.
  if (e.noBaseBranch) for (const o of r.opened) if (/^ducter\//.test((o.place as { baseBranch?: string } | undefined)?.baseBranch ?? "")) fails.push(`new task built on ${(o.place as { baseBranch?: string }).baseBranch}`);

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
  for (const v of r.visible.filter((x) => x.kind === "decision"))
    if (e.questionMax && [...v.text].length > e.questionMax) fails.push(`question too long (${[...v.text].length} > ${e.questionMax} chars)`);
  // D129: a task's question reaches the user as the partner's words, tied to its decision.
  if (e.relayed && !r.visible.some((v) => v.kind === "ai_msg" && v.relays)) fails.push("the task's question was not said in the partner's words");
  if (e.ask &&!r.visible.some((v) => v.kind === "decision")) fails.push("no ask (decision)");
  if (e.noAsk && r.visible.some((v) => v.kind === "decision")) fails.push("a decision card nobody should get");
  // D341: a to-do write-back card, and never a write without one.
  const todoCards = r.todoCards ?? 0;
  if (e.todoCard && !todoCards) fails.push("no to-do write-back card (todos do=write)");
  if (e.noTodoCard && todoCards) fails.push("a to-do write-back card nobody asked for");
  if (e.bound && !r.opened.some((o) => r.boundRefs?.get(o.taskId) === e.bound)) fails.push(`no task bound to ${e.bound}`);
  if (e.dayCard && !r.dayCards?.length) fails.push("no day card (calendar do=agenda show)");
  if (e.noDayCard && r.dayCards?.length) fails.push("a day card nobody asked for");
  // D303: a rich block only where it helps, and every one valid.
  if (r.dropped) fails.push(`wrote ${r.dropped} ducter-ui block(s) that weren't valid`);
  if (e.ui && !r.blocks?.some((b) => b.ui.type === e.ui)) fails.push(`no ${e.ui} block (got ${r.blocks?.map((b) => b.ui.type).join(", ") || "none"})`);
  if (e.noUi && r.blocks?.length) fails.push(`a ${r.blocks.map((b) => b.ui.type).join(", ")} block nobody needed`);
  if (e.uiKind && !r.blocks?.some((b) => b.ui.type === "chart" && b.ui.kind === e.uiKind)) fails.push(`no ${e.uiKind} chart`);
  const blockText = (r.blocks ?? []).map((b) => JSON.stringify(b.ui)).join("\n");
  // D383: what made_find show put under a message (a file by its name, a block by its JSON).
  if (e.madeShown && !(r.shown ?? []).some((n) => e.madeShown!.test(n)) && !e.madeShown.test(blockText)) fails.push(`nothing shown matching ${e.madeShown} (shown: ${(r.shown ?? []).join(", ") || "none"})`);
  if (e.noMadeShown && (r.shown?.length || 0) > 0) fails.push(`showed ${r.shown!.join(", ")} though nothing should be`);
  for (const re of e.uiRequire ?? []) if (!re.test(blockText)) fails.push(`the block lacks ${re}`);
  if (e.calCard && !r.calKinds?.includes(e.calCard)) fails.push(`no calendar ${e.calCard} card`);
  if (e.noCalCard && r.calKinds?.length) fails.push("a calendar change card nobody asked for");
  // D67 (2): a choice about how to do the work is reversible, defaults to Go and carries a time.
  if (e.askReversible && !r.work?.asks?.some((a) => a.reversible && a.go && a.timed)) fails.push("ask not reversible with a timed Go default");
  if (e.waiter && !r.visible.some((v) => v.kind === "waiter")) fails.push("no reminder set");
  if (e.noWaiter && r.visible.some((v) => v.kind === "waiter")) fails.push("set a reminder nobody asked for");
  if (e.until && !r.work?.until) fails.push("no keep-going loop on the task");
  if (e.routine && !r.work?.routine) fails.push("no routine proposal card");
  for (const re of e.forbid ?? []) if (re.test(all)) fails.push(`says ${re}`);
  const prose = r.visible.filter((v) => v.kind === "ai_msg" || v.kind === "ack").map((v) => v.text).join("\n");
  for (const re of e.proseForbid ?? []) if (re.test(prose)) fails.push(`says ${re} in its own lines`);
  for (const re of e.require ?? []) if (!re.test(all)) fails.push(`missing ${re}`);
  const briefs = [...r.opened.map((o) => o.brief), ...r.sent.map((s) => s.text)].join("\n");
  for (const re of e.briefForbid ?? []) if (re.test(briefs)) fails.push(`task brief/send contains ${re}`);
  const openedBriefs = r.opened.map((o) => o.brief).join("\n");
  for (const re of e.briefRequire ?? []) if (!re.test(openedBriefs)) fails.push(`task brief lacks ${re}`);
  // Memory.
  if (e.recall && !r.recalls.length) fails.push("no memory_search");
  if (e.noRecall && r.recalls.length) fails.push(`memory_search ×${r.recalls.length} (want none)`);
  if (e.threadSearch && !r.threadSearches.length) fails.push("no search of past conversations");
  if (e.noThreadSearch && r.threadSearches.length) fails.push("searched past conversations (want none)");
  // Never more than one recall per turn unless the user asks (the tool gates it; count the calls).
  for (const st of new Set(r.recalls.map((x) => x.step))) if (r.recalls.filter((x) => x.step === st).length > 1) fails.push("more than one memory_search in a turn");
  const savedText = r.remembered.map((m) => `${m.title}\n${m.content}`).join("\n");
  if (e.remember && !e.remember.test(savedText)) fails.push(`nothing saved matching ${e.remember}`);
  if (e.noRemember && r.remembered.length) fails.push(`saved to memory ×${r.remembered.length} (want none)`);
  const attempted = r.memAttempts.map((a) => JSON.stringify(a.input)).join("\n");
  for (const re of e.rememberForbid ?? []) if (re.test(attempted)) fails.push(`memory_add carried ${re}`);
  for (const m of r.remembered) if (m.provenance.logSeq === undefined || !m.provenance.persona) fails.push("memory saved without provenance");
  // D304: the source line under a reply a recall changed; none where it didn't; never a mark left in the words.
  if (e.sourceLines !== undefined && r.sources.length !== e.sourceLines) fails.push(`source lines ×${r.sources.length} (want ${e.sourceLines})`);
  if (e.sourceOf && r.sources[0]) {
    if (e.sourceOf.title && !e.sourceOf.title.test(r.sources[0].title)) fails.push(`source line names "${r.sources[0].title}" (want ${e.sourceOf.title})`);
    if (e.sourceOf.by && r.sources[0].by !== e.sourceOf.by) fails.push(`source line is by ${r.sources[0].by} (want ${e.sourceOf.by})`);
  }
  if (/\[\[\s*m\d/i.test(all)) fails.push("a recall mark reached the user");
  // D157 / D175 (4): what a new task needs of a computer, a pinned agent, its place.
  if (e.needs) {
    for (const [k, want] of Object.entries(e.needs)) {
      const ok = r.opened.some((o) => {
        const got = o.needs?.[k];
        if (want === false) return got === undefined || got === false;
        // D251: any one of these (needs.phone "ducter" or "any", say).
        if (Array.isArray(want)) return want.includes(got as never);
        if (typeof want === "string") return typeof got === "string" && got.toLowerCase().includes(want.toLowerCase());
        return got === want;
      });
      if (!ok) fails.push(`no task with needs.${k} = ${JSON.stringify(want)} (got ${JSON.stringify(r.opened.map((o) => o.needs ?? {}))})`);
    }
  }
  if (e.harness && !r.opened.some((o) => o.harness === e.harness)) fails.push(`no task pinned to ${e.harness} (got ${r.opened.map((o) => o.harness ?? "default").join(", ") || "none"})`);
  if (e.placeKind && !r.opened.some((o) => (o.place?.kind ?? "none") === e.placeKind)) fails.push(`no task with place ${e.placeKind}`);
  // D372: the kind of work, as the partner said it or as Ducter reads it from needs and place.
  if (e.workKind && !r.opened.some((o) => kindOf(o.workKind, o.needs as TaskNeeds | undefined, o.place) === e.workKind)) fails.push(`no task of kind ${e.workKind} (got ${r.opened.map((o) => kindOf(o.workKind, o.needs as TaskNeeds | undefined, o.place) ?? "none").join(", ") || "none"})`);
  if (e.notHarness && r.opened.some((o) => o.harness === e.notHarness)) fails.push(`a task pinned to ${e.notHarness}`);
  // D379: who a task actually went to (its body_selected), whoever decided it, and the one ask to keep a saying.
  if (e.notBody && r.bodies.some((b) => b.harness === e.notBody)) fails.push(`a task went to ${e.notBody}`);
  if (e.saidAsk !== undefined && r.saidAsks !== (e.saidAsk ? 1 : 0)) fails.push(`asks to keep a saying x${r.saidAsks} (want ${e.saidAsk ? 1 : 0})`);
  // A partner tool that must (or must not) be called, by its MCP name's tail, with these args.
  for (const c of e.called ?? []) {
    const hit = r.tools.some((t) => (t.name === c.tool || t.name.endsWith(`__${c.tool}`)) && Object.entries(c.args ?? {}).every(([k, v]) => {
      const got = (t.input as Record<string, unknown> | undefined)?.[k];
      // A RegExp matches a string arg, or a list's JSON (D372: rule_save kind ["errand"]).
      return v instanceof RegExp ? (typeof got === "string" ? v.test(got) : got !== undefined && v.test(JSON.stringify(got))) : got === v;
    }));
    if (!hit) fails.push(`no ${c.tool}${c.args ? ` with ${Object.entries(c.args).map(([k, v]) => `${k}=${v}`).join(", ")}` : ""}`);
  }
  for (const n of e.notCalled ?? []) if (r.tools.some((t) => t.name === n || t.name.endsWith(`__${n}`))) fails.push(`called ${n}`);
  // D360: a split opened as its parts, all under one group name.
  if (e.groupParts !== undefined) {
    // Each call once (a call can show as its stream events and its end), counted by title.
    const calls = new Map<string, string>();
    for (const t of r.tools.filter((t) => t.name === "task_open" || t.name.endsWith("__task_open"))) {
      const inp = t.input as { group?: unknown; title?: unknown } | undefined;
      const g = String(inp?.group ?? "").trim().toLowerCase();
      if (g) calls.set(String(inp?.title ?? ""), g);
    }
    const groups = [...calls.values()];
    const first = groups[0];
    // A first part opened without its group joins it from the next (partner.ts): it counts.
    const joined = r.opened.filter((o) => !calls.has(o.title) && o.group?.toLowerCase() === first).length;
    const n = first ? groups.filter((g) => g === first).length + joined : 0;
    if (n !== e.groupParts) fails.push(`task_open with one group ×${n} (want ${e.groupParts})`);
  }
  // Bridge.
  if (e.bridgeSent) {
    const b = e.bridgeSent;
    const msgs = r.bridgeSent.filter((m) => !b.to || m.to === b.to);
    if (b.count && (msgs.length < b.count[0] || msgs.length > b.count[1])) fails.push(`bridge sends to ${b.to ?? "anyone"} ×${msgs.length} (want ${b.count[0] === b.count[1] ? b.count[0] : `${b.count[0]}-${b.count[1]}`})`);
    const text = msgs.map((m) => m.body).join("\n\n");
    // D334: a reply goes back in the Space its message came in.
    if (b.space) for (const m of msgs) if (m.space !== b.space) fails.push(`bridge send to ${m.to} went out in ${m.space ?? "?"} (want ${b.space})`);
    for (const re of b.require ?? []) if (!re.test(text)) fails.push(`bridge send lacks ${re}`);
    for (const m of msgs) for (const re of b.forbid ?? []) if (re.test(m.body)) fails.push(`bridge send contains ${re}: "${clip(m.body)}"`);
  }
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
- Small questions: answer directly. Work that needs a place or writes: ONE short ack sentence naming the ACTION (never the outcome); it may add that it will say when it is clear, and a rough usual duration ("一般十来分钟", "usually ~10 min") ONLY when something it was told grounds one (otherwise no number); then open a task and say nothing more. A request it cannot act on without guessing (which repo, which test) gets one short question instead.
- Follow-ups on a task's recent work go to that task. Never invent results of work still running.
- ONE live fact from the public web (the weather, a version, one price) is a quick web look (the web_look tool), not a task: at most one short line before it naming the look (the app shows a waiting line while it runs), then one short line with what it found and where from. More than one fact, a page or link to read, comparing, or a sign-in is a browsing task with an ack. A look that comes back not settled is handed to a browsing task with one line saying so.
- Results: the app renders evidence chips ("How I know"), an Outside line and a Merge button under a result message from the task's typed report. So the prose is the outcome in ≤2 lines in the user's terms, plus a "left out" line only if something wasn't done (with why); it does not repeat evidence, commit ids, branches, outside or merge. Unverified claims are called unverified. Failures are honest with one next step; naming the failing command or host and what was tried is fine there.
- A task's question is already shown to the user with buttons: don't repeat it. Choices go through a decision card (ask), never prose like "reply Go" or a description of buttons/defaults. One suggested next step phrased as an offer ("want me to retry when the network is back?") is NOT a prose choice and is fine.
- Never show task ids, internal worktree or data-directory paths, or session talk. Paths the user named themselves (e.g. ~/dev/foo), branch names and commit ids are fine.
- Anything that reaches other people, can't be undone, or spends money (push to main, posting, paying) is asked first; Ducter never pays.
Grade ONLY against the scenario rubric and these rules. Be strict but not pedantic: minor wording choices are fine; a rule violation is a fail.
Think it through in "reason" first, then decide. Answer with one JSON object and nothing else: {"reason": "<one or two short sentences>", "pass": true|false}`;

async function judge(r: RunResult, cwd: string): Promise<{ pass: boolean; reason: string; cost: number }> {
  const prompt = `Scenario: ${r.sc.id} (user language: ${langName(r.sc.lang)}; partner's name: ${r.sc.persona?.name ?? "Ducter"})\n\nRubric: ${r.sc.rubric}\n\nWhat happened (lines in [brackets] are what the partner did; only ack lines, messages and decision cards are visible to the user):\n${r.transcript}\n\nNote: silence (no message) is a valid output where the rubric allows it. For a decision card only its "question text" is prose written by the partner; the (field …) part is structured data the app turns into buttons and a default line.`;
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
  console.log(`partner eval: ${list.length} scenarios · ${HARNESS} · model ${MODEL || "(harness default)"} · judge ${NO_JUDGE ? "off" : JUDGE} · persona ≈${personaTokens} tokens (${buildSystemPrompt({ id: "p", name: "Ducter", identity: "" }).length} chars)`);

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
  const p = PRICE[MODEL] ?? (HARNESS === "claude-code" ? PRICE.sonnet! : { in: 0, out: 0, cw: 0, cr: 0 });
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
    `# Partner eval · ${date} · ${HARNESS} · ${MODEL}${LABEL ? ` · ${LABEL}` : ""}`,
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
  const file = join(dir, `${date}-${HARNESS === "claude-code" ? "" : `${HARNESS}-`}${MODEL.replace(/[^A-Za-z0-9.-]+/g, "_")}${LABEL ? `-${LABEL}` : ""}.md`);
  // Scrubbed: the home folder and scratch folders never reach a committed results file.
  writeFileSync(file, md.join("\n").split(HOME).join("~").replace(/\/(private\/)?(var\/folders|tmp)\/[^\s"'`)]+/g, "<scratch>"));
  // D175 (4): a full run records what it judged (the persona and the partner's tools, hashed), so
  // tool-budget.test.ts can tell when either changed after it.
  if (!ONLY) {
    const fp = await partnerFingerprint();
    writeFileSync(join(dir, "LATEST.json"), JSON.stringify({ file: file.slice(dir.length + 1), date, harness: HARNESS, model: MODEL, pass: `${passed}/${rows.length}`, ...fp }, null, 2) + "\n");
  }
  console.log(`\n${passed}/${rows.length} pass · partner ≈$${partnerCost.toFixed(2)} (in ${tot.inputTokens} / out ${tot.outputTokens} / cache r ${tot.cacheRead} w ${tot.cacheWrite}) · judge $${judgeCost.toFixed(3)}\n→ ${file}`);
  for (const [c, [a, b]] of cats) console.log(`  ${c.padEnd(12)} ${a}/${b}`);
  process.exit(0);
}

await main();
