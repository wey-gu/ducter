// A demo core for D403 (research/164): two 在等你回 finds in a morning note, each with its reply
// already written (the thread's language, the person's voice), editable in place, sent on Go
// after a 30-second undo window. DEMO_STAGE=sending shows the first one in its window and the
// second one sent. Synthetic: every person and address is made up; nothing is sent anywhere.
//   DUCTER_PORT=7843 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh DEMO_STAGE=open bun apps/web/demo-drafts.ts
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const sending = process.env.DEMO_STAGE === "sending";
const core = startCore({ ooSource: noOo, persona: { id: "default", name: "Ducter", identity: "" }, hostname: process.env.DUCTER_HOST || "127.0.0.1" });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
const log = core.log;
const H = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();
const now = Date.now();
const w = zh
  ? {
      a: "CamLi 4 天前问你「大文件导入修好了没有」，又问了一次。",
      b: "Kenji 2 天前问你「Plus 买了还是没开通」，还没回。",
      check: "大文件导入的问题修没修好",
      send: "发出去",
      user: "早上好，今天先看看邮件",
      ai: "好。",
    }
  : {
      a: 'CamLi asked you "is large-file import fixed" 4 days ago, and asked again.',
      b: 'Kenji asked you "Plus is paid but not active" 2 days ago, not answered yet.',
      check: "whether large-file import is fixed",
      send: "Send",
      user: "Morning, let's start with mail",
      ai: "Sure.",
    };
log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: w.user } });
log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: w.ai } });
const finds = [
  {
    findId: "f_a",
    kind: "waiting_on_you" as const,
    text: w.a,
    how: [{ src: "mail" as const, what: "大文件导入一直报错", from: "CamLi", at: iso(now - 4 * 24 * H) }, { src: "mail" as const, what: "Re: 大文件导入一直报错", from: "CamLi", at: iso(now - 26 * H) }],
    decisionId: "d_a",
    goLabel: w.send,
    draft: { text: "CamLi 你好，抱歉回晚了。大文件导入的问题我们在查，修好后第一时间告诉你。Wey", to: "CamLi", from: "wey@example.com", subject: "Re: 大文件导入一直报错", lang: "zh", check: w.check },
  },
  {
    findId: "f_b",
    kind: "waiting_on_you" as const,
    text: w.b,
    how: [{ src: "mail" as const, what: "Plus を購入しましたが Not active のままです", from: "Kenji Example", at: iso(now - 2 * 24 * H) }],
    decisionId: "d_b",
    goLabel: w.send,
    draft: { text: "Kenji さん、ご連絡ありがとうございます。お支払いの状況を確認して、すぐにご連絡します。Wey", to: "Kenji Example", subject: "Plus を購入しましたが Not active のままです", lang: "ja" },
  },
];
for (const f of finds) log.append({ stream: "channel", origin: "partner", kind: "decision", body: { decisionId: f.decisionId, question: f.text, goLabel: zh ? "看草稿" : "See the draft", defaultOption: "hold", reversible: false, findId: f.findId, draft: { first: f.draft.text.split("\n")[0]! } } });
log.append({ stream: "channel", origin: "partner", kind: "finds", body: { noteId: "n_m", rung: "morning", opening: zh ? "早。" : "Morning.", finds } });
if (sending) {
  log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: "d_a", option: "go", by: "user" } });
  log.append({ stream: "channel", origin: "system", kind: "find_state", body: { findId: "f_a", kind: "waiting_on_you", state: "sending", until: iso(Date.now() + 28_000) } });
  log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: "d_b", option: "go", by: "user" } });
  log.append({ stream: "channel", origin: "system", kind: "find_state", body: { findId: "f_b", kind: "waiting_on_you", state: "sent" } });
}

console.log(`[demo] up at http://127.0.0.1:${core.port}/app (data: ${core.dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
