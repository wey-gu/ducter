// D214: a task's page previewed through an address of its own: refused without its token, let in
// by the token for that port alone, forwarded with its own Host, its redirects kept here, its
// websocket (hot reload) carried both ways; and the home's side of the workbench frames.
import { afterEach, expect, test } from "bun:test";
import { backHeaders, createPreviews, forwardHeaders, loopbackOf } from "../src/preview.ts";
import { createWbFrames, saidPorts } from "../src/workbench.ts";
import { cspFor } from "../src/web.ts";
import type { LogEvent } from "@ducter/protocol";

const stops: (() => void)[] = [];
afterEach(() => {
  for (const s of stops.splice(0)) s();
});

function page() {
  const seen: { host?: string; cookie?: string | null; path?: string }[] = [];
  const srv = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req, s) {
      const u = new URL(req.url);
      seen.push({ host: req.headers.get("host") ?? undefined, cookie: req.headers.get("cookie"), path: u.pathname });
      if (u.pathname === "/hmr" && s.upgrade(req)) return;
      if (u.pathname === "/go") return new Response(null, { status: 302, headers: { location: `http://localhost:${s.port}/there`, "x-frame-options": "DENY" } });
      return new Response(`<title>App</title>${u.pathname}`, { headers: { "content-type": "text/html", "x-frame-options": "DENY", "set-cookie": "app=1; Path=/" } });
    },
    websocket: { message: (ws, m) => ws.send(`echo:${m}`) },
  });
  stops.push(() => srv.stop(true));
  return { srv, seen };
}

test("a preview: no token, refused; the token sets this port's cookie; then the page, as it expects", async () => {
  const { srv, seen } = page();
  const pv = createPreviews({ hostname: "127.0.0.1", route: () => ({ here: true }), loopback: loopbackOf });
  stops.push(() => pv.close());
  const { previewPort, token } = pv.open("t1", srv.port!);
  expect(pv.open("t1", srv.port!).previewPort).toBe(previewPort); // reused
  const base = `http://127.0.0.1:${previewPort}`;
  expect((await fetch(`${base}/`)).status).toBe(403);
  expect((await fetch(`${base}/__ducter/enter/wrong`, { redirect: "manual" })).status).toBe(403);
  const ping = await fetch(`${base}/__ducter/ping`);
  expect(ping.status).toBe(204);
  const enter = await fetch(`${base}/__ducter/enter/${token}?to=//evil.example`, { redirect: "manual" });
  expect(enter.status).toBe(302);
  expect(enter.headers.get("location")).toBe("/"); // never off this address
  const cookie = enter.headers.get("set-cookie")!.split(";")[0]!;
  expect(cookie).toBe(`__ducter_preview_${previewPort}=${token}`);
  const r = await fetch(`${base}/src/main.ts?x=1`, { headers: { cookie: `${cookie}; theirs=2` } });
  expect(r.status).toBe(200);
  expect(await r.text()).toContain("/src/main.ts");
  expect(r.headers.get("x-frame-options")).toBeNull();
  expect(r.headers.get("set-cookie")).toContain("app=1");
  const last = seen.at(-1)!;
  expect(last.host).toBe(`localhost:${srv.port}`);
  expect(last.cookie).toBe("theirs=2"); // the preview's own cookie never reaches the page
  const go = await fetch(`${base}/go`, { headers: { cookie }, redirect: "manual" });
  expect(go.headers.get("location")).toBe("/there");
  // Hot reload: the page's websocket, both ways.
  const got = await new Promise<string>((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${previewPort}/hmr`, { headers: { cookie } } as unknown as string[]);
    ws.onopen = () => ws.send("hi");
    ws.onmessage = (m) => (resolve(String(m.data)), ws.close());
    ws.onerror = () => reject(new Error("ws failed"));
    setTimeout(() => reject(new Error("timeout")), 3000);
  });
  expect(got).toBe("echo:hi");
  pv.close("t1");
  expect(pv.list()).toEqual([]);
});

test("a worker's page goes through its socket; a gone task is refused", async () => {
  const calls: { port: number; path: string }[] = [];
  let gone = false;
  const pv = createPreviews({
    hostname: "127.0.0.1",
    route: () => (gone ? undefined : { here: false, fetch: async (a) => (calls.push({ port: a.port, path: a.path }), { status: 200, headers: [["content-type", "text/plain"]], body: Buffer.from("from hel").toString("base64") }) }),
    loopback: loopbackOf,
  });
  stops.push(() => pv.close());
  const { previewPort, token } = pv.open("t2", 5173);
  const enter = await fetch(`http://127.0.0.1:${previewPort}/__ducter/enter/${token}`, { redirect: "manual" });
  const cookie = enter.headers.get("set-cookie")!.split(";")[0]!;
  const r = await fetch(`http://127.0.0.1:${previewPort}/a?b=1`, { headers: { cookie } });
  expect(await r.text()).toBe("from hel");
  expect(calls).toEqual([{ port: 5173, path: "/a?b=1" }]);
  gone = true;
  expect((await fetch(`http://127.0.0.1:${previewPort}/`, { headers: { cookie } })).status).toBe(410);
});

test("headers: hop headers dropped, Host and Origin as the page expects, redirects kept here", () => {
  const req = new Request("http://h:9/x", { headers: { cookie: "__ducter_preview_9=t; a=1", origin: "http://h:9", referer: "http://h:9/p?q=1", connection: "keep-alive" } });
  expect(forwardHeaders(req, "__ducter_preview_9", 5173)).toEqual([
    ["cookie", "a=1"],
    ["origin", "http://localhost:5173"],
    ["referer", "http://localhost:5173/p?q=1"],
    ["host", "localhost:5173"],
  ]);
  const back = backHeaders([["location", "http://127.0.0.1:5173/a"], ["x-frame-options", "DENY"], ["content-encoding", "gzip"]], 5173);
  expect(back.get("location")).toBe("/a");
  expect(back.get("x-frame-options")).toBeNull();
  expect(back.get("content-encoding")).toBeNull();
});

test("the page's CSP lets only this host's ports be framed", () => {
  const csp = cspFor(new Request("http://hel.example:7777/app", { headers: { host: "hel.example:7777" } }));
  expect(csp).toContain("frame-src http://hel.example:* https://hel.example:*");
  expect(csp).toContain("connect-src 'self' ws: wss: http://hel.example:*");
  expect(cspFor(new Request("http://x/app", { headers: { host: "bad host;script-src *" } }))).not.toContain("frame-src");
});

test("the ports a task's output named, newest first; the frames refuse a port that isn't its page", async () => {
  const ev = (seq: number, body: object): LogEvent => ({ seq, ts: "", persona: "p", stream: "task:t1", origin: "task", kind: "task_event", body: { taskId: "t1", role: "tool", ...body } }) as unknown as LogEvent;
  const events = [ev(1, { tool: { name: "Bash", input: { command: "bun run dev" }, output: "Local: http://localhost:5173/" } }), ev(2, { text: "Open http://127.0.0.1:3000 to see it" })];
  expect(saidPorts(events)).toEqual([3000, 5173]);
  const asked: unknown[] = [];
  const frames = createWbFrames({
    log: { read: () => events } as never,
    runner: () => ({ workbench: async (_id: string, req: { op: string }, extra: unknown) => (asked.push({ req, extra }), { op: "ports", ports: [{ port: 5173, via: "said" }] }) }) as never,
    previews: { open: () => ({ previewPort: 40001, token: "tk" }), close() {}, list: () => [] },
    exclude: () => [7777],
  });
  expect(await frames.handle("t1", { op: "preview", port: 9999 })).toEqual({ ok: false, error: "missing" });
  expect(await frames.handle("t1", { op: "preview", port: 5173 })).toEqual({ ok: true, answer: { op: "preview", port: 5173, previewPort: 40001, token: "tk" } });
  expect(asked[0]).toEqual({ req: { op: "ports" }, extra: { said: [3000, 5173], exclude: [7777] } });
  const refused = createWbFrames({ log: { read: () => [] } as never, runner: () => ({ workbench: async () => Promise.reject(Object.assign(new Error("conflict"), { code: "conflict" })) }) as never, exclude: () => [] });
  expect(await refused.handle("t1", { op: "write", path: "a", text: "", base: "" })).toEqual({ ok: false, error: "conflict" });
});
