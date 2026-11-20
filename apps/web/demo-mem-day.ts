// D444: a demo core for Nowledge Mem in the person's day: a message from their Codex that hands over a
// file from Mem (named on its line), "你都记得我些什么？" answered in a few warm lines, and a fresh 记下了
// line shown once under the reply with 别记这个. No nmem runs; the Mem steps are stubs.
//   DUCTER_PORT=7981 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh DEMO_STAGE=day bun apps/web/demo-mem-day.ts
// DEMO_STAGE: day (as above) · takeback (then 算了，别记这个: taken back at the word, 好，不记了。)
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const stage = process.env.DEMO_STAGE ?? "day";
const core = startCore({ ooSource: noOo, persona: { id: "default", name: "Ducter", identity: "" }, hostname: process.env.DUCTER_HOST || "127.0.0.1", update: { homeName: "home-server" }, bridgeLink: { run: async () => undefined, env: {} } });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.persona.mem = { agentId: "ducter", owned: true };
core.settings.setMemState("connected");
core.settings.set({ language: zh ? "zh" : "en" });
core.settings.setMemHooks({ undo: async () => true, waiting: () => new Set() });
const log = core.log;

const say = (origin: "user" | "partner", text: string, replyTo?: number) =>
  log.append({ stream: "channel", origin, kind: origin === "user" ? "user_msg" : "ai_msg", body: origin === "user" ? { text } : { text, ...(replyTo !== undefined ? { replyTo } : {}) } } as never);

// Codex hands over its release checklist, kept in Mem.
log.append({
  stream: "channel",
  origin: "peer",
  kind: "bridge_msg",
  body: {
    direction: "in",
    messageId: "m-in-1",
    from: "another agent",
    mine: true,
    agent: "Codex",
    role: zh ? "Mem 协作" : "Mem helper",
    selfNamed: true,
    text: zh ? "0.9 的发布清单放在 nowledgemem://artifacts/a1 了，打 tag 前帮我过一遍。" : "The 0.9 release checklist is at nowledgemem://artifacts/a1; look it over before I tag.",
    refs: [{ uri: "nowledgemem://artifacts/a1", title: zh ? "HawDB 0.9 发布清单" : "HawDB 0.9 release checklist", kind: "artifact", text: "1. bump Cargo.toml 2. CHANGELOG 3. rerun bench" }],
  },
});
say("partner", zh ? "你的 Codex 把 HawDB 0.9 的发布清单发过来了，让我在打 tag 前过一遍。三步都齐，只差重跑基准。要我现在去跑吗？" : "Your Codex sent over the HawDB 0.9 release checklist to look over before tagging. All three steps are there; only the benchmark rerun is left. Shall I run it now?");

const a1 = say("user", zh ? "你都记得我些什么？" : "What do you know about me?");
say(
  "partner",
  zh
    ? "你习惯先看结论、细节放后面，周报每周五下午发给产品组。写 JS 只用 pnpm，测试里一律用假时钟，HawDB 的压测找 Alice。哪条不对、或者不想让我记着，跟我说一声就好。"
    : "You like the conclusion first and the details after, and your weekly report goes to the product team on Friday afternoons. You use pnpm, never npm, fake clocks in tests, and Alice runs the HawDB load tests. If any of that is wrong, or you'd rather I didn't keep it, just tell me.",
  a1.seq,
);

const u = say("user", zh ? "以后我的 commit message 都用英文写。" : "From now on, my commit messages are in English.");
say("partner", zh ? "好，以后都用英文。" : "Got it, English from now on.", u.seq);
const n = log.append({ stream: "channel", origin: "partner", kind: "memory_noted", body: { title: zh ? "commit message 都用英文写" : "Commit messages in English", memoryId: "m-commit", replyTo: u.seq } });

if (stage === "takeback") {
  const t = say("user", zh ? "算了，别记这个" : "Actually, don't remember that");
  await core.settings.undo(n.seq);
  say("partner", zh ? "好，不记了。" : "Okay, not keeping that.", t.seq);
}
console.log(`[demo] up at http://127.0.0.1:${core.port}/app (data: ${core.dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
