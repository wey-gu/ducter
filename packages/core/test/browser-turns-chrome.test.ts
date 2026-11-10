// D190 against a real headless Chrome: 看它上网 / Watch it browse while a task works (the page
// keeps its own size, the user's input goes nowhere, each step reaches the watcher's line), then
// 换我来 / My turn (the task blind, the page at the viewer's size, the user's taps, IME text and a
// typed address go in), 还给它 / Hand it back (the task sees again and is told what changed),
// and a paused view gets no frames. Nothing of it reaches the Log.
//
// Needs a Chrome: DUCTER_TEST_CHROME=<path to a Chrome for Testing executable> (never the user's
// own Chrome; a throwaway profile under a temp data dir). Skipped without it.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { LiveDoing, ServerFrame } from "@ducter/protocol";
import { startCore, type Core } from "../src/core.ts";
import { stubRunner } from "../src/main.ts";
import { BLIND } from "../src/browser/tools.ts";
import { tempDir } from "./helpers.ts";

const CHROME = process.env.DUCTER_TEST_CHROME;
const run = CHROME && existsSync(CHROME) ? describe : describe.skip;

const FORM = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Order form</title>
<h1>Order form</h1><label for="n">Name</label><input id="n" name="n" style="font-size:20px;width:90%">
<p><a href="/next">Next step</a></p><button id="go" onclick="document.title='Clicked'">Check stock</button>`;

run("Watch it browse, and taking turns, on a real Chrome (D190)", () => {
  let site: ReturnType<typeof Bun.serve>;
  let core: Core;
  let td: ReturnType<typeof tempDir>;
  let base = "";
  const told: [string, string][] = [];
  const ctx = { role: "task" as const, taskId: "t1" };
  const call = (name: string, args: object = {}) => core.mcp.call(ctx, name, args) as Promise<string>;
  const frames: ServerFrame[] = [];
  const sink = { send: (f: ServerFrame) => frames.push(f) };
  const live = () => core.ducterBrowser!.live;
  const lastFrame = () => frames.filter((f) => f.t === "live_frame").at(-1) as Extract<ServerFrame, { t: "live_frame" }> | undefined;
  const until = async (ok: () => boolean, ms = 15_000) => {
    const end = Date.now() + ms;
    while (!ok() && Date.now() < end) await Bun.sleep(30);
    return ok();
  };
  /** The page in the task's tab, read straight from CDP (a test's own look, not a tool). */
  const look = async (expression: string) => {
    const b = core.ducterBrowser!.host.running("default")!;
    const tab = core.ducterBrowser!.host.task("t1")!.current!;
    const { sessionId } = await b.cdp.send("Target.attachToTarget", { targetId: tab, flatten: true });
    const r = await b.cdp.send("Runtime.evaluate", { expression, returnByValue: true }, sessionId);
    await b.cdp.send("Target.detachFromTarget", { sessionId });
    return r.result.value;
  };
  let id = "";
  /** Ack each frame as a client does once it is on screen; keeps the stream going. */
  let acking = true;
  const acker = setInterval(() => {
    const f = lastFrame();
    if (acking && f && id) live().ack(sink, id, f.seq);
  }, 40);

  beforeAll(() => {
    site = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch(req) {
        const u = new URL(req.url);
        if (u.pathname === "/next") return new Response(`<!doctype html><title>Step two</title><h1>Step two</h1>`, { headers: { "content-type": "text/html" } });
        return new Response(FORM, { headers: { "content-type": "text/html; charset=utf-8" } });
      },
    });
    base = `http://127.0.0.1:${site.port}`;
    td = tempDir();
    core = startCore({ dataDir: td.dir, port: 0, push: false, browser: { find: () => ({ path: CHROME!, version: "157.0.8103.38" }), idleMs: 60_000 } });
    const r = stubRunner(core);
    r.send = async (taskId, text) => (told.push([taskId, text]), { delivered: "prompted" });
    core.setRunner(r);
    core.log.append({
      stream: "task:t1",
      origin: "partner",
      kind: "task_open",
      body: { taskId: "t1", title: "Order more filter paper", project: "", place: { kind: "browser", device: "local", profile: "default" }, harness: "codex", brief: "Order filter paper." },
    });
    core.tasks.setState("t1", "working", "hot");
    core.ducterBrowser!.port.attach("t1", { profile: "default", evidenceDir: join(td.dir, "evidence", "t1"), downloads: join(td.dir, "scratch", "t1") });
  });

  afterAll(async () => {
    clearInterval(acker);
    await core?.stop();
    site?.stop(true);
    td?.cleanup();
  });

  test("On hand marks the task as holding Ducter's browser", () => {
    const card = core.tasks.onHand().tasks.find((c) => c.taskId === "t1");
    expect(card?.browsing).toEqual({ device: "local" });
  });

  test("watching: the task's tab at its own size, the task's steps on the line, the user's input goes nowhere", async () => {
    await call("browser_open", { url: `${base}/` });
    const pageW = await look("innerWidth");
    id = (await live().watch(sink, "t1", { width: 390, height: 700, scale: 2 }))!;
    expect(id).toBeTruthy();
    expect(frames[0]).toMatchObject({ t: "live", state: "open", decisionId: "watch", turn: "agent", here: false, taskId: "t1", task: { title: "Order more filter paper", harness: "codex" } });
    expect(core.ducterBrowser!.host.blind("default")).toBe(false);
    expect(await until(() => !!lastFrame())).toBe(true);
    // The page keeps its own width: the screencast scales it for the phone, the task's layout stays.
    expect(await look("innerWidth")).toBe(pageW);
    expect(lastFrame()!.width).toBe(pageW);
    expect(Buffer.from(lastFrame()!.data, "base64").subarray(0, 2).toString("hex")).toBe("ffd8");
    // The task's own steps reach the watcher: a read, then a click with the button's words and where.
    const out = await call("browser_read");
    const ref = Number(out.match(/\[(\d+)\] button "Check stock"/)![1]);
    await call("browser_click", { ref });
    const doing = frames.filter((f) => f.t === "live_doing").map((f) => (f as { doing: LiveDoing }).doing);
    expect(doing.map((x) => x.kind)).toEqual(["read", "click"]);
    expect(doing[1]).toMatchObject({ kind: "click", label: "Check stock" });
    expect(doing[1]!.x).toBeGreaterThan(0);
    expect(doing[1]!.y).toBeGreaterThan(0);
    // In the task's turn nothing the user does goes in.
    await live().input(sink, id, { kind: "go", url: `${base}/next` });
    await live().input(sink, id, { kind: "text", text: "nope" });
    await Bun.sleep(300);
    expect(await look("location.pathname")).toBe("/");
    expect(await call("browser_read")).toContain("Page: Clicked");
  }, 60_000);

  test("换我来 / My turn: the task is blind, the page takes the viewer's size, the user's taps and words go in", async () => {
    await live().turn(sink, id, true);
    expect(frames.at(-1)).toMatchObject({ t: "live_turn", id, turn: "you", here: true });
    expect(core.ducterBrowser!.host.blind("default")).toBe(true);
    await expect(call("browser_read")).rejects.toThrow(BLIND);
    expect(await look("innerWidth")).toBe(390);
    expect(await until(() => lastFrame()?.width === 390)).toBe(true);
    // A tap on the Name field, then Chinese through the IME (one insertText), then Enter.
    const at = await look("(() => { const r = document.getElementById('n').getBoundingClientRect(); return { x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height / 2) / innerHeight }; })()");
    await live().input(sink, id, { kind: "mouse", type: "down", x: at.x, y: at.y });
    await live().input(sink, id, { kind: "mouse", type: "up", x: at.x, y: at.y });
    await live().input(sink, id, { kind: "text", text: "林小满" });
    expect(await look("document.getElementById('n').value")).toBe("林小满");
    // Only web pages: a typed javascript: address does nothing.
    await live().input(sink, id, { kind: "go", url: "javascript:document.title='pwned'" });
    await Bun.sleep(200);
    expect(await look("document.title")).not.toBe("pwned");
    await live().input(sink, id, { kind: "go", url: `${base}/next` });
    expect(await until(() => (lastFrame()?.url ?? "").endsWith("/next"))).toBe(true);
  }, 60_000);

  test("还给它 / Hand it back: the task sees again, at its own size, and is told what changed", async () => {
    await live().turn(sink, id, false);
    expect(frames.at(-1)).toMatchObject({ t: "live_turn", id, turn: "agent", here: false });
    expect(core.ducterBrowser!.host.blind("default")).toBe(false);
    await Bun.sleep(50);
    expect(told).toHaveLength(1);
    expect(told[0]![0]).toBe("t1");
    expect(told[0]![1]).toContain("handed Ducter's browser back");
    expect(told[0]![1]).toContain(`to "Step two" (${base}/next)`);
    expect(await look("innerWidth")).not.toBe(390);
    expect(await call("browser_read")).toContain("Page: Step two");
    // The typed name and the frames never reached the Log.
    const logged = JSON.stringify(core.log.read({ fromSeq: 0, limit: 10_000 }));
    expect(logged).not.toContain("林小满");
    expect(logged).not.toContain(lastFrame()!.data.slice(0, 200));
  }, 60_000);

  test("a paused view gets no frames until it's back; the stream reports its numbers", async () => {
    await live().pause(sink, id, true);
    await Bun.sleep(150);
    const n = frames.filter((f) => f.t === "live_frame").length;
    await call("browser_open", { url: `${base}/` });
    await Bun.sleep(600);
    expect(frames.filter((f) => f.t === "live_frame").length).toBe(n);
    await live().pause(sink, id, false);
    // Back in sight with nothing moving on the page: one still picture of it comes anyway.
    expect(await until(() => frames.filter((f) => f.t === "live_frame").length > n, 2_000)).toBe(true);
    await call("browser_scroll", { direction: "down" });
    expect(await until(() => frames.filter((f) => f.t === "live_frame").length > n)).toBe(true);
    const s = live().stats(id)!;
    expect(s.frames).toBeGreaterThan(2);
    expect(s.bytes).toBeGreaterThan(1000);
    expect(s.rttMs).toBeGreaterThanOrEqual(0);
    console.log(`[D190] watch stream: ${s.frames} frames, ${Math.round(s.bytes / 1024)} KB, ack round trip ${s.rttMs} ms, capture to send ${s.lagMs} ms, JPEG q${s.quality}`);
  }, 60_000);

  test("closing a watch leaves the task's tab and its turn alone", async () => {
    await live().close(sink, id);
    expect(frames.at(-1)).toMatchObject({ t: "live", state: "closed", reason: "closed" });
    expect(core.ducterBrowser!.host.task("t1")!.tabs.length).toBeGreaterThan(0);
    expect(await call("browser_read")).toContain("Order form");
    expect(told).toHaveLength(1);
  });

  test("closing in the user's turn hands it back too (the task is never left waiting)", async () => {
    const f2: ServerFrame[] = [];
    const s2 = { send: (f: ServerFrame) => f2.push(f) };
    const v = (await live().watch(s2, "t1", { width: 1000, height: 700 }))!;
    await live().turn(s2, v, true);
    await expect(call("browser_read")).rejects.toThrow(BLIND);
    await live().drop(s2);
    expect(core.ducterBrowser!.host.blind("default")).toBe(false);
    await Bun.sleep(50);
    expect(told.at(-1)![1]).toContain("handed Ducter's browser back");
    expect(told.at(-1)![1]).toContain("Your tab is still on");
  }, 60_000);
});
