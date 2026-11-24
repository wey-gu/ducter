// D509: older messages page in. The store folds an older page on its own and joins it in front:
// the conversation reads the same as one folded in order. The fixture is the one the Mac's store
// test and core's paging test read too.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { LogEvent, ServerFrame } from "@ducter/protocol";
import fixture from "../../../packages/protocol/fixtures/older-pages.json";
import { Store } from "../src/store.ts";
import { strings } from "../src/i18n.ts";

const events = fixture.events as unknown as LogEvent[];
const welcome = { t: "welcome", persona: "default", personaName: "Ducter", headSeq: 16 } as ServerFrame;

/** What the conversation shows: each row's place and what it says, and the state it is drawn with. */
function shown(s: Store) {
  return {
    rows: s.channel.map((e) => [e.firstSeq, e.ev.kind, e.user?.text ?? e.ai?.text ?? e.job?.status?.text ?? e.job?.ack?.text ?? e.living?.items.map((i) => i.text).join() ?? ""]),
    job: s.jobs.get("job_ci")?.status?.state,
    decision: s.decisions.get("d_retry")?.resolved?.option,
    question: s.decisions.get("d_retry")?.question,
    waiters: [...s.waiters.keys()],
    readUpTo: s.readUpTo,
  };
}

test("the newest stretch, then the older page, reads as the whole conversation folded in order", () => {
  const all = new Store();
  all.apply(welcome);
  all.apply({ t: "events", events: events.filter((e) => e.seq !== 5) } as ServerFrame);

  const s = new Store();
  s.apply(welcome);
  s.apply({ t: "events", events: events.filter((e) => e.seq >= fixture.cut) } as ServerFrame);
  expect(s.older.from).toBe(fixture.cut);
  expect(s.moreOlder()).toBe(true);
  s.older.asked = fixture.cut;
  expect(s.moreOlder()).toBe(false); // one page at a time
  s.apply({ t: "channel_history", beforeSeq: fixture.cut, more: false, events: events.filter((e) => e.seq < fixture.cut && e.seq !== 5) } as ServerFrame);
  expect(shown(s)).toEqual(shown(all));
  expect(s.older).toEqual({ from: 1, done: true, asked: 0 });
  expect(s.moreOlder()).toBe(false);
  // Its newest status, its resolution, and the wait that fired is not armed again.
  expect(shown(s).job).toBe("done");
  expect(shown(s).decision).toBe("hold");
  expect(shown(s).waiters).toEqual([]);
});

test("a page nobody asked for (another partner's, an old socket's) changes nothing", () => {
  const s = new Store();
  s.apply(welcome);
  s.apply({ t: "events", events: events.filter((e) => e.seq >= fixture.cut) } as ServerFrame);
  const before = shown(s);
  s.apply({ t: "channel_history", beforeSeq: fixture.cut, more: false, events: events.filter((e) => e.seq < fixture.cut) } as ServerFrame);
  expect(shown(s)).toEqual(before);
  // A new socket: the page asked on the old one never comes; it can be asked again.
  s.older.asked = fixture.cut;
  s.apply(welcome);
  expect(s.moreOlder()).toBe(true);
});

test("pages until the home says there are none, each in front of the last", () => {
  const s = new Store();
  s.apply(welcome);
  s.apply({ t: "events", events: events.filter((e) => e.seq >= 14) } as ServerFrame);
  s.older.asked = 14;
  s.apply({ t: "channel_history", beforeSeq: 14, more: true, events: events.filter((e) => e.seq >= 9 && e.seq < 14) } as ServerFrame);
  expect(s.older).toEqual({ from: 9, done: false, asked: 0 });
  s.older.asked = 9;
  s.apply({ t: "channel_history", beforeSeq: 9, more: false, events: events.filter((e) => e.seq < 9 && e.seq !== 5) } as ServerFrame);
  expect(s.channel.map((e) => e.firstSeq)).toEqual([...s.channel.map((e) => e.firstSeq)].sort((a, b) => a - b));
  expect(s.channel[0]!.user?.text).toBe("把 CI 上那个时好时坏的测试修一下");
  expect(s.older.done).toBe(true);
});

test("the conversation asks as the reader nears its top, keeps the line read, and says it quietly", () => {
  const src = (f: string) => readFileSync(join(import.meta.dir, `../src/${f}`), "utf8");
  const views = src("views.tsx");
  expect(views).toContain("useOlder(scroller, rows)");
  expect(views).toContain("<OlderWait />");
  // The person's own older messages landing above are never a send (the end is not taken back).
  expect(src("conv-follow.tsx")).toContain("mine.seq > s.mine.seq || mine.pending > s.mine.pending");
  expect(src("app.ts")).toContain('t: "channel_history", beforeSeq: before');
  const css = readFileSync(join(import.meta.dir, "../static/app.css"), "utf8");
  // The line takes no room, so nothing moves when it comes or goes.
  expect(css).toMatch(/\.scroll > \.older-wait \{[^}]*height: 0;[^}]*margin-bottom: -12px;/);
  expect(css).toMatch(/\.scroll\[role="log"\] \{\s*overflow-anchor: none;/);
  expect(strings("zh").t("conv.older")).toBe("正在载入更早的消息");
  expect(strings("en").t("conv.older")).toBe("Loading earlier messages");
});
