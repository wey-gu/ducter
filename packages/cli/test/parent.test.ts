import { describe, expect, test } from "bun:test";
import { parentGone, parentPid, watchParent, type ParentProbe } from "../src/parent.ts";

describe("parent watch", () => {
  test("reads DUCTER_PARENT_PID", () => {
    expect(parentPid({ DUCTER_PARENT_PID: "4242" })).toBe(4242);
    expect(parentPid({})).toBeUndefined();
    expect(parentPid({ DUCTER_PARENT_PID: "1" })).toBeUndefined(); // launchd is never "the app"
    expect(parentPid({ DUCTER_PARENT_PID: "x" })).toBeUndefined();
  });

  test("gone when the pid is dead or we were reparented", () => {
    const probe = (alive: boolean, ppid: number): ParentProbe => ({ alive: () => alive, ppid: () => ppid });
    expect(parentGone(10, probe(true, 10))).toBe(false);
    expect(parentGone(10, probe(false, 10))).toBe(true);
    expect(parentGone(10, probe(true, 1))).toBe(true);
  });

  test("calls onGone once", async () => {
    let alive = true;
    let calls = 0;
    const stop = watchParent(10, () => calls++, { alive: () => alive, ppid: () => 10 }, 5);
    await Bun.sleep(20);
    expect(calls).toBe(0);
    alive = false;
    await Bun.sleep(30);
    expect(calls).toBe(1);
    stop();
  });

  test("the real probe sees this process's parent", () => {
    expect(parentGone(process.ppid)).toBe(false);
  });
});
