// A demo core for D440, a first answer with no plan: a fresh home where nothing can think, the key
// card's 还没有密钥？/ No key yet? with the ways for the home's zone (DEMO_TZ), a pasted key that
// works but whose pi isn't there yet (said at once, "setting up" for DEMO_PREP_MS, then ready),
// and the partner's first answer. Fakes only: no network, no install, no model (the partner is a
// stub whose words are written as the real one says them: packages/partner/src/words.ts "blind").
//   DUCTER_PORT=7975 DUCTER_DATA_DIR=$(mktemp -d) DEMO_TZ=Asia/Shanghai DEMO_LANG=zh bun apps/web/demo-first-answer.ts
// Any key shaped like a DeepSeek or Kimi key works (fake ones: sk- and zeros).
import type { DeviceHarness } from "@ducter/protocol";
import { said } from "../../packages/partner/src/words.ts";
import { startCore } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

if (!process.env.DUCTER_DATA_DIR) throw new Error("set DUCTER_DATA_DIR to a scratch folder");
const lang = process.env.DEMO_LANG ?? "zh";
const prepMs = Number(process.env.DEMO_PREP_MS ?? 8000);
let ready = false;
const harnesses = (): DeviceHarness[] => [
  { harness: "claude-code", installed: false, loggedIn: false, canBePartner: true },
  { harness: "codex", installed: false, loggedIn: false, canBePartner: true },
  { harness: "pi", installed: ready, loggedIn: ready, canBePartner: true, billing: "usage" },
];
const keyFetch = (async (u: string | URL) => {
  await Bun.sleep(500);
  const host = new URL(String(u)).host;
  if (host === "api.deepseek.com") return new Response(JSON.stringify({ is_available: true }), { status: 200 });
  if (host === "api.moonshot.cn") return new Response(JSON.stringify({ data: { available_balance: 15 } }), { status: 200 });
  return new Response("{}", { status: 401 });
}) as typeof fetch;

const core = startCore({
  ooSource: noOo,
  persona: { id: "default", name: "Ducter", identity: "" },
  hostname: "127.0.0.1",
  firstWords: { home: `${process.env.DUCTER_DATA_DIR}/scratch-home`, env: {} },
  update: { homeName: lang === "zh" ? "小林的 MacBook Air" : "Ada’s MacBook Air" },
  keyFetch,
  keyCanRun: (h) => h === "pi" && ready,
  keyPrepare: async () => {
    await Bun.sleep(prepMs);
    ready = true;
    return true;
  },
  keyTz: () => process.env.DEMO_TZ,
  deviceProbes: { cua: async () => null, kind: async () => "laptop", harnesses: async () => harnesses() },
});
// The partner, as a stub: a message while nothing can think gets the code's own line; once the key
// is ready, the waiting message is answered first.
const waiting: string[] = [];
const answer = (_q: string) =>
  core.log.append({
    stream: "channel",
    origin: "partner",
    kind: "ai_msg",
    body: {
      text:
        lang === "zh"
          ? `周末带爸妈吃饭，我会挑离家近、不用排长队、有包间或安静角落的地方。你在哪个城市、爸妈爱吃什么口味？告诉我，我挑三家，连怎么订座一起给你。`
          : `For dinner with your parents this weekend I'd pick somewhere close, quiet, with no long wait. Which city, and what do they like? Tell me and I'll pick three, with how to book each.`,
    },
  });
core.setPartner({
  onTrigger(e) {
    if (e.kind !== "user_msg") return;
    const q = String((e.body as { text?: string }).text ?? "");
    if (!ready) {
      waiting.push(q);
      core.log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: said(lang, "blind") } });
      return;
    }
    answer(q);
  },
});
setInterval(() => {
  if (ready && waiting.length) answer(waiting.splice(0).join(lang === "zh" ? "；" : "; "));
}, 300);
console.log(`[demo-first-answer] ${process.env.DEMO_TZ ?? "(no zone)"} ${lang} on ${core.url}`);
