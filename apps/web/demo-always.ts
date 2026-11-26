// D601: 以后这类直接做 / Always do this beside Go, and GQ4's offer. A repo task in nowledge-co/mem asks
// to rerun a flaky E2E check (its step: ci_rerun). DEMO_OFFER=1: two earlier asks of that kind were
// answered with a plain Go, so this one leads with 这类你已经点过两次了，以后直接做？. Settings › Partner
// lists a review permission kept by a tap (你点了「以后直接发」 with its day). A stub runner: no git,
// no GitHub, no model; the partner's relay line is scripted.
//   DUCTER_PORT=7996 DEMO_LANG=zh DEMO_OFFER=1 bun apps/web/demo-always.ts
// then open http://127.0.0.1:7996/app (the conversation) and /app#settings=partner.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies } from "@ducter/protocol";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const offer = process.env.DEMO_OFFER === "1";
const scratch = mkdtempSync(join(tmpdir(), "ducter-demo-always-"));
const dataDir = process.env.DUCTER_DATA_DIR ?? join(scratch, "data");
const core = startCore({ ooSource: noOo, dataDir, persona: { id: "default", name: zh ? "小鸭" : "Duckie", identity: "" }, hostname: process.env.DUCTER_HOST || "127.0.0.1" });
core.setRunner(stubRunner(core) as never);
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en" });

const log = core.log;
const id = "t10932";
log.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", body: { taskId: id, title: zh ? "把 PR #10932 推到能合并" : "Get PR #10932 to mergeable", project: "mem", place: { kind: "repo", device: "local", repoPath: "/Users/demo/dev/mem", clone: "nowledge-co/mem", branch: "ducter/fix-10932", baseBranch: "main" }, harness: "codex", brief: zh ? "推进到能合并" : "Get it to mergeable", language: zh ? "zh" : "en" } } as never);
core.tasks.setState(id, "working", "hot");
log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: zh ? "盯一下 mem 那个 PR，推进到能合并" : "Keep an eye on that mem PR and get it to mergeable" } } as never);

const ask = () => {
  log.append({ stream: `task:${id}`, origin: "task", kind: "report", body: { taskId: id, state: "needs_input", summary: "E2E flaked once.", evidence: [], questions: [{ id: "q", text: zh ? "在 PR #10932 评论 /test pull-mem-playwright-e2e 重跑这项 E2E？" : "Comment /test pull-mem-playwright-e2e on PR #10932 to rerun the E2E check?", blocking: true, default: zh ? "重跑 E2E" : "Rerun E2E", reversible: true, step: "ci_rerun" }] } } as never);
  return log.read({ stream: "channel", kinds: ["decision"], limit: 50 }).map((e) => e.body as Bodies["decision"]).at(-1)!;
};
const relay = (d: Bodies["decision"]) =>
  log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: zh ? "#10932 的 E2E 偶发失败了一次（别的检查都过了）。要我在 PR 下评论 /test 重跑这一项吗？" : "The E2E check on #10932 failed once, a flake; everything else passed. Shall I comment /test on the PR to rerun just that one?", decisionId: d.decisionId } } as never);

if (offer) {
  for (let i = 0; i < 2; i++) {
    const d = ask();
    relay(d);
    await Bun.sleep(20);
    core.decisions.decide(d.decisionId, "go");
    await Bun.sleep(20);
  }
}
const d = ask();
await Bun.sleep(20);
relay(d);
// Settings: a review permission kept by a tap on a round's card (以后直接发), in nowledge-co.
core.standing.tap("pr_review", ["nowledge-co"], new Date().toISOString(), zh ? "以后直接发" : "Always post", { quiet: true });
console.log(`[demo] card: ${JSON.stringify(d.always)}; standing: ${JSON.stringify(core.standing.list())}`);
console.log(`[demo] up at http://127.0.0.1:${core.port}/app (data: ${core.dataDir}; scratch: ${scratch})`);
