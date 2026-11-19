// A frame the home began before it stopped (a settings push awaiting a probe) lands after the Log
// and the devices database are closed. It is dropped quietly: never an unhandled rejection, which
// Bun charges to whatever test runs next (the 0.0.94 CI failure, charged to agent_setup).
import { expect, test } from "bun:test";
import { startCore } from "../src/core.ts";
import { tempDir } from "./helpers.ts";

test("a settings push still under way when the home stops is dropped, not thrown", async () => {
  const t = tempDir();
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5, platform: "linux", deviceProbes: { cua: async () => undefined, native: async () => undefined, harnesses: async () => [], kind: async () => "server" } });
  core.setPartner({ onTrigger: () => {} });
  const ws = new WebSocket(core.url);
  const frames: { t: string }[] = [];
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise<void>((r) => (ws.onopen = () => r()));
  ws.send(JSON.stringify({ t: "hello" }));
  ws.send(JSON.stringify({ t: "settings" }));
  for (let i = 0; i < 300 && !frames.some((f) => f.t === "settings"); i++) await Bun.sleep(10);
  expect(frames.some((f) => f.t === "settings")).toBe(true);
  // The frame's own reads take a while (on CI, a probe does): it is still building when stop comes.
  const view = core.settings.view.bind(core.settings);
  (core.settings as { view: typeof view }).view = async () => (await Bun.sleep(150), view());
  core.settings.set({ language: "en" });
  await core.stop();
  ws.close();
  t.cleanup();
});

test("the next test runs clean after it", async () => {
  await Bun.sleep(300); // past the frame above, which would have rejected here
  expect(true).toBe(true);
});
