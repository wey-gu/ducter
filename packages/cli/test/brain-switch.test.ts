// D89 end to end on OAR's scripted runtime: the real core, runner and partner. The person
// switches what the partner thinks with to Codex over the client socket (Partner › Switch);
// the next message starts a fresh Codex session, isolated by Codex's own method, with no
// resume of the Claude Code session id (the prompt-hash guard covers the harness).
import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scriptedRuntime } from "@botiverse/oar/testing";
import type { Runtime } from "@botiverse/oar/browser";
import { startCore } from "@ducter/core";
import { createPartner, noMemory } from "@ducter/partner";
import { createOarHarnessPort, createRunner } from "@ducter/runner";
import type { DeviceHarness, ServerFrame } from "@ducter/protocol";

const dir = mkdtempSync(join(tmpdir(), "ducter-brain-switch-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

test("a brain switch to Codex: the next turn runs on a fresh, isolated Codex session", async () => {
  const seen: { runtime: string; options: any; inputs: string[] }[] = [];
  const runtime = (id: "claude" | "codex"): Runtime => {
    const rt = scriptedRuntime({
      id,
      turn: async (t: any) => {
        seen.at(-1)?.inputs.push(String(t.input ?? ""));
        t.say?.(id === "codex" ? "（codex）在呢。" : "在呢。");
      },
    } as any);
    return new Proxy(rt, {
      get(target, prop, recv) {
        if (prop === "session")
          return (inst: any, options: any, ctx: any) => {
            seen.push({ runtime: id, options, inputs: [] });
            return (target as any).session(inst, options, ctx);
          };
        return Reflect.get(target, prop, recv);
      },
    });
  };
  const harnesses: DeviceHarness[] = [
    { harness: "claude-code", installed: true, loggedIn: true, canBePartner: true, billing: "plan" },
    { harness: "codex", installed: true, loggedIn: true, canBePartner: true, billing: "plan" },
  ];
  const core = startCore({ dataDir: dir, port: 0, batchMs: 5, push: false, deviceProbes: { cua: async () => ({ missing: "test" }), harnesses: async () => harnesses, kind: async () => "laptop" } });
  const port = createOarHarnessPort({ dataDir: dir, loadRuntime: async (h) => runtime(h === "codex" ? "codex" : "claude") });
  const runner = createRunner(core, { harness: port });
  core.setRunner(runner);
  const partner = createPartner(core, runner, { prewarm: false, memory: noMemory, bridge: null, persistState: false, onError: () => {} });
  core.setPartner(partner);
  try {
    core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "你好" } });
    await Bun.sleep(50);
    await partner.idle();
    expect(seen.map((s) => s.runtime)).toEqual(["claude"]);

    // Partner › Switch: over the socket, as the clients do.
    const ws = new WebSocket(core.url);
    const frames: ServerFrame[] = [];
    ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
    await new Promise((r) => (ws.onopen = r));
    ws.send(JSON.stringify({ t: "hello" }));
    ws.send(JSON.stringify({ t: "settings_set", patch: { brain: { harness: "codex" } } }));
    for (let i = 0; i < 100 && core.settings.get().brain.harness !== "codex"; i++) await Bun.sleep(10);
    expect(core.settings.get().brain).toEqual({ harness: "codex" });
    ws.close();

    core.log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "现在呢？" } });
    await Bun.sleep(50);
    await partner.idle();
    expect(seen.map((s) => s.runtime)).toEqual(["claude", "codex"]);
    const codex = seen[1]!.options;
    // A fresh session: the Claude Code session id is never handed to Codex.
    expect(codex.resume ?? codex.resumeSessionId ?? codex.sessionId).toBeUndefined();
    // Isolated by Codex's own method (per-session -c overrides), not Claude's userConfiguration.
    expect((codex.launchArgs ?? []).join(" ")).toContain("features.hooks=false");
    expect(codex.userConfiguration).toBeUndefined();
    // The fresh session gets the projection: the conversation so far is in its first input.
    expect(seen[1]!.inputs.join("\n")).toContain("你好");
  } finally {
    await partner.close();
    await (runner as any).dispose?.();
    await core.stop();
  }
});
