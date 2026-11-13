// D206: the home's media store: what it reads from a picture, upload over HTTP (the gate, the
// caps, dedupe), the keyed GET, and messages that carry refs.
import { afterEach, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MEDIA_KEY, keyExpires, type Bodies, type MediaRef, type ServerFrame } from "@ducter/protocol";
import { startCore, type Core } from "../src/core.ts";
import { createMediaStore, sniffFile, sniffImage } from "../src/media.ts";
import { gif, jpeg, png, webp } from "./fixtures-media.ts";
import { openTask, tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

function boot(): Core {
  const t = tempDir();
  stops.push(t.cleanup);
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5, push: false });
  core.setPartner({ onTrigger: () => {} });
  stops.push(() => core.stop());
  return core;
}
const http = (core: Core, path: string) => `http://127.0.0.1:${core.port}/${path}`;

async function upload(core: Core, bytes: Uint8Array, extra: Record<string, string | Blob> = {}, headers: Record<string, string> = {}) {
  const form = new FormData();
  form.set("file", new Blob([bytes]), "IMG_0042.jpg");
  for (const [k, v] of Object.entries(extra)) form.set(k, v);
  const res = await fetch(http(core, "api/media"), { method: "POST", body: form, headers });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as { media?: MediaRef; error?: string } };
}

test("it reads a picture's type and pixel size from its header, an EXIF quarter turn included", () => {
  expect(sniffImage(png(1290, 2796))).toEqual({ type: "image/png", w: 1290, h: 2796 });
  expect(sniffImage(jpeg(4032, 3024))).toEqual({ type: "image/jpeg", w: 4032, h: 3024 });
  expect(sniffImage(jpeg(4032, 3024, 6))).toEqual({ type: "image/jpeg", w: 3024, h: 4032 });
  expect(sniffImage(gif(320, 240))).toEqual({ type: "image/gif", w: 320, h: 240 });
  expect(sniffImage(webp(1024, 768))).toEqual({ type: "image/webp", w: 1024, h: 768 });
  expect(sniffImage(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeUndefined();
  // A task's file: a known kind by its name, a PDF only when it is one.
  expect(sniffFile(new TextEncoder().encode("%PDF-1.7 …"), "report.pdf")).toEqual({ type: "application/pdf" });
  expect(sniffFile(new TextEncoder().encode("not a pdf"), "report.pdf")).toBeUndefined();
  expect(sniffFile(new TextEncoder().encode("a,b\n1,2"), "sales.csv")).toEqual({ type: "text/csv" });
  // D239: a script or source is text (kept as text/plain, never run); a binary by that name is not;
  // a secrets file never is.
  expect(sniffFile(new TextEncoder().encode("#!/bin/sh"), "run.sh")).toEqual({ type: "text/plain" });
  expect(sniffFile(new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0, 0, 1]), "run.sh")).toBeUndefined();
  expect(sniffFile(new TextEncoder().encode("TOKEN=x"), ".env")).toBeUndefined();
  expect(sniffFile(new TextEncoder().encode("TOKEN=x"), "prod.env")).toBeUndefined();
});

test("the same bytes are stored once; a second upload adds what the first lacked", () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const m = createMediaStore(t.dir);
  const a = m.put(png(800, 600));
  const b = m.put(png(800, 600), { preview: "data:image/jpeg;base64,/9j/AAAA", thumb: png(400, 300, 1) });
  expect(b.id).toBe(a.id);
  expect(a.preview).toBeUndefined();
  expect(b.preview).toBe("data:image/jpeg;base64,/9j/AAAA");
  expect(b.thumb?.id).toBeTruthy();
  expect(m.get(a.id)?.thumb?.id).toBe(b.thumb!.id);
  // A preview that isn't a small picture data: URL is dropped, never stored.
  expect(m.put(png(10, 10, 9), { preview: "javascript:alert(1)" }).preview).toBeUndefined();
  expect(() => m.refs(["f".repeat(64)])).toThrow(/didn't arrive/);
  expect(m.refs([a.id, a.id]).map((r) => r.id)).toEqual([a.id]);
});

test("upload: a picture is stored and answered with its ref; too big, not a picture and not signed in are refused", async () => {
  const core = boot();
  const r = await upload(core, png(1290, 2796), { thumb: new Blob([png(332, 720, 2)]), preview: "data:image/jpeg;base64,/9j/4AAQ" });
  expect(r.status).toBe(200);
  const m = r.body.media!;
  expect(m).toMatchObject({ type: "image/png", w: 1290, h: 2796, preview: "data:image/jpeg;base64,/9j/4AAQ" });
  expect(m.id).toMatch(/^[0-9a-f]{64}$/);
  expect(m.thumb?.id).toMatch(/^[0-9a-f]{64}$/);
  // Again: the same id (content-addressed).
  expect((await upload(core, png(1290, 2796))).body.media!.id).toBe(m.id);
  expect((await upload(core, new TextEncoder().encode("hello"))).status).toBe(415);
  const huge = new Uint8Array(26 * 1024 * 1024);
  huge.set(png(10, 10));
  expect((await upload(core, huge)).status).toBe(413);
  // Off this machine (a proxy in front): a paired device's token is needed, as for every /api route.
  expect((await upload(core, png(5, 5), {}, { "x-forwarded-for": "203.0.113.9" })).status).toBe(401);
  // Another site's page can't post one.
  expect((await upload(core, png(6, 6), {}, { origin: "https://evil.example" })).status).toBe(403);
});

test("a picture is served only with its key, immutable", async () => {
  const core = boot();
  const m = (await upload(core, png(640, 480))).body.media!;
  const ok = await fetch(http(core, `media/${m.id}?k=${m.k}`));
  expect(ok.status).toBe(200);
  expect(ok.headers.get("content-type")).toBe("image/png");
  expect(ok.headers.get("cache-control")).toContain("immutable");
  expect(new Uint8Array(await ok.arrayBuffer())).toEqual(png(640, 480));
  expect((await fetch(http(core, `media/${m.id}`))).status).toBe(404);
  expect((await fetch(http(core, `media/${m.id}?k=${"x".repeat(22)}`))).status).toBe(404);
  // An id with no key says nothing about whether the home holds it.
  expect((await fetch(http(core, `media/${"0".repeat(64)}?k=${m.k}`))).status).toBe(404);
  const thumb = await fetch(http(core, `media/${m.thumb?.id ?? m.id}?k=${m.thumb?.k ?? m.k}`));
  expect(thumb.status).toBe(200);
});

test("a task's file: shown as itself (sandboxed) for the viewer's fetch; &dl=1 always a download (D239)", async () => {
  const core = boot();
  const store = (core as unknown as { media: { put(b: Uint8Array, o?: object): MediaRef } }).media;
  const m = store.put(new TextEncoder().encode("# Investigation\n\nThe TTL test raced the clock.\n"), { files: true, name: "investigation.md", from: { taskId: "t1" } });
  expect(m.type).toBe("text/markdown");
  const view = await fetch(http(core, `media/${m.id}?k=${m.k}`));
  expect(view.headers.get("content-disposition")).toStartWith("inline;");
  expect(view.headers.get("content-security-policy")).toContain("sandbox");
  expect(await view.text()).toStartWith("# Investigation");
  const dl = await fetch(http(core, `media/${m.id}?k=${m.k}&dl=1`));
  expect(dl.headers.get("content-disposition")).toBe("attachment; filename*=UTF-8''investigation.md");
});

async function client(core: Core) {
  const frames: ServerFrame[] = [];
  const ws = new WebSocket(core.url);
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  stops.push(() => ws.close());
  ws.send(JSON.stringify({ t: "hello" }));
  const until = async (pred: (f: ServerFrame) => boolean) => {
    for (let i = 0; i < 300; i++) {
      const hit = frames.find(pred);
      if (hit) return hit;
      await Bun.sleep(10);
    }
    throw new Error(`timeout; got ${frames.map((f) => f.t)}`);
  };
  await until((f) => f.t === "on_hand");
  return { send: (f: object) => ws.send(JSON.stringify(f)), until, frames };
}

test("a message with pictures (and no words) is logged with their refs; the echo carries them", async () => {
  const core = boot();
  const a = (await upload(core, png(1290, 2796))).body.media!;
  const b = (await upload(core, jpeg(2048, 1536))).body.media!;
  const c = await client(core);
  c.send({ t: "send", text: "", clientId: "m1", media: [a.id, b.id] });
  const echo = (await c.until((f) => f.t === "events" && f.events.some((e) => e.kind === "user_msg"))) as Extract<ServerFrame, { t: "events" }>;
  const body = echo.events.find((e) => e.kind === "user_msg")!.body as Bodies["user_msg"];
  expect(body.text).toBe("");
  expect(body.media!.map((m) => [m.id, m.w, m.h, m.k])).toEqual([
    [a.id, 1290, 2796, a.k],
    [b.id, 2048, 1536, b.k],
  ]);
  // The Log keeps refs, never bytes.
  const logged = core.log.read({ kinds: ["user_msg"] })[0]!;
  expect(JSON.stringify(logged).length).toBeLessThan(2000);
  // An id the home doesn't hold: refused, nothing logged.
  c.send({ t: "send", text: "看这个", clientId: "m2", media: ["e".repeat(64)] });
  const err = (await c.until((f) => f.t === "error")) as Extract<ServerFrame, { t: "error" }>;
  expect(err.message).toMatch(/didn't arrive/);
  expect(core.log.read({ kinds: ["user_msg"] })).toHaveLength(1);
});

// D242: keys expire. A key names its end; it opens until then, the same through one window; a
// key from before D242 (no time in it) opens for a week after the home's first expiring key.
test("a key opens for about a day, then never; an old key gets a week's grace", () => {
  const t = tempDir();
  stops.push(t.cleanup);
  let at = Date.UTC(2026, 10, 13, 9, 30);
  const H = 3600_000;
  const m = createMediaStore(t.dir, { now: () => at });
  const r = m.put(png(64, 64));
  expect(r.k).toMatch(/^[0-9a-z]+\.[A-Za-z0-9_-]{22}$/);
  const end = keyExpires(r.k)!;
  expect(end - at).toBeGreaterThanOrEqual(MEDIA_KEY.hours * H);
  expect(end - at).toBeLessThanOrEqual((MEDIA_KEY.hours + MEDIA_KEY.windowHours) * H);
  // One window, one key (one cache entry).
  at += H;
  expect(m.key(r.id)).toBe(r.k);
  expect(m.verify(r.id, r.k)).toBe(true);
  // Another id's key, a changed time or a forged sig: no.
  const other = m.put(png(32, 32));
  expect(m.verify(r.id, other.k)).toBe(false);
  expect(m.verify(r.id, `${(Math.floor(end / 1000) + 3600).toString(36)}.${r.k.split(".")[1]}`)).toBe(false);
  // Past its end: closed.
  at = end + 1;
  expect(m.verify(r.id, r.k)).toBe(false);
  expect(m.verify(r.id, m.key(r.id))).toBe(true);
  // A pre-D242 key (an HMAC of the id alone): open in the grace week, then never.
  const legacy = createHmac("sha256", readFileSync(join(t.dir, "media", ".key"))).update(r.id).digest("base64url").slice(0, 22);
  expect(m.verify(r.id, legacy)).toBe(true);
  at = Date.UTC(2026, 10, 13, 9, 30) + MEDIA_KEY.legacyDays * 24 * H + 1;
  expect(m.verify(r.id, legacy)).toBe(false);
  // The grace starts once: a restarted home reads it back.
  const again = createMediaStore(t.dir, { now: () => at });
  expect(again.verify(r.id, legacy)).toBe(false);
});

test("refs are signed afresh as they leave; a client past its keys asks for new ones", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  let at = Date.UTC(2026, 10, 13, 9, 30);
  const m = createMediaStore(t.dir, { now: () => at });
  const r = m.put(png(64, 64), { thumb: png(32, 32, 1) });
  const stale = { ...r, k: "old", thumb: { id: r.thumb!.id, k: "old" } };
  const frame = { t: "events", events: [{ seq: 1, body: { text: "看", media: [stale] } }, { seq: 2, body: { text: "无图" } }] };
  at += 30 * 3600_000;
  const out = m.fresh(frame);
  const got = out.events[0]!.body.media![0]!;
  expect(got.k).toBe(m.key(r.id));
  expect(got.thumb!.k).toBe(m.key(r.thumb!.id));
  expect(m.verify(r.id, got.k)).toBe(true);
  // Untouched parts are the same objects; the frame given is never changed.
  expect(out.events[1]).toBe(frame.events[1]);
  expect(stale.k).toBe("old");
  expect(m.fresh({ t: "on_hand" })).toEqual({ t: "on_hand" });
  // keysFor: only ids the home holds.
  expect(m.keysFor([r.id, "e".repeat(64), 7, "../x"])).toEqual({ [r.id]: m.key(r.id) });
  expect(m.keysFor("nope")).toEqual({});

  // Over the wire: a frame carrying an old key arrives with a fresh one, and media_keys answers.
  const core = boot();
  const up = (await upload(core, png(640, 480))).body.media!;
  const c = await client(core);
  c.send({ t: "media_keys", ids: [up.id, "e".repeat(64)] });
  const ans = (await c.until((f) => f.t === "media_keys")) as Extract<ServerFrame, { t: "media_keys" }>;
  expect(Object.keys(ans.mediaKeys)).toEqual([up.id]);
  expect((await fetch(http(core, `media/${up.id}?k=${ans.mediaKeys[up.id]}`))).status).toBe(200);
});

test("a picture sent into a task reaches the runner with the words", async () => {
  const core = boot();
  openTask(core.log, "t1");
  const sent: { text: string; media?: MediaRef[] }[] = [];
  core.setRunner({ send: async (_id: string, text: string, _m: unknown, _f: unknown, _c: unknown, media?: MediaRef[]) => (sent.push({ text, ...(media ? { media } : {}) }), { delivered: "prompted" }) } as any);
  const shot = (await upload(core, png(1440, 900))).body.media!;
  const c = await client(core);
  c.send({ t: "task_send", taskId: "t1", text: "按钮在这里", clientId: "s1", media: [shot.id] });
  await c.until((f) => f.t === "sent");
  expect(sent).toHaveLength(1);
  expect(sent[0]!.text).toBe("按钮在这里");
  expect(sent[0]!.media!.map((m) => m.id)).toEqual([shot.id]);
});
