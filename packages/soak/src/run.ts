#!/usr/bin/env bun
// Soak: the real main process (`ducter up --headless`, scripted model) driven over the real
// WebSocket for many minutes, with SIGKILL chaos and a worker that comes and goes. Invariants
// are checked live (per-socket seq continuity) and at rest (invariants.ts over the whole Log).
//
//   bun packages/soak/src/run.ts --minutes 50 --root <scratch dir> [--seed 7] [--no-worker]
//
// Writes <root>/metrics.csv, <root>/findings.json, <root>/summary.json, <root>/main.log.
import { Database } from "bun:sqlite";
import { appendFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { LogEvent, OnHand, ServerFrame, TaskCard } from "@ducter/protocol";
import { checkAll, type DriverRecord, type Finding } from "./invariants.ts";

// ---------- config ----------
const argv = process.argv.slice(2);
const arg = (k: string, d?: string) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? argv[i + 1] : d;
};
const MINUTES = Number(arg("minutes", "50"));
const ROOT = resolve(arg("root", join(process.env.TMPDIR ?? "/tmp", `ducter-soak-${Date.now()}`))!);
const PORT = Number(arg("port", "7802"));
const WORKER = !argv.includes("--no-worker");
const CHAOS = !argv.includes("--no-chaos");
let seed = Number(arg("seed", String(Date.now() % 100000)));
const REPO_ROOT = resolve(import.meta.dir, "../../..");
const MAIN = join(REPO_ROOT, "packages/cli/src/main.ts");
const DATA = join(ROOT, "data");
const WDATA = join(ROOT, "worker-data");
const HOME = join(ROOT, "home");
const REPOS = [0, 1, 2].map((i) => join(ROOT, `repo${i}`));
const BASE = `http://127.0.0.1:${PORT}`;
const T0 = Date.now();
const END = T0 + MINUTES * 60_000;
const CALM_AT = END - Math.min(8, MINUTES / 4) * 60_000; // no chaos, no new work after this
const el = () => ((Date.now() - T0) / 1000).toFixed(1);

const rnd = () => {
  seed = (seed * 1103515245 + 12345) % 2 ** 31;
  return seed / 2 ** 31;
};
const pick = <T>(xs: T[]): T | undefined => (xs.length ? xs[Math.floor(rnd() * xs.length)] : undefined);
const between = (a: number, b: number) => a + rnd() * (b - a);

const findings: (Finding & { at: string })[] = [];
const find = (check: string, detail: string) => {
  findings.push({ check, detail, at: el() });
  log(`FINDING ${check}: ${detail}`);
};
const log = (s: string) => {
  const line = `[${el()}s] ${s}`;
  console.log(line);
  appendFileSync(join(ROOT, "soak.log"), line + "\n");
};

// ---------- environment ----------
if (existsSync(ROOT)) rmSync(ROOT, { recursive: true, force: true });
mkdirSync(join(ROOT, "bin"), { recursive: true });
mkdirSync(HOME, { recursive: true });
// No real Nowledge Mem: the identity load fails fast and the default identity is used.
writeFileSync(join(ROOT, "bin/nmem"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
const ENV: Record<string, string> = {
  ...(process.env as Record<string, string>),
  HOME,
  PATH: `${join(ROOT, "bin")}:${process.env.PATH}`,
  DUCTER_SCRIPTED_MODEL: "1",
  DUCTER_MEMORY: "off",
  DUCTER_PUSH: "off",
  DUCTER_DECISION_DEFAULT_MS: "25000",
  DUCTER_OFFLINE_GRACE_MS: "20000",
  DUCTER_PARK_IDLE_MS: "90000",
  DUCTER_LOCALE: "en",
  NO_COLOR: "1",
};
delete ENV.DUCTER_PORT;
delete ENV.DUCTER_DATA_DIR;

async function sh(cmd: string[], cwd?: string) {
  const p = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe", stdin: "ignore", env: ENV });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  return { ok: code === 0, out: out.trim(), err: err.trim() };
}
const git = (cwd: string, ...a: string[]) => sh(["git", "-c", "user.name=soak", "-c", "user.email=soak@example.invalid", "-C", cwd, ...a]);
for (const r of REPOS) {
  await sh(["git", "init", "-q", "-b", "main", r]);
  writeFileSync(join(r, "README.md"), "soak\n");
  await git(r, "add", ".");
  await git(r, "commit", "-q", "-m", "init");
}

// ---------- processes ----------
interface Proc {
  p: ReturnType<typeof Bun.spawn>;
  pid: number;
  startedAt: number;
}
let main: Proc | undefined;
let worker: Proc | undefined;
let restarts = 0;
let workerRestarts = 0;
let mainDown = false;

function pipeTo(p: ReturnType<typeof Bun.spawn>, file: string) {
  for (const s of [p.stdout, p.stderr] as ReadableStream<Uint8Array>[])
    void (async () => {
      try {
        for await (const c of s) appendFileSync(file, c);
      } catch {}
    })();
}

async function startMain(): Promise<void> {
  appendFileSync(join(ROOT, "main.log"), `\n===== start at ${el()}s =====\n`);
  const p = Bun.spawn(["bun", MAIN, "up", "--headless", "--no-desktop", "--port", String(PORT), "--data-dir", DATA], { env: ENV, stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  pipeTo(p, join(ROOT, "main.log"));
  main = { p, pid: p.pid, startedAt: Date.now() };
  const until = Date.now() + 60_000;
  for (;;) {
    if (p.exitCode !== null) throw new Error(`main exited with ${p.exitCode} at start`);
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) break;
    } catch {}
    if (Date.now() > until) throw new Error("main did not come up in 60 s");
    await Bun.sleep(100);
  }
  mainDown = false;
}

async function killMain(why: string) {
  if (!main) return;
  const m = main;
  mainDown = true;
  log(`SIGKILL main (${why}) pid ${m.pid}`);
  m.p.kill("SIGKILL");
  await m.p.exited;
  main = undefined;
}

async function startWorker(first: boolean) {
  const args = ["bun", MAIN, "worker", "--data-dir", WDATA];
  if (first) {
    const pair = await sh(["bun", MAIN, "pair", "--worker", "--json", "--data-dir", DATA, "--port", String(PORT)]);
    const code = JSON.parse(pair.out.split("\n").find((l) => l.startsWith("{")) ?? "{}").code;
    if (!code) throw new Error(`no pairing code: ${pair.out} ${pair.err}`);
    args.push("--join", BASE, "--code", code, "--name", "soakw");
  }
  appendFileSync(join(ROOT, "worker.log"), `\n===== start at ${el()}s =====\n`);
  const p = Bun.spawn(args, { env: { ...ENV, HOME: join(ROOT, "worker-home") }, stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  pipeTo(p, join(ROOT, "worker.log"));
  worker = { p, pid: p.pid, startedAt: Date.now() };
}
async function killWorker(why: string) {
  if (!worker) return;
  log(`SIGKILL worker (${why}) pid ${worker.pid}`);
  worker.p.kill("SIGKILL");
  await worker.p.exited;
  worker = undefined;
}

// ---------- clients ----------
let connSeq = 0;
class Client {
  ws?: WebSocket;
  conn = 0;
  cursor?: number; // highest channel seq seen
  next?: number; // the next live seq this connection must see
  replayed = false;
  seen = new Map<number, LogEvent>();
  onHand?: OnHand;
  onHandAt = 0;
  open = false;
  closedByUs = false;
  waiting = new Map<string, number>(); // `${taskId}/${action}` -> count awaiting action_result
  sentAcks = 0;
  results: ServerFrame[] = [];
  errors: string[] = [];
  onEvent?: (e: LogEvent, live: boolean) => void;
  onReplayed?: () => void;
  constructor(public name: string, public useCursor: boolean) {}

  connect() {
    if (mainDown) return;
    this.closedByUs = false;
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    this.ws = ws;
    this.conn = ++connSeq;
    this.next = undefined;
    this.replayed = false;
    ws.onopen = () => {
      this.open = true;
      ws.send(JSON.stringify(this.useCursor && this.cursor != null ? { t: "hello", cursor: this.cursor } : { t: "hello" }));
    };
    ws.onmessage = (m) => this.frame(JSON.parse(String(m.data)) as ServerFrame);
    ws.onclose = () => {
      this.open = false;
      for (const [k, n] of this.waiting) if (n > 0) this.lostResults += n;
      this.waiting.clear();
      if (!this.closedByUs) setTimeout(() => this.reconnect(), 300);
    };
    ws.onerror = () => {};
  }
  lostResults = 0;
  reconnect() {
    if (this.open || this.closedByUs) return;
    if (mainDown) return void setTimeout(() => this.reconnect(), 300);
    this.connect();
  }
  close() {
    this.closedByUs = true;
    this.ws?.close();
  }
  send(f: object) {
    if (!this.open || !this.replayed) return false;
    this.ws!.send(JSON.stringify(f));
    return true;
  }
  action(taskId: string, action: string) {
    if (!this.send({ t: "task_action", taskId, action })) return false;
    const k = `${taskId}/${action}`;
    this.waiting.set(k, (this.waiting.get(k) ?? 0) + 1);
    return true;
  }
  frame(f: ServerFrame) {
    switch (f.t) {
      case "welcome":
        this.next = f.headSeq + 1;
        this.welcomeHead = f.headSeq;
        if (this.maxSeen > f.headSeq) find("ws.head_regressed", `${this.name}: welcome headSeq ${f.headSeq} < seq ${this.maxSeen} seen before`);
        return;
      case "events": {
        if (!this.replayed) {
          // The replay: channel only, after the cursor, at most the head the welcome named.
          for (const e of f.events) {
            if (e.stream !== "channel") find("ws.replay_stream", `${this.name}: replay carried ${e.stream}#${e.seq}`);
            if (e.seq > this.welcomeHead) find("ws.replay_ahead", `${this.name}: replay #${e.seq} > head ${this.welcomeHead}`);
            this.take(e, false);
          }
          this.replayed = true;
          this.onReplayed?.();
          return;
        }
        for (const e of f.events) {
          if (e.seq !== this.next) find("ws.live_gap", `${this.name} conn ${this.conn}: expected #${this.next}, got #${e.seq} (${e.kind})`);
          this.next = e.seq + 1;
          this.take(e, true);
        }
        return;
      }
      case "on_hand":
        this.onHand = f.onHand;
        this.onHandAt = this.next ?? 0;
        return;
      case "action_result": {
        const k = `${f.taskId}/${f.action}`;
        const n = this.waiting.get(k) ?? 0;
        if (n <= 0) find("ws.result_unasked", `${this.name}: action_result ${k} with nothing waiting (duplicate?)`);
        else this.waiting.set(k, n - 1);
        this.results.push(f);
        return;
      }
      case "sent":
        this.sentAcks++;
        return;
      case "error":
        this.errors.push(f.message);
        return;
    }
  }
  welcomeHead = 0;
  maxSeen = 0;
  take(e: LogEvent, live: boolean) {
    const prev = this.seen.get(e.seq);
    if (prev && (prev.kind !== e.kind || prev.stream !== e.stream)) find("ws.seq_reused", `${this.name}: #${e.seq} was ${prev.kind}@${prev.stream}, now ${e.kind}@${e.stream}`);
    this.seen.set(e.seq, e);
    this.maxSeen = Math.max(this.maxSeen, e.seq);
    if (e.stream === "channel") this.cursor = Math.max(this.cursor ?? 0, e.seq);
    this.onEvent?.(e, live);
  }
}

// ---------- driver state ----------
interface TaskInfo {
  tok: string;
  opts: string;
  repo?: string;
  dev?: string;
  taskId?: string;
}
const rec: DriverRecord = { sent: new Map(), echoed: new Set(), decided: new Map() };
const sentOn = new Map<string, number>(); // clientId -> connection it was sent on
const byTok = new Map<string, TaskInfo>();
const byTask = new Map<string, TaskInfo>();
const pendingDecide = new Map<string, { option: "go" | "hold" | "reply"; text?: string; conn: number }>();
const merges: { taskId: string; ref?: string; ok: boolean; message?: string }[] = [];
const counters: Record<string, number> = {};
const bump = (k: string) => void (counters[k] = (counters[k] ?? 0) + 1);
let tokN = 0;

const driver = new Client("driver", true);
const watchers = [new Client("watch-cursor", true), new Client("watch-fresh", false)];

driver.onEvent = (e) => {
  if (e.kind === "user_msg") {
    const c = (e.body as { clientId?: string }).clientId;
    if (c) rec.echoed.add(c);
  }
  if (e.kind === "task_open") {
    const b = e.body as { taskId: string; title: string };
    const tok = b.title.match(/^soak (\S+)$/)?.[1];
    const info = tok ? byTok.get(tok) : undefined;
    if (info) (info.taskId = b.taskId), byTask.set(b.taskId, info);
  }
  if (e.kind === "decision_resolved") {
    const b = e.body as { decisionId: string; option: "go" | "hold" | "reply"; by: string };
    pendingDecide.delete(b.decisionId);
    if (e.origin === "user" && b.by === "user") rec.decided.set(b.decisionId, { option: b.option });
  }
};
driver.onReplayed = () => {
  // A message or an answer that went out on a connection that died before its echo came back
  // is sent again, as a careful client would: same clientId, so a double would show.
  for (const [cid, text] of rec.sent) {
    if (rec.echoed.has(cid) || sentOn.get(cid) === driver.conn) continue;
    bump("resend.msg");
    sentOn.set(cid, driver.conn);
    driver.ws!.send(JSON.stringify({ t: "send", text, clientId: cid }));
  }
  for (const [id, d] of pendingDecide) {
    if (d.conn === driver.conn) continue;
    const card = driver.onHand?.tasks.find((c) => c.pendingDecisionId === id);
    if (!card) continue;
    bump("resend.decide");
    d.conn = driver.conn;
    driver.ws!.send(JSON.stringify({ t: "decide", decisionId: id, option: d.option, ...(d.text ? { text: d.text } : {}) }));
  }
};

function say(text: string) {
  const cid = `c${++tokN}`;
  rec.sent.set(cid, text);
  sentOn.set(cid, driver.conn);
  if (!driver.send({ t: "send", text, clientId: cid })) sentOn.set(cid, -1); // goes out on reconnect
  return cid;
}

const cards = (): TaskCard[] => driver.onHand?.tasks ?? [];
const active = () => cards().filter((c) => ["working", "queued", "needs_you", "blocked", "done_claimed"].includes(c.attention));

function openTask() {
  const tok = `t${++tokN}`;
  const opts: string[] = [];
  const r = rnd();
  const onWorker = WORKER && worker && rnd() < 0.12;
  const repo = !onWorker && r < 0.6 ? pick(REPOS) : undefined;
  if (repo && rnd() < 0.8) opts.push("commit");
  const kind = rnd();
  if (kind < 0.3) opts.push("ask");
  else if (kind < 0.38) opts.push("block");
  else if (kind < 0.43) opts.push("fail");
  else if (kind < 0.46) opts.push("nodone");
  opts.push(`slow=${Math.round(rnd() < 0.25 ? between(20, 60) : between(1, 8))}`);
  if (onWorker) opts.push("dev=soakw");
  const info: TaskInfo = { tok, opts: opts.join(" "), repo, dev: onWorker ? "soakw" : undefined };
  byTok.set(tok, info);
  say(`#soak task ${tok} ${info.opts}${repo ? ` ${repo}` : ""}`);
  bump("open");
}

function act() {
  const cs = cards();
  const working = cs.filter((c) => c.attention === "working");
  const pending = cs.filter((c) => c.pendingDecisionId && !pendingDecide.has(c.pendingDecisionId));
  const idle = cs.filter((c) => ["done", "done_claimed", "blocked", "failed"].includes(c.attention));
  const dropped = cs.filter((c) => c.attention === "dropped");
  const mergeable = cs.filter((c) => c.place.kind === "repo" && (c.attention === "done" || c.attention === "done_claimed") && byTask.get(c.taskId)?.opts.includes("commit"));
  const r = rnd() * 100;
  if (r < 22) {
    if (active().length < 14) openTask();
    else bump("open.skipped");
  } else if (r < 30) say(`#soak chat x${++tokN}`), bump("chat");
  else if (r < 34) say(`#soak wait w${++tokN} sec=${Math.round(between(5, 120))}`), bump("wait");
  else if (r < 37) say(`#soak ask a${++tokN} min=${between(0.2, 0.8).toFixed(2)}`), bump("ask");
  else if (r < 52) {
    // Answer about two in three questions; the rest wait for their default.
    const c = pick(pending);
    if (!c || rnd() < 0.3) return bump("decide.left_to_default");
    const option = pick(["go", "go", "hold", "reply"] as const)!;
    const text = option === "reply" ? `#soak reply ${++tokN}` : undefined;
    pendingDecide.set(c.pendingDecisionId!, { option, text, conn: driver.conn });
    driver.send({ t: "decide", decisionId: c.pendingDecisionId, option, ...(text ? { text } : {}) });
    bump(`decide.${option}`);
  } else if (r < 60) {
    const c = pick(rnd() < 0.6 && working.length ? working : idle);
    if (!c) return;
    driver.send({ t: "task_send", taskId: c.taskId, text: `#soak note s${++tokN}` });
    bump(c.attention === "working" ? "send.steer" : "send.idle");
  } else if (r < 63) {
    const c = pick(idle.filter((x) => x.attention !== "failed"));
    if (c) say(`#soak send m${++tokN} ${c.taskId}`), bump("send.partner");
  } else if (r < 68) {
    const c = pick(working);
    if (c && driver.action(c.taskId, "interrupt")) bump("interrupt");
  } else if (r < 72) {
    const c = pick(cs.filter((x) => x.attention !== "dropped"));
    if (c && driver.action(c.taskId, "drop")) bump("drop");
  } else if (r < 75) {
    const c = pick(dropped);
    if (c && driver.action(c.taskId, "undrop")) bump("undrop");
  } else if (r < 83) {
    const c = pick(mergeable);
    if (c && driver.action(c.taskId, "merge")) bump("merge");
  } else if (r < 85) {
    const c = pick(cs.filter((x) => x.attention === "done" || x.attention === "failed"));
    if (c && driver.action(c.taskId, "reopen")) bump("reopen");
  } else if (r < 92) {
    if (driver.cursor) driver.send({ t: "read", upToSeq: driver.cursor }), bump("read");
  } else if (r < 95) {
    const c = pick(cs);
    if (c) driver.send({ t: "task_history", taskId: c.taskId, limit: 50 }), bump("history");
  } else {
    // A watcher drops its socket and comes back with its cursor (or fresh).
    const w = pick(watchers)!;
    w.close();
    setTimeout(() => w.connect(), between(100, 3000));
    bump("reconnect");
  }
}

driver.results = [];
const watchResults = () => {
  for (const f of driver.results.splice(0)) {
    if (f.t !== "action_result") continue;
    if (f.action === "merge") merges.push({ taskId: f.taskId, ok: f.ok, ref: f.ref, message: f.message });
    bump(`result.${f.action}.${f.ok ? "ok" : "no"}`);
  }
};

// ---------- chaos ----------
async function chaos() {
  const kinds = ["mid-turn", "mid-decision", "mid-merge", "mid-partner-turn", "random"] as const;
  const kind = pick([...kinds])!;
  let why: string = kind;
  if (kind === "mid-turn") {
    const c = pick(cards().filter((x) => x.attention === "working"));
    why += c ? ` (${c.taskId} working)` : " (none working)";
  } else if (kind === "mid-decision") {
    const c = pick(cards().filter((x) => x.pendingDecisionId && !pendingDecide.has(x.pendingDecisionId)));
    if (c) {
      pendingDecide.set(c.pendingDecisionId!, { option: "go", conn: driver.conn });
      driver.send({ t: "decide", decisionId: c.pendingDecisionId, option: "go" });
      await Bun.sleep(between(0, 25));
      why += ` (${c.pendingDecisionId})`;
    }
  } else if (kind === "mid-merge") {
    const c = pick(cards().filter((x) => x.place.kind === "repo" && x.attention.startsWith("done") && byTask.get(x.taskId)?.opts.includes("commit")));
    if (c && driver.action(c.taskId, "merge")) {
      await Bun.sleep(between(0, 80));
      why += ` (${c.taskId})`;
    }
  } else if (kind === "mid-partner-turn") {
    openTask();
    await Bun.sleep(between(0, 400));
  }
  await killMain(why);
  await Bun.sleep(between(300, 3000));
  restarts++;
  await startMain();
  log(`main back (restart ${restarts}) pid ${main!.pid}`);
  bump(`chaos.${kind}`);
}

// ---------- metrics ----------
const CSV = join(ROOT, "metrics.csv");
writeFileSync(CSV, "t_s,pid,rss_kb,fds,children,descendants,head_seq,db_kb,tasks,working,needs_you,restarts,worker_restarts\n");
const metrics: { t: number; rss: number; fds: number; children: number; desc: number; head: number; db: number; tasks: number }[] = [];
async function sample() {
  if (!main || mainDown) return;
  const pid = main.pid;
  const ps = await sh(["ps", "-o", "rss=", "-p", String(pid)]);
  const rss = Number(ps.out) || 0;
  const lsof = await sh(["lsof", "-n", "-P", "-p", String(pid)]);
  const fds = Math.max(0, lsof.out.split("\n").length - 1);
  const all = await sh(["ps", "-axo", "pid=,ppid="]);
  const kids = new Map<number, number[]>();
  for (const l of all.out.split("\n")) {
    const [a, b] = l.trim().split(/\s+/).map(Number);
    if (a && b) kids.set(b, [...(kids.get(b) ?? []), a]);
  }
  const children = kids.get(pid)?.length ?? 0;
  let desc = 0;
  const walk = (p: number) => (kids.get(p) ?? []).forEach((c) => (desc++, walk(c)));
  walk(pid);
  let head = 0;
  try {
    head = ((await (await fetch(`${BASE}/health`)).json()) as { headSeq: number }).headSeq;
  } catch {}
  let db = 0;
  try {
    db = Math.round((Bun.file(join(DATA, "ducter.db")).size + Bun.file(join(DATA, "ducter.db-wal")).size) / 1024);
  } catch {}
  const cs = cards();
  const row = { t: Math.round((Date.now() - T0) / 1000), rss, fds, children, desc, head, db, tasks: cs.length };
  metrics.push(row);
  appendFileSync(CSV, [row.t, pid, rss, fds, children, desc, head, db, cs.length, cs.filter((c) => c.attention === "working").length, cs.filter((c) => c.attention === "needs_you").length, restarts, workerRestarts].join(",") + "\n");
}

// ---------- log checks ----------
function readLog(): LogEvent[] {
  const db = new Database(join(DATA, "ducter.db"), { readonly: true });
  try {
    return (db.query("SELECT * FROM events ORDER BY seq").all() as any[]).map((r) => ({
      seq: r.seq,
      ts: r.ts,
      persona: r.persona,
      stream: r.stream,
      origin: r.origin,
      kind: r.kind,
      body: JSON.parse(r.body),
      ...(r.supersedes != null ? { supersedes: r.supersedes } : {}),
    }));
  } finally {
    db.close();
  }
}
let lastHead = 0;
function quickCheck() {
  const evs = readLog();
  for (let i = 0; i < evs.length; i++) if (evs[i]!.seq !== i + 1) return find("seq.gap", `position ${i} holds #${evs[i]!.seq}`);
  const head = evs.at(-1)?.seq ?? 0;
  if (head < lastHead) find("seq.regressed", `head ${head} < ${lastHead}`);
  lastHead = head;
  // Everything a client was shown is in the Log, as shown.
  for (const c of [driver, ...watchers])
    for (const [s, e] of c.seen) {
      const d = evs[s - 1];
      if (!d) find("ws.shown_not_durable", `${c.name} saw #${s} ${e.kind} that the Log lacks (head ${head})`);
      else if (d.kind !== e.kind || d.stream !== e.stream || JSON.stringify(d.body) !== JSON.stringify(e.body)) find("ws.shown_differs", `${c.name} #${s}: saw ${e.kind}, Log has ${d.kind}`);
    }
  for (const c of [driver, ...watchers]) c.seen.clear(); // checked; keep memory flat
}

// ---------- run ----------
log(`soak: ${MINUTES} min, root ${ROOT}, seed ${seed}, worker ${WORKER}, chaos ${CHAOS}`);
await startMain();
for (const c of [driver, ...watchers]) c.connect();
if (WORKER) await startWorker(true);
while (!driver.replayed) await Bun.sleep(50);

let nextChaos = Date.now() + between(60_000, 150_000);
let nextWorkerChaos = Date.now() + between(120_000, 240_000);
let nextSample = 0;
let nextCheck = Date.now() + 60_000;
let workerDownUntil = 0;
while (Date.now() < CALM_AT) {
  watchResults();
  if (Date.now() >= nextSample) (nextSample = Date.now() + 15_000), await sample();
  if (Date.now() >= nextCheck && !mainDown) (nextCheck = Date.now() + 120_000), quickCheck();
  if (CHAOS && Date.now() >= nextChaos) {
    await chaos();
    nextChaos = Date.now() + between(40_000, 110_000);
  }
  if (WORKER && CHAOS && worker && Date.now() >= nextWorkerChaos) {
    await killWorker("chaos");
    // Short blips and long absences (past the 20 s grace): both are designed paths.
    workerDownUntil = Date.now() + (rnd() < 0.5 ? between(2000, 8000) : between(25_000, 60_000));
  }
  if (WORKER && !worker && workerDownUntil && Date.now() >= workerDownUntil) {
    await startWorker(false);
    workerRestarts++;
    workerDownUntil = 0;
    nextWorkerChaos = Date.now() + between(150_000, 300_000);
    log(`worker back (restart ${workerRestarts})`);
  }
  if (!mainDown && driver.replayed && driver.open) act();
  await Bun.sleep(between(600, 2200));
}

// ---------- calm: let everything come to rest ----------
log("calm: no new work, no chaos; answering nothing, letting defaults and timers run out");
if (WORKER && !worker) await startWorker(false);
const restBy = Date.now() + Math.max(END - Date.now(), 4 * 60_000);
const restingNow = () => {
  const cs = cards();
  const now = Date.now();
  const due = (iso?: string) => !!iso && Date.parse(iso) > now - 5000;
  return (
    cs.every((c) => !["working", "queued"].includes(c.attention) && c.residency !== "hot" && !due(c.pendingDecision?.defaultAt)) &&
    (driver.onHand?.waiters ?? []).every((w) => !due(w.at))
  );
};
let restSince = 0;
while (Date.now() < restBy) {
  watchResults();
  if (Date.now() >= nextSample) (nextSample = Date.now() + 15_000), await sample();
  // Hold leaves a task waiting for good; answer the open questions the soak itself holds.
  if (restingNow()) {
    if (!restSince) restSince = Date.now();
    if (Date.now() - restSince > 45_000) break;
  } else restSince = 0;
  await Bun.sleep(2000);
}
await sample();
quickCheck();

// Final check against a fresh connection's On hand and the whole Log at one head.
const finalClient = new Client("final", false);
finalClient.connect();
while (!finalClient.replayed) await Bun.sleep(50);
await Bun.sleep(500);
const evs = readLog();
const onHand = finalClient.onHand!;
finalClient.close();
const offline = new Set<string>();
for (const f of checkAll(evs, onHand.tasks, rec, Date.now(), { offlineDevices: offline })) find(f.check, f.detail);

// On hand agrees with the Log: rebuild the projection from the Log with core's own registry.
const { createRegistry } = await import("@ducter/core/src/registry.ts");
const fakeLog = { read: (o: any = {}) => evs.filter((e) => (!o.kinds || o.kinds.includes(e.kind)) && (o.fromSeq == null || e.seq >= o.fromSeq)), subscribe: () => () => {}, head: () => evs.length } as any;
const rebuilt = createRegistry(fakeLog);
for (const c of onHand.tasks) {
  const r = rebuilt.get(c.taskId);
  if (!r) find("onhand.unknown", c.taskId);
  else if (r.attention !== c.attention || (r.pendingDecisionId ?? null) !== (c.pendingDecisionId ?? null)) find("onhand.differs", `${c.taskId}: On hand ${c.attention}/${c.pendingDecisionId}, Log ${r.attention}/${r.pendingDecisionId}`);
}

// Merges: what was reported merged is in the base branch; no repo is left mid-merge.
for (const m of merges.filter((m) => m.ok && m.ref)) {
  const c = onHand.tasks.find((x) => x.taskId === m.taskId) ?? rebuilt.get(m.taskId);
  const repo = c?.place.kind === "repo" ? c.place.repoPath : undefined;
  if (repo && !(await git(repo, "merge-base", "--is-ancestor", m.ref!, "main")).ok) find("merge.missing", `${m.taskId} ${m.ref} is not in main of ${repo}`);
}
for (const r of REPOS) {
  if (existsSync(join(r, ".git/MERGE_HEAD"))) find("repo.mid_merge", `${r} has MERGE_HEAD`);
  if (existsSync(join(r, ".git/index.lock"))) find("repo.locked", `${r} has index.lock`);
  const st = await git(r, "status", "--porcelain");
  if (st.out) find("repo.dirty", `${r}: ${st.out.split("\n").slice(0, 3).join(" | ")}`);
  const wl = await git(r, "worktree", "list", "--porcelain");
  const prunable = wl.out.split("\n").filter((l) => l.startsWith("prunable")).length;
  if (prunable) find("worktree.prunable", `${r}: ${prunable} worktrees git calls prunable`);
}
// Worktrees are kept by design (no archiving yet): every repo task that started has one.
const wtDir = join(DATA, "worktrees");
const wts = new Set(existsSync(wtDir) ? readdirSync(wtDir) : []);
const repoTasks = [...rebuilt.list()].filter((c) => c.place.kind === "repo");
const startedRepo = repoTasks.filter((c) => c.residency !== "archived");
const missingWt = startedRepo.filter((c) => !wts.has(c.taskId));
if (missingWt.length) find("worktree.missing", `${missingWt.length} repo tasks without a worktree: ${missingWt.slice(0, 5).map((c) => c.taskId).join(", ")}`);

// A clean restart at rest changes nothing that matters (no resend, no re-run, no new question).
const headBefore = evs.length;
log("quiet restart: SIGTERM, start, 20 s");
main!.p.kill("SIGTERM");
await main!.p.exited;
await startMain();
await Bun.sleep(20_000);
const after = readLog().slice(headBefore);
// Shutdown closes sessions ("harness exited"); start parks what was warm. Nothing else.
const noisy = after.filter(
  (e) => !(e.kind === "task_state" && (e.body as any).residency === "parked") && e.kind !== "living_msg" && !(e.kind === "task_event" && /^harness exited/.test((e.body as any).text ?? "")),
);
if (noisy.length) find("restart.noisy", `${noisy.length} events after a restart at rest: ${noisy.slice(0, 6).map((e) => `${e.kind}${e.kind === "task_event" ? `:${(e.body as any).text?.slice(0, 40)}` : ""}`).join(", ")}`);

// Shutdown: nothing of ours is left running.
for (const c of [driver, ...watchers]) c.close();
await killWorker("end");
main!.p.kill("SIGTERM");
await main!.p.exited;
await Bun.sleep(1500);
const ps = await sh(["ps", "-axo", "pid=,ppid=,command="]);
// Anything still running from our data dirs or worktrees (main, worker, a VCS child, a harness).
const ours = ps.out.split("\n").filter((l) => (l.includes(DATA) || l.includes(WDATA)) && !l.includes("soak/src/run.ts") && !/\b(tail|grep|zsh)\b/.test(l));
if (ours.length) find("orphans", ours.slice(0, 5).join(" | "));

// ---------- summary ----------
const first = metrics.slice(2, 6);
const last = metrics.slice(-4);
const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length));
const summary = {
  minutes: MINUTES,
  seed: Number(arg("seed", "0")),
  events: lastHead,
  tasks: rebuilt.list().length,
  restarts,
  workerRestarts,
  counters,
  merges: { ok: merges.filter((m) => m.ok).length, refused: merges.filter((m) => !m.ok).length },
  lostResults: driver.lostResults,
  errors: driver.errors.length,
  errorSamples: [...new Set(driver.errors.map((e) => e.replace(/[a-z0-9_]{8,}/g, "<id>")))].slice(0, 12),
  rss: { early: avg(first.map((m) => m.rss)), late: avg(last.map((m) => m.rss)), max: Math.max(...metrics.map((m) => m.rss)) },
  fds: { early: avg(first.map((m) => m.fds)), late: avg(last.map((m) => m.fds)), max: Math.max(...metrics.map((m) => m.fds)) },
  children: { max: Math.max(...metrics.map((m) => m.children)), descMax: Math.max(...metrics.map((m) => m.desc)) },
  findings: findings.length,
};
writeFileSync(join(ROOT, "findings.json"), JSON.stringify(findings, null, 2));
writeFileSync(join(ROOT, "summary.json"), JSON.stringify(summary, null, 2));
log(`summary: ${JSON.stringify(summary)}`);
const byCheck = new Map<string, number>();
for (const f of findings) byCheck.set(f.check, (byCheck.get(f.check) ?? 0) + 1);
log(`findings by check: ${JSON.stringify(Object.fromEntries(byCheck))}`);
process.exit(findings.length ? 1 : 0);
