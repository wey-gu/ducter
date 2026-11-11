// A demo core for Settings › 伙伴's connection with the user's other AI agents (D205), in one state.
// No nmem runs: a scripted stand-in answers the read-only checks (and, for DEMO_BRIDGE=connecting,
// a connect that never returns). For pictures of each state, web and phone.
//   DUCTER_PORT=7798 DUCTER_DATA_DIR=/tmp/x DEMO_LANG=zh DEMO_BRIDGE=ready bun apps/web/demo-bridge.ts
// DEMO_BRIDGE: ready · connecting · connected · update · no_space · refused:<reason> · failed · unconfirmed
// then open http://127.0.0.1:7798/app#settings=partner
import { startCore, stubRunner } from "@ducter/core";
import { noOo } from "./demo-oo.ts";
import { REFUSALS } from "@ducter/core/src/bridge-link.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const want = process.env.DEMO_BRIDGE ?? "ready";
const reason = want.startsWith("refused:") ? want.slice("refused:".length) : undefined;
const code = reason ? Object.keys(REFUSALS).find((k) => REFUSALS[k] === reason) : undefined;
const SPACE = "6f1c0d2e-8b4a-4d1e-9c3f-2a7b5e0d9c11";
const ok = (j: unknown) => ({ code: 0, out: JSON.stringify(j), err: "" });
const conn = { connection_id: "00000000-0000-4000-8000-000000000001", agent_id: "ducter", identity_birth: "00000000-0000-4000-8000-000000000900", client_label: "ducter", state: "active" };
const run = async (args: string[]) => {
  const a = args.join(" ");
  if (args[0] === "--version") return ok(want === "update" ? "nmem 0.10.116" : "nmem 0.10.118");
  if (a.includes("bridge connections --help")) return { code: want === "update" ? 2 : 0, out: "", err: "" };
  if (a === "bridge setup")
    return ok({
      state: "selection_needed",
      candidates: [
        { id: "team-1", label: "dev team", kind: "team", readers: 7, write_default: false },
        ...(want === "no_space" ? [] : [{ id: SPACE, label: "Only me", kind: "personal", readers: 1, write_default: true }]),
      ],
    });
  if (a.includes("connections connect")) {
    if (want === "connecting") return new Promise<never>(() => {});
    if (code) return { code: 1, out: JSON.stringify({ error_code: code, detail: "refused", outcome_unknown: false, http_status: 403 }), err: "" };
    if (want === "failed") return { code: 1, out: "", err: "error: connection to Mem timed out after 30 s" };
    return ok({ state: "connected", agent_context: "ducter", connection: conn, selection: { scope: { space_id: SPACE }, address: { agent_id: "ducter" } } });
  }
  if (a.includes("--agent-context ducter bridge setup")) return want === "unconfirmed" ? { code: 1, out: "", err: "agent context could not be verified" } : ok({ state: "enable_needed", endpoint: { address: { agent_id: "ducter" } } });
  if (a.includes("connections list")) return ok({ schema_version: 1, connections: [conn], next_connection_id: null });
  if (a.includes("connections revoke")) return ok({ schema_version: 1, connection: { ...conn, state: "revoked" } });
  return { code: 2, out: "", err: "demo: not scripted" };
};

const core = startCore({ ooSource: noOo, persona: { id: "default", name: zh ? "小鸭" : "Duckie", identity: "" }, hostname: process.env.DUCTER_HOST || "127.0.0.1", update: { homeName: "hel" }, bridgeLink: { run, env: {} } });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.persona.mem = { agentId: "ducter", owned: true };
core.settings.setMemState("connected");
core.settings.set({ language: zh ? "zh" : "en" });
// States after a tap are reached by tapping, as the user would.
if (want !== "ready" && want !== "update" && want !== "no_space") void core.bridgeLink.connect();
console.log(`[demo] up at http://127.0.0.1:${core.port}/app#settings=partner (data: ${core.dataDir})`);
