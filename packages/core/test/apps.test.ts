// D405: 小应用 / Apps on the home: the store (a folder per app, versions kept, data private, a
// restart keeps them) and the socket (the list after the welcome, an app opened as a composed
// document under its policy, a key written on one device reaching every other, an ask logged as
// the person's message from the app and held to one at a time, Made for you listing it).
import { afterEach, expect, test } from "bun:test";
import { statSync } from "node:fs";
import { join } from "node:path";
import { APP_ASKS_PER_HOUR, APP_VERSIONS_KEPT, appDocument, type AppOpen, type Bodies, type ServerFrame } from "@ducter/protocol";
import { startCore, type Core } from "../src/core.ts";
import { openApps } from "../src/apps.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

const TRIP = `<h1>北京出差花销</h1><script>document.body.dataset.n=(ducter.get("expenses")||[]).length</script>`;

function boot(): { core: Core; dir: string } {
  const t = tempDir();
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5 });
  stops.push(t.cleanup, () => core.stop());
  core.setPartner({ onTrigger: () => {} });
  return { core, dir: t.dir };
}

async function client(core: Core) {
  const frames: ServerFrame[] = [];
  const ws = new WebSocket(core.url);
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  stops.push(() => ws.close());
  ws.send(JSON.stringify({ t: "hello" }));
  const next = async (pred: (f: ServerFrame) => boolean, from = 0): Promise<ServerFrame> => {
    for (let i = 0; i < 300; i++) {
      const hit = frames.slice(from).find(pred);
      if (hit) return hit;
      await Bun.sleep(10);
    }
    throw new Error(`timeout; got ${frames.map((f) => f.t)}`);
  };
  await next((f) => f.t === "apps");
  return { send: (f: object) => ws.send(JSON.stringify(f)), frames, next };
}

test("the store: made, changed, versions kept to the limit, back, data private, a restart keeps them", () => {
  const { dir } = tempDir();
  let clock = Date.parse("2026-11-20T08:00:00Z");
  const apps = openApps({ dataDir: dir, now: () => new Date((clock += 1000)) });
  const r = apps.make("p1", { name: "  北京出差花销\n", html: TRIP, ask: "做个记花销的小应用" });
  if (!r.ok) throw new Error(r.error);
  expect(r.app).toMatchObject({ name: "北京出差花销", version: 1, persona: "p1" });
  expect(apps.make("p1", { name: "x", html: " " })).toMatchObject({ ok: false });
  for (let i = 0; i < APP_VERSIONS_KEPT + 3; i++) expect(apps.change(r.app.id, { html: `${TRIP}<!--${i}-->` }).ok).toBe(true);
  expect(apps.get(r.app.id)!.version).toBe(APP_VERSIONS_KEPT + 4);
  expect(apps.change(r.app.id, { edits: [{ find: "<h1>", replace: "<h2>" }, { find: "nope", replace: "" }] })).toMatchObject({ ok: false });
  expect(apps.put(r.app.id, "expenses", [{ what: "午饭", yuan: 48 }], "app")).toEqual({ ok: true });
  expect(apps.put(r.app.id, "", 1, "app").ok).toBe(false);
  expect(statSync(join(dir, "apps", r.app.id, "data.json")).mode & 0o777).toBe(0o600);
  // Back as far as kept, then no further.
  let backs = 0;
  while (apps.back(r.app.id).ok) backs++;
  expect(backs).toBe(APP_VERSIONS_KEPT);
  expect(apps.get(r.app.id)!.back).toBeUndefined();
  const again = openApps({ dataDir: dir });
  expect(again.list("p1").map((m) => m.name)).toEqual(["北京出差花销"]);
  expect(again.list("p2")).toEqual([]);
  expect(again.data(r.app.id)).toEqual({ expenses: [{ what: "午饭", yuan: 48 }] });
  expect(again.remove(r.app.id)).toBe(true);
  expect(again.list("p1")).toEqual([]);
});

test("the document: the policy before anything, the bridge, the app's file after it", () => {
  const doc = appDocument({ id: "a1", name: "x</script>", html: "<p>hi</p>", data: { k: "</script><script>alert(1)" } }, { transport: "message", dark: true, lang: "zh-CN" });
  expect(doc.indexOf("Content-Security-Policy")).toBeLessThan(doc.indexOf("<script>"));
  expect(doc).toContain("connect-src 'none'");
  expect(doc).toContain("default-src 'none'");
  // Data can't close the bridge's script element.
  expect(doc.split("</script>").length).toBe(3); // the bridge, and D421: the kit's select
  expect(doc.endsWith("<body><p>hi</p></body></html>")).toBe(true);
  expect(appDocument({ id: "a1", name: "x", html: "", data: {} }, { transport: "fetch" })).toContain("connect-src 'self'");
});

test("the socket: the list after the welcome, open, a key reaching the other device, an ask held to one at a time, Made for you", async () => {
  const { core } = boot();
  const r = core.apps.make(core.persona.id, { name: "北京出差花销", html: TRIP });
  if (!r.ok) throw new Error(r.error);
  core.log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: "做好了。", app: { id: r.app.id, name: r.app.name, version: 1, change: "made" } } });
  const a = await client(core);
  const b = await client(core);
  const list = (await a.next((f) => f.t === "apps")) as Extract<ServerFrame, { t: "apps" }>;
  expect(list.apps.map((x) => x.id)).toEqual([r.app.id]);

  a.send({ t: "app_open", id: r.app.id, dark: true, lang: "zh-CN" });
  const open = (await a.next((f) => f.t === "app_open")) as { app: AppOpen };
  expect(open.app.doc).toContain(`<h1>北京出差花销</h1>`);
  expect(open.app.doc).toContain(`"dark":true`);
  a.send({ t: "app_open", id: "nope" });
  expect(await a.next((f) => f.t === "app_open" && (f as { id: string }).id === "nope")).toMatchObject({ gone: true });

  const from = b.frames.length;
  a.send({ t: "app_put", id: r.app.id, key: "expenses", value: [{ what: "打车", yuan: 36 }] });
  expect(await b.next((f) => f.t === "app_data", from)).toMatchObject({ id: r.app.id, key: "expenses", by: "app" });
  expect(core.apps.data(r.app.id)).toEqual({ expenses: [{ what: "打车", yuan: 36 }] });

  a.send({ t: "app_ask", id: r.app.id, text: "今天汇率多少？", ref: "q1" });
  for (let i = 0; i < 100 && !core.log.read({ stream: "channel", kinds: ["user_msg"], limit: 5 }).length; i++) await Bun.sleep(10);
  const asked = core.log.read({ stream: "channel", kinds: ["user_msg"], limit: 5 }).at(-1)!.body as Bodies["user_msg"];
  expect(asked).toMatchObject({ text: "今天汇率多少？", app: { id: r.app.id, name: "北京出差花销", ask: "q1" } });
  a.send({ t: "app_ask", id: r.app.id, text: "again", ref: "q2" });
  expect(await a.next((f) => f.t === "app_ask_refused")).toMatchObject({ ref: "q2", why: "busy" });
  core.apps.answered(r.app.id, "q1");
  for (let i = 1; i < APP_ASKS_PER_HOUR; i++) core.apps.asked(r.app.id, `x${i}`), core.apps.answered(r.app.id);
  a.send({ t: "app_ask", id: r.app.id, text: "one more", ref: "q3" });
  expect(await a.next((f) => f.t === "app_ask_refused" && (f as { ref: string }).ref === "q3")).toMatchObject({ why: "limit" });

  // Typed in its sheet: the person's own words, about it.
  a.send({ t: "send", text: "加个合计", clientId: "c1", app: r.app.id });
  for (let i = 0; i < 100 && (core.log.read({ stream: "channel", kinds: ["user_msg"], limit: 5 }).at(-1)!.body as Bodies["user_msg"]).text !== "加个合计"; i++) await Bun.sleep(10);
  expect(core.log.read({ stream: "channel", kinds: ["user_msg"], limit: 5 }).at(-1)!.body).toMatchObject({ text: "加个合计", app: { id: r.app.id, name: "北京出差花销" } });

  const made = core.made.query(core.persona.id, { q: "小应用" });
  expect(made.items.map((i) => [i.kind, i.title, i.app?.id])).toEqual([["app", "北京出差花销", r.app.id]]);
  core.apps.remove(r.app.id);
  expect(core.made.query(core.persona.id, {}).items).toEqual([]);
});
