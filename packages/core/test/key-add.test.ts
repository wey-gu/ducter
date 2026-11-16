// D298: a key pasted in an app reaches the home once, is checked against a fake network, kept,
// and made what the partner thinks with when nothing could think before. No frame carries it back.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ServerFrame } from "@ducter/protocol";
import { startCore } from "../src/core.ts";
import { tempDir } from "./helpers.ts";

const DS = "sk-fedcba9876543210fedcba9876543210";

test("key_add: checked, kept, the partner thinks with it; the answer never carries the key", async () => {
  const t = tempDir();
  const calls: string[] = [];
  const keyFetch = (async (u: string | URL) => {
    calls.push(String(u));
    return new Response(JSON.stringify({ is_available: true }), { status: 200 });
  }) as typeof fetch;
  const core = startCore({
    dataDir: t.dir,
    port: 0,
    batchMs: 5,
    keyFetch,
    keyCanRun: (h) => h === "pi",
    deviceProbes: { cua: async () => null, harnesses: async () => [{ harness: "claude-code", installed: true, loggedIn: false }], kind: async () => "laptop" },
  });
  core.setPartner({ onTrigger: () => {} });
  try {
    const frames: ServerFrame[] = [];
    const raw: string[] = [];
    const ws = new WebSocket(core.url);
    ws.onmessage = (m) => (raw.push(String(m.data)), frames.push(JSON.parse(String(m.data))));
    await new Promise<void>((res) => (ws.onopen = () => res()));
    ws.send(JSON.stringify({ t: "hello", locale: "zh", client: "web" }));
    for (let i = 0; i < 300 && !frames.some((f) => f.t === "first_screen" && f.first.noBrain); i++) await Bun.sleep(10);
    expect(frames.some((f) => f.t === "first_screen" && f.first.noBrain === true)).toBe(true);
    ws.send(JSON.stringify({ t: "key_add", key: DS, clientId: "k1" }));
    for (let i = 0; i < 300 && !frames.some((f) => f.t === "key_add_result"); i++) await Bun.sleep(10);
    ws.close();
    const r = frames.find((f) => f.t === "key_add_result") as Extract<ServerFrame, { t: "key_add_result" }>;
    expect(r).toMatchObject({ clientId: "k1", result: { ok: true, provider: "deepseek", harness: "pi", model: "deepseek/deepseek-flash" } });
    expect(calls).toEqual(["https://api.deepseek.com/user/balance"]);
    expect(raw.join("\n")).not.toContain(DS);
    expect(readFileSync(join(t.dir, "keys.env"), "utf8")).toContain(`DEEPSEEK_API_KEY=${DS}`);
    expect(JSON.parse(readFileSync(join(t.dir, "settings.json"), "utf8")).brain).toEqual({ harness: "pi", model: "deepseek/deepseek-flash" });
    // Nothing of it in the Log.
    expect(JSON.stringify(core.log.read({ limit: 1000 }))).not.toContain(DS);
  } finally {
    core.stop();
    t.cleanup();
  }
});
