// A demo core for the waiting line while the partner works (D104, D425): the person asks about
// applying for an ITIN, a task is already at it, and they ask how it is going. DEMO_STAGE picks the
// moment held on screen:
//   thinking · recalling · checking (on the task, by its name) · calendar · web · slow (past 15 s) ·
//   long (past 45 s) · reply (the answer has landed) · cycle (the whole turn, step by step, then the
//   reply, starting DEMO_DELAY_MS after launch, default 4 s; for clips)
//   DUCTER_PORT=7982 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh DEMO_STAGE=cycle bun apps/web/demo-alive.ts
// then open http://127.0.0.1:7982/app (#onhand for the task at work). No model, no web.
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const w = (z: string, e: string) => (zh ? z : e);
const stage = process.env.DEMO_STAGE ?? "cycle";
const core = startCore({ ooSource: noOo, persona: { id: "default", name: zh ? "小鸭" : "Duckie", identity: "" }, hostname: process.env.DUCTER_HOST || "127.0.0.1", bridgeLink: { run: async () => undefined, env: {} } });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en" });
const log = core.log;

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const say = (origin: "user" | "partner", text: string, replyTo?: number) =>
  log.append({ stream: "channel", origin, kind: origin === "user" ? "user_msg" : "ai_msg", body: origin === "user" ? { text } : { text, ...(replyTo !== undefined ? { replyTo } : {}) } } as never);

// Earlier: the ask, the ack, and the task it opened, at work since.
const title = w("查 ITIN 的申请材料", "Look into the ITIN application");
const u0 = say("user", w("我下个月要在美国报税，没有 SSN，ITIN 要怎么申请？", "I'm filing US taxes next month and have no SSN. How do I apply for an ITIN?"));
log.append({ stream: "channel", origin: "partner", kind: "ack", body: { jobId: "j_itin", text: w("好，我去查 ITIN 的申请材料和路线，一般十来分钟，查清楚了告诉你。", "On it: looking into what an ITIN application needs and the way to send it, usually about 10 min; I'll tell you when it's clear."), replyTo: u0.seq } });
log.append({ stream: "task:t_itin", origin: "partner", kind: "task_open", body: { taskId: "t_itin", title, project: "", place: { kind: "none" }, harness: "claude-code", model: "sonnet", brief: "Find what an ITIN application (W-7) needs, where to send it, and the fastest route." } as never });
core.tasks.setState("t_itin", "working", "hot");
const step = (role: "tool" | "assistant", x: Record<string, unknown>) => log.append({ stream: "task:t_itin", origin: "task", kind: "task_event", body: { taskId: "t_itin", role, ...x } } as never);
step("tool", { tool: { name: "WebFetch", input: { url: "https://www.irs.gov/forms-pubs/about-form-w-7" }, output: "ok", ok: true } });
step("assistant", { text: w("在看 IRS 的 W-7 说明和材料清单。", "Reading the IRS page on Form W-7 and its document list.") });
log.append({ stream: "task:t_itin", origin: "task", kind: "report", body: { taskId: "t_itin", state: "progress", summary: w("在比较三条路：寄 IRS、找认证代理、去 IRS 办公室当面办", "Comparing three routes: mail to the IRS, a certifying agent, or an IRS office in person"), questions: [], evidence: [] } });

// Now: "how is it going?"
const u1 = say("user", w("ITIN 那个查得怎么样了？", "How's the ITIN one going?"));
const reply = w("材料基本清楚了：W-7 表、护照原件或公证件、加上今年的报税表一起交。最快是找认证代理，不用寄护照。它在比较三条路的时间，十分钟内给你结论。", "The documents are mostly clear: Form W-7, your passport (original or certified copy) and this year's return, sent together. The quickest is a certifying agent, so your passport never goes in the mail. It's comparing how long each route takes; you'll have the answer within ten minutes.");

const at = (msAgo = 0) => new Date(Date.now() - msAgo).toISOString();
const turnSince = at(400);
type Step = { step: "thinking" | "recalling" | "checking_task" | "looking" | "web"; about?: string; source?: "calendar" | "todos" | "accounts" };
const set = (s: Step | null, stepAgoMs = 0, since = turnSince) => core.activity?.set(s ? ({ ...s, since, stepSince: at(stepAgoMs) } as never) : null);
const checking: Step = { step: "checking_task", about: title };
switch (stage) {
  case "thinking":
    set({ step: "thinking" }, 300, at(300));
    break;
  case "recalling":
    set({ step: "recalling" }, 600);
    break;
  case "checking":
    set(checking, 900);
    break;
  case "calendar":
    set({ step: "looking", source: "calendar" }, 900);
    break;
  case "web":
    set({ step: "web", about: w("ITIN 认证代理怎么预约", "how to book an ITIN certifying agent") }, 1200);
    break;
  case "slow":
    set(checking, 17_000, at(18_000));
    break;
  case "long":
    set(checking, 48_000, at(50_000));
    break;
  case "reply":
    say("partner", reply, u1.seq);
    break;
  default: {
    // The whole turn as a live one paces itself, for clips.
    let shown: number[] = [];
    const run = () => {
      for (const h of shown) clearTimeout(h);
      const since = at();
      const plan: [number, Step | null][] = [
        [0, { step: "thinking" }],
        [900, { step: "recalling" }],
        [2600, checking],
        [5200, { step: "web", about: w("ITIN 认证代理怎么预约", "how to book an ITIN certifying agent") }],
      ];
      shown = plan.map(([ms, s]) => setTimeout(() => set(s, 0, since), ms) as unknown as number);
      shown.push(
        setTimeout(() => {
          say("partner", reply, u1.seq);
          set(null);
        }, 8600) as unknown as number,
      );
    };
    if (stage === "cycle") setTimeout(run, Number(process.env.DEMO_DELAY_MS ?? 4000));
  }
}
console.log(`[demo] up at http://127.0.0.1:${core.port}/app (data: ${core.dataDir})`);
