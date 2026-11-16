// D303: the partner's ```ducter-ui blocks become a message's ui, standing in its text as plain
// lines (what chat apps, pushes and copies get); a bad block is left out and the partner reads so.
import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies } from "../../protocol/src/index.ts";
import { createPartner } from "../src/index.ts";
import { renderHistoryLine } from "../src/render.ts";
import { FakeClock, fakeCore, fakeRunner, type Script } from "./fakes.ts";

function run(words: string) {
  const clock = new FakeClock();
  const base = fakeCore(clock, mkdtempSync(join(tmpdir(), "ducter-partner-rich-")));
  const script: Script = (_i, s) => {
    s.say(words);
    s.end();
  };
  const fr = fakeRunner(script);
  fr.bindCards(base.cards);
  const partner = createPartner(base.core, fr.runner, { now: clock.now, persistState: false, onError: () => {}, settleMs: 0 });
  partner.onTrigger(base.core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "又有一个测试时好时坏的，帮我修一下" } }));
  return { partner, log: base.core.log };
}

test("a choices block goes with the message; its text keeps plain lines", async () => {
  const { partner, log } = run('哪个仓库里的？\n\n```ducter-ui\n{"type":"choices","options":["foo","HawDB"]}\n```');
  await partner.idle();
  const msg = log.read({ stream: "channel", kinds: ["ai_msg"], limit: 10 }).map((e) => e.body as Bodies["ai_msg"]).at(-1)!;
  expect(msg.text).toBe("哪个仓库里的？\n\n- foo\n- HawDB");
  expect(msg.ui).toEqual([{ type: "choices", options: ["foo", "HawDB"], plain: "- foo\n- HawDB" }]);
});

test("a block that isn't valid is left out, and the partner's history says so", async () => {
  const { partner, log } = run('Here:\n\n```ducter-ui\n{"type":"chart","kind":"bar","points":[]}\n```');
  await partner.idle();
  const ev = log.read({ stream: "channel", kinds: ["ai_msg"], limit: 10 }).at(-1)!;
  const msg = ev.body as Bodies["ai_msg"];
  expect(msg.text).toBe("Here:");
  expect(msg.ui).toBeUndefined();
  expect(msg.uiDropped).toBe(1);
  expect(renderHistoryLine(ev, {} as never)).toContain("not valid and not shown");
});
