// D407: 审查看板 / Review board. A review routine that has run three rounds over nine requests across
// nowledge-co (the shape of the author's own, research/166 §2; synthetic text): Ducter's offer card
// after the third round, and with DEMO_STAGE=board the person's Go, the board made from its template,
// filled from the rounds, and the Ongoing card that opens it. A fake gh (never the real GitHub), a
// stub runner (no model).
//   DUCTER_PORT=7998 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh DEMO_STAGE=board bun apps/web/demo-review-board.ts
// then open http://127.0.0.1:7998/app (the conversation; 做过的事 › 一直在跑的; the board's 看草稿).
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import { fakeGh, type FakeIssue } from "../../packages/core/test/fake-gh-issues.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const stage = process.env.DEMO_STAGE ?? "board";
const scratch = mkdtempSync(join(tmpdir(), "ducter-demo-board-"));
const now = Date.now();
const pr = (repo: string, number: number, title: string, author: string, hoursAgo: number): FakeIssue => ({ repo: `nowledge-co/${repo}`, number, title, pr: true, assigned: false, review: true, author, updated: new Date(now - hoursAgo * 3600_000).toISOString(), diff: "diff --git a/src/x.rs b/src/x.rs\n+x\n" });
const PRS = [
  pr("mem", 10287, "Distill memories in batches of 50", "mei-chen", 1),
  pr("mem", 10473, "Keep the pinned message when the window trims", "jun-park", 2),
  pr("hawdb", 412, "Compaction: skip empty runs", "ari-k", 3),
  pr("mem", 8528, "Search: rank exact titles first", "mei-chen", 30),
  pr("mem", 6497, "Docs: the CLI's export command", "sam-li", 52),
  pr("mem", 7743, "Sync: retry on 409 with backoff", "jun-park", 70),
  pr("oomol-cli", 211, "Login: keep the device code on screen", "ari-k", 20),
  pr("hawdb", 398, "WAL: fsync the directory after rename", "sam-li", 26),
  pr("mem", 10332, "Importer: Notion databases", "sam-li", 40),
];
const gh = fakeGh(PRS, { login: "lin-dev" });
const dataDir = process.env.DUCTER_DATA_DIR ?? join(scratch, "data");
const core = startCore({ ooSource: noOo, dataDir, persona: { id: "default", name: zh ? "小鸭" : "Duckie", identity: "" }, hostname: process.env.DUCTER_HOST || "127.0.0.1", taskSources: { ghRun: gh.run, ghEnv: {}, home: join(scratch, "home"), quietMs: 0, pollMs: 3_600_000 } });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en" });
await core.taskSources.add("github");
await core.taskSources.look();

const log = core.log;
const id = "t_review";
const title = zh ? "看 nowledge-co 里请我 review 的 PR" : "Review my requests in nowledge-co";
log.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", body: { taskId: id, title, project: "mem", place: { kind: "none" }, harness: "codex", brief: zh ? "每 45 分钟 review 一次 nowledge-co 里请我 review 和提到我的 PR，按 mem 的 review skill 来。" : "Every 45 minutes, review the PRs in nowledge-co that request my review or mention me, with mem's review skill.", needs: { reviews: true }, language: zh ? "zh" : "en" } } as never);
core.tasks.setState(id, "working", "hot");
const say = (origin: "user" | "partner", text: string) => log.append({ stream: "channel", origin, kind: origin === "user" ? "user_msg" : "ai_msg", body: { text } } as never);
say("user", zh ? "每 45 分钟帮我看一下 nowledge-co 里请我 review 的 PR，按 mem 的 review skill 来审。" : "Every 45 minutes, look at the PRs in nowledge-co that want my review, and review them with mem's review skill.");
say("partner", zh ? "好，每 45 分钟去看一轮，审好的先给你过目再发。" : "On it: a round every 45 minutes, and you see each review before it goes out.");

const note = (kind: "problem" | "suggestion", path: string, line: number, text: string) => ({ kind, path, line, text });
const ci: Record<string, string> = { "mem#10287": "failing", "mem#10473": "passing", "hawdb#412": "pending", "mem#8528": "passing", "mem#6497": "passing", "mem#7743": "failing", "oomol-cli#211": "passing", "hawdb#398": "passing", "mem#10332": "none" };
const heads: Record<string, string> = { "mem#10287": "a1b2c3d", "mem#10473": "f098abc", "hawdb#412": "0c0ffee", "mem#8528": "77e1d02", "mem#6497": "5b0d1e9", "mem#7743": "c4f2a10", "oomol-cli#211": "e7d3b88", "hawdb#398": "9a41c6f", "mem#10332": "2fd7e05" };
const row = (x: FakeIssue, changed: boolean, notes: ReturnType<typeof note>[] = []) => {
  const k = `${x.repo.split("/")[1]}#${x.number}`;
  return { ref: `${x.repo}#${x.number}`, title: x.title, head: heads[k], ci: ci[k], changed, notes };
};
const call = (prs: unknown[]) => core.mcp.call({ role: "task", taskId: id } as never, "review_report", { prs });
// Round 1, two hours ago: two older ones reviewed (one posted since), the rest unchanged.
await call(PRS.map((x) => (x.number === 8528 ? row(x, true, [note("problem", "src/search/rank.rs", 41, "Exact-title boost is applied after the limit, so a match on page 2 never comes up.")]) : x.number === 398 ? row(x, true, [note("suggestion", "src/wal/rename.rs", 77, "A test that kills the process between rename and fsync would pin this down.")]) : row(x, false))));
// The person posted those two from their sheets (Done for you).
for (const ref of ["nowledge-co/mem#8528", "nowledge-co/hawdb#398"]) await core.taskSources.pile.sendRead(ref, [0]);
await call(PRS.map((x) => row(x, false)));
// Round 3, just now: three moved and were reviewed again.
await call(
  PRS.map((x) =>
    x.number === 10287
      ? row(x, true, [note("problem", "src/distill/batch.rs", 64, "`batch_size` is read from the config before it is checked, so 0 loops forever."), note("problem", "src/distill/batch.rs", 112, "A failed batch is retried with the same 50; one bad memory stops the rest."), note("suggestion", "src/distill/batch.rs", 30, "A test for an empty batch would keep this honest.")])
      : x.number === 10473
        ? row(x, true, [note("problem", "src/window/trim.rs", 88, "Trimming counts the pinned message twice when it is also the newest.")])
        : x.number === 412
          ? row(x, true, [note("suggestion", "src/compaction/plan.rs", 51, "Skipping here also skips the level's stats update; move the check after it."), note("suggestion", "src/compaction/plan.rs", 9, "An empty run could be logged once at debug.")])
          : row(x, false),
  ),
);
for (let i = 12; i >= 1; i--) log.append({ stream: "channel", origin: "waiter", kind: "waiter", body: { waiterId: `w_r${i}`, taskId: id, wakes: "task", at: new Date(now - i * 45 * 60_000).toISOString(), reason: zh ? "再看一轮评审请求" : "the next round of review requests", state: "fired" } } as never);
log.append({ stream: "channel", origin: "waiter", kind: "waiter", body: { waiterId: "w_next", taskId: id, wakes: "task", at: new Date(now + 44 * 60_000).toISOString(), reason: zh ? "再看一轮评审请求" : "the next round of review requests", state: "armed" } } as never);
const offer = log.read({ stream: "channel", kinds: ["decision"], limit: 100 }).map((e) => e.body as { decisionId: string; board?: unknown }).find((d) => d.board);
if (stage === "board" && offer) core.decisions.decide(offer.decisionId, "go");
await Bun.sleep(100);
const app = core.apps.list("default")[0];
console.log(`[demo] offer ${offer?.decisionId ?? "none"}; board ${app ? `${app.id} "${app.name}"` : "not made"}`);
console.log(`[demo] up at http://127.0.0.1:${core.port}/app (data: ${core.dataDir}; scratch: ${scratch})`);
