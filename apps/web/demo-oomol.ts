// A demo core for adding OOMOL Hosted with a key (D158): the real core and broker, with OOMOL's
// origin pointed at a local look-alike (MCP at /v1/mcp, a plain-text 401 gateway, GET /v1/apps), so
// every outcome can be seen on the phone and the Mac without a real key or the network.
//   DUCTER_PORT=7961 DUCTER_DATA_DIR=<scratch> DEMO_OOMOL=accounts bun apps/web/demo-oomol.ts
// DEMO_OOMOL: accounts (Gmail and Discord connected there) | empty (nothing connected yet) |
// many (already added: two Gmail, two Slack workspaces, Discord and a WeCom bot, each account
// named the way OOMOL names them, for the accounts card's crowded case, D192)
// The key that works: api_demo_key. Any other key is refused; an empty one is never sent.
import { startCore, stubRunner } from "@ducter/core";
import { httpLinker } from "../../packages/core/src/connections.ts";
import { fakeOpenConnector } from "../../packages/core/test/fake-mcp.ts";

const KEY = "api_demo_key";
const mode = process.env.DEMO_OOMOL ?? "accounts";
const app = (id: string, service: string, displayName: string, accountLabel: string) => ({ id, service, displayName, accountLabel, alias: null, authType: "oauth2", status: "active" });
const apps =
  mode === "empty"
    ? [{ id: "no_auth:hackernews", service: "hackernews", displayName: "Hacker News", accountLabel: "", authType: "no_auth", status: "active" }]
    : mode === "many"
      ? [
          app("a1", "gmail", "w-nowledge-mail", "w@nowledge-labs.ai"),
          app("a2", "gmail", "weyl-gmail", "weyl.gu@gmail.com"),
          app("a3", "discord", "wey", "wey"),
          app("a4", "slack", "nowledge-labs-inc", "Nowledge Labs, Inc"),
          app("a5", "slack", "nowledge-community", "nowledge-community"),
          app("a6", "wecom_bot", "wecom-sales-bot", "wecom-sales-bot"),
        ]
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
if (mode === "many" && !core.connections.view().length) {
  await core.connections.add({ url: "https://connector.oomol.com", token: KEY });
  // The person said not to read the WeCom bot.
  const id = core.connections.view()[0]?.id;
  if (id) core.connections.setApp(id, "wecom_bot", "wecom-sales-bot", { excluded: true });
}
console.log(`[demo-oomol] ${core.url.replace("ws://", "http://").replace("/ws", "/app")} · ${mode} · key ${KEY}`);
