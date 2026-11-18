// A demo core for D381: 置顶 / Pin. A packing list for the Osaka trip and a side-by-side of two
// Macs, made by the partner in the conversation; pinned, ticked on another device, then changed in
// place when the person asks. For screenshots of the web and Mac clients.
//   DUCTER_PORT=7981 DUCTER_DATA_DIR=/tmp/x DEMO_LANG=zh DEMO_STAGE=2 bun apps/web/demo-pins.ts
// DEMO_STAGE: 1 = the list in the conversation, not pinned yet (its corner says 置顶);
//             2 = the list and the table pinned, two items ticked (the strip, 已置顶 on the cards);
//             3 = "加上充电宝": the partner's new list stands in for the pinned one (version 2).
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import { parseRich } from "@ducter/protocol";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const stage = Number(process.env.DEMO_STAGE ?? "2");
const core = startCore({
  ooSource: noOo,
  persona: { id: "default", name: "Ducter", identity: "" },
  hostname: process.env.DUCTER_HOST || "127.0.0.1",
  deviceProbes: { cua: async () => ({ missing: "demo" }), harnesses: async () => [{ harness: "claude-code", installed: true, loggedIn: true, canBePartner: true, billing: "plan" }], kind: async () => "laptop" },
});
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
const log = core.log;
const tick = () => Bun.sleep(30);
const fence = (o: object) => "```ducter-ui\n" + JSON.stringify(o) + "\n```";

const w = zh
  ? {
      ask: "12 月 20 号去大阪，帮我列个要带的东西，我一边收拾一边勾",
      said: "给你，收拾的时候勾掉就行。",
      title: "大阪行李清单",
      items: ["护照", "日元现金", "充电器和转换插头", "ICOCA 卡", "折叠伞", "酒店确认单"],
      macAsk: "Mac mini M4 和 MacBook Air M4 放一起比一下：一个 599 美元、一直插电放家里，一个 999 美元、带电池跟着我走，都是 16 GB。哪个适合一直开着做你的家？",
      macSaid: "做家选 Mac mini：便宜，一直插着电。",
      macTitle: "两台 Mac 做家",
      cols: ["", "Mac mini M4", "MacBook Air M4"],
      rows: [["价格", "$599", "$999"], ["内存", "16 GB", "16 GB"], ["供电", "一直插电", "电池"], ["放在哪", "家里", "跟着你"]],
      more: "清单里加上充电宝",
      moreSaid: "加上了，放在充电器后面。",
      power: "充电宝",
    }
  : {
      ask: "I'm off to Osaka on Dec 20. Make me a list of what to pack; I'll tick it as I go",
      said: "Here you go: tick them off as you pack.",
      title: "Osaka packing list",
      items: ["Passport", "Yen in cash", "Charger and plug adapter", "ICOCA card", "Folding umbrella", "Hotel confirmation"],
      macAsk: "Put these side by side: Mac mini M4, $599, 16 GB, always plugged in at home; MacBook Air M4, $999, 16 GB, on battery, comes with me. Which is the better always-on home for you?",
      macSaid: "The Mac mini: cheaper, and always plugged in.",
      macTitle: "Two Macs as a home",
      cols: ["", "Mac mini M4", "MacBook Air M4"],
      rows: [["Price", "$599", "$999"], ["Memory", "16 GB", "16 GB"], ["Power", "Always plugged in", "Battery"], ["Lives", "At home", "With you"]],
      more: "Add a power bank to the list",
      moreSaid: "Added, right after the charger.",
      power: "Power bank",
    };

/** A partner message with its blocks, as the partner's own path stores it (parseRich), then pins. */
const partnerSays = (text: string) => {
  const r = parseRich(text, zh ? "zh" : "en");
  if (r.pins.length) for (const [i, id] of core.pins.claim(r.pins)) r.ui[i] = { ...r.ui[i]!, pin: id };
  const e = log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: r.text, ...(r.ui.length ? { ui: r.ui } : {}) } });
  if (r.pins.length) core.pins.put(e.seq, r.ui, r.pins);
  return e.seq;
};

log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: w.macAsk } });
const macSeq = partnerSays(`${w.macSaid}\n\n${fence({ type: "table", title: w.macTitle, columns: w.cols, rows: w.rows })}`);
await tick();
log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: w.ask } });
const listSeq = partnerSays(`${w.said}\n\n${fence({ type: "checklist", title: w.title, items: w.items })}`);
await tick();
if (stage >= 2) {
  core.pins.pin(macSeq, 0);
  await tick();
  const r = core.pins.pin(listSeq, 0);
  if (!r.ok) throw new Error(`demo-pins: ${r.error}`);
  core.pins.tick(r.pin.id, w.items[0]!, true);
  core.pins.tick(r.pin.id, w.items[3]!, true);
  if (stage >= 3) {
    await tick();
    log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: w.more } });
    const items = [...w.items.slice(0, 3), w.power, ...w.items.slice(3)];
    partnerSays(`${w.moreSaid}\n\n${fence({ type: "checklist", title: w.title, items, pin: r.pin.id })}`);
  }
}
console.log(`demo-pins ready on :${process.env.DUCTER_PORT ?? "?"} (stage ${stage}, ${zh ? "zh" : "en"})`);
