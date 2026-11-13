// A demo core for keeping your place in the conversation (D254): a morning's work with the partner,
// read up to the middle, so it opens on 新消息 / New messages; a code block and a link to copy;
// then, with DEMO_DRIP=1, three more of the partner's messages a few seconds apart, to see the
// way back count them while you are scrolled up.
//   DUCTER_PORT=7799 DUCTER_DATA_DIR=/tmp/x DEMO_LANG=zh DEMO_DRIP=1 bun apps/web/demo-follow.ts
import { startCore, stubRunner } from "@ducter/core";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const core = startCore({ ooSource: noOo, persona: { id: "default", name: "Ducter", identity: "" }, hostname: process.env.DUCTER_HOST || "127.0.0.1" });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
const log = core.log;
const tick = () => Bun.sleep(20);

const said: [boolean, string][] = zh
  ? [
      [true, "早，昨晚 CI 怎么样？"],
      [false, "早。昨晚 main 上跑了 3 次 CI，都过了。只有 nightly 的 e2e 慢了一倍，我在看是不是新加的录屏拖慢的。"],
      [true, "好，看完告诉我。顺便把 v0.0.52 的发版说明草稿写一下"],
      [false, "好，我去写发版说明，写好了给你看。"],
      [false, "nightly 慢的原因找到了：录屏在 CI 上没有硬件编码，退回了软件编码。改成只在失败时录，慢的那一半就没了。"],
      [true, "那就这么改"],
      [false, "改好了，这是改动的那一行：\n\n```\nrecord: process.env.CI ? \"on-failure\" : \"always\"\n```\n\n我在本地跑过一遍 e2e，18 分钟降到 9 分钟。"],
      [true, "漂亮"],
      [false, "发版说明的草稿写好了，放在 [PR #412](https://github.com/wey-gu/ducter/pull/412) 里。一共 6 条，最上面是**回到最新**和**拷贝**这两件。"],
      [false, "还有一件：Cloudflare 上 ducter.dev 自动续费的那张卡 11 月底过期，要我提醒你换吗？"],
      [false, "另外，王磊周二问的 HawDB 报价你还没回，他今天上午又问了一次。"],
      [false, "我先把报价单按上次的格式填好了，数字等你看过再发。"],
    ]
  : [
      [true, "Morning. How did CI do overnight?"],
      [false, "Morning. main ran CI three times overnight and all passed. Only the nightly e2e took twice as long; I'm checking whether the new screen recording slowed it."],
      [true, "OK, tell me when you know. And draft the release notes for v0.0.52"],
      [false, "On it: drafting the release notes; I'll show you when they're ready."],
      [false, "Found why the nightly is slow: CI has no hardware encoder, so the recording fell back to software. Recording only on failure takes the slow half away."],
      [true, "Do that"],
      [false, "Done. The one line that changed:\n\n```\nrecord: process.env.CI ? \"on-failure\" : \"always\"\n```\n\nI ran the e2e locally: 18 minutes down to 9."],
      [true, "Nice"],
      [false, "The release notes draft is in [PR #412](https://github.com/wey-gu/ducter/pull/412). Six items; **Jump to latest** and **Copy** are at the top."],
      [false, "One more: the card that auto-renews ducter.dev on Cloudflare expires at the end of November. Want a reminder to change it?"],
      [false, "Also, Wang Lei's HawDB quote from Tuesday is still unanswered; he asked again this morning."],
      [false, "I filled in the quote in last time's format; the numbers wait for your look before it goes."],
    ];

// Read up to the 8th message ("漂亮" / "Nice"): the four after it are new.
let readTo = 0;
for (const [i, [mine, text]] of said.entries()) {
  const e = mine ? log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text } }) : log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text } });
  if (i === 7) readTo = e.seq;
  await tick();
}
log.append({ stream: "channel", origin: "user", kind: "read_receipt", body: { upToSeq: readTo } });

if (process.env.DEMO_DRIP === "1") {
  const drip = zh
    ? ["报价单我放在「下载」里了：HawDB-quote-1113.pdf。", "Cloudflare 那张卡我先不动，等你说。", "nightly 刚跑完，9 分 12 秒，稳了。"]
    : ["The quote is in Downloads: HawDB-quote-1113.pdf.", "I'll leave the Cloudflare card alone until you say.", "The nightly just finished: 9 min 12 s. Steady."];
  setTimeout(async () => {
    for (const text of drip) {
      log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text } });
      await Bun.sleep(Number(process.env.DEMO_DRIP_MS ?? "3000"));
    }
  }, Number(process.env.DEMO_DRIP_AFTER ?? "8000"));
}

console.log(`[demo] up at http://127.0.0.1:${core.port}/app (data: ${core.dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
