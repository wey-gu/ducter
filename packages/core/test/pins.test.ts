// D381: 置顶 / Pin on the home: the store (pins.json, newest first, ticks by their words, the limit,
// a restart keeps them) and the socket (a pinned block after the welcome, a tap on one device
// reaching every other, a tick, unpin, the refusals).
import { afterEach, expect, test } from "bun:test";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { PINS_MAX, type Bodies, type PinView, type ServerFrame } from "@ducter/protocol";
import { startCore, type Core } from "../src/core.ts";
import { openPins, PINS_FILE } from "../src/pins.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

const LIST = { type: "checklist" as const, title: "Packing list", items: ["Passport", "Charger", "Umbrella"], plain: "Packing list\n- Passport\n- Charger\n- Umbrella" };
const CHOICES = { type: "choices" as const, options: ["foo", "bar"], plain: "- foo\n- bar" };

function boot(): { core: Core; dir: string } {
  const t = tempDir();
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5 });
  stops.push(t.cleanup, () => core.stop());
  core.setPartner({ onTrigger: () => {} });
  return { core, dir: t.dir };
}

const said = (core: Core, ui: Bodies["ai_msg"]["ui"]) => core.log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: ui!.map((b) => b.plain).join("\n\n"), ui } }).seq;

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
  await next((f) => f.t === "pins");
  return { send: (f: object) => ws.send(JSON.stringify(f)), frames, next };
}
const pinsOf = (f: ServerFrame) => (f as Extract<ServerFrame, { t: "pins" }>).pins;

test("the store: a tap pins once, ticks by words, newest first, a restart keeps them, the file is private", () => {
  const { core, dir } = boot();
  let clock = Date.parse("2026-11-19T08:00:00Z");
  const pins = openPins({ dataDir: dir, log: core.log, now: () => new Date((clock += 1000)) });
  const a = said(core, [LIST]);
  const b = said(core, [{ type: "table", columns: ["", "Price"], rows: [["Mac mini", "$599"]], plain: "- Mac mini: Price $599" }]);
  const r = pins.pin(a, 0);
  expect(r.ok && r.pin).toMatchObject({ title: "Packing list", seq: a, index: 0, ticks: [], version: 1 });
  expect(pins.pin(a, 0)).toMatchObject({ ok: true, already: true });
  expect(pins.pin(b, 0).ok).toBe(true);
  expect(pins.list().map((p) => p.seq)).toEqual([b, a]);
  expect(pins.pin(b, 5)).toEqual({ ok: false, error: "gone" });
  expect(pins.pin(said(core, [CHOICES]), 0)).toEqual({ ok: false, error: "kind" });
  const id = (r as { pin: PinView }).pin.id;
  expect(pins.tick(id, "Charger", true)).toBe(true);
  expect(pins.tick(id, "Passport", true)).toBe(true);
  expect(pins.tick(id, "Not on it", true)).toBe(false);
  expect(pins.get(id)!.ticks).toEqual(["Passport", "Charger"]);
  const again = openPins({ dataDir: dir, log: core.log });
  expect(again.list().map((p) => p.id)).toEqual(pins.list().map((p) => p.id));
  expect(statSync(join(dir, PINS_FILE)).mode & 0o777).toBe(0o600);
  expect(pins.unpin(id)).toBe(true);
  expect(pins.unpin(id)).toBe(false);
  expect(existsSync(join(dir, PINS_FILE))).toBe(true);
});

test("the strip holds at most PINS_MAX", () => {
  const { core, dir } = boot();
  const pins = openPins({ dataDir: dir, log: core.log });
  for (let i = 0; i < PINS_MAX; i++) expect(pins.pin(said(core, [{ ...LIST, title: `List ${i}` }]), 0).ok).toBe(true);
  expect(pins.pin(said(core, [LIST]), 0)).toEqual({ ok: false, error: "full" });
  expect(pins.claim([{ index: 0, want: true }]).size).toBe(0);
});

test("the socket: pinned after the welcome, a tap on one device reaches the other, ticks and unpin too", async () => {
  const { core } = boot();
  const seq = said(core, [LIST]);
  const phone = await client(core);
  const mac = await client(core);
  expect(pinsOf(phone.frames.find((f) => f.t === "pins")!)).toEqual([]);
  let from = mac.frames.length;
  phone.send({ t: "pin", seq, index: 0 });
  const got = pinsOf(await mac.next((f) => f.t === "pins" && pinsOf(f).length === 1, from));
  const id = got[0]!.id;
  from = mac.frames.length;
  phone.send({ t: "pin_tick", id, item: "Umbrella", on: true });
  expect(pinsOf(await mac.next((f) => f.t === "pins", from))[0]!.ticks).toEqual(["Umbrella"]);
  from = phone.frames.length;
  phone.send({ t: "pin", seq: said(core, [CHOICES]), index: 0 });
  expect(await phone.next((f) => f.t === "pins" && !!(f as { refused?: string }).refused, from)).toMatchObject({ refused: "kind" });
  from = phone.frames.length;
  mac.send({ t: "unpin", id });
  expect(pinsOf(await phone.next((f) => f.t === "pins", from))).toEqual([]);
  // A later welcome carries what is pinned now.
  phone.send({ t: "pin", seq, index: 0 });
  await mac.next((f) => f.t === "pins" && pinsOf(f).length === 1, mac.frames.length);
  const tablet = await client(core);
  expect(pinsOf(tablet.frames.find((f) => f.t === "pins")!)).toHaveLength(1);
});
