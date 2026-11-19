// D394: a review that runs every 45 minutes (research/158), for the Ongoing card's standing line,
// the round's one card and each draft opened as its PR's pre-read. A fake gh with five PRs waiting
// for "lin-dev"'s review in nowledge-co/mem (never the real GitHub); a Codex task resting on its own
// timer with twelve rounds behind it; its last round reported through review_report.
//   DUCTER_PORT=7999 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-reviews.ts
// then open http://127.0.0.1:7999/app (the card in the conversation; 做过的事 › 一直在跑的).
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import { fakeGh, type FakeIssue } from "../../packages/core/test/fake-gh-issues.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const scratch = mkdtempSync(join(tmpdir(), "ducter-demo-reviews-"));
const now = Date.now();
const pr = (number: number, title: string, author: string, hoursAgo: number): FakeIssue => ({ repo: "nowledge-co/mem", number, title, pr: true, assigned: false, review: true, author, updated: new Date(now - hoursAgo * 3600_000).toISOString(), diff: "diff --git a/src/x.rs b/src/x.rs\n+x\n" });
const gh = fakeGh(
  [
    pr(10287, "Distill memories in batches of 50", "mei-chen", 1),
    pr(10473, "Keep the pinned message when the window trims", "jun-park", 2),
    pr(10419, "Recall across spaces the token can read", "ari-k", 3),
    pr(8528, "Search: rank exact titles first", "mei-chen", 30),
    pr(6497, "Docs: the CLI's export command", "sam-li", 52),
    pr(7743, "Sync: retry on 409 with backoff", "jun-park", 70),
    pr(6095, "Graph view: keep zoom on refresh", "ari-k", 90),
    pr(10332, "Importer: Notion databases", "sam-li", 20),
  ],
  { login: "lin-dev" },
);
const dataDir = process.env.DUCTER_DATA_DIR ?? join(scratch, "data");
const core = startCore({ ooSource: noOo, dataDir, persona: { id: "default", name: zh ? "小鸭" : "Duckie", identity: "" }, hostname: process.env.DUCTER_HOST || "127.0.0.1", taskSources: { ghRun: gh.run, ghEnv: {}, home: join(scratch, "home"), quietMs: 0, pollMs: 3_600_000 } });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en" });
const ts = core.taskSources;
await ts.add("github");
await ts.look();

const log = core.log;
const id = "t_review";
const title = zh ? "看 nowledge-co 里请我 review 的 PR" : "Review my requests in nowledge-co";
log.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", body: { taskId: id, title, project: "mem", place: { kind: "none" }, harness: "codex", brief: zh ? "每 45 分钟 review 一次 nowledge-co 里请我 review 和提到我的 PR，按 mem 的 review skill 来。" : "Every 45 minutes, review the PRs in nowledge-co that request my review or mention me, with mem's review skill.", language: zh ? "zh" : "en" } } as never);
core.tasks.setState(id, "working", "hot");
const say = (origin: "user" | "partner", text: string) => log.append({ stream: "channel", origin, kind: origin === "user" ? "user_msg" : "ai_msg", body: { text } } as never);
say("user", zh ? "每 45 分钟帮我看一下 nowledge-co 里请我 review 的 PR，按 mem 的 review skill 来审。" : "Every 45 minutes, look at the PRs in nowledge-co that want my review, and review them with mem's review skill.");
say("partner", zh ? "好，每 45 分钟去看一轮，审好的先给你过目再发。" : "On it: a round every 45 minutes, and you see each review before it goes out.");

const note = (kind: "problem" | "suggestion", path: string, line: number, text: string) => ({ kind, path, line, text });
const r = await core.mcp.call({ role: "task", taskId: id } as never, "review_report", {
  prs: [
    { ref: "nowledge-co/mem#10287", head: "a1b2c3d", changed: true, gist: zh ? "把记忆提炼改成每 50 条一批" : "Distills memories 50 at a time", notes: [note("problem", "src/distill/batch.rs", 64, "`batch_size` is read from the config before it is checked, so 0 loops forever."), note("problem", "src/distill/batch.rs", 112, "A failed batch is retried with the same 50; one bad memory stops the rest."), note("suggestion", "src/distill/batch.rs", 30, "A test for an empty batch would keep this honest.")] },
    { ref: "nowledge-co/mem#10473", head: "f098abc", changed: true, gist: zh ? "窗口裁剪时留住置顶的消息" : "Keeps the pinned message when the window trims", notes: [note("problem", "src/window/trim.rs", 88, "Trimming counts the pinned message twice when it is also the newest.")] },
    { ref: "nowledge-co/mem#10419", head: "0c0ffee", changed: true, gist: zh ? "跨空间召回" : "Recall across spaces", notes: [note("problem", "src/recall/spaces.rs", 40, "Recall reads every space, then filters; a space the token can't see is still read."), note("suggestion", "src/recall/spaces.rs", 12, "Pass the allowed spaces into the query instead.")] },
    { ref: "nowledge-co/mem#8528", changed: false },
    { ref: "nowledge-co/mem#6497", changed: false },
    { ref: "nowledge-co/mem#7743", changed: false },
    { ref: "nowledge-co/mem#6095", changed: false },
    { ref: "nowledge-co/mem#10332", changed: false },
  ],
});
// Earlier rounds: looks on its own timer, every 45 minutes, most finding nothing new.
for (let i = 12; i >= 1; i--) {
  const at = new Date(now - i * 45 * 60_000).toISOString();
  log.append({ stream: "channel", origin: "waiter", kind: "waiter", body: { waiterId: `w_r${i}`, taskId: id, wakes: "task", at, reason: zh ? "再看一轮评审请求" : "the next round of review requests", state: "fired" } } as never);
}
log.append({ stream: "channel", origin: "waiter", kind: "waiter", body: { waiterId: "w_next", taskId: id, wakes: "task", at: new Date(now + 44 * 60_000).toISOString(), reason: zh ? "再看一轮评审请求" : "the next round of review requests", state: "armed" } } as never);
console.log(`[demo] review round: ${String(r)}`);
console.log(`[demo] up at http://127.0.0.1:${core.port}/app (data: ${core.dataDir}; scratch: ${scratch})`);
