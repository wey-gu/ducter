// Ack-and-go latency probe (D120). `bun packages/partner/eval/latency.ts [--model opus|sonnet]
//   [--task-model haiku] [--lang zh|en]`
//
// Real core + real runner + real partner on a real model, against a scratch git repo. One
// warm-up turn, then one work request; it prints, in ms from the moment the user's message is
// in the Log: each waiting-line step, the ack, the task's card (task_open), the task session's
// spawn (harness.start for the task's cwd), the turn's end. The task is dropped right after it
// spawns. The ~/.claude/projects folders it creates are deleted at the end.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies, LogEvent } from "../../protocol/src/index.ts";
import type { HarnessEvent, HarnessPort, HarnessSession } from "../../protocol/src/internal.ts";
import { startCore } from "../../core/src/index.ts";
import { createOarHarnessPort, createRunner, registerTaskTools } from "../../runner/src/index.ts";
import { createPartner, noMemory } from "../src/index.ts";

const argv = process.argv.slice(2);
const arg = (n: string, d: string) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1]! : d);
const MODEL = arg("model", "sonnet");
const TASK_MODEL = arg("task-model", "haiku");
const LANG = arg("lang", "zh");

const HOME = homedir();
const projectsDir = join(HOME, ".claude", "projects");
const before = new Set(existsSync(projectsDir) ? readdirSync(projectsDir) : []);
const root = realpathSync(mkdtempSync(join(tmpdir(), "ducter-latency-")));
const dataDir = join(root, "data");
const repo = join(root, "ttlcache");
mkdirSync(join(repo, "test"), { recursive: true });
writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "ttlcache", type: "module" }));
writeFileSync(join(repo, "cache.ts"), "export class Cache<V> {\n  private m = new Map<string, { v: V; at: number }>();\n  constructor(private ttlMs: number) {}\n  set(k: string, v: V) { this.m.set(k, { v, at: Date.now() }); }\n  get(k: string) { const e = this.m.get(k); return e && Date.now() - e.at < this.ttlMs ? e.v : undefined; }\n}\n");
writeFileSync(join(repo, "test", "cache.test.ts"), 'import { test, expect } from "bun:test";\nimport { Cache } from "../cache.ts";\ntest("expires", async () => { const c = new Cache<number>(50); c.set("a", 1); await Bun.sleep(50); expect(c.get("a")).toBeUndefined(); });\n');
for (const cmd of [["git", "init", "-q", "-b", "main"], ["git", "add", "."], ["git", "-c", "user.email=probe@ducter.local", "-c", "user.name=probe", "commit", "-qm", "init"]]) Bun.spawnSync(cmd, { cwd: repo });

const core = startCore({ dataDir, port: 0, persona: { id: "default", name: "Ducter", identity: "You are Ducter, Weyl's personal AI partner. He prefers short answers." } });
let t0 = 0;
const marks: { ms: number; what: string }[] = [];
const mark = (what: string) => t0 && marks.push({ ms: Math.round(performance.now() - t0), what });

const real = createOarHarnessPort({ dataDir });
let taskSpawned: (() => void) | null = null;
const spawned = new Promise<void>((r) => (taskSpawned = r));
const port: HarnessPort = {
  available: () => real.available(),
  async start(spec) {
    const isTask = !spec.cwd.endsWith("/partner");
    if (isTask) mark(`task session spawn starts (harness.start, ${spec.harness}${spec.model ? " " + spec.model : ""})`);
    const s = await real.start(spec);
    if (isTask) {
      mark("task session process up"), taskSpawned?.();
      return s;
    }
    // The partner's own stream: when each tool call starts and ends.
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
              const k = (r.value?.raw as { kind?: string } | undefined)?.kind;
              if (!r.done && r.value.tool && k?.startsWith("tool_call_")) mark(`partner ${k.slice(10)} ${r.value.tool.name.split("__").pop()}`);
              return r;
            },
          }),
        };
      },
    };
    return wrapped;
  },
};
registerTaskTools(core);
const runner = createRunner(core, { harness: port, taskModel: TASK_MODEL, isolateUserConfig: true });
core.setRunner(runner);
const set = core.activity?.set.bind(core.activity);
if (core.activity && set) core.activity.set = (a) => (mark(a ? `waiting line: ${a.step}` : "waiting line: off"), set(a));
core.log.subscribe((e: LogEvent) => {
  if (e.kind === "ack") mark(`ack on screen: "${(e.body as Bodies["ack"]).text}"`);
  else if (e.kind === "ai_msg" && e.origin === "partner") mark(`message: "${(e.body as Bodies["ai_msg"]).text}"`);
  else if (e.kind === "task_open") mark(`task card (task_open "${(e.body as Bodies["task_open"]).title}")`);
  else if (e.kind === "job_status" && e.origin === "partner") mark(`job_status ${(e.body as Bodies["job_status"]).state}`);
});
const partner = createPartner(core, runner, { model: MODEL, persistState: false, memory: noMemory, onError: (err) => console.error("[partner]", err) });
core.setPartner(partner);

try {
  // Warm-up: the session is live and seeded, as in a conversation already under way.
  core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: LANG === "zh" ? "你好" : "hi" } });
  await Bun.sleep(100);
  await partner.idle();
  const ask = LANG === "zh" ? `看看 ${repo} 里的测试为什么会不稳定，修好它` : `Find out why the test in ${repo} is flaky and fix it`;
  t0 = performance.now();
  core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: ask } });
  mark("user message in the Log");
  await Promise.race([spawned, Bun.sleep(90_000)]);
  await partner.idle();
  mark("turn ended");
  console.log(`\nack-and-go latency · partner ${MODEL} · task ${TASK_MODEL} · ${LANG}`);
  for (const m of marks) console.log(`${String(m.ms).padStart(7)} ms  ${m.what}`);
} finally {
  for (const t of core.tasks.list()) await runner.drop(t.taskId).catch(() => {});
  await partner.close().catch(() => {});
  await runner.dispose().catch(() => {});
  await core.stop().catch(() => {});
  let n = 0;
  for (const d of existsSync(projectsDir) ? readdirSync(projectsDir) : []) {
    if (!before.has(d) && d.includes("ducter-latency-")) rmSync(join(projectsDir, d), { recursive: true, force: true }), n++;
  }
  rmSync(root, { recursive: true, force: true });
  console.log(`cleaned ${n} ~/.claude/projects folder(s) and the scratch dir`);
  process.exit(0);
}
