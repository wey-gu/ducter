// D263 through the real core: a page says its device's shape in its hello, an Android app's model
// says it more exactly, and the devices frame carries it (kept in devices.db for when it is away).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { startCore, type Core } from "../src/core.ts";
import { stubRunner } from "../src/main.ts";
import { tempDir } from "./helpers.ts";

let td: ReturnType<typeof tempDir>;
let core: Core;
const sockets: WebSocket[] = [];

beforeAll(() => {
  td = tempDir();
  core = startCore({
    dataDir: join(td.dir, "home"),
    port: 0,
    push: false,
    deviceProbes: { cua: async () => ({ missing: "no" }), native: async () => undefined, harnesses: async () => [], kind: async () => "laptop" },
  });
  core.setRunner(stubRunner(core));
  core.setPartner({ onTrigger: () => {} });
});

afterAll(async () => {
  for (const ws of sockets) ws.close();
  await core?.stop();
  td?.cleanup();
});

async function connect(name: string, platform: string, frames: object[]) {
  const paired = core.devices.redeem(core.devices.createCode({ kind: "client" }).code, { name, platform }) as { token: string; device: { id: string } };
  const ws = new WebSocket(`ws://127.0.0.1:${core.port}/ws`, { headers: { authorization: `Bearer ${paired.token}` } } as any);
  sockets.push(ws);
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  for (const f of frames) ws.send(JSON.stringify(f));
  return paired.device.id;
}
const shapeOf = async (id: string) => (await core.devicesView.frame()).reach.clients.find((c) => c.id === id)?.shape;
const until = async (ok: () => Promise<boolean>, ms = 3000) => {
  const end = Date.now() + ms;
  while (!(await ok()) && Date.now() < end) await Bun.sleep(10);
  return ok();
};

describe("a handheld's shape (D263)", () => {
  test("an iPad's page says tablet; a computer's hello says nothing", async () => {
    const ipad = await connect("iPad · Ducter", "ios-app", [{ t: "hello", client: "web", shape: "tablet" }]);
    expect(await until(async () => (await shapeOf(ipad)) === "tablet")).toBe(true);
    const mac = await connect("Browser · Chrome", "macos", [{ t: "hello", client: "web" }]);
    await Bun.sleep(100);
    expect(await shapeOf(mac)).toBeUndefined();
  });

  test("a Pixel Fold's page says phone (Chrome hides the model), its app's model says foldable", async () => {
    const fold = await connect("Android phone · Ducter", "android-app", [
      { t: "hello", client: "web", shape: "phone" },
      { t: "handset_hello", state: { bridge: 1, sdk: 34, model: "Pixel Fold", service: false, pictures: true } },
    ]);
    expect(await until(async () => (await shapeOf(fold)) === "foldable")).toBe(true);
    // Its page says phone again on the next hello: still a foldable.
    sockets.at(-1)!.send(JSON.stringify({ t: "hello", client: "web", shape: "phone" }));
    await Bun.sleep(100);
    expect(await shapeOf(fold)).toBe("foldable");
  });
});
