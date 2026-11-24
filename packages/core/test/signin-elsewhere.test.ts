// D505: a server home signs in through the person's Mac. hel (the home, a server, Ducter's own
// browser with none of their sign-ins) and a MacBook doing tasks for it (their own Chrome, signed
// in). A task's browser on hel asks for a sign-in: the task goes to the MacBook instead of a card,
// said once in its own line; their sign-ins never come up the worker's socket. Fakes only.
import { expect, test } from "bun:test";
import { join } from "node:path";
import type { Bodies, DeviceHarness } from "@ducter/protocol";
import type { Runner } from "@ducter/protocol/src/internal.ts";
import { movedOver } from "../../runner/src/brief.ts";
import { signInRoute, type Computer } from "../src/candidates.ts";
import { workerBrowserOps } from "../src/browser/remote.ts";
import { registerBrowserTools } from "../src/browser/tools.ts";
import { FakeClock } from "../src/clock.ts";
import { openLog } from "../src/log.ts";
import { createMcpHub } from "../src/mcp.ts";
import { createRegistry } from "../src/registry.ts";
import { createDecisions } from "../src/decisions.ts";
import { openSettings } from "../src/settings.ts";
import { openPushStore } from "../src/push.ts";
import { tempDir } from "./helpers.ts";

const h = (harness: string): DeviceHarness => ({ harness, installed: true, loggedIn: true, canBePartner: true });
const HEL: Computer = { id: "local", name: "hel", home: true, state: "awake", alwaysOn: true, mac: false, harnesses: [h("codex")], web: { on: true, where: "ducter" }, sites: [] };
const mac = (more: Partial<Computer> = {}): Computer => ({ id: "dev_mac", name: "MacBook", home: false, state: "awake", alwaysOn: false, mac: true, harnesses: [h("claude-code"), h("codex")], web: { on: true, where: "chrome" }, ...more });

test("the rule: from a server, to an awake Mac's own Chrome; least access first; never a Mac home; buying never in their Chrome", () => {
  expect(signInRoute({ computers: [HEL, mac()], here: "local", site: "www.taobao.com" })).toMatchObject({ to: { name: "MacBook" }, uses: "chrome" });
  // Asleep: said, not taken.
  expect(signInRoute({ computers: [HEL, mac({ state: "asleep" })], here: "local", site: "taobao.com" })).toMatchObject({ asleep: { name: "MacBook" } });
  // Out of reach, or 上网 off there: nowhere (the card stays on hel).
  expect(signInRoute({ computers: [HEL, mac({ state: "unreachable" })], here: "local", site: "taobao.com" })).toBeUndefined();
  expect(signInRoute({ computers: [HEL, mac({ web: { on: false } })], here: "local", site: "taobao.com" })).toBeUndefined();
  // Ducter's browser on another computer already signed in to the site beats their Chrome (less access).
  const mini: Computer = { ...mac(), id: "mini", name: "Mac mini", web: { on: true, where: "ducter" }, sites: ["taobao.com"] };
  expect(signInRoute({ computers: [HEL, mac(), mini], here: "local", site: "taobao.com" })).toMatchObject({ to: { name: "Mac mini" }, uses: "ducter" });
  // A Mac the task is on is where the person sits: signing in there stays there.
  expect(signInRoute({ computers: [{ ...HEL, mac: true }, mac()], here: "local", site: "taobao.com" })).toBeUndefined();
  // hel's browser signed in already: nothing to carry.
  expect(signInRoute({ computers: [{ ...HEL, sites: ["taobao.com"] }, mac()], here: "local", site: "taobao.com" })).toBeUndefined();
  // D436: buying stays in Ducter's browser, so only one already signed in there takes it.
  expect(signInRoute({ computers: [HEL, mac()], here: "local", site: "taobao.com", buy: true })).toBeUndefined();
  expect(signInRoute({ computers: [HEL, mac(), mini], here: "local", site: "taobao.com", buy: true })).toMatchObject({ to: { name: "Mac mini" }, uses: "ducter" });
});

function home(o: { macState?: "awake" | "asleep"; moveOk?: boolean; zh?: boolean } = {}) {
  const t = tempDir();
  const clock = new FakeClock(Date.parse("2026-11-24T06:00:00Z"));
  const log = openLog({ path: join(t.dir, "ducter.db"), persona: "default", clock });
  const tasks = createRegistry(log, clock);
  log.append({ stream: "task:t1", origin: "partner", kind: "task_open", body: { taskId: "t1", title: "看看我淘宝的订单", project: "", place: { kind: "browser", device: "local", profile: "default" }, harness: "codex", brief: "List my recent Taobao orders.", needs: { browse: true }, ...(o.zh ? { language: "zh" } : {}) } as never });
  const dv = (id: string, name: string, isHome: boolean, kind: string, where: "chrome" | "ducter", state: string, platform: string, harnesses: DeviceHarness[]) => ({ id, name, kind, home: isHome, state, platform, harnesses, abilities: [{ id: "web", state: "on", where }] });
  const frame = { t: "devices", devices: [dv("local", "hel", true, "server", "ducter", "awake", "linux", [h("codex")]), dv("dev_mac", "MacBook", false, "laptop", "chrome", o.macState ?? "awake", "darwin", [h("claude-code"), h("codex")])], reach: { clients: [] } };
  const moves: unknown[][] = [];
  const runner = { moveTask: async (...a: unknown[]) => (moves.push(a), o.moveOk === false ? { ok: false, message: "MacBook can't be reached right now" } : { ok: true }) } as unknown as Runner;
  return { t, log, tasks, frame, moves, runner };
}

test("a sign-in asked on hel: the task moves to the MacBook's Chrome, said in its line; the partner only knows; no card", async () => {
  const { createLoadout } = await import("../src/loadout.ts");
  const s = home();
  const lo = createLoadout({ log: s.log, tasks: s.tasks, settings: { get: () => ({ brain: { harness: "codex" } }) } as never, rules: { list: () => [] } as never, devices: () => ({ frame: async () => s.frame }) as never });
  const mcp = createMcpHub({ secret: "s" });
  const host = { task: (id: string) => (id === "t1" ? { taskId: id, profile: "default" } : undefined), blind: () => false, touch() {} } as never;
  // D505 (rev.): taobao.com already said to go straight to their Chrome (this test is the silent move).
  registerBrowserTools({ mcp, host, log: s.log, tasks: s.tasks as never, signInElsewhere: (id, site) => lo.signInElsewhere(id, site, s.runner), chromeSites: { has: (x) => x === "taobao.com", add() {} } });
  try {
    const said = String(await mcp.call({ role: "task", taskId: "t1" } as never, "browser_ask_sign_in", { url: "https://login.taobao.com/", why: "要看你的订单" }));
    expect(said).toContain("MacBook");
    expect(said).toContain("End your turn");
    await Bun.sleep(5);
    // Moved there with the same agent, for the sign-in (the meta line: 在 MacBook 上 · 用你的 Chrome).
    expect(s.moves).toEqual([["t1", { device: "MacBook", name: "MacBook", homeName: "hel", signIn: { site: "taobao.com", uses: "chrome", always: true } }, "codex", undefined]]);
    // No sign-in card on hel.
    expect(s.log.read({ stream: "task:t1", kinds: ["report"], limit: 10 })).toEqual([]);
    // The partner's hidden note: why it moved, nothing typed on hel.
    const note = s.log.read({ stream: "channel", kinds: ["job_status"], limit: 10 }).map((e) => (e.body as { text: string }).text);
    expect(note.join("\n")).toMatch(/signed in to login\.taobao\.com.*moved it to MacBook.*Nothing was typed on hel.*goes straight to their Chrome/);
  } finally {
    s.t.cleanup();
  }
});

test("the MacBook asleep, or the move failing: the sign-in card, as before (never a task waiting on nothing)", async () => {
  const { createLoadout } = await import("../src/loadout.ts");
  for (const o of [{ macState: "asleep" as const }, { moveOk: false }]) {
    const s = home(o);
    const lo = createLoadout({ log: s.log, tasks: s.tasks, settings: { get: () => ({ brain: { harness: "codex" } }) } as never, rules: { list: () => [] } as never, devices: () => ({ frame: async () => s.frame }) as never });
    try {
      const r = await lo.signInElsewhere("t1", "taobao.com", s.runner);
      if (o.macState) {
        expect(r).toEqual({ asleep: "MacBook" });
        continue;
      }
      expect(r && "move" in r ? await r.move() : r).toMatchObject({ ok: false });
      expect(s.log.read({ stream: "channel", kinds: ["job_status"], limit: 10 })).toEqual([]);
    } finally {
      s.t.cleanup();
    }
  }
});

test("the worker keeps sign-ins: cookie reads come up without values; traffic, form data and storage are refused there", async () => {
  const t = tempDir();
  const sent: { method: string }[] = [];
  const conn = {
    send: async (method: string) => (sent.push({ method }), method.endsWith("ookies") ? { cookies: [{ name: "_tb_token_", value: "s3cr3t", domain: ".taobao.com", path: "/" }] } : { ok: 1 }),
    on: () => () => {},
    onClose: () => () => {},
    closed: () => false,
    close() {},
  };
  const w = workerBrowserOps({
    dataDir: t.dir,
    send: () => {},
    find: () => ({ path: "/opt/chrome" }),
    launch: async () => ({ wsUrl: "ws://x", proc: { exited: new Promise<number>(() => {}), kill() {} } }) as never,
    connect: async () => conn as never,
  });
  try {
    const { key } = (await w.ops.chromeLaunch!({ profile: "default" })) as { key: string };
    for (const m of ["Storage.getCookies", "Network.getCookies", "Network.getAllCookies"]) {
      const r = (await w.ops.cdpSend!({ key, method: m })) as { cookies: { name: string; value: string; domain: string }[] };
      expect(r.cookies).toEqual([{ name: "_tb_token_", value: "", domain: ".taobao.com", path: "/" }]);
    }
    for (const m of ["Network.enable", "Network.getRequestPostData", "Fetch.enable", "DOMStorage.getDOMStorageItems", "IndexedDB.requestData"]) await expect(w.ops.cdpSend!({ key, method: m })).rejects.toThrow(/stays on this computer/);
    expect(sent.map((s) => s.method)).toEqual(["Storage.getCookies", "Network.getCookies", "Network.getAllCookies"]);
    // Everything a task's tools use still goes through.
    expect(await w.ops.cdpSend!({ key, method: "Page.navigate", params: { url: "https://www.taobao.com" } })).toEqual({ ok: 1 });
  } finally {
    t.cleanup();
  }
});

test("the first turn on the MacBook: why it moved, don't sign in again, and the sign-ins stay there", () => {
  const s = movedOver("hel", "MacBook", ["opened taobao.com"], false, undefined, { site: "taobao.com", uses: "chrome" });
  expect(s).toContain("Ducter moved this task from hel to MacBook");
  expect(s).toContain("the user's own Chrome, where they are signed in already");
  expect(s).toContain("never read, copy or report cookies");
  expect(movedOver("hel", "MacBook", [], false)).toContain("The user moved this task");
});

// D505 (rev.): ask once per site, then remember. The first sign-in a task on hel needs at a site the
// person's Chrome has: one go/hold card (换过去 / 我在这里登录), unanswered it waits. Go moves it and
// remembers the site; the next one there moves without a card; taken out in Settings, it asks again.
test("ask once per site: first time a card; Go moves and remembers; next time silent; removed in Settings, the card again", async () => {
  const { createLoadout } = await import("../src/loadout.ts");
  const s = home({ zh: true });
  const settings = openSettings({ dataDir: s.t.dir, log: s.log, push: openPushStore(s.t.dir), persona: { name: "Pebble", identity: "" } });
  const decisions = createDecisions({ log: s.log, tasks: s.tasks, clock: new FakeClock(Date.parse("2026-11-24T06:00:00Z")) });
  const lo = createLoadout({ log: s.log, tasks: s.tasks, settings: { get: () => ({ brain: { harness: "codex" } }) } as never, rules: { list: () => [] } as never, devices: () => ({ frame: async () => s.frame }) as never });
  const mcp = createMcpHub({ secret: "s" });
  const host = { task: (id: string) => (id === "t1" ? { taskId: id, profile: "default" } : undefined), blind: () => false, touch() {} } as never;
  registerBrowserTools({ mcp, host, log: s.log, tasks: s.tasks as never, signInElsewhere: (id, site) => lo.signInElsewhere(id, site, s.runner), chromeSites: { has: (x) => !!settings.get().chromeSites?.includes(x), add: (x) => settings.rememberChrome(x) } });
  const signIn = () => mcp.call({ role: "task", taskId: "t1" } as never, "browser_ask_sign_in", { url: "https://login.taobao.com/" }).then(String);
  const cards = () => s.log.read({ stream: "channel", kinds: ["decision"], limit: 50 }).map((e) => e.body as Bodies["decision"]);
  try {
    // 1. First time: the card, in the task's language; nothing moved; it waits, no countdown.
    const said = await signIn();
    expect(said).toContain("End your turn");
    await Bun.sleep(5);
    expect(s.moves).toEqual([]);
    const [c1] = cards();
    expect(c1).toMatchObject({ taskId: "t1", question: "要登录 taobao.com。换到 MacBook 上你已登录的 Chrome 接着做？", goLabel: "换过去", holdLabel: "我在这里登录", defaultOption: "hold", reversible: true, signInWhere: { site: "taobao.com", to: "MacBook", url: "https://login.taobao.com/" } });
    expect(c1!.defaultAt).toBeUndefined();
    expect(s.tasks.get("t1")?.attention).toBe("needs_you");
    expect(settings.get().chromeSites).toBeUndefined();

    // 2. Go: moved to the MacBook's Chrome, and the site remembered (the move line says so).
    decisions.decide(c1!.decisionId, "go");
    await Bun.sleep(10);
    expect(s.moves).toEqual([["t1", { device: "MacBook", name: "MacBook", homeName: "hel", signIn: { site: "taobao.com", uses: "chrome", always: true } }, "codex", undefined]]);
    expect(settings.get().chromeSites).toEqual(["taobao.com"]);

    // 3. Next time on that site: no card, it just moves.
    s.moves.length = 0;
    expect(await signIn()).toContain("Don't sign in here");
    await Bun.sleep(5);
    expect(s.moves).toHaveLength(1);
    expect(cards()).toHaveLength(1);

    // 4. 移除 / Remove in Settings › 上网: a patch only takes sites out; the next sign-in asks again.
    expect(settings.set({ chromeSites: ["somewhere-else.com"] })).toEqual(["chromeSites"]);
    expect(settings.get().chromeSites).toBeUndefined();
    s.moves.length = 0;
    await signIn();
    await Bun.sleep(5);
    expect(s.moves).toEqual([]);
    const c2 = cards().at(-1)!;
    expect(c2.signInWhere?.site).toBe("taobao.com");
    expect(c2.decisionId).not.toBe(c1!.decisionId);

    // 5. 我在这里登录 / I'll sign in here: today's sign-in card where the task is; nothing remembered, nothing moved.
    decisions.decide(c2.decisionId, "hold");
    await Bun.sleep(10);
    expect(s.moves).toEqual([]);
    expect(settings.get().chromeSites).toBeUndefined();
    expect(cards().at(-1)).toMatchObject({ signIn: { site: "login.taobao.com", url: "https://login.taobao.com/" } });
    expect(s.tasks.get("t1")?.attention).toBe("needs_you");
  } finally {
    decisions.stop();
    s.t.cleanup();
  }
});

test("the card is its own kind: never answered on someone's word, never by a chat app's button, nothing forwarded", async () => {
  const { plainAsk, forwardText } = await import("../src/decisions.ts");
  const { plainDecision } = await import("../src/reply.ts");
  const { cardPolicy } = await import("../src/channels/hub.ts");
  const d = { decisionId: "d1", taskId: "t1", question: "要登录 taobao.com。换到 MacBook 上你已登录的 Chrome 接着做？", goLabel: "换过去", holdLabel: "我在这里登录", defaultOption: "hold", reversible: true, signInWhere: { site: "taobao.com", url: "https://login.taobao.com/", to: "MacBook" } } as Bodies["decision"];
  expect(plainAsk(d)).toBe(false);
  expect(plainDecision(d)).toBe(false);
  expect(cardPolicy(d)).toBe("open");
  expect(forwardText(d, { decisionId: "d1", option: "go" })).toBe("");
  expect(forwardText(d, { decisionId: "d1", option: "hold" })).toBe("");
});
