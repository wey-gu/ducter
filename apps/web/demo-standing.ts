// D411: 不用问我的 / Without asking. A review routine on nowledge-co with two drafts on its round card;
// then the author's own words (hel, 2026-11-19, read only): 「review 做好了直接发别和我确认」. Ducter keeps
// it at once, posts what waited (the card settles), says the one first-time line with links, and
// Settings › Partner lists it under 要不要先问 with 收回. A fake gh (never the real GitHub), a stub
// runner (no model; the partner's one-line answer is scripted as the eval's pass looks).
//   DUCTER_PORT=7997 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-standing.ts
// then open http://127.0.0.1:7997/app (the conversation) and /app#settings=partner.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import { fakeGh, type FakeIssue } from "../../packages/core/test/fake-gh-issues.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const scratch = mkdtempSync(join(tmpdir(), "ducter-demo-standing-"));
const now = Date.now();
const pr = (repo: string, number: number, title: string, author: string): FakeIssue => ({ repo: `nowledge-co/${repo}`, number, title, pr: true, assigned: false, review: true, author, updated: new Date(now - number).toISOString(), diff: "diff --git a/x b/x\n+x\n" });
const PRS = [pr("mem", 10288, "Re-push messages in pages under the byte budget", "mei-chen"), pr("mem", 10591, "Bump rustls-platform-verifier", "jun-park"), pr("nowledge-labs-website", 535, "Changelog: folder features", "sam-li")];
const gh = fakeGh(PRS, { login: "lin-dev" });
const dataDir = process.env.DUCTER_DATA_DIR ?? join(scratch, "data");
const core = startCore({ ooSource: noOo, dataDir, persona: { id: "default", name: zh ? "小鸭" : "Duckie", identity: "" }, hostname: process.env.DUCTER_HOST || "127.0.0.1", taskSources: { ghRun: gh.run, ghEnv: {}, home: join(scratch, "home"), quietMs: 0, pollMs: 3_600_000 } });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en" });
await core.taskSources.add("github");
await core.taskSources.look();

const log = core.log;
const id = "swj3zc4w";
log.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", body: { taskId: id, title: zh ? "看 nowledge-co 里请我 review 的 PR" : "Review my requests in nowledge-co", project: "mem", place: { kind: "none" }, harness: "codex", brief: zh ? "每 45 分钟 review 一次 nowledge-co 里请我 review 的 PR。" : "Every 45 minutes, review the PRs in nowledge-co that request my review.", language: zh ? "zh" : "en" } } as never);
core.tasks.setState(id, "working", "hot");
const say = (origin: "user" | "partner", text: string) => log.append({ stream: "channel", origin, kind: origin === "user" ? "user_msg" : "ai_msg", body: { text } } as never);
const note = (path: string, line: number, text: string) => ({ kind: "problem", path, line, text });
await core.mcp.call({ role: "task", taskId: id } as never, "review_report", {
  prs: [
    { ref: "nowledge-co/mem#10288", title: PRS[0]!.title, head: "a1b2c3d", ci: "passing", changed: true, notes: [note("nmem-rs/crates/nmem-server/src/hawdb_search_repush.rs", 57, "Make message re-push advance when a fixed page exceeds the byte budget.")] },
    { ref: "nowledge-co/mem#10591", title: PRS[1]!.title, head: "b2c3d4e", ci: "pending", changed: true, notes: [note("nowledge-graph/src-tauri/Cargo.lock", 2204, "Keep the desktop on rustls-platform-verifier 0.7.1, or attach current-head evidence for 0.6.2.")] },
  ],
});
await Bun.sleep(50);
say("user", zh ? "review 做好了直接发别和我确认" : "Just post the reviews when they're done, don't ask me.");
await Bun.sleep(300);
say("partner", zh ? "好，以后评审写完直接发到 GitHub，不再问你。在「替你做过的」里都看得到，想收回说一声。" : "Got it: from now on reviews go straight to GitHub without asking. Each one is in Done for you; say so to take it back.");
console.log(`[demo] standing: ${JSON.stringify(core.standing.list())}; posted ${gh.reviews.length}`);
console.log(`[demo] up at http://127.0.0.1:${core.port}/app (data: ${core.dataDir}; scratch: ${scratch})`);
