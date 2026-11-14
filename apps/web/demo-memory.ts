// A demo core for Settings › 记忆 / Memory and › 你的其他 AI (D257), in one state. No nmem runs: a
// scripted stand-in answers the read-only checks. Noted lines are seeded into the Log across a few
// days (realistic, not anyone's own memories). For pictures, web and phone.
//   DUCTER_PORT=7864 DUCTER_DATA_DIR=/tmp/x DEMO_LANG=zh DEMO_MEM=newer bun apps/web/demo-memory.ts
// DEMO_MEM: newer (connected, Bridge on, Mem says 0.10.121 is out; pipx copy) · on (connected, up to
//   date) · empty (connected, nothing noted yet) · off (switched off) · fresh (no nmem on the home) ·
//   sign_in (nmem there, not signed in) · old (0.10.116 by pipx: too old for Bridge)
// then open http://127.0.0.1:7864/app#settings=memory (or #settings=peers)
import { startCore, stubRunner } from "@ducter/core";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const want = process.env.DEMO_MEM ?? "newer";
const SPACE = "6f1c0d2e-8b4a-4d1e-9c3f-2a7b5e0d9c11";
const ok = (j: unknown) => ({ code: 0, out: JSON.stringify(j), err: "" });
const conn = { connection_id: "00000000-0000-4000-8000-000000000001", agent_id: "ducter", identity_birth: "00000000-0000-4000-8000-000000000900", client_label: "ducter", state: "active" };
const version = want === "old" ? "0.10.116" : "0.10.118";
const run = async (args: string[]) => {
  const a = args.join(" ");
  if (want === "fresh") return undefined;
  if (args[0] === "--version") return ok(`nmem ${version}`);
  if (a.includes("bridge connections --help")) return { code: want === "old" ? 2 : 0, out: "", err: "" };
  if (a === "status")
    return want === "sign_in"
      ? { code: 1, out: "", err: "not signed in" }
      : ok({ status: "healthy", backend: "cloud", update: { current: version, latest: want === "newer" ? "0.10.121" : version, update_available: want === "newer" } });
  if (a === "bridge setup") return ok({ state: "selection_needed", candidates: [{ id: SPACE, label: "Only me", kind: "personal", readers: 1, write_default: true }] });
  if (a.includes("connections connect")) return ok({ state: "connected", agent_context: "ducter", connection: conn, selection: { scope: { space_id: SPACE }, address: { agent_id: "ducter" } } });
  if (a.includes("--agent-context ducter bridge setup")) return ok({ state: "enable_needed", endpoint: { address: { agent_id: "ducter" } } });
  if (a.includes("connections list")) return ok({ schema_version: 1, connections: [conn], next_connection_id: null });
  return { code: 2, out: "", err: "demo: not scripted" };
};
// The home's nmem: a pipx copy, so Ducter can update it in one tap.
const NMEM = "/home/wei/.local/pipx/venvs/nmem-cli/bin/nmem";
const tools: Record<string, string> = want === "fresh" ? { pipx: "/usr/bin/pipx" } : { nmem: NMEM, pipx: "/usr/bin/pipx" };
const sys = {
  which: (c: string) => tools[c],
  exists: (p: string) => p === NMEM && want !== "fresh",
  read: () => undefined,
  list: () => [],
  real: (p: string) => p,
  home: "/home/wei",
  platform: "linux" as const,
  uid: 1000,
};
const exec = async () => new Promise<never>(() => {}); // a tap stays "updating…"

let shift = 0;
const clock = { now: () => Date.now() - shift, setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>) };
const core = startCore({ ooSource: noOo, clock, persona: { id: "default", name: zh ? "小鸭" : "Duckie", identity: "" }, hostname: process.env.DUCTER_HOST || "127.0.0.1", update: { homeName: "hel" }, bridgeLink: { run: run as never, env: {}, sys, exec } });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
if (want !== "fresh" && want !== "sign_in") core.persona.mem = { agentId: "ducter", owned: true };
core.settings.setMemState(want === "fresh" || want === "sign_in" ? "missing" : "connected");
core.settings.set({ language: zh ? "zh" : "en", ...(want === "off" ? { memory: false } : {}) });

// What it noted, as the partner writes it: a stated preference, a decision, a fact about the work.
const H = 3600_000;
const notes: [number, string, string][] = [
  [9 * 24 * H, "家里的网是电信，路由器在书房", "Home internet is on China Telecom; the router is in the study"],
  [4 * 24 * H, "HawDB 的发布说明用英文写", "HawDB release notes are written in English"],
  [2 * 24 * H + 3 * H, "Weizhen 负责 HawDB 的代码审查", "Weizhen reviews HawDB's code"],
  [26 * H, "测试统一用假时钟，不用真的 sleep", "Tests use the fake clock, never a real sleep"],
  [3 * H, "周报每周五下午发，发给整个组", "The weekly report goes out Friday afternoon, to the whole team"],
  [40 * 60_000, "开会别排在中午 12 点到 1 点", "No meetings between 12 and 1"],
];
if (want !== "empty" && want !== "fresh" && want !== "sign_in")
  for (const [back, z, e] of notes) {
    shift = back;
    core.log.append({ stream: "channel", origin: "partner", kind: "memory_noted", body: { title: zh ? z : e, memoryId: `m-${back}` } });
  }
shift = 0;
if (want === "newer" || want === "on" || want === "empty") void core.bridgeLink.connect();
console.log(`[demo] up at http://127.0.0.1:${core.port}/app#settings=memory (data: ${core.dataDir})`);
