// A demo core for D566, 存到 Nowledge Mem / Save to Nowledge Mem: a task that finished a load-test
// report (Markdown), its numbers (CSV) and a screenshot, shown under the partner's words, with Mem
// connected. Keeping a file runs the FAKE nmem (packages/partner/eval/fake-artifacts-nmem.ts) in the
// scratch data folder: never the person's own Mem.
//   DUCTER_PORT=7977 DUCTER_DATA_DIR=/tmp/x DEMO_LANG=zh DEMO_KEEP=can bun apps/web/demo-mem-files.ts
// DEMO_KEEP: can (nothing kept yet) · saved (the report already kept) · slow (a tap waits DEMO_SLOW_MS,
//   default 20 s, so the busy state can be seen) · signed_out (a tap answers Mem's 401) · auto (the
//   Settings default on while Mem is out of reach: the one it couldn't keep is said under its row) ·
//   no_space (D572: Mem lists Spaces but marks none personal or write default, as a tap meets it) ·
//   down (a tap meets Mem out of reach)
// then open http://127.0.0.1:7977/app (or #settings=memory)
import { join, resolve } from "node:path";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const want = process.env.DEMO_KEEP ?? "can";
if (!process.env.DUCTER_DATA_DIR) throw new Error("set DUCTER_DATA_DIR to a scratch folder");
const state = join(process.env.DUCTER_DATA_DIR, "fake-mem.json");
const FAKE = resolve(import.meta.dir, "../../packages/partner/eval/fake-artifacts-nmem.ts");
const slow = want === "slow" ? Number(process.env.DEMO_SLOW_MS ?? 20_000) : 0;
const memRun = async (argv: string[], ms: number) => {
  if (slow && (argv.includes("add") || argv.includes("update"))) await Bun.sleep(slow);
  const p = Bun.spawn(["bun", FAKE, "--json", ...argv], { stdout: "pipe", stderr: "pipe", env: { PATH: process.env.PATH ?? "", NMEM_FAKE_ARTIFACTS: state, ...(want === "signed_out" ? { NMEM_FAKE_SIGNED_OUT: "1" } : want === "auto" || want === "down" ? { NMEM_FAKE_DOWN: "1" } : want === "no_space" ? { NMEM_FAKE_SPACES: "none" } : {}) } });
  const timer = setTimeout(() => p.kill(), ms);
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  clearTimeout(timer);
  return { code, out, err };
};
// The home's own Mem, connected and up to date (as demo-memory.ts DEMO_MEM=on): a pretend pipx copy.
const ok = (j: unknown) => ({ code: 0, out: JSON.stringify(j), err: "" });
const SPACE = "6f1c0d2e-8b4a-4d1e-9c3f-2a7b5e0d9c11";
const conn = { connection_id: "00000000-0000-4000-8000-000000000001", agent_id: "ducter", identity_birth: "00000000-0000-4000-8000-000000000900", client_label: "ducter", state: "active" };
const bridgeRun = async (args: string[]) => {
  const a = args.join(" ");
  if (args[0] === "--version") return ok("nmem 0.10.123");
  if (a.includes("bridge connections --help")) return { code: 0, out: "", err: "" };
  if (a === "status") return ok({ status: "healthy", backend: "cloud", update: { current: "0.10.123", latest: "0.10.123", update_available: false } });
  if (a === "bridge setup") return ok({ state: "selection_needed", candidates: [{ id: SPACE, label: "Only me", kind: "personal", readers: 1, write_default: true }] });
  if (a.includes("connections connect")) return ok({ state: "connected", agent_context: "ducter", connection: conn, selection: { scope: { space_id: SPACE }, address: { agent_id: "ducter" } } });
  if (a.includes("--agent-context ducter bridge setup")) return ok({ state: "enable_needed", endpoint: { address: { agent_id: "ducter" } } });
  if (a.includes("connections list")) return ok({ schema_version: 1, connections: [conn], next_connection_id: null });
  return { code: 2, out: "", err: "demo: not scripted" };
};
const NMEM = "/home/wei/.local/pipx/venvs/nmem-cli/bin/nmem";
const tools: Record<string, string> = { nmem: NMEM, pipx: "/usr/bin/pipx" };
const sys = { which: (c: string) => tools[c], exists: (p: string) => p === NMEM, read: () => undefined, list: () => [], real: (p: string) => p, home: "/home/wei", platform: "linux" as const, uid: 1000 };
const core = startCore({ ooSource: noOo, persona: { id: "default", name: zh ? "小鸭" : "Duckie", identity: "" }, hostname: process.env.DUCTER_HOST || "127.0.0.1", memFiles: { run: memRun }, update: { homeName: "home-server" }, bridgeLink: { run: bridgeRun as never, env: {}, sys, exec: async () => new Promise<never>(() => {}) } as never });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.persona.mem = { agentId: "ducter", owned: true };
core.settings.setMemState("connected");
core.settings.set({ language: zh ? "zh" : "en", ...(want === "auto" ? { memFiles: true } : {}) });
const log = core.log;
const text = (s: string) => new TextEncoder().encode(s);

const w = zh
  ? {
      ask: "HawDB 的 compaction 压测跑一下，写个报告",
      ack: "好，我去跑三个写入速率，做好给你看。",
      title: "HawDB compaction 压测",
      report: "compaction-压测报告.md",
      body: "# HawDB compaction 压测\n\n三个写入速率下的 p99 和停顿。\n\n| 写入/秒 | p99 (ms) | 停顿 (s) |\n|---:|---:|---:|\n| 10,000 | 4.1 | 0 |\n| 25,000 | 6.8 | 0 |\n| 40,000 | 11.2 | 1.5 |\n\n## 结论\n\n40k/s 时 L0 堆积，停顿 1.5 秒；把 `max_background_compactions` 调到 4 之后消失。\n",
      summary: "压测跑完了：40k/s 以下 compaction 跟得上，再高 L0 会堆积。",
      said: "压测跑完了。4 万/秒以下 compaction 跟得上，再往上 L0 会堆积、停顿 1.5 秒，调高后台 compaction 数就好了。报告和数字都在这儿。",
    }
  : {
      ask: "Run the HawDB compaction load test and write up a report",
      ack: "On it: three write rates, I'll show you when it's done.",
      title: "HawDB compaction load test",
      report: "compaction-load-test.md",
      body: "# HawDB compaction load test\n\np99 and stalls at three write rates.\n\n| writes/s | p99 (ms) | stall (s) |\n|---:|---:|---:|\n| 10,000 | 4.1 | 0 |\n| 25,000 | 6.8 | 0 |\n| 40,000 | 11.2 | 1.5 |\n\n## Finding\n\nAt 40k/s L0 piles up and writes stall 1.5 s; raising `max_background_compactions` to 4 removes it.\n",
      summary: "The load test is done: compaction keeps up below 40k writes/s; above that L0 piles up.",
      said: "The load test is done. Compaction keeps up below 40k writes a second; above that L0 piles up and writes stall for 1.5 s, which more background compactions fix. The report and the numbers are here.",
    };

const t1 = "t_load";
const report = core.media.put(text(w.body), { files: true, name: w.report, from: { taskId: t1 } });
const csv = core.media.put(text("rate,p99_ms,stall_s\n10000,4.1,0\n25000,6.8,0\n40000,11.2,1.5\n"), { files: true, name: "hawdb-loadtest.csv", from: { taskId: t1 } });
const u = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: w.ask } });
log.append({ stream: "channel", origin: "partner", kind: "ack", body: { jobId: "j1", text: w.ack, replyTo: u.seq } });
log.append({ stream: `task:${t1}`, origin: "partner", kind: "task_open", body: { taskId: t1, title: w.title, project: "hawdb", place: { kind: "none" }, harness: "claude-code", brief: w.ask, language: zh ? "zh" : "en" } });
log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: "j1", text: w.title, state: "running", taskId: t1 } });
core.tasks.setState(t1, "working", "hot");
await Bun.sleep(30);
log.append({ stream: `task:${t1}`, origin: "task", kind: "report", body: { taskId: t1, state: "done", summary: w.summary, questions: [], evidence: [], media: [report, csv] } });
core.tasks.setState(t1, "done", "warm");
log.append({ stream: "channel", origin: "partner", kind: "job_status", body: { jobId: "j1", text: w.title, state: "done", taskId: t1 } });
log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: w.said, replyTo: u.seq, media: [report, csv] } });
if (want === "saved") await core.memFiles.save(report.id, "tap");
void core.bridgeLink.connect();
console.log(`[demo] up at ${core.url}/app (data: ${core.dataDir}) · ${zh ? "zh" : "en"} · ${want}`);
