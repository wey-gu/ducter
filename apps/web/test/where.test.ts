// D157 on the phone: every task says which computer it runs on once there are two, the home by its
// own name ("this Mac" means nothing on a phone); a tap says why there. Same words as the desktop.
import { describe, expect, test } from "bun:test";
import { strings, TABLES } from "../src/i18n.ts";

const devices = (n: 1 | 2) =>
  ({
    t: "devices",
    devices: [
      { id: "local", name: "hel", kind: "server", home: true, state: "awake", alwaysOn: true, harnesses: [], abilities: [{ id: "web", state: "on", where: "ducter" }] },
      ...(n === 2 ? [{ id: "dev_mac", name: "MacBook", kind: "laptop", home: false, state: "asleep", harnesses: [], abilities: [{ id: "web", state: "on", where: "chrome" }] }] : []),
      { id: "c1", name: "iPhone", kind: "phone", home: false, state: "awake", harnesses: [], abilities: [] },
    ],
    reach: { clients: [] },
  }) as any;

describe("where a task runs (D157)", () => {
  test("one computer: nothing; two: the computer and what it uses, with why", async () => {
    const { A } = await import("../src/app.ts");
    const { taskWhere, computerName } = await import("../src/where.ts");
    A.L = strings("zh");
    const task = {
      id: "t1",
      events: [],
      card: { taskId: "t1", title: "淘宝订单", place: { kind: "browser", device: "MacBook", profile: "default" }, harness: "claude-code", attention: "working" },
      body: { harness: "claude-code", why: { kind: "default", where: { device: "MacBook", kind: "signed_in", site: "taobao.com", uses: "chrome" } } },
    } as any;
    A.receive(devices(1));
    expect(taskWhere(task)).toEqual({ line: "", why: "" });
    A.receive(devices(2));
    expect(computerName("local")).toBe("hel");
    expect(taskWhere(task)).toEqual({ line: "在 MacBook 上 · 用你的 Chrome", why: "为什么在 MacBook 上：要用你登录着的 taobao.com" });
    // Moved since: the reason was for the other computer, so only the place is said.
    task.card.place = { kind: "browser", device: "local", profile: "default" };
    expect(taskWhere(task)).toEqual({ line: "在 hel 上", why: "" });
    A.L = strings("en");
    task.card.place = { kind: "browser", device: "MacBook", profile: "default" };
    expect(taskWhere(task).line).toBe("on MacBook · in your Chrome");
  });

  test("the sleeping-Mac ask: wait by default; now elsewhere says what it costs; a waiting task's line", async () => {
    const { A } = await import("../src/app.ts");
    const { whereAsk, deviceWait } = await import("../src/where.ts");
    A.L = strings("zh");
    const a = whereAsk({ kind: "asleep", device: "MacBook", state: "asleep", other: "hel", site: "taobao.com", here: "chrome", uses: "ducter", signIn: true });
    expect(a.question).toBe("MacBook 睡着了。等它醒了用你的 Chrome 做，还是现在在 hel 上做？");
    expect([a.hold, a.go]).toEqual(["等它醒", "现在在 hel 上做"]);
    expect(a.lines.map((l) => l.text)).toEqual(["hel 那边没登录 taobao.com，得你登一下。", "不回的话就等它醒，什么都不会丢"]);
    const w = whereAsk({ kind: "asleep", device: "MacBook", state: "asleep", other: "Mac mini", uses: "chrome", widens: true });
    expect(w.lines.find((l) => l.widen)?.text).toBe("会用你的 Chrome，你登录着的网站它都能用。");
    expect(deviceWait("device:asleep:MacBook")).toBe("在等 · MacBook 睡着了");
    A.L = strings("en");
    expect(whereAsk({ kind: "pin", device: "MacBook", state: "unreachable", other: "hel", agent: "claude-code", otherAgent: "codex" }).go).toBe("Have Codex do it");
  });

  test("every where key is in both languages", () => {
    const keys = (l: "zh" | "en") => Object.keys(TABLES[l]).filter((k) => /^(where|switch|newtask\.computer|newtask\.agent|move\.closing)\./.test(k)).sort();
    expect(keys("zh")).toEqual(keys("en"));
    expect(keys("zh").length).toBeGreaterThan(40);
  });
});
