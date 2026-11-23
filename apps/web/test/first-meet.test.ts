// D451: 第一次 / The first time: one line under the thing, once on the first thing on the screen,
// met on the home so no other device shows it; the same words as the Mac.
import { expect, test } from "bun:test";
import { FIRST_MEETS, type Settings } from "@ducter/protocol";
import { firstMeetWords } from "../src/i18n-first-meet.ts";

// The words equal the Mac's, key for key: words.test.ts checks every mirrored table (D488).
test("one line for every moment", () => {
  expect(Object.keys(firstMeetWords.zh).sort()).toEqual(FIRST_MEETS.map((m) => `first.${m}`).sort());
});

test("one plain sentence or two in the partner's voice: no counter word, no joiner, no exclamation", () => {
  for (const v of [...Object.values(firstMeetWords.zh), ...Object.values(firstMeetWords.en)]) {
    expect(v).not.toMatch(/件|·|!|！/);
    expect(v.length).toBeLessThan(120);
  }
  for (const v of Object.values(firstMeetWords.zh)) expect(v).toMatch(/我|它/);
});

test("shown once, on the first thing, until the home says it is met; never on a home too old to keep it", async () => {
  const { A } = await import("../src/app.ts");
  const { firstMeetHere, meet, resetFirstMeet } = await import("../src/first-meet.tsx");
  const sent: unknown[] = [];
  A.send = (f) => void sent.push(f);
  resetFirstMeet();
  A.settings = undefined;
  expect(firstMeetHere("loop", "a")).toBe(false); // no settings yet: nothing
  A.settings = { met: undefined } as unknown as Settings;
  expect(firstMeetHere("loop", "a")).toBe(false); // an older home: nothing
  A.settings = { met: [] } as unknown as Settings;
  expect(firstMeetHere("loop", "a")).toBe(true);
  expect(firstMeetHere("loop", "b")).toBe(false); // only the first thing carries it
  expect(firstMeetHere("look", "b")).toBe(true); // each moment its own
  meet("loop");
  meet("loop");
  expect(sent).toEqual([{ t: "settings_set", patch: { met: ["loop"] } }]);
  // Met: the thing that has it keeps it while this page lives; nothing else ever gets it.
  A.settings = { met: ["loop"] } as unknown as Settings;
  expect(firstMeetHere("loop", "a")).toBe(true);
  expect(firstMeetHere("loop", "c")).toBe(false);
  // Another device, met elsewhere: never.
  resetFirstMeet();
  expect(firstMeetHere("loop", "a")).toBe(false);
});
