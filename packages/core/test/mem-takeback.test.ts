// D444: 别记这个 / "don't remember that", said right after the partner noted something, takes it back
// the moment the words land: only the reply's Noted lines, only a take-back and nothing else.
import { afterEach, expect, test } from "bun:test";
import { openLog } from "../src/log.ts";
import { readTakeBack, takeBackAtOnce, TAKE_BACK_MS } from "../src/mem-takeback.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => void)[] = [];
afterEach(() => {
  for (const s of stops.reverse()) s();
  stops = [];
});

test("a take-back and nothing else, in Chinese and English", () => {
  for (const s of ["别记这个", "别记这个。", "算了，别记这个", "这条不用记", "这个别记了", "不用记了", "不要记住这个", "忘了它吧", "把这条忘掉", "don't remember that", "Don't save this.", "forget that", "no, don't keep that", "Please don't remember it"])
    expect([s, readTakeBack(s)]).toEqual([s, true]);
  for (const s of ["别记这个，帮我改成周五", "记住这个", "不用记账了，我自己来", "帮我记一下明天开会", "forget about the meeting tomorrow, it's cancelled", "remember that", "别忘了明天开会", ""])
    expect([s, readTakeBack(s)]).toEqual([s, false]);
});

function rig() {
  const t = tempDir();
  stops.push(t.cleanup);
  let at = Date.parse("2026-11-21T10:00:00.000Z");
  const clock = { now: () => at, setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (h: unknown) => clearTimeout(h as never) };
  const log = openLog({ path: `${t.dir}/log.db`, persona: "p", clock });
  stops.push(() => log.close());
  const undone: number[] = [];
  const tb = takeBackAtOnce({ log, undo: async (seq) => (undone.push(seq), true) });
  stops.push(tb.stop);
  const user = (text: string) => log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text } });
  const noted = (title: string) => log.append({ stream: "channel", origin: "partner", kind: "memory_noted", body: { title, memoryId: `m-${title}` } });
  return { log, tb, undone, user, noted, later: (ms: number) => (at += ms) };
}

test("别记这个 takes back what the reply to the previous message noted, at once", () => {
  const r = rig();
  r.user("以后 commit message 都用英文");
  r.log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: "好，以后都用英文。" } });
  const n = r.noted("commit message 用英文");
  const said = r.user("算了，别记这个");
  expect(r.undone).toEqual([n.seq]);
  expect(r.tb.heardFrom(said.seq)).toEqual([{ seq: n.seq, title: "commit message 用英文" }]);
});

test("nothing noted since the previous message, or longer words: nothing taken back", () => {
  const r = rig();
  r.user("以后 commit message 都用英文");
  r.noted("commit message 用英文");
  r.user("帮我看看 CI");
  const said = r.user("别记这个");
  expect(r.undone).toEqual([]);
  expect(r.tb.heardFrom(said.seq)).toEqual([]);
  r.noted("另一条");
  const longer = r.user("别记这个，改成以后都用中文");
  expect(r.undone).toEqual([]);
  expect(r.tb.heardFrom(longer.seq)).toEqual([]);
});

test("a noted line older than the window is not taken back by a bare 别记这个", () => {
  const r = rig();
  r.user("以后都用 pnpm");
  r.noted("pnpm");
  r.later(TAKE_BACK_MS + 60_000);
  r.user("别记这个");
  expect(r.undone).toEqual([]);
});
