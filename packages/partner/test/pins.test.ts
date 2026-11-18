// D381: 置顶 / Pin from the partner's side. A block with "pin":true becomes a pin; one with
// "pin":"<id>" replaces that pin in place (ticks carried by their words, or set by "ticked"); an
// unknown id or a full strip pins nothing; every turn carries the [pinned] line while anything is.
import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies } from "../../protocol/src/index.ts";
import { PINS_MAX } from "../../protocol/src/pins.ts";
import { openPins } from "../../core/src/pins.ts";
import { createPartner } from "../src/index.ts";
import { renderPins } from "../src/partner.ts";
import { FakeClock, fakeCore, fakeRunner } from "./fakes.ts";

const fence = (o: object) => "```ducter-ui\n" + JSON.stringify(o) + "\n```";

/** A partner whose n-th turn says replies[n] (pushed as the test goes), over a real pins store. */
function setup() {
  const clock = new FakeClock();
  const dir = mkdtempSync(join(tmpdir(), "ducter-partner-pins-"));
  const base = fakeCore(clock, dir);
  const pins = openPins({ dataDir: dir, log: base.core.log, now: () => new Date(clock.now()) });
  base.core.pins = pins;
  const inputs: string[] = [];
  const replies: string[] = [];
  const fr = fakeRunner((input, s, n) => {
    inputs.push(input);
    s.say(replies[n] ?? "好。");
    s.end();
  });
  fr.bindCards(base.cards);
  const partner = createPartner(base.core, fr.runner, { now: clock.now, persistState: false, onError: () => {}, settleMs: 0 });
  const say = async (text: string) => {
    partner.onTrigger(base.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text } }));
    await partner.idle();
    clock.advance(1000);
  };
  const last = () => base.core.log.read({ stream: "channel", kinds: ["ai_msg"], limit: 50 }).at(-1)!;
  return { partner, pins, inputs, replies, say, last };
}

const LIST = { type: "checklist", title: "打包清单", items: ["护照", "充电器", "雨伞"] };

test('"pin": true pins the block; the message carries its id; the next turn sees it', async () => {
  const s = setup();
  s.replies.push(`给你，置顶了。\n\n${fence({ ...LIST, pin: true })}`);
  await s.say("给我列个打包清单，置顶");
  const ev = s.last();
  const ui = (ev.body as Bodies["ai_msg"]).ui!;
  expect(ui[0]!.pin).toMatch(/^p[a-z0-9]+$/);
  const [p] = s.pins.list();
  expect(p).toMatchObject({ id: ui[0]!.pin, title: "打包清单", seq: ev.seq, index: 0, ticks: [], version: 1 });
  expect(p!.ui).not.toHaveProperty("pin");
  s.pins.tick(p!.id, "护照", true);
  await s.say("还差什么？");
  expect(s.inputs.at(-1)).toContain("[pinned]");
  expect(s.inputs.at(-1)).toContain(`${p!.id} checklist "打包清单": ticked: 护照; not yet: 充电器 | 雨伞`);
  await s.partner.close();
});

test('"pin":"<id>" changes that pin in place; ticks follow their words; "ticked" sets them', async () => {
  const s = setup();
  s.replies.push(`好。\n\n${fence({ ...LIST, pin: true })}`);
  await s.say("列个清单置顶");
  const id = s.pins.list()[0]!.id;
  s.pins.tick(id, "护照", true);
  const items = ["护照", "充电器", "充电宝"];
  s.replies.push(`加上了。\n\n${fence({ ...LIST, items, pin: id })}`);
  await s.say("加上充电宝，雨伞不用了");
  let p = s.pins.get(id)!;
  expect(s.pins.list()).toHaveLength(1);
  expect(p.ui.type === "checklist" && p.ui.items).toEqual(items);
  expect(p.ticks).toEqual(["护照"]);
  expect(p.version).toBe(2);
  expect(p.seq).toBe(s.last().seq);
  // The older list is that pin, never a second one beside it.
  const [was] = p.was!;
  expect(s.pins.pin(was!.seq, was!.index)).toMatchObject({ ok: true, already: true, pin: { id } });
  expect(s.pins.list()).toHaveLength(1);
  s.replies.push(`划掉了。\n\n${fence({ ...LIST, items, pin: id, ticked: ["护照", "充电宝", "不在里面的"] })}`);
  await s.say("护照和充电宝拿了");
  p = s.pins.get(id)!;
  expect(p.ticks).toEqual(["护照", "充电宝"]);
  expect(p.version).toBe(3);
  await s.partner.close();
});

test("an unknown id pins nothing and the block still shows; a full strip takes no more", async () => {
  const s = setup();
  s.replies.push(`好。\n\n${fence({ type: "table", columns: ["", "A"], rows: [["x", "1"]], pin: "pzzzzzz" })}`);
  await s.say("改一下那个表");
  const ui = (s.last().body as Bodies["ai_msg"]).ui!;
  expect(ui[0]!.type).toBe("table");
  expect(ui[0]!.pin).toBeUndefined();
  expect(s.pins.list()).toHaveLength(0);
  for (let n = 0; n <= PINS_MAX; n++) {
    s.replies.push(`第 ${n} 个。\n\n${fence({ type: "checklist", title: `清单 ${n}`, items: ["a"], pin: true })}`);
    await s.say(`再置顶一个 ${n}`);
  }
  expect(s.pins.list()).toHaveLength(PINS_MAX);
  expect((s.last().body as Bodies["ai_msg"]).ui![0]!.pin).toBeUndefined();
  expect(renderPins(s.pins.list())).toContain(`All ${PINS_MAX} places are taken`);
  await s.partner.close();
});

test("choices are never pinned; nothing pinned, no line", async () => {
  expect(renderPins([])).toBe("");
  const s = setup();
  s.replies.push(`哪个？\n\n${fence({ type: "choices", options: ["foo", "bar"], pin: true })}`);
  await s.say("置顶一下");
  expect((s.last().body as Bodies["ai_msg"]).ui![0]!.pin).toBeUndefined();
  expect(s.pins.list()).toHaveLength(0);
  await s.partner.close();
});
