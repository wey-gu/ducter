// D537: a demo core for 分享到 Ducter / Share to Ducter: two partners (the default and 小家 / Home),
// so the share sheet shows its picker, and a pretend partner that answers a share the way the
// persona asks for (short; no note: one line offering the obvious thing). The iPhone app in the
// Simulator pairs with it (DEMO_PAIR=1) and sends through POST /api/media and POST /api/share.
//   DUCTER_PORT=7841 DUCTER_DATA_DIR=/tmp/x DEMO_LANG=zh DEMO_PAIR=1 bun apps/web/demo-share.ts
import type { Bodies } from "@ducter/protocol";
import { shareParts } from "@ducter/protocol";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const core = startCore({ ooSource: noOo, partners: true, persona: { id: "default", name: "Ducter", identity: "" }, hostname: process.env.DUCTER_HOST || "127.0.0.1" });
core.setRunner(stubRunner(core));
if (core.partners.list().length < 2) core.partners.add({ name: zh ? "小家" : "Home", look: "sage", about: zh ? "家里的事、看病、孩子" : "home, the doctor, the kids" });

core.setPartner({
  onTrigger(e) {
    if (e.kind !== "user_msg") return;
    const b = e.body as Bodies["user_msg"];
    if (b.via !== "share" || !b.shared) return;
    const { note } = shareParts(b.text, b.shared);
    const pics = (b.media ?? []).filter((m) => m.type.startsWith("image/")).length;
    const files = (b.media ?? []).length - pics;
    const text = note
      ? zh
        ? b.shared.link
          ? "好，我开个任务读一下这篇，读完把要点告诉你。"
          : "记下了，下周一早上提醒你。"
        : b.shared.link
          ? "On it: a task is reading the page; I'll send you the gist."
          : "Noted. I'll remind you on Monday morning."
      : zh
        ? b.shared.link
          ? "收到一篇文章。要我读完给你总结一下吗？"
          : files
            ? "收到这个文件。要我看一遍，挑出要紧的告诉你吗？"
            : pics
              ? "收到照片了。要我记下来，还是帮你看看里面写了什么？"
              : "收到。要我记下来吗？"
        : b.shared.link
          ? "Got the article. Want a summary?"
          : files
            ? "Got the file. Want me to read it and pull out what matters?"
            : pics
              ? "Got the photo. Keep it, or read what's in it?"
              : "Got it. Want me to keep it?";
    setTimeout(() => core.log.append({ stream: e.stream, origin: "partner", kind: "ai_msg", body: { text, replyTo: e.seq } as Bodies["ai_msg"] }), 700);
  },
});
console.log(`[demo-share] http://127.0.0.1:${core.port}/app`);
