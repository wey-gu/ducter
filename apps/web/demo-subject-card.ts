// D653 (research/244 rules 1 and 8) and its polish: the before/after of one fix's lines, on the web.
// DEMO_STAGE=before: every report is its own partner bubble (the measured 13–17 lines).
// DEMO_STAGE=after: the start, the one needs-you, the final result, and one living card under
// the message that started the work, revised in place; after the result the card says the artifact
// and the time, not the partner's sentence. A second partner's task carries its own card. No model,
// no network.
//   DUCTER_PORT=7711 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh DEMO_STAGE=after bun apps/web/demo-subject-card.ts
// then open http://127.0.0.1:7711/app
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const stage = process.env.DEMO_STAGE ?? "after";
const w = (z: string, e: string) => (zh ? z : e);
const core = startCore({ ooSource: noOo, persona: { id: "default", name: zh ? "小鸭" : "Duckie", identity: "" }, partners: true, bridgeLink: { run: async () => undefined, env: {} } });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en" });
const log = core.log;
const at = (min: number) => new Date(Date.now() - (30 - min) * 60_000).toISOString();
const title = w("官网下载页的下载按钮", "The download button on our site");
const say = (kind: "user_msg" | "ai_msg", text: string, replyTo?: number, min = 0, stream = "channel", persona?: string) =>
  log.append({ stream, ...(persona ? { persona } : {}), origin: kind === "user_msg" ? "user" : "partner", kind, body: { text, ...(replyTo !== undefined ? { replyTo } : {}) } } as never);

const u = say("user_msg", w("官网下载页的下载按钮点不了，帮我修一下。", "The download button on our site doesn't work. Fix it please."));
say("ai_msg", w("我去看看下载按钮，修好了告诉你。", "I'll look at the download button and tell you when it's fixed."), u.seq, 0);
// The second partner is on the rail in both stages; only the after stage gives it a task.
const second = core.partners.add({ name: w("小家", "Home"), look: "sage", about: w("家里的事、看病、孩子", "home, the doctor, the kids") });
if (stage === "before") {
  const lines = [
    w("找到了，是下载链接写到了一个已删除的文件。", "Found it: the link points at a deleted file."),
    w("改好了，开了 PR #578。", "Fixed it; opened PR #578."),
    w("本地跑了一遍，下载正常。", "Ran it here; the download works."),
    w("复查看过了，改动没问题。", "Reviewer looked; the change is fine."),
    w("CI 第一项过了。", "The first CI check passed."),
    w("CI 挂了，是缓存的旧依赖。", "CI failed on a stale cached dependency."),
    w("清了缓存，在重跑。", "Cleared the cache; running it again."),
    w("CI 绿了，还差一位评审。", "CI is green; one more review needed."),
    w("第二位评审看过了。", "A second reviewer looked."),
    w("在等合并。", "Waiting for the merge."),
    w("合并了。", "Merged."),
    w("线上下载按钮好了。", "The download button works now."),
    w("又看了一遍，线上正常。", "Checked again; the live site is fine."),
    w("把记录收个尾。", "Tidying up the notes."),
  ];
  lines.forEach((text, i) => say("ai_msg", text, u.seq, 1 + i));
} else {
  say("ai_msg", w("CI 的缓存要不要清掉重跑？", "Should I clear CI's cache and run it again?"), u.seq, 2);
  say("ai_msg", w("合并了，线上下载按钮好了。", "Merged. The download button works now."), u.seq, 6);
  log.append({
    stream: "channel",
    origin: "system",
    kind: "subject_card",
    body: {
      card: {
        key: "pr:acme/site#578",
        msgSeq: u.seq,
        title,
        state: "done",
        // The card is state, the partner's message is speech: the artifact and the time, not its sentence.
        line: w("PR #578 合并了", "PR #578 merged"),
        took: 17 * 60_000,
        taskId: "t_fix",
        at: at(6),
      },
    },
  } as never);
  // A second partner's task: its card is in its own conversation, with its own facts.
  if (second.ok) {
    const sid = second.partner.id;
    const su = say("user_msg", w("小店网站的订单页打不开，帮我修一下。", "The order page on my shop's site won't open. Fix it please."), undefined, 11, `channel:${sid}`, sid);
    say("ai_msg", w("我去看看订单页，修好了告诉你。", "I'll look at the order page and tell you when it's fixed."), su.seq, 11, `channel:${sid}`, sid);
    say("ai_msg", w("合并了，订单页能用了。", "Merged. The order page works now."), su.seq, 20, `channel:${sid}`, sid);
    log.append({
      stream: `channel:${sid}`,
      persona: sid,
      origin: "system",
      kind: "subject_card",
      body: { card: { key: "pr:acme/shop#612", msgSeq: su.seq, title: w("小店网站的订单页", "The order page on my shop's site"), state: "done", line: w("PR #612 合并了", "PR #612 merged"), took: 9 * 60_000, at: at(20) } },
    } as never);
    console.log(`[demo] second partner ${sid} (${second.partner.name})`);
  }
}
console.log(`[demo] up at http://127.0.0.1:${core.port}/app (stage: ${stage}, data: ${core.dataDir})`);
