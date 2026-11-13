// D250: a home that said 不再需要 to the morning note before the notes got better (NOTES_REV) hears
// it offered back once, in the partner's own voice, the next time the person writes; no answer
// keeps 只说急的; either answer is a choice (never offered again). A mode the person chose in
// Settings is never re-offered.
import { afterEach, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PROACTIVE_FILE } from "../src/proactive/engine.ts";
import { SETTINGS_FILE } from "../src/settings.ts";
import { tempDir } from "./helpers.ts";
import { rig, type Rig } from "./proactive-rig.ts";

const rigs: Rig[] = [];
const dirs: (() => void)[] = [];
afterEach(() => {
  rigs.splice(0).forEach((r) => r.stop());
  dirs.splice(0).forEach((f) => f());
});
const make = (...a: Parameters<typeof rig>) => {
  const r = rig(...a);
  rigs.push(r);
  return r;
};
const say = async (r: Rig, text: string) => {
  r.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text } });
  await r.settle();
};

/**
 * A home as a core before D250 left it: 只说急的 with no source kept, the state file from before
 * NOTES_REV, and (when `saidNo`) 不再需要 answered to 早上那条还要吗？ in the Log.
 */
async function before(saidNo: boolean, language: "zh" | "en" = "zh"): Promise<string> {
  const t = tempDir();
  dirs.push(t.cleanup);
  const r = rig({ dir: t.dir, language });
  if (saidNo) {
    r.log.append({ stream: "channel", origin: "partner", kind: "finds", body: { noteId: "note_k", rung: "morning", opening: "早上那条还要吗？", finds: [], ask: "keep_note" } });
    r.log.append({ stream: "channel", origin: "partner", kind: "finds", body: { noteId: "note_k2", rung: "morning", opening: "早上那条还要吗？", finds: [], ask: "keep_note", revises: "note_k", answered: "no" } });
  }
  r.stop();
  const sp = join(t.dir, SETTINGS_FILE);
  writeFileSync(sp, JSON.stringify({ ...JSON.parse(readFileSync(sp, "utf8")), proactive: "urgent" }));
  const pp = join(t.dir, PROACTIVE_FILE);
  const st = JSON.parse(readFileSync(pp, "utf8"));
  delete st.notesRev;
  writeFileSync(pp, JSON.stringify(st));
  return t.dir;
}

test("不再需要 before D243: offered back once when they next write; 好 brings the morning note back, as a choice", async () => {
  const dir = await before(true);
  const r = make({ dir });
  expect(r.settings.get().proactive).toBe("urgent");
  expect(r.notes()).toHaveLength(2); // nothing said at start
  await say(r, "帮我看看日程");
  const again = r.lastNote()!;
  expect(again).toMatchObject({ rung: "morning", ask: "note_again", finds: [], opening: "现在我能提前告诉你航班、维护、扣费这些了。要每天早上说几件吗？" });
  expect(r.sent).toHaveLength(0); // a line in the conversation, never a notification
  await say(r, "还有呢");
  expect(r.notes().filter((e) => e.body.ask === "note_again")).toHaveLength(1); // once
  await r.p.answer(again.noteId, "note_again", true);
  expect(r.lastNote()).toMatchObject({ revises: again.noteId, answered: "yes" });
  expect(r.settings.get()).toMatchObject({ proactive: "three", proactiveBy: "chosen" });
});

test("no answer keeps 只说急的; 不用 is a choice too, and nothing is offered again after a restart", async () => {
  const dir = await before(true, "en");
  let r = make({ dir, language: "en" });
  await say(r, "what's on today?");
  const again = r.lastNote()!;
  expect(again).toMatchObject({ ask: "note_again", opening: "I can now tell you about flights, maintenance and billing changes ahead of time. Want a few each morning?" });
  await r.advance(2 * 3_600_000);
  expect(r.settings.get().proactive).toBe("urgent"); // the default is hold: nothing changes on its own
  await r.p.answer(again.noteId, "note_again", false);
  expect(r.settings.get()).toMatchObject({ proactive: "urgent", proactiveBy: "chosen" });
  r.stop();
  rigs.splice(rigs.indexOf(r), 1);
  r = make({ dir, language: "en" });
  await say(r, "thanks");
  expect(r.notes().filter((e) => e.body.ask === "note_again" && !e.body.revises)).toHaveLength(1);
});

test("只说急的 chosen in Settings (or before D250 without 不再需要): never offered back", async () => {
  const legacy = await before(false);
  const a = make({ dir: legacy });
  await say(a, "帮我看看日程");
  expect(a.notes().filter((e) => e.body.ask === "note_again")).toHaveLength(0);

  const b = make({ mode: "urgent" });
  expect(b.settings.get().proactiveBy).toBe("chosen");
  await say(b, "帮我看看日程");
  expect(b.notes().filter((e) => e.body.ask === "note_again")).toHaveLength(0);
});

test("a choice made before they next write cancels the offer", async () => {
  const dir = await before(true);
  const r = make({ dir });
  r.settings.set({ proactive: "useful" });
  await say(r, "帮我看看日程");
  expect(r.notes().filter((e) => e.body.ask === "note_again")).toHaveLength(0);
  expect(r.settings.get()).toMatchObject({ proactive: "useful", proactiveBy: "chosen" });
});
