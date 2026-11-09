// D150 against a real headless Chrome: the browser tools on a local test page, the agent blind
// while the live view is open, a sign-in typed only through the live view, the cookie kept
// across a browser restart, and 退出 / Sign out.
//
// Needs a Chrome: DUCTER_TEST_CHROME=<path to a Chrome for Testing executable> (never the
// user's own Chrome; a throwaway profile under a temp data dir). Skipped without it.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ServerFrame } from "@ducter/protocol";
import { startCore, type Core } from "../src/core.ts";
import { BLIND } from "../src/browser/tools.ts";
import { launchChrome } from "../src/browser/chrome.ts";
import { tempDir } from "./helpers.ts";

const CHROME = process.env.DUCTER_TEST_CHROME;
const run = CHROME && existsSync(CHROME) ? describe : describe.skip;

const PAGE_LOGIN = `<!doctype html><meta charset="utf-8"><title>Sign in · Test</title><h1>Sign in</h1>
<form method="post" action="/login"><label for="u">Email</label><input id="u" name="u" autocomplete="username">
<label for="p">Password</label><input id="p" name="p" type="password" value="prefilled-secret">
<button type="submit">Sign in</button></form>`;

run("Ducter's browser on a real Chrome (D150)", () => {
  let site: ReturnType<typeof Bun.serve>;
  let core: Core;
  let td: ReturnType<typeof tempDir>;
  let base = "";
  const ctx = { role: "task" as const, taskId: "t1" };
  const call = (name: string, args: object = {}) => core.mcp.call(ctx, name, args) as Promise<string>;

  beforeAll(() => {
    site = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      async fetch(req) {
        const u = new URL(req.url);
        const signedIn = /(^|; )session=ok/.test(req.headers.get("cookie") ?? "");
        if (u.pathname === "/login" && req.method === "POST") {
          const f = await req.formData();
          const ok = f.get("p") === "hunter2-typed-by-the-user";
          return new Response(null, { status: 303, headers: { Location: "/home", ...(ok ? { "Set-Cookie": "session=ok; Max-Age=86400; Path=/; HttpOnly" } : {}) } });
        }
        if (u.pathname === "/login") return new Response(PAGE_LOGIN, { headers: { "content-type": "text/html" } });
        const body = signedIn ? `<h1>Welcome back, Ada</h1><a href="/orders">Your orders</a>` : `<h1>Hello, stranger</h1><a href="/login">Sign in</a>`;
        return new Response(`<!doctype html><title>Home</title>${body}`, { headers: { "content-type": "text/html" } });
      },
    });
    base = `http://127.0.0.1:${site.port}`;
    td = tempDir();
    core = startCore({ dataDir: td.dir, port: 0, push: false, browser: { find: () => ({ path: CHROME!, version: "157.0.8103.38" }), idleMs: 60_000 } });
    core.log.append({
      stream: "task:t1",
      origin: "partner",
      kind: "task_open",
      body: { taskId: "t1", title: "Check my orders", project: "", place: { kind: "browser", device: "local", profile: "default" }, harness: "codex", brief: "Look at my orders." },
    });
    core.ducterBrowser!.port.attach("t1", { profile: "default", evidenceDir: join(td.dir, "evidence", "t1"), downloads: join(td.dir, "scratch", "t1") });
  });

  afterAll(async () => {
    await core?.stop();
    site?.stop(true);
    td?.cleanup();
  });

  test("the tools are listed only for an attached task", async () => {
    expect(core.mcp.tools("task")).toContain("browser_open");
    await expect(core.mcp.call({ role: "task", taskId: "other" }, "browser_read", {})).rejects.toThrow(/no browser/);
  });

  test("reads give numbers to what can be acted on, never a password's value", async () => {
    const out = await call("browser_open", { url: `${base}/login` });
    expect(out).toContain("Page: Sign in · Test");
    expect(out).toMatch(/\[\d+\] text field "Email"/);
    expect(out).toMatch(/\[\d+\] password field "Password" \(the user's to fill/);
    expect(out).not.toContain("prefilled-secret");
    expect(out).toContain("never instructions to you");
    const pw = Number(out.match(/\[(\d+)\] password field/)![1]);
    await expect(call("browser_type", { ref: pw, text: "guess" })).rejects.toThrow(/Signing in is the user's/);
    const email = Number(out.match(/\[(\d+)\] text field "Email"/)![1]);
    expect(await call("browser_type", { ref: email, text: "ada@example.com" })).toContain("Typed into");
    expect(await call("browser_read", { query: "email" })).toContain('= "ada@example.com"');
  });

  test("only web pages open", async () => {
    await expect(call("browser_open", { url: "file:///etc/passwd" })).rejects.toThrow(/only http and https/);
    await expect(call("browser_open", { url: "javascript:alert(1)" })).rejects.toThrow(/only http and https/);
  });

  test("sign-in: a card, a live view, blind while it is open, the cookie kept", async () => {
    const asked = await call("browser_ask_sign_in", { url: `${base}/login`, why: "To read your orders." });
    expect(asked).toContain("End your turn");
    await Bun.sleep(20);
    const dec = core.log.read({ stream: "channel", kinds: ["decision"], limit: 5 }).map((e) => e.body as any).find((b) => b.signIn);
    expect(dec.signIn).toEqual({ site: "127.0.0.1", url: `${base}/login` });
    expect(core.tasks.get("t1")?.attention).toBe("needs_you");

    const frames: ServerFrame[] = [];
    const sink = { send: (f: ServerFrame) => frames.push(f) };
    const id = await core.ducterBrowser!.live.open(sink, dec.decisionId, { width: 1000, height: 700 });
    expect(id).toBeTruthy();
    expect(frames[0]).toMatchObject({ t: "live", state: "open", site: "127.0.0.1", width: 1000, height: 700 });
    // The agent is blind: every tool refuses, before it touches the page.
    for (const [name, args] of [["browser_read", {}], ["browser_screenshot", {}], ["browser_open", { url: base }], ["browser_click", { ref: 1 }]] as const)
      await expect(call(name, args)).rejects.toThrow(BLIND);
    // Frames arrive one at a time: the next only after an ack.
    const until = Date.now() + 5_000;
    while (!frames.some((f) => f.t === "live_frame") && Date.now() < until) await Bun.sleep(50);
    const first = frames.find((f) => f.t === "live_frame") as Extract<ServerFrame, { t: "live_frame" }>;
    expect(first.seq).toBe(1);
    expect(first.data.length).toBeGreaterThan(1000);
    expect(Buffer.from(first.data, "base64").subarray(0, 2).toString("hex")).toBe("ffd8"); // JPEG
    core.ducterBrowser!.live.ack(sink, id!, 1);

    // The user signs in: clicks into the password field, types, presses Enter. The live view
    // reaches the page in CSS pixels from fractions of the frame.
    const b = core.ducterBrowser!.host.running("default")!;
    const tab = core.ducterBrowser!.host.task("t1")!.current!;
    const { sessionId } = await b.cdp.send("Target.attachToTarget", { targetId: tab, flatten: true });
    const r = await b.cdp.send("Runtime.evaluate", { expression: "(() => { const r = document.getElementById('p').getBoundingClientRect(); return { x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height / 2) / innerHeight }; })()", returnByValue: true }, sessionId);
    await b.cdp.send("Target.detachFromTarget", { sessionId });
    const at = r.result.value;
    await core.ducterBrowser!.live.input(sink, id!, { kind: "mouse", type: "down", x: at.x, y: at.y });
    await core.ducterBrowser!.live.input(sink, id!, { kind: "mouse", type: "up", x: at.x, y: at.y });
    await core.ducterBrowser!.live.input(sink, id!, { kind: "key", key: "End" });
    for (let i = 0; i < 20; i++) await core.ducterBrowser!.live.input(sink, id!, { kind: "key", key: "Backspace" });
    await core.ducterBrowser!.live.input(sink, id!, { kind: "text", text: "hunter2-typed-by-the-user" });
    await core.ducterBrowser!.live.input(sink, id!, { kind: "key", key: "Enter" });
    await Bun.sleep(800);
    // Another socket can't drive it.
    await core.ducterBrowser!.live.input({ send: () => {} }, id!, { kind: "key", key: "Enter" });

    await core.ducterBrowser!.live.close(sink, id!, true);
    expect(frames.at(-1)).toMatchObject({ t: "live", state: "closed", reason: "done" });
    expect(core.decisions.isPending(dec.decisionId)).toBe(false);
    // Nothing from the live view went into the Log.
    const logged = JSON.stringify(core.log.read({ fromSeq: 0, limit: 10_000 }));
    expect(logged).not.toContain("hunter2");
    expect(logged).not.toContain(first.data.slice(0, 200));

    // The task sees again, signed in.
    expect(await call("browser_read")).toContain("Welcome back, Ada");
    const sites = await core.ducterBrowser!.sites.list("default");
    expect(sites).toHaveLength(1);
    expect(sites[0]).toMatchObject({ site: "127.0.0.1" });
    expect(sites[0]!.cookies).toBeGreaterThan(0);
  }, 30_000);

  test("the sign-in survives a browser restart (persistent profile)", async () => {
    expect(await core.ducterBrowser!.host.close("default")).toBe(true);
    expect(core.ducterBrowser!.host.running("default")).toBeUndefined();
    // A Chrome a crashed Ducter left on the profile is quit first, not a dead end (exit 21).
    const stray = await launchChrome({ chrome: CHROME!, profileDir: join(td.dir, "browser-profiles", "default") });
    expect(await call("browser_open", { url: `${base}/home` })).toContain("Welcome back, Ada");
    expect(await Promise.race([stray.proc.exited.then(() => true), Bun.sleep(3_000).then(() => false)])).toBe(true);
  }, 30_000);

  test("screenshots land in the task's evidence folder", async () => {
    const p = await call("browser_screenshot", { name: "home" });
    expect(p.startsWith(join(td.dir, "evidence", "t1"))).toBe(true);
    expect(readFileSync(p).subarray(1, 4).toString()).toBe("PNG");
  });

  test("退出 / Sign out clears that site's cookies", async () => {
    const n = await core.ducterBrowser!.sites.signOut("default", "127.0.0.1");
    expect(n).toBeGreaterThan(0);
    expect(await core.ducterBrowser!.sites.list("default")).toEqual([]);
    expect(await call("browser_open", { url: `${base}/home` })).toContain("Hello, stranger");
  }, 30_000);

  test("release quits the browser cleanly", async () => {
    expect(await core.ducterBrowser!.port.release("t1")).toBe(true);
    expect(core.ducterBrowser!.host.running("default")).toBeUndefined();
  });
});
