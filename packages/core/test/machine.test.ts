// The welcome names the machine the main runs on, as a hash the desktop computes the same way
// (apps/desktop/internal/remote/machine_test.go pins the same value).
import { afterEach, expect, test } from "bun:test";
import { startCore } from "../src/core.ts";
import { machineHash, machineId, rawMachineId } from "../src/machine.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => unknown)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

test("the hash is pinned and never the raw id", () => {
  expect(machineHash("abc")).toBe("e9b710b3ae0609667ede5b3d95376ba1");
  expect(machineHash(undefined)).toBeUndefined();
  const raw = rawMachineId();
  if (raw) expect(machineId()).toBe(machineHash(raw)!), expect(machineId()).not.toContain(raw);
});

test("welcome carries the machine", async () => {
  const t = tempDir();
  const core = startCore({ dataDir: t.dir, port: 0 });
  stops.push(t.cleanup, () => core.stop());
  const ws = new WebSocket(core.url);
  stops.push(() => ws.close());
  const welcome = await new Promise<any>((resolve) => {
    ws.onopen = () => ws.send(JSON.stringify({ t: "hello" }));
    ws.onmessage = (m) => {
      const f = JSON.parse(String(m.data));
      if (f.t === "welcome") resolve(f);
    };
  });
  expect(welcome.machine).toBe(machineId());
  if (process.platform === "darwin" || process.platform === "linux") expect(welcome.machine).toMatch(/^[0-9a-f]{32}$/);
});
