// A demo core for adding OOMOL Hosted with a key (D158): the real core and broker, with OOMOL's
// origin pointed at a local look-alike (MCP at /v1/mcp, a plain-text 401 gateway, GET /v1/apps), so
// every outcome can be seen on the phone and the Mac without a real key or the network.
//   DUCTER_PORT=7961 DUCTER_DATA_DIR=<scratch> DEMO_OOMOL=accounts bun apps/web/demo-oomol.ts
// DEMO_OOMOL: accounts (Gmail and Discord connected there) | empty (nothing connected yet)
// The key that works: api_demo_key. Any other key is refused; an empty one is never sent.
import { startCore, stubRunner } from "@ducter/core";
import { httpLinker } from "../../packages/core/src/connections.ts";
import { fakeOpenConnector } from "../../packages/core/test/fake-mcp.ts";

const KEY = "api_demo_key";
const empty = process.env.DEMO_OOMOL === "empty";
const apps = empty
  ? [{ id: "no_auth:hackernews", service: "hackernews", displayName: "Hacker News", accountLabel: "", authType: "no_auth", status: "active" }]
  : [
      { id: "a1", service: "gmail", displayName: "Gmail", accountLabel: "wey.gu@example.com", alias: "work", authType: "oauth2", status: "active" },
      { id: "a2", service: "discord", displayName: "Discord", accountLabel: "wey", alias: null, authType: "oauth2", status: "active" },
    ];
const fake = fakeOpenConnector([{ id: "gmail.search_threads", operationType: "read", run: () => ({ threads: [] }) }], KEY, { path: "/v1/mcp", plain401: true, apps });
const to = (u: string) => u.replace("https://connector.oomol.com", fake.url);

const core = startCore({
  persona: { id: "default", name: "Ducter", identity: "" },
  hostname: process.env.DUCTER_HOST || "127.0.0.1",
  deviceProbes: { cua: async () => ({ missing: "demo" }), harnesses: async () => [], kind: async () => "laptop" },
  connectionLinker: (u, k) => httpLinker(to(u), k),
  ooSource: { detect: () => ({ installed: false, account: false }), read: () => undefined },
  work: { connectionFetch: (u, i) => fetch(to(u), i) },
});
core.setRunner(stubRunner(core));
console.log(`[demo-oomol] ${core.url.replace("ws://", "http://").replace("/ws", "/app")} · ${empty ? "empty" : "accounts"} · key ${KEY}`);
