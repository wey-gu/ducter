// D543: the web client stays useful through a drop. The page's real AppState and Connection run
// against a fake home (a Bun server speaking the client protocol: welcome with ping, a cursor
// replay, sends deduped by clientId, pongs) that can drop a socket mid-send, or go deaf on it (a
// half-open socket: nothing closes, nothing comes back). A message sent through either is in the
// home's Log exactly once; the outbox survives the page; a kept screen opens with the link down and
// never asks the app for its can't-reach screen; nothing a drop under 10 s does blocks the screen;
// and the composer is never disabled by the link.
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { LogEvent } from "@ducter/protocol";
import { A } from "../src/app.ts";
import { Api, PROBE_MS, WELCOME_WAIT_MS } from "../src/conn.ts";
import { strings } from "../src/i18n.ts";
import { linkState, LINK_QUIET_MS, LONG_OUTAGE_MS } from "../src/link.ts";
import { ANSWER_TTL_MS, frameOf, memoryStore, Outbox } from "../src/outbox.ts";
import { Store } from "../src/store.ts";
import { taskWindows } from "../src/taskwin.ts";
import { keepTaskDrafts, readDraft, keepDraft, readTaskDrafts } from "../src/follow.ts";

const src = (p: string) => readFileSync(join(import.meta.dir, "..", p), "utf8");
const until = async (ok: () => boolean, ms = 12_000) => {
  const t0 = Date.now();
  while (!ok()) {
    if (Date.now() - t0 > ms) throw new Error("timed out");
    await Bun.sleep(20);
  }
};

/** A home: its channel Log, sends deduped by clientId, decisions answered once. */
function fakeHome(port = 0) {
  const log: LogEvent[] = [];
  const answered = new Map<string, string>();
  let seq = 0;
  const socks = new Set<import("bun").ServerWebSocket<{ deaf?: boolean }>>();
  const at = () => new Date().toISOString();
  const home = {
    log,
    answered,
    /** The next frame of this kind closes its socket before the home reads it (a drop mid-send). */
    dropNext: "" as string,
    /** Every socket open now hears nothing and says nothing, and stays open (half-open). */
    deafen() {
      for (const s of socks) s.data.deaf = true;
    },
    dials: 0,
    sent: [] as string[],
    stop: () => server.stop(true),
    port: 0,
  };
  const server = Bun.serve<{ deaf?: boolean }>({
    port,
    fetch(req, s) {
      if (new URL(req.url).pathname === "/ws") return s.upgrade(req, { data: {} }) ? undefined : new Response("no", { status: 400 });
      if (new URL(req.url).pathname === "/api/me") return Response.json({ via: "local", personaName: "Ducter", push: { supported: false } });
      return new Response("not found", { status: 404 });
    },
    websocket: {
      open(w) {
        socks.add(w);
        home.dials++;
      },
      close(w) {
        socks.delete(w);
      },
      message(w, m) {
        if (w.data.deaf) return;
        const f = JSON.parse(String(m));
        if (home.dropNext && f.t === home.dropNext) {
          home.dropNext = "";
          return void w.close();
        }
        home.sent.push(f.t);
        if (f.t === "ping") return void w.send(JSON.stringify({ t: "pong" }));
        if (f.t === "hello") {
          w.send(JSON.stringify({ t: "welcome", persona: "default", personaName: "Ducter", headSeq: seq, ping: true }));
          const from = f.cursor ?? 0;
          w.send(JSON.stringify({ t: "events", events: log.filter((e) => e.seq > from) }));
          w.send(JSON.stringify({ t: "on_hand", onHand: { tasks: [], counts: { needs_you: 0, working: 0, waiting: 0, done_today: 0 }, waiters: [] } }));
          return;
        }
        if (f.t === "send") {
          const had = log.find((e) => e.kind === "user_msg" && (e.body as { clientId?: string }).clientId === f.clientId);
          const ev = had ?? ({ seq: ++seq, ts: at(), stream: "channel", origin: "user", kind: "user_msg", body: { text: f.text, clientId: f.clientId } } as LogEvent);
          if (!had) log.push(ev);
          for (const s of had ? [w] : socks) if (!s.data.deaf) s.send(JSON.stringify({ t: "events", events: [ev] }));
          return;
        }
        if (f.t === "decide") {
          if (answered.has(f.decisionId)) return;
          answered.set(f.decisionId, f.option);
          const ev = { seq: ++seq, ts: at(), stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: f.decisionId, option: f.option, by: "user" } } as LogEvent;
          log.push(ev);
          for (const s of socks) if (!s.data.deaf) s.send(JSON.stringify({ t: "events", events: [ev] }));
        }
      },
    },
  });
  home.port = server.port!;
  return home;
}

const g = globalThis as any;
const had: Record<string, unknown> = { location: g.location, history: g.history };
beforeAll(() => {
  g.location = { hash: "", pathname: "/app", href: "http://127.0.0.1/app" };
  g.history = { length: 1, pushState: () => {}, replaceState: () => {} };
});
afterAll(() => {
  for (const [k, v] of Object.entries(had)) v === undefined ? delete g[k] : (g[k] = v);
  // The one page goes back as this file found it, for the files after it.
  A.conn?.stop();
  A.conn = undefined;
  A.status = "connecting";
  A.S = new Store();
  A.pending = [];
  A.outbox = new Outbox(memoryStore());
});

let home: ReturnType<typeof fakeHome> | undefined;
afterEach(() => {
  A.conn?.stop();
  home?.stop();
  home = undefined;
  delete g.ducterNative;
  delete g.webkit;
});

/** The page, fresh: its store, its outbox (in memory), on a home at `port`. */
function page(port: number) {
  A.conn?.stop();
  A.L = strings("zh");
  delete (A as { send?: unknown }).send; // another file stubbed it on the one page (door, done-today): the real one
  A.S.welcomed = false;
  A.S = new Store();
  A.pending = [];
  A.outbox = new Outbox(memoryStore());
  A.glanceDevice = "local";
  const base = new URL(`http://127.0.0.1:${port}/`);
  A.start(base, new Api(base, () => undefined), { via: "local", personaName: "Ducter", push: { supported: false } }, () => undefined);
  return A;
}
const inLog = (h: ReturnType<typeof fakeHome>, text: string) => h.log.filter((e) => e.kind === "user_msg" && (e.body as { text: string }).text === text).length;

describe("a message sent through a drop reaches the home once (D543)", () => {
  test("the socket drops as the message goes: the outbox sends it again on the next welcome, and the home has it once", async () => {
    home = fakeHome();
    page(home.port);
    await until(() => A.linkUp());
    home.dropNext = "send";
    expect(A.sendMessage("断网前最后一句")).toBe(true);
    expect(A.outbox.items.map((i) => i.kind)).toEqual(["send"]);
    await until(() => home!.dials >= 2 && A.linkUp());
    await until(() => inLog(home!, "断网前最后一句") === 1);
    await until(() => A.outbox.items.length === 0);
    await Bun.sleep(300);
    expect(inLog(home, "断网前最后一句")).toBe(1);
  });

  test("a half-open socket (nothing closes, nothing answers): the send's probe gives up on it within PROBE_MS, and the message lands once", async () => {
    home = fakeHome();
    const link = deadLink(home.port);
    try {
      page(link.port());
      await until(() => A.linkUp());
      const t0 = Date.now();
      link.kill();
      A.sendMessage("半开的时候发的");
      await until(() => home!.dials >= 2 && A.linkUp(), PROBE_MS + 6000);
      await until(() => inLog(home!, "半开的时候发的") === 1);
      // Before D543 this waited for the steady ping's 45 s, then for a close that never came.
      expect(Date.now() - t0).toBeLessThan(PROBE_MS + 4000);
      await until(() => A.outbox.items.length === 0);
      expect(inLog(home, "半开的时候发的")).toBe(1);
    } finally {
      A.conn?.stop();
      link.stop();
    }
  }, 20_000);

  test("coming back to the front on a half-open socket redials at once (ducterresume, visibilitychange, focus)", async () => {
    home = fakeHome();
    const link = deadLink(home.port);
    try {
      page(link.port());
      await until(() => A.linkUp());
      link.kill();
      const t0 = Date.now();
      dispatchEvent(new Event("ducterresume"));
      await until(() => home!.dials >= 2 && A.linkUp(), PROBE_MS + 6000);
      expect(Date.now() - t0).toBeLessThan(PROBE_MS + 3000);
    } finally {
      A.conn?.stop();
      link.stop();
    }
  }, 20_000);

  test("a dial into a dead network that never hears its welcome is let go after WELCOME_WAIT_MS and dialled again", async () => {
    home = fakeHome();
    const link = deadLink(home.port);
    try {
      page(link.port());
      await until(() => A.linkUp());
      link.deadNew = true;
      link.kill();
      A.sendMessage("隧道里发的");
      // The probe lets the first go; the next dial opens into the dead network and hears nothing.
      await until(() => A.status === "offline", PROBE_MS + 2000);
      await Bun.sleep(1500); // the next dial is out, into the dead network
      expect(A.linkUp()).toBe(false);
      link.deadNew = false;
      const t0 = Date.now();
      await until(() => A.linkUp(), WELCOME_WAIT_MS + 6000);
      expect(Date.now() - t0).toBeLessThan(WELCOME_WAIT_MS + 5000);
      await until(() => inLog(home!, "隧道里发的") === 1);
    } finally {
      A.conn?.stop();
      link.stop();
    }
  }, 30_000);

  test("sent while the home is down: it shows pending and goes on the first welcome", async () => {
    home = fakeHome();
    const port = home.port;
    home.stop();
    page(port);
    await Bun.sleep(300);
    A.sendMessage("家里那台还没开");
    expect(A.pending.map((p) => p.text)).toEqual(["家里那台还没开"]);
    expect(A.outbox.items).toHaveLength(1);
    // The home comes back on the same port.
    home = undefined;
    const back = fakeHomeOn(port);
    home = back;
    await until(() => A.linkUp(), 10_000);
    await until(() => inLog(back, "家里那台还没开") === 1);
    await until(() => A.outbox.items.length === 0);
  }, 20_000);
});

/**
 * A TCP link in front of the home whose open connections can be made dead (every byte swallowed
 * both ways, nothing closed: a phone that moved networks). Unlike a deaf home, a dead link doesn't
 * answer the client's close either, which is what kept a real browser waiting.
 */
function deadLink(target: number) {
  const net = require("node:net") as typeof import("node:net");
  const conns: { dead: boolean; a: import("node:net").Socket; b: import("node:net").Socket }[] = [];
  const mode = { deadNew: false };
  const server = net.createServer((a) => {
    const b = net.connect(target, "127.0.0.1");
    const c = { dead: mode.deadNew, a, b };
    conns.push(c);
    a.on("data", (d) => !c.dead && b.write(d));
    b.on("data", (d) => !c.dead && a.write(d));
    const end = () => (a.destroy(), b.destroy());
    a.on("error", end).on("close", () => !c.dead && end());
    b.on("error", end).on("close", () => !c.dead && end());
  });
  server.listen(0, "127.0.0.1");
  return {
    port: () => (server.address() as import("node:net").AddressInfo).port,
    kill: () => conns.forEach((c) => (c.dead = true)),
    /** New connections are dead too (the network itself is gone), until false again. */
    set deadNew(v: boolean) {
      mode.deadNew = v;
    },
    stop: () => (server.close(), conns.forEach((c) => (c.a.destroy(), c.b.destroy()))),
  };
}

/** A home at the same address, after a restart. */
const fakeHomeOn = (port: number) => fakeHome(port);

describe("the outbox survives the page (D543)", () => {
  test("a reload keeps what waited: the messages show again pending, a task's message on its task, an answer on its card", async () => {
    const store = memoryStore();
    const before = new Outbox(store);
    before.put({ kind: "send", device: "dev1", persona: "default", clientId: "p1-a-1", text: "地铁里打的字", at: Date.now() });
    before.put({ kind: "task_send", device: "dev1", taskId: "t_ci", clientId: "t1-a-2", text: "先别 rebase", at: Date.now() });
    before.put({ kind: "decide", device: "dev1", decisionId: "dec_1", option: "go", at: Date.now() });
    before.put({ kind: "send", device: "other", persona: "default", clientId: "p1-x-1", text: "another pairing's", at: Date.now() });
    await before.flushed();
    // The page after the reload.
    A.conn?.stop();
    A.S = new Store();
    A.pending = [];
    A.outbox = new Outbox(store);
    A.partnerShown = "default";
    await A.outbox.load("dev1");
    expect(A.outbox.items.map((i) => i.kind)).toEqual(["send", "task_send", "decide"]);
    A.restoreOutbox();
    expect(A.pending.map((p) => p.text)).toEqual(["地铁里打的字"]);
    expect(A.S.tasks.get("t_ci")?.sends.map((s) => s.clientId)).toEqual(["t1-a-2"]);
    // Another pairing's items are not this device's to send.
    expect(store.value.some((i) => i.device === "other")).toBe(false);
    expect(frameOf(A.outbox.items[0]!)).toEqual({ t: "send", text: "地铁里打的字", clientId: "p1-a-1" });
  });

  test("an answer kept longer than ANSWER_TTL_MS is not sent late: its card opens again", async () => {
    home = fakeHome();
    page(home.port);
    A.outbox.put({ kind: "decide", device: "local", decisionId: "dec_old", option: "go", at: Date.now() - ANSWER_TTL_MS - 1000 });
    A.outbox.put({ kind: "decide", device: "local", decisionId: "dec_new", option: "hold", at: Date.now() });
    await until(() => A.linkUp());
    await until(() => home!.answered.has("dec_new"));
    expect(home.answered.has("dec_old")).toBe(false);
    await until(() => A.outbox.items.length === 0);
  });

  test("a Go tapped with the link down waits; a payment, a key and a Go that deletes ask again instead", async () => {
    home = fakeHome();
    const port = home.port;
    home.stop();
    page(port);
    await Bun.sleep(200);
    const card = (id: string, question: string, goLabel = "好") => A.S.decisions.set(id, { decisionId: id, question, goLabel, holdLabel: "先不", seq: 1 } as any);
    card("dec_ok", "要不要把 PR #11024 合进 main？", "合进去");
    card("dec_rm", "要删掉 build/ 目录下的旧产物吗？", "删掉");
    A.decide("dec_ok", "go");
    A.decide("dec_rm", "go");
    A.pay("dec_pay", "123");
    A.giveKey("dec_key", "sk-not-a-real-key", true);
    expect(A.outbox.items.map((i) => (i.kind === "decide" ? i.decisionId : ""))).toEqual(["dec_ok"]);
    expect(A.S.decisions.get("dec_ok")?.pending).toBe("go");
    expect(A.S.decisions.get("dec_rm")?.pending).toBeUndefined();
    const back = fakeHomeOn(port);
    home = back;
    await until(() => back.answered.has("dec_ok"), 10_000);
    expect(back.answered.size).toBe(1);
    // No payment or key frame ever left the page.
    expect(back.sent.filter((t) => t === "decide")).toHaveLength(1);
  }, 20_000);
});

describe("a cold start with the link down opens to the last screen (D543)", () => {
  test("a kept screen paints with no home, and the iPhone app is never asked for its can't-reach screen", async () => {
    const said: { t: string; ok?: boolean }[] = [];
    g.ducterNative = { platform: "ios", version: "0.1.47" };
    g.webkit = { messageHandlers: { ducter: { postMessage: async (m: { t: string; ok?: boolean }) => void said.push(m) } } };
    const ev = (seq: number, kind: string, text: string) => ({ seq, ts: new Date().toISOString(), stream: "channel", origin: kind === "user_msg" ? "user" : "partner", kind, body: { text } }) as LogEvent;
    home = fakeHome();
    const port = home.port;
    home.stop();
    A.conn?.stop();
    A.S = new Store();
    A.restore({ v: 1, device: "local", persona: "default", personaName: "Ducter", headSeq: 2, events: [ev(1, "user_msg", "CI 挂了吗"), ev(2, "ai_msg", "挂了，我在看。")], savedAt: Date.now() });
    expect(A.S.channel.length).toBeGreaterThan(0);
    expect(A.keptScreen()).toBe(true);
    page2(port);
    await until(() => A.status === "offline", 5000);
    await Bun.sleep(300);
    expect(said.filter((m) => m.t === "reach" && m.ok === false)).toHaveLength(0);
    // Still readable: the conversation is there, and nothing says the page broke.
    expect(A.S.channel.length).toBeGreaterThan(0);
    expect(A.settling()).toBe(false);
  });

  test("a task opened lately reads from its kept window, and the home is asked again when it answers", async () => {
    const kv = new Map<string, unknown>();
    const wins = taskWindows({ get: async (k) => kv.get(k) as any, set: async (k, v) => void (v === undefined ? kv.delete(k) : kv.set(k, v)) });
    const ev = (seq: number, text: string) => ({ seq, ts: new Date().toISOString(), stream: "task:t_ci", origin: "task", kind: "task_event", body: { taskId: "t_ci", role: "assistant", text } }) as LogEvent;
    await wins.keep({ device: "dev1", taskId: "t_ci", events: [ev(10, "找到原因了：缓存键里少了平台。"), ev(11, "改好了，CI 在跑。")], at: Date.now() });
    expect(await wins.get("dev2", "t_ci")).toBeUndefined();
    A.conn?.stop();
    A.S = new Store();
    A.taskWins = wins;
    A.glanceDevice = "dev1";
    await A.hydrateTask("t_ci");
    const t = A.S.tasks.get("t_ci")!;
    expect(t.events.map((e) => e.seq)).toEqual([10, 11]);
    expect(t.histStale).toBe(true);
  });
});

describe("a short drop never blocks the screen (D543)", () => {
  test("under LINK_QUIET_MS nothing is said; under 10 s at most the quiet line; the plain notice only from LONG_OUTAGE_MS", () => {
    const t0 = 1_000_000;
    expect(linkState("offline", t0, t0 + LINK_QUIET_MS - 1)).toBe("up");
    for (const dt of [LINK_QUIET_MS, 5000, 9999]) expect(linkState("offline", t0, t0 + dt)).toBe("back");
    expect(LONG_OUTAGE_MS).toBeGreaterThanOrEqual(10_000);
    expect(linkState("offline", t0, t0 + LONG_OUTAGE_MS)).toBe("lost");
  });

  test("a real drop of a few seconds: the page stays the app (no boot ground, no pair screen), the partner doesn't nap, and it comes back by itself", async () => {
    home = fakeHome();
    const port = home.port;
    page(port);
    await until(() => A.linkUp());
    home.stop();
    await until(() => A.status === "offline");
    const downAt = Date.now();
    // Inside the quiet window: as if nothing happened.
    expect(A.link()).toBe("up");
    expect(A.presence()).not.toBe("napping");
    expect(A.summaryParts().words).not.toContain("正在重新连上");
    expect(A.settling()).toBe(false);
    await Bun.sleep(LINK_QUIET_MS + 100);
    expect(A.link()).toBe("back");
    const back = fakeHomeOn(port);
    home = back;
    await until(() => A.linkUp(), 10_000);
    expect(Date.now() - downAt).toBeLessThan(10_000);
    expect(A.link()).toBe("up");
  }, 20_000);

  test("the composer is never disabled by the link: no connectivity check reaches the composer, its field or its send", () => {
    const composer = src("src/composer.tsx");
    const views = src("src/views.tsx");
    const body = views.slice(views.indexOf("function Composer("), views.indexOf("\nfunction ", views.indexOf("function Composer(") + 10));
    expect(body.length).toBeGreaterThan(500);
    const link = /A\.(status|link\(|linkUp|conn\b|S\.welcomed)|navigator\.onLine/;
    expect(link.test(body)).toBe(false);
    // The send is ready whenever there is something to send; the field is read-only only when its caller says so.
    expect(body).toContain("const canSend = !!value.trim() || !!pics.length;");
    expect(link.test(composer)).toBe(false);
  });
});

describe("drafts survive the page, per partner and per task (D543)", () => {
  test("each partner's draft is its own; the default keeps its old key; a task's draft is kept", () => {
    const m = new Map<string, string>();
    const s = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
    keepDraft("给小鸭的", "default", s);
    keepDraft("给阿岩的", "p_yan", s);
    expect(readDraft("default", s)).toBe("给小鸭的");
    expect(readDraft(s)).toBe("给小鸭的");
    expect(readDraft("p_yan", s)).toBe("给阿岩的");
    expect(m.has("ducter.draft")).toBe(true);
    keepTaskDrafts({ t_ci: "先别 rebase", t_empty: "  " }, s);
    expect(readTaskDrafts(s)).toEqual({ t_ci: "先别 rebase" });
  });
});

describe("the static boot ground never stays beside the app (D543)", () => {
  test("every draw into #app goes through paint(), whose first draw empties what Preact didn't make", () => {
    const main = src("src/main.tsx");
    // One render() call, inside paint().
    expect(main.match(/\brender\(/g)?.length).toBe(1);
    const paint = main.slice(main.indexOf("function paint("), main.indexOf("function paint(") + 300);
    expect(paint).toContain("root.replaceChildren()");
    expect(paint).toContain("render(vnode, root)");
    for (const r of ["paint(<BootWait", "paint(<Pairing", "paint(\n    <Guard"]) expect(main).toContain(r);
  });

  test("and the CSS hides it beside anything else, whatever draws", () => {
    expect(src("static/app.css")).toMatch(/#app > \.boot-wait\.static:not\(:only-child\) \{\s*display: none;/);
    expect(src("static/index.html")).toContain('<div id="app"><main class="boot-wait static"');
  });
});

describe("the app shell (D543)", () => {
  test("the page network-first with a short wait, its named code cache-first, and nothing under /api or /ws touched", () => {
    const sw = src("src/sw.ts");
    expect(sw).toContain('req.mode === "navigate" && PAGE.test(path)');
    expect(sw).toMatch(/SHELL_WAIT_MS = 3_000/);
    expect(sw).toContain("!want.has(k.url)"); // a version no page names is dropped
    const fetching = sw.slice(sw.indexOf('self.addEventListener("fetch"'), sw.indexOf('self.addEventListener("push"'));
    expect(fetching.length).toBeGreaterThan(200);
    expect(fetching).not.toMatch(/api|\/ws/);
    // Registered only outside the iPhone and Android apps (their own cache is the shell there, D209).
    expect(src("src/main.tsx")).toContain("if (!inApp()) void registerWorker(base)");
  });
});

/** The page on a home at `port` that may be down, keeping what restore() painted. */
function page2(port: number) {
  A.L = strings("zh");
  delete (A as { send?: unknown }).send; // another file stubbed it on the one page (door, done-today): the real one
  A.S.welcomed = false;
  A.pending = [];
  A.outbox = new Outbox(memoryStore());
  A.glanceDevice = "local";
  const base = new URL(`http://127.0.0.1:${port}/`);
  A.start(base, new Api(base, () => undefined), { via: "local", personaName: "Ducter", push: { supported: false } }, () => undefined);
}
