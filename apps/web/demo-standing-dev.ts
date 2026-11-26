// D596: 开发做完、验证好，直接开 PR 交给帮手 / Verified work goes straight to a PR and your helper. The
// author's words (the Mac, 2026-11-26): 「以后我让你做开发的工作，请都按照这个标准（不一定分配给谁），做好了
// PR，研究实现设计验证好之后，交给 PR baby sitter 哈。」 The partner keeps it (without_asking pr_open, scripted
// here), the task's verified fix calls open_pr, Ducter opens the PR with no card and says the one
// first-time line with the link; Settings › Partner lists the row under 不用问我的 with 收回. A stub
// runner (no git, no GitHub, no model; the partner's line back is scripted as the eval's pass reads).
//   DUCTER_PORT=7998 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-standing-dev.ts
// then open http://127.0.0.1:7998/app (the conversation) and /app#settings=partner.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const scratch = mkdtempSync(join(tmpdir(), "ducter-demo-standing-dev-"));
const dataDir = process.env.DUCTER_DATA_DIR ?? join(scratch, "data");
const core = startCore({ ooSource: noOo, dataDir, persona: { id: "default", name: zh ? "小鸭" : "Duckie", identity: "" }, hostname: process.env.DUCTER_HOST || "127.0.0.1" });
const PR = "https://github.com/nowledge-co/mem/pull/11391";
core.setRunner({ ...stubRunner(core), openPr: async () => ({ ok: true, message: "Opened a PR for ducter/fix-11390.", ref: PR }) } as never);
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en" });

const log = core.log;
const id = "m11390";
const say = (origin: "user" | "partner", text: string) => log.append({ stream: "channel", origin, kind: origin === "user" ? "user_msg" : "ai_msg", body: { text } } as never);
const words = zh ? "以后我让你做开发的工作，请都按照这个标准（不一定分配给谁），做好了 PR，研究实现设计验证好之后，交给 PR baby sitter 哈。" : "From now on, for any dev work I give you: once it's researched, built and verified, open the PR and hand it to my PR babysitter. No need to ask me first.";
// The task is already at work in nowledge-co/mem: the go holds where the person's tasks work.
log.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", body: { taskId: id, title: zh ? "修 Mem #11390" : "Fix Mem #11390", project: "mem", place: { kind: "repo", device: "local", repoPath: "/Users/demo/dev/mem", clone: "nowledge-co/mem", branch: "ducter/fix-11390", baseBranch: "main" }, harness: "codex", brief: zh ? "修 #11390" : "Fix #11390", language: zh ? "zh" : "en" } } as never);
core.tasks.setState(id, "working", "hot");
const heard = say("user", words);
// D596: the partner records it with without_asking (scripted here: no model).
core.standing.hear(`tool:${heard.seq}`, { kind: "grant", action: "pr_open", quote: words }, heard.ts, heard.seq);
say("partner", zh ? "好，以后开发的活验证好就直接开 PR，交给 PR baby sitter 跟进，不再问你。合并还是你来。想收回说一声。" : "Got it: from now on verified dev work goes straight to a PR and your PR babysitter, without asking. Merging stays yours; say so to take it back.");
await Bun.sleep(50);
const r = await core.mcp.call({ role: "task", taskId: id } as never, "open_pr", {
  title: "fix(search): page on past the byte budget (#11390)",
  body: "Fixes #11390.",
  checks: ["bun test packages/search: 42 passed", "Playwright e2e on the search page: passed"],
  hand_to: zh ? "PR baby sitter" : "PR babysitter",
});
console.log(`[demo] open_pr: ${JSON.stringify(r)}; standing: ${JSON.stringify(core.standing.list())}`);
console.log(`[demo] up at http://127.0.0.1:${core.port}/app (data: ${core.dataDir}; scratch: ${scratch})`);
