// D157: where a task runs is part of who does it (design/where.md §4). One ranking over
// (computer × agent × model) from what the task needs; one reason; the moments W1–W6 on the
// author's setup: hel (the home, a server that never sleeps, Codex, Ducter's own browser) and
// a MacBook doing tasks for it (Claude Code and Codex, the user's Chrome, sleeps when closed).
import { describe, expect, test } from "bun:test";
import type { DeviceHarness, RuleView } from "@ducter/protocol";
import { chooseBody, computersOf, fwCandidates, type BodyPick, type Computer } from "../src/candidates.ts";

const h = (harness: string, o: Partial<DeviceHarness> = {}): DeviceHarness => ({ harness, installed: true, loggedIn: true, canBePartner: true, ...o });
const settings = { brain: { harness: "codex" as const }, taskAccounts: {} } as any;

function setup(o: { mac?: Computer["state"]; helSites?: string[]; macAgents?: DeviceHarness[]; helAgents?: DeviceHarness[] } = {}): Computer[] {
  return [
    { id: "local", name: "hel", home: true, state: "awake", alwaysOn: true, mac: false, harnesses: o.helAgents ?? [h("codex")], web: { on: true, where: "ducter" }, sites: o.helSites ?? [] },
    { id: "dev_mac", name: "MacBook", home: false, state: o.mac ?? "awake", alwaysOn: false, mac: true, harnesses: o.macAgents ?? [h("claude-code"), h("codex")], web: { on: true, where: "chrome" } },
  ];
}
const work = { title: "x" };
const choose = (computers: Computer[], extra: Partial<Parameters<typeof chooseBody>[0]> = {}) => chooseBody({ work, computers, settings, rules: [], ...extra }) as BodyPick;

describe("W1–W6", () => {
  test("W1 public pages, both awake: hel's own browser (least access), never the user's Chrome", () => {
    const p = choose(setup(), { needs: { browse: true } });
    expect(p).toMatchObject({ device: "local", harness: "codex", uses: "ducter" });
    expect(p.why.where).toMatchObject({ device: "hel", kind: "no_signin", uses: "ducter" });
    expect(p.waits).toBeUndefined();
  });

  test("W2 the user's sign-ins, Mac awake: the MacBook, in the user's Chrome, said so", () => {
    const p = choose(setup(), { needs: { browse: true, signedIn: true, site: "taobao.com" } });
    expect(p).toMatchObject({ device: "MacBook", deviceId: "dev_mac", uses: "chrome" });
    expect(p.why.where).toMatchObject({ device: "MacBook", kind: "signed_in", site: "taobao.com", uses: "chrome" });
  });

  test("W2, with hel's own browser already signed in to the site: hel (less access does the job)", () => {
    const p = choose(setup({ helSites: ["taobao.com"] }), { needs: { signedIn: true, site: "taobao.com" } });
    expect(p).toMatchObject({ device: "local", uses: "ducter" });
    expect(p.needsSignIn).toBeUndefined();
    expect(p.why.where?.kind).toBe("signed_in");
  });

  test("W2b the same while the Mac sleeps: it waits by default, with hel (sign in there first) as the other choice", () => {
    const p = choose(setup({ mac: "asleep" }), { needs: { signedIn: true, site: "taobao.com" } });
    expect(p).toMatchObject({ device: "MacBook", waits: "asleep", uses: "chrome" });
    expect(p.now).toMatchObject({ device: "local", uses: "ducter", needsSignIn: true });
  });

  test("W3 Keynote while the Mac sleeps: nobody else can, so it waits, with no other choice", () => {
    const p = choose(setup({ mac: "asleep" }), { needs: { app: "Keynote" } });
    expect(p).toMatchObject({ device: "MacBook", waits: "asleep" });
    expect(p.now).toBeUndefined();
    expect(p.why.where).toMatchObject({ kind: "only_here", thing: "app", app: "Keynote", uses: "app" });
  });

  test("W4 a plain task, both awake and equal: the home, silently (no ask, no wait)", () => {
    const p = choose(setup({ macAgents: [h("codex")] }));
    expect(p).toMatchObject({ device: "local" });
    expect(p.why.where?.kind).toBe("home");
  });

  test("W5 Claude Code (only on the MacBook) pinned: the pin brings its computer", () => {
    const p = choose(setup(), { pinned: { harness: "claude-code" }, pinnedBy: "you" });
    expect(p).toMatchObject({ device: "MacBook", harness: "claude-code", why: { kind: "you" } });
    expect(p.why.where).toMatchObject({ kind: "agent_here", agent: "claude-code" });
  });

  test("W5, the MacBook asleep: the user's pick waits there, and the ask offers who can start now", () => {
    const p = choose(setup({ mac: "unreachable" }), { pinned: { harness: "claude-code" }, pinnedBy: "you" });
    expect(p).toMatchObject({ device: "MacBook", waits: "unreachable" });
    expect(p.now).toMatchObject({ device: "local", harness: "codex" });
  });

  test("W6 long work: a computer that doesn't sleep, even when the laptop's agent ranks higher", () => {
    const comps = setup({ macAgents: [h("claude-code", { allowance: { left: 1 } })], helAgents: [h("codex", { allowance: { left: 0.2 } })] });
    expect(choose(comps).device).toBe("MacBook"); // without "long": the agent's own rank decides
    const p = choose(comps, { needs: { long: true } });
    expect(p.device).toBe("local");
    expect(p.why.where).toMatchObject({ kind: "always_on", other: "MacBook" });
  });
});

describe("the rules of where", () => {
  test("never widens silently: public browsing never falls to the user's Chrome while hel's browser is there", () => {
    const comps = setup();
    comps[0]!.state = "awake";
    const list = fwCandidates({ work, computers: comps, needs: { browse: true }, settings, rules: [], current: { harness: "codex", device: "local", uses: "ducter" } });
    const mac = list.find((c) => c.device === "dev_mac" && !c.blocked)!;
    expect(mac).toMatchObject({ uses: "chrome", widens: true });
    expect(list.find((c) => c.current)).toMatchObject({ device: "local", uses: "ducter" });
  });

  test("the sleeping best with an equal awake one: no ask, the awake one does it", () => {
    const p = choose(setup({ mac: "asleep", macAgents: [h("codex")], helAgents: [h("codex")] }), { needs: { long: false } });
    expect(p.waits).toBeUndefined();
    expect(p.device).toBe("local");
  });

  test("a sleeping Mac with Claude Code: a default pick never waits when an awake computer can do it the same way", () => {
    const p = choose(setup({ mac: "asleep" }));
    expect(p).toMatchObject({ device: "local", harness: "codex" });
    expect(p.why.where).toMatchObject({ kind: "awake", other: "MacBook" });
  });

  test("a computer the user named is a pin; a folder stays on its computer", () => {
    expect(choose(setup(), { pinDevice: "MacBook" })).toMatchObject({ device: "MacBook", why: { where: { kind: "you" } } });
    const f = choose(setup(), { place: { kind: "folder", device: "MacBook", path: "~/Documents/x" } });
    expect(f.device).toBe("MacBook");
    expect(f.why.where?.kind).toBe("changes_here");
    const list = fwCandidates({ work, computers: setup(), place: { kind: "folder", device: "MacBook", path: "~/x" }, settings, rules: [] });
    expect(list.filter((c) => c.device === "local").every((c) => c.blocked === "elsewhere")).toBe(true);
  });

  test("a computer the user named holds even asleep: it waits there, nothing asked", () => {
    const p = choose(setup({ mac: "asleep" }), { pinDevice: "MacBook" });
    expect(p).toMatchObject({ device: "MacBook", waits: "asleep" });
    expect(p.now).toBeUndefined();
    const q = choose(setup({ mac: "asleep", helAgents: [h("codex"), h("claude-code")] }), { pinDevice: "MacBook", pinned: { harness: "claude-code" }, pinnedBy: "you" });
    expect(q).toMatchObject({ device: "MacBook", harness: "claude-code", waits: "asleep" });
  });

  test("a rule can name a computer", () => {
    const rule: RuleView = { id: "r1", text: "要登录的网页都在 MacBook 上做", harness: "codex", match: ["订单"], createdAt: "2026-11-10T00:00:00Z", device: "MacBook" };
    const p = chooseBody({ work: { title: "看看订单" }, computers: setup(), settings, rules: [rule], needs: { browse: true } }) as BodyPick;
    expect(p).toMatchObject({ device: "MacBook", harness: "codex" });
  });

  test("what can't: greyed with why, per computer", () => {
    const list = fwCandidates({ work, computers: setup(), needs: { app: "Keynote" }, settings, rules: [] });
    expect(list.find((c) => c.device === "local")?.blocked).toBe("no_app");
    const noWeb = setup();
    noWeb[0]!.web = { on: false };
    const l2 = fwCandidates({ work, computers: noWeb, needs: { signedIn: true }, settings, rules: [] });
    expect(l2.find((c) => c.device === "local")?.blocked).toBe("no_chrome");
  });

  test("one computer: nothing about where (rows and picks as before)", () => {
    const one = [setup()[0]!];
    const p = choose(one, { needs: { browse: true } });
    expect(p.device).toBeUndefined();
    expect(p.why.where).toBeUndefined();
    expect(fwCandidates({ work, computers: one, settings, rules: [] })[0]!.device).toBeUndefined();
  });

  test("computersOf: phones never run tasks; a laptop sleeps, a server doesn't", () => {
    const comps = computersOf([
      { id: "local", name: "hel", kind: "server", home: true, state: "awake", harnesses: [], abilities: [{ id: "web", state: "on", where: "ducter" }], platform: "linux-x64" },
      { id: "d1", name: "MacBook", kind: "laptop", home: false, state: "asleep", harnesses: [], abilities: [{ id: "web", state: "on", where: "chrome" }], platform: "darwin-arm64" },
      { id: "d2", name: "iPhone", kind: "phone", home: false, state: "awake", harnesses: [], abilities: [] },
    ]);
    expect(comps.map((c) => [c.name, c.alwaysOn, c.mac, c.web?.where])).toEqual([
      ["hel", true, false, "ducter"],
      ["MacBook", false, true, "chrome"],
    ]);
  });
});
