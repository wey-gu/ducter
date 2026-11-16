// D299: the demo's own "this computer": a scratch home holding a few sessions the person ran by
// hand in Claude Code, Codex and pi (synthetic, in the agents' own record shapes), so Past tasks'
// 也在这台电脑上 / Also on this computer has something true-looking to show. The demo never reads
// the real home's sessions: without DEMO_PAST it gets an empty one.
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalAgents, type LocalAgents } from "../../packages/core/src/local-agents/index.ts";
import { writeSession } from "../../packages/core/test/fixtures-agents.ts";

export function outsideAgents(zh: boolean, seed: boolean): LocalAgents {
  const home = mkdtempSync(join(tmpdir(), "ducter-demo-home-"));
  if (!seed) return createLocalAgents({ home, env: {} });
  const w = (z: string, e: string) => (zh ? z : e);
  const now = Date.now();
  const ago = (h: number) => new Date(now - h * 3600_000);
  const dir = (...p: string[]) => {
    const d = join(home, ...p);
    mkdirSync(d, { recursive: true });
    return d;
  };
  const hawdb = dir("src", "hawdb");
  const mem = dir("src", "mem");
  const ducter = dir("src", "ducter");
  writeSession(home, { agent: "claude-code", id: "942ecde2-b387-45c2-bbc6-75da83748a7f", cwd: hawdb, branch: "fix/raft-snapshot", model: "claude-opus-5", title: w("Raft 快照的竞争", "Raft snapshot race"), turns: [[w("TestRaftSnapshot 为什么偶尔失败？", "Why is TestRaftSnapshot flaky?"), w("快照计时器和 leader 退位在抢跑：退位后计时器还会触发一次。", "The snapshot timer races the leader step-down: it can fire once after stepping down.")], [w("加一道 fence，再补个测试", "Add a fence and a test for it"), w("fence 加在 snapshot.rs，新测试连跑 200 遍都过了。还没提交。", "Added the fence in snapshot.rs; the new test passes 200 runs. Not committed yet.")]], startedAt: ago(27), updatedAt: ago(25) });
  writeSession(home, { agent: "codex", id: "01a1e522-a9c6-7d53-9d33-0dfcdf329f76", cwd: hawdb, branch: "perf/lto", model: "gpt-5.5", turns: [[w("查一下 release 构建为什么慢", "Find out why the release build is slow"), w("链接占了 70%；换成 thin LTO 能减半。", "Linking takes 70% of it; thin LTO halves it.")]], startedAt: ago(52), updatedAt: ago(50) });
  writeSession(home, { agent: "claude-code", id: "5c1b7e20-4f6a-4d3e-9a51-2b8f0c6d7e11", cwd: ducter, branch: "main", model: "claude-sonnet-5", turns: [[w("把 On hand 的空状态文案再打磨一下", "Polish On hand's empty-state words"), w("改了三句，中英各一版，放在 i18n-onhand.ts。", "Three lines reworded in both languages, in i18n-onhand.ts.")]], startedAt: ago(75), updatedAt: ago(74) });
  writeSession(home, { agent: "pi", id: "01a1e523-706a-722e-8264-627a362842f1", cwd: mem, title: w("0.9 的版本说明", "Release notes for 0.9"), turns: [[w("写 0.9 的版本说明", "Write the release notes for 0.9"), w("写在 CHANGELOG.md 里了。", "Drafted them in CHANGELOG.md.")]], startedAt: ago(220), updatedAt: ago(218) });
  return createLocalAgents({ home, env: {} });
}

/**
 * One outside session already carried on: a Codex session the person ran in mem, now a Ducter
 * task whose transcript opens with its earlier turns under one hairline, then Ducter's own line,
 * then the agent's answer and report (what the runner logs, D299).
 */
export async function seedAdopted(core: import("@ducter/core").Core, zh: boolean) {
  const w = (z: string, e: string) => (zh ? z : e);
  const id = "t_outside";
  const st = `task:${id}`;
  const log = core.log;
  const began = new Date(Date.now() - 30 * 3600_000).toISOString();
  const ev = (body: object, origin: "task" | "user" = "task") => log.append({ stream: st, origin, kind: "task_event", body: { taskId: id, ...body } } as never);
  log.append({ stream: st, origin: "system", kind: "task_open", body: { taskId: id, title: w("mem 同步在断网后重复上传", "Mem sync uploads twice after going offline"), project: "mem", place: { kind: "folder", device: "local", path: "/Users/demo/src/mem" }, harness: "codex", model: "gpt-5.5", brief: w("断网再连上以后，同步会把同一批记忆传两遍，查一下", "After going offline and back, sync uploads the same memories twice. Look into it."), origin: "you", outside: { agent: "codex", sessionId: "7a7a7a7a-0000-4000-8000-000000000001", startedAt: began } } } as never);
  ev({ role: "system", from: "runner", raw: { folder: { direct: true } } });
  ev({ role: "system", from: "runner", text: "carried on from a codex session started outside Ducter", raw: { outside: { agent: "codex", at: began, turns: 4 }, sessionId: "7a7a7a7a-0000-4000-8000-000000000001", harness: "codex" } });
  ev({ role: "user", from: "user", text: w("断网再连上以后，同步会把同一批记忆传两遍，查一下", "After going offline and back, sync uploads the same memories twice. Look into it."), raw: { outside: true } }, "user");
  ev({ role: "assistant", text: w("重连时队列被重放了一次，但上一次的上传其实已经成功，只是没收到回执。", "On reconnect the queue replays once, but the earlier upload had already landed; only its ack was lost."), raw: { outside: true } });
  ev({ role: "user", from: "user", text: w("那上传前先比一下 etag 呢？", "What about comparing the etag before uploading?"), raw: { outside: true } }, "user");
  ev({ role: "assistant", text: w("可以。我先在 client.ts 里加了比对，还没写测试。", "That works. I added the check in client.ts; no test yet."), raw: { outside: true } });
  ev({ role: "user", from: "ducter", text: "The user picked this session up again in Ducter; it is a Ducter task now. Check where the work stands, then carry on from where it was left." }, "user");
  ev({ role: "assistant", text: w("接着上次：etag 比对已经在了，我补了断网重连的集成测试，连跑 50 遍都只上传一次。", "Picking up where we were: the etag check is in; I added an offline-and-back integration test, and 50 runs each upload once.") });
  log.append({ stream: st, origin: "task", kind: "report", body: { taskId: id, state: "done", summary: w("断网重连后不再重复上传：上传前比对 etag，补了集成测试。", "No more double uploads after reconnecting: the etag is compared first, with an integration test."), questions: [], evidence: [] } } as never);
  await Bun.sleep(10);
  core.tasks.setState(id, "done", "archived");
}
