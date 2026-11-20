// D431: a demo core for walking the whole apps loop through a real client, with a stand-in partner
// that does what the app tool would (no model): made from a sentence (opens on its first state),
// added to from inside, an ask from inside answered, changed by talking (a budget), the shelf in
// words, deleted by asking. For screenshots of the web and the Mac, before and after D431.
//   DUCTER_PORT=7986 DUCTER_DATA_DIR=/tmp/x DEMO_LANG=zh bun apps/web/demo-apps-walk.ts
// The partner's lines and the file are hand-written stand-ins (the eval's own apps are in its results).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { LogEvent } from "@ducter/protocol";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const core = startCore({
  ooSource: noOo,
  persona: { id: "default", name: "Ducter", identity: "" },
  hostname: process.env.DUCTER_HOST || "127.0.0.1",
  deviceProbes: { cua: async () => ({ missing: "demo" }), harnesses: async () => [{ harness: "claude-code", installed: true, loggedIn: true, canBePartner: true, billing: "plan" }], kind: async () => "laptop" },
});
core.setRunner(stubRunner(core));
const log = core.log;
const persona = core.persona.id;
const file = readFileSync(join(import.meta.dir, "demo-apps-spend.html"), "utf8");
const w = zh
  ? { name: "这个月的花销", made: "做好了。记下第一笔，上面就是这个月的合计。", answer: "这个月目前都在日常范围里，吃饭占得最多。", changed: "加好了：月预算 ¥3,000，还剩多少在合计下面。", note: "加了每月 ¥3,000 的预算", shelf: "都在「你的小应用」里，最上面那排。", removed: "删掉了，连同它记下的东西。", make: /小应用|记.*花/, del: /删/, where: /在哪/ }
  : { name: "Spending this month", made: "Done. Add the first cost and the top becomes this month's total.", answer: "So far this month it's everyday spending, mostly food.", changed: "Added a $3,000 monthly budget; what's left shows under the total.", note: "added a $3,000 monthly budget", shelf: "They're all in Your apps, at the top.", removed: "Deleted, with what it kept.", make: /app|track/i, del: /delete|remove/i, where: /where/i };
const say = (text: string, replyTo: number, extra: Record<string, unknown> = {}) => setTimeout(() => log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text, replyTo, ...extra } }), 700);
let id = "";
core.setPartner({
  onTrigger(e: LogEvent) {
    if (e.kind !== "user_msg") return;
    const b = e.body as { text: string; app?: { id: string; ask?: string } };
    if (b.app?.ask) return say(w.answer, e.seq, { appAnswer: { id: b.app.id, ask: b.app.ask } });
    if (b.app) {
      // Changed by talking, a moment later (a model's turn): the budget turned on in its file, the number in its data.
      const app = b.app.id;
      setTimeout(() => {
        const r = core.apps.change(app, { edits: [{ find: "const BUDGET_ON = false;", replace: "const BUDGET_ON = true;" }], note: w.note });
        if (!r.ok) return say(r.error, e.seq);
        core.apps.put(app, "budget", 3000, "partner");
        say(w.changed, e.seq, { app: { id: r.app.id, name: r.app.name, version: r.app.version, change: "changed" } });
      }, 1500);
      return;
    }
    if (w.where.test(b.text)) return say(w.shelf, e.seq, { shelf: true });
    if (w.del.test(b.text) && id) {
      const m = core.apps.get(id);
      if (m && core.apps.remove(id)) return say(w.removed, e.seq, { app: { id, name: m.name, version: m.version, change: "removed" } });
    }
    if (w.make.test(b.text)) {
      const r = core.apps.make(persona, { name: w.name, html: file, ask: b.text, icon: "coins" });
      if (!r.ok) return say(r.error, e.seq);
      id = r.app.id;
      return say(w.made, e.seq, { app: { id, name: r.app.name, version: 1, change: "made" } });
    }
  },
});
console.log(`demo-apps-walk ready on :${process.env.DUCTER_PORT ?? "?"} (${zh ? "zh" : "en"})`);
