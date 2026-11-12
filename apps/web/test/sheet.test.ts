// D161: the device card as a character sheet on the phone: one status line in words, the
// list's one word, how it is connected, the version line in a coin's detail with the channel
// in words, the chips a device gets, and the same keys as the desktop.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { strings, TABLES } from "../src/i18n.ts";
import { agentBehind, chipsFor, listWord, statusLine, versionLine, viaText } from "../src/sheet.ts";

const zh = strings("zh");
const en = strings("en");
const dev = (o: Record<string, unknown>) => ({ id: "dev_mac", name: "MacBook", kind: "laptop", home: false, state: "awake", harnesses: [], abilities: [], ...o }) as any;

describe("the character sheet (D161)", () => {
  test("one status line: the role or the state, never the kind", () => {
    const home = dev({ id: "local", name: "hel", kind: "server", home: true });
    expect(statusLine(zh, home, { persona: "小鸭", home: "hel", running: 0 })).toEqual({ text: "小鸭住这儿", tone: "" });
    expect(statusLine(zh, home, { persona: "小鸭", home: "hel", running: 3 }).text).toBe("小鸭住这儿 · 在做 3 件事");
    expect(statusLine(zh, dev({}), { persona: "小鸭", home: "hel", running: 2 })).toEqual({ text: "在替 hel 做 2 件事", tone: "working" });
    expect(statusLine(en, dev({}), { persona: "Ducter", home: "hel", running: 2 }).text).toBe("Doing 2 tasks for hel");
    expect(statusLine(zh, dev({}), { persona: "小鸭", home: "hel", running: 0 }).text).toBe("替 hel 做事");
    expect(statusLine(zh, dev({ state: "asleep" }), { persona: "小鸭", home: "hel", running: 2 })).toEqual({ text: "睡着了 · 醒来就接着做", tone: "asleep" });
    expect(statusLine(en, dev({ state: "unreachable" }), { persona: "Ducter", home: "hel", running: 0, ago: "2 h ago" })).toEqual({ text: "Can't reach · last seen 2 h ago", tone: "away" });
  });

  test("the list says one word of state", () => {
    expect(listWord(zh, dev({}), { home: "hel", running: 2 })).toEqual({ text: "在做 2 件", tone: "working" });
    expect(listWord(zh, dev({ home: true }), { home: "hel", running: 0 }).text).toBe("住这儿");
    expect(listWord(en, dev({ state: "asleep" }), { home: "hel", running: 0 }).text).toBe("asleep");
    expect(listWord(en, dev({ update: { current: "0.0.6", how: "app", available: true, phase: "downloading" } }), { home: "hel", running: 0 }).text).toBe("updating");
  });

  test("how it is connected, in one line", () => {
    const app = { id: "a", name: "MacBook", platform: "darwin", connected: true, form: "app" };
    const cli = { id: "c", name: "CLI on MacBook", platform: "darwin", connected: false };
    expect(viaText(zh, [app, cli] as any)).toBe("通过 app 和命令行连着");
    expect(viaText(en, [app, cli] as any)).toBe("Connected via the app and command line");
    expect(viaText(zh, [{ id: "p", name: "iPhone", platform: "ios-safari", connected: true }] as any)).toBe("通过 Safari 连着");
    expect(viaText(zh, [])).toBe("");
  });

  test("a coin's version line names its channel in words; the dot only when it can update", () => {
    expect(versionLine(zh, { harness: "pi", installed: true, loggedIn: true, version: "1.4.0", how: "installer" } as any)).toBe("版本 1.4.0 · 它自己装的");
    expect(versionLine(en, { harness: "codex", installed: true, loggedIn: true, version: "0.167.0", how: "npm" } as any)).toBe("Version 0.167.0 · installed with npm");
    expect(versionLine(zh, { harness: "codex", installed: true, loggedIn: true, version: "0.166.0", how: "app" } as any)).toBe("版本 0.166.0 · 随 Codex app 更新");
    expect(versionLine(zh, { harness: "x", installed: true, loggedIn: true, version: "1.0", how: "unknown" } as any)).toBe("版本 1.0");
    const pi = { harness: "pi", installed: true, loggedIn: true, latest: "1.4.2", available: true } as any;
    expect(agentBehind(pi)).toBe(true);
    expect(agentBehind({ ...pi, update: { phase: "updating", from: "1.4.0" } })).toBe(false);
  });

  test("the chips: on, can be added (dashed), can't now (flat), Ducter's browser failed", () => {
    expect(
      chipsFor(
        dev({
          abilities: [
            { id: "web", state: "off", where: "chrome" },
            { id: "computer", state: "on" },
            { id: "phone", state: "later" },
          ],
        }),
      ),
    ).toEqual([
      { id: "web", look: "add" },
      { id: "computer", look: "on" },
    ]);
    expect(chipsFor(dev({ state: "asleep", abilities: [{ id: "web", state: "off" }] }))).toEqual([{ id: "web", look: "off" }]);
    expect(chipsFor(dev({ abilities: [{ id: "web", state: "unavailable", where: "ducter", reason: "browser_deps" }] }))).toEqual([{ id: "web", look: "fail" }]);
  });

  test("D234, D235: a worker Mac (not the home) has + 用手机 and + 用电脑; added without macOS's switches, 用电脑 fails", () => {
    const mac = (computer: Record<string, unknown>) => dev({ home: false, abilities: [{ id: "web", state: "on", where: "chrome" }, { id: "computer", ...computer }, { id: "phone", state: "off" }] as any });
    expect(chipsFor(mac({ state: "off" }))).toEqual([
      { id: "web", look: "on" },
      { id: "computer", look: "add" },
      { id: "phone", look: "add" },
    ]);
    expect(chipsFor(mac({ state: "unavailable", reason: "computer_permissions", perms: { accessibility: true, screen: false } }))[1]).toEqual({ id: "computer", look: "fail" });
    expect(chipsFor(mac({ state: "unavailable", reason: "cua_missing" }))[1]).toEqual({ id: "computer", look: "off" });
  });

  test("D199: the home has 打电话 (on, + to add, sign in again) and its later abilities as ghosts; another computer has neither", () => {
    const home = (call: Record<string, unknown>) =>
      dev({
        id: "local",
        home: true,
        abilities: [
          { id: "web", state: "on", where: "chrome" },
          { id: "computer", state: "later" },
          { id: "remote", state: "off" },
          { id: "phone", state: "later" },
          { id: "call", ...call },
        ],
      });
    expect(chipsFor(home({ state: "off" }))).toEqual([
      { id: "web", look: "on" },
      { id: "remote", look: "add" },
      { id: "call", look: "add" },
      { id: "computer", look: "later" },
      { id: "phone", look: "later" },
    ]);
    expect(chipsFor(home({ state: "on" })).find((c) => c.id === "call")).toEqual({ id: "call", look: "on" });
    expect(chipsFor(home({ state: "on", reason: "signed_out" })).find((c) => c.id === "call")).toEqual({ id: "call", look: "fail" });
    // A computer that works for the home: no calls, no ghosts.
    const worker = dev({ abilities: [{ id: "web", state: "on", where: "chrome" }, { id: "computer", state: "later" }, { id: "phone", state: "later" }] });
    expect(chipsFor(worker)).toEqual([{ id: "web", look: "on" }]);
    // Every chip has its words and its clay, in both languages.
    for (const L of [zh, en]) for (const k of ["chip.call", "chip.phone", "chip.computer", "chip.state.later", "chip.call.signed_out", "ability.call.about", "ability.call.where", "ability.call.signed_out", "ability.phone.about", "ability.computer.about"]) expect(L.t(k)).not.toBe(k);
    for (const f of ["ab_call", "ab_computer_later", "ab_phone_later"]) expect(existsSync(new URL(`../static/art/${f}.webp`, import.meta.url))).toBe(true);
    expect(zh.t("ability.call.about")).not.toMatch(/免费|拨/);
    expect(en.t("ability.call.about")).not.toMatch(/free|dial/i);
  });

  test("the sheet's words are the desktop's, in zh and en", () => {
    const go = readFileSync(new URL("../../desktop/internal/i18n/devicecard.go", import.meta.url), "utf8");
    for (const [lang, table] of [
      ["zh", "zhDeviceCard"],
      ["en", "enDeviceCard"],
    ] as const) {
      const body = go.slice(go.indexOf(`var ${table} = Table{`));
      const pairs = [...body.slice(0, body.indexOf("\n}\n")).matchAll(/\t"([^"]+)":\s+"((?:[^"\\]|\\.)*)",/g)];
      expect(pairs.length).toBeGreaterThan(50);
      for (const [, k, v] of pairs) expect(TABLES[lang][k!]).toBe(JSON.parse(`"${v}"`));
    }
  });
});
