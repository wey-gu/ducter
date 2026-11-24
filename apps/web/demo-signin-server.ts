// A demo core for D518: signing Claude Code in on a server home (hel, "Hetzner Server"), the card's
// tray and the sign-in's states. Real core and real web client; Claude Code's own sign-in is a fake
// process here (a link, then a pasted code), and its own check says whatever the demo says. Nothing
// reaches Anthropic, nothing is installed.
//   DUCTER_PORT=7996 DUCTER_DATA_DIR=$(mktemp -d) bun apps/web/demo-signin-server.ts
// then open http://127.0.0.1:7996/app#settings=devices, tap Hetzner Server, its Claude Code coin.
// On DEMO_CTL_PORT (default 7995): POST /say?s=link (the link comes), /say?s=invalid (a wrong code),
// /exit?code=0 (its sign-in ends), /signed?on=1 (its own check says signed in), /reset.
// DEMO_WAIT_MS, DEMO_CHECK_MS: how long a sign-in and a pasted code wait (to show their ends).
import type { LoginProc } from "../../packages/core/src/agent-setup.ts";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

let signed = false;
let proc: { say: (t: string) => void; exit: (c: number) => void } | undefined;
const LINK = "https://claude.com/cai/oauth/authorize?code=true&client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e&response_type=code&redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback&scope=user%3Ainference&state=demo";

const core = startCore({
  ooSource: noOo,
  persona: { id: "default", name: "Ducter", identity: "" },
  hostname: "127.0.0.1",
  platform: "linux",
  deviceProbes: {
    cua: async () => ({ missing: "no" }),
    native: async () => undefined,
    harnesses: async () => [
      { harness: "claude-code", installed: true, loggedIn: signed, version: "2.1.331", how: "ducter" },
      { harness: "codex", installed: true, loggedIn: true, version: "0.172.0", how: "installer" },
      { harness: "antigravity", installed: true, loggedIn: true, version: "1.5.16", how: "installer" },
    ],
    kind: async () => "server",
  },
  update: { fetch: async () => new Response(JSON.stringify({ tag_name: "v0.1.38", body: "" })), how: "self", version: "0.1.38", homeName: "Hetzner Server", autoEveryMs: 0, run: () => new Promise(() => {}) },
  agents: { fetch: (async () => new Response("", { status: 404 })) as any, sys: { fetch: (async () => new Response("", { status: 404 })) as any, run: () => new Promise(() => {}), freeBytes: () => undefined, sleep: (ms) => Bun.sleep(ms), now: () => Date.now() }, autoEveryMs: 0 },
  memPlugins: { inspectLocal: async () => ({}), everyMs: 0, connected: () => false },
  agentSetup: {
    sys: {
      platform: "linux",
      arch: "x64",
      download: async () => new Uint8Array(),
      run: async () => ({ code: 0, out: "" }),
      which: (c) => (c === "claude" ? "/root/.ducter/tools/node/bin/claude" : null),
      env: () => ({}),
      spawn: (): LoginProc => {
        const fns: ((t: string) => void)[] = [];
        let end!: (c: number) => void;
        const exited = new Promise<number>((r) => (end = r));
        proc = { say: (t) => fns.forEach((f) => f(t)), exit: (c) => end(c) };
        return { onOutput: (fn) => void fns.push(fn), write: () => {}, kill: () => end(-1), exited };
      },
    },
    signedIn: async () => signed,
    ...(process.env.DEMO_WAIT_MS ? { waitMs: Number(process.env.DEMO_WAIT_MS) } : {}),
    ...(process.env.DEMO_CHECK_MS ? { checkMs: Number(process.env.DEMO_CHECK_MS) } : {}),
  },
});
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });

Bun.serve({
  port: Number(process.env.DEMO_CTL_PORT || 7995),
  fetch(req) {
    const u = new URL(req.url);
    if (u.pathname === "/say") proc?.say(u.searchParams.get("s") === "invalid" ? "Invalid code. Please make sure the full code was copied.\nPaste code here if prompted > " : `Opening browser to sign in…\nIf the browser didn't open, visit: ${LINK}\nPaste code here if prompted > `);
    if (u.pathname === "/exit") proc?.exit(Number(u.searchParams.get("code") ?? 0));
    if (u.pathname === "/signed") signed = u.searchParams.get("on") === "1";
    if (u.pathname === "/reset") {
      // As 不登录了 does from a client, then a look again: the card starts from 未登录.
      signed = false;
      const ws = new WebSocket(`ws://127.0.0.1:${core.port}/ws`);
      ws.onopen = () => {
        ws.send(JSON.stringify({ t: "hello" }));
        ws.send(JSON.stringify({ t: "agent_setup", device: "local", action: "cancel", harness: "claude-code" }));
        ws.send(JSON.stringify({ t: "agent_setup", device: "local", action: "look" }));
        setTimeout(() => ws.close(), 300);
      };
    }
    return new Response("ok");
  },
});
console.log(`demo at http://127.0.0.1:${core.port}/app#settings=devices`);
