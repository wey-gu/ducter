# 44. OOMOL Hosted: the real MCP endpoint, its key, and what it lists

> 2026-11-10 · Why: the author added OOMOL Hosted in Settings › 账号 with
> `https://connector.oomol.com` and got "这个地址上没有 Ducter 能用的账号服务。" (not_mcp), shown in
> a green, checked banner. Feeds D158. Probed without any key: no key of the author's was used,
> looked for or read, and no oo file was opened.

## 1. What was read and probed

- **Public repos**, cloned `--depth 1` into the session scratchpad and read only (nothing run),
  2026-11-10:
  - `oomol-lab/dsh-oomol` (OOMOL's own connector plugin for DeepSeek Harness);
  - `oomol-lab/connector-sdk` (OOMOL's TypeScript client for the hosted gateway);
  - `oomol-lab/oo-cli` (the `oo` CLI);
  - `oomol-lab/open-connector` (self-hosted OpenConnector; its MCP server in `src/mcp.ts`);
  - `oomol-lab/wanta` (OOMOL's desktop agent, docs only).
- **The console's route table**: the public JS bundle of `https://console.oomol.com`
  (`/assets/index-*.js`), searched for its page paths.
- **The hosted service**, with `curl`, no credentials or a made-up one.

## 2. The endpoint

- **MCP lives at `https://connector.oomol.com/v1/mcp`, Streamable HTTP.** DOCUMENTED:
  - `dsh-oomol/src/runtime.ts`: `DEFAULT_MCP_ENDPOINT = "https://connector.oomol.com/v1/mcp"`;
  - its README: "`endpoint` · `https://connector.oomol.com/v1/mcp` · Streamable HTTP MCP endpoint".
- **VERIFIED** (2026-11-10, no key):
  - `POST /v1/mcp` with an MCP `initialize` and no `Authorization` → `401`,
    `{"errorMessage":"Unauthorized"}`, and
    `WWW-Authenticate: Bearer resource_metadata="https://connector.oomol.com/.well-known/oauth-protected-resource/v1/mcp"`.
  - That metadata answers `200`: resource `https://connector.oomol.com/v1/mcp`, authorization
    server `https://api.oomol.com`, scope `connector:use`, `bearer_methods_supported: ["header"]`.
  - `GET /v1/mcp` → `405` (a POST endpoint, as Streamable HTTP is).
- **`/mcp` (what Ducter used) is not an endpoint.** VERIFIED: `GET`/`POST
  https://connector.oomol.com/mcp`, `/`, `/sse`, `/api/mcp`, `/zzz`, `/v1/nonexistent` all answer
  the same gateway `401` with the plain text `token not found` (with a made-up Bearer:
  `invalid token`). The gateway sits in front of every path, so with no key `/mcp` looks exactly
  like `/v1/mcp`. INFERRED: with a valid key, `/mcp` would then answer 404.
- **The base for the HTTP API is `https://connector.oomol.com/v1`.** DOCUMENTED:
  `connector-sdk/src/connector.ts` `DEFAULT_BASE_URL = "https://connector.oomol.com/v1"`.
- `/.well-known/oauth-protected-resource` (bare) and `/.well-known/oauth-authorization-server`
  answer 404 (VERIFIED), as research/35 §4b found.

## 3. The key

- **`Authorization: Bearer <API key>`.** DOCUMENTED:
  - `connector-sdk` README: `new Connector({ apiKey })` "→ Authorization: Bearer <apiKey>";
    `src/connector.ts` sets `authorization: Bearer ${apiKey}`;
  - `dsh-oomol/src/runtime.ts`: `{ Authorization: \`Bearer ${apiKey}\`, ...x-oo-team-name }`.
- **The key is made at `https://console.oomol.com/api-key`.** DOCUMENTED: both READMEs ("Create
  an OOMOL MCP API key in OOMOL Console (https://console.oomol.com/api-key)"). VERIFIED: the
  console bundle's route table has `"api-key"`. dsh-oomol's example key starts `api_…`; a
  project key starts `oo_proj_…` (connector-sdk).
- **Not `x-api-key`.** VERIFIED: a made-up `x-api-key` header gets the app's own
  `Unauthorized`, while a made-up Bearer gets the gateway's `invalid token`: only the Bearer
  header is read.
- **Optional team:** `x-oo-team-name: <team>` picks a team identity (DOCUMENTED, dsh-oomol,
  oo-cli). Ducter sends none: the key's own account.
- **oo itself sends the raw key, no `Bearer `** to `https://connector.<endpoint>` (DOCUMENTED,
  `oo-cli/src/application/commands/connector/target.ts`), so the gateway takes both forms
  (INFERRED). Ducter uses the documented Bearer form.
- **OAuth.** The resource metadata names `api.oomol.com` as an authorization server (scope
  `connector:use`), so an MCP OAuth sign-in may also work. Not needed: the API key is the
  documented path for programs.

## 4. What it can read: accounts and tools

- **Connected accounts: `GET /v1/apps?status=active`**, Bearer key, answer
  `{ data: [appView] }` with `service`, `displayName`, `accountLabel`, `alias`, `authType`,
  `status`, `isDefault`. DOCUMENTED: `oo-cli/.../connector/shared.ts` ("Backed by
  `GET /v1/apps?status=active`, which the OOMOL service and the open-source self-hosted runtime
  both implement with the same `{ data: [appView] }` envelope"); dsh-oomol calls the same route.
  - The list also holds virtual entries that are not accounts: ids `no_auth:<service>` and
    `marketplace:<…>` (DOCUMENTED, dsh-oomol `VIRTUAL_APP_ID`). Ducter leaves them out.
  - VERIFIED only that `GET /v1/apps` without a key is the gateway's `401 token not found`.
- **Tools.** Self-hosted OpenConnector's MCP lists five: `list_apps`, `list_connections`,
  `search_actions`, `get_action_guide`, `execute_action` (VERIFIED in `open-connector/src/mcp.ts`).
  Note `list_apps` there is the provider catalog, not the connected accounts.
  - Hosted: INFERRED the same discovery set (dsh-oomol describes one "search Actions, load the
    guide, execute" surface for both modes). **Not verified without a key.** Ducter therefore
    treats anything at the hosted address as OOMOL Hosted whatever its tool list, and decides read
    or write from `get_action_guide`'s `operationType` as before; if the hosted list differs,
    every action counts as a write (asks Go), which is safe.
  - Which tool means mail, calendar or Discord: none by name; actions are found with
    `search_actions` and named `<service>.<action>` (`gmail.search_threads`). The account list
    above is what says "Gmail, Discord".
- **Where accounts are connected:** `https://console.oomol.com/app-connections`. VERIFIED in the
  console's route table (`"app-connections"`, plus `connections` mapped to the same page);
  dsh-oomol links `https://console.oomol.com/connections` and uses
  `https://console.oomol.com/app-connections/callback` for OAuth returns.

## 5. Why the author saw not_mcp in a green banner

VERIFIED by reading Ducter's code and the MCP SDK 1.32.2 it uses:

1. `normalizeUrl("https://connector.oomol.com")` gave `https://connector.oomol.com/mcp`: the
   wrong path (§2).
2. The gateway answered `401 token not found`. The SDK throws
   `StreamableHTTPError(401, "Error POSTing to endpoint: token not found")`, whose *message* is
   `Streamable HTTP error: Error POSTing to endpoint: token not found`: the status is only in
   `.code`. Ducter matched the message for `401|unauthorized|forbidden`, found none, and fell
   through to `not_mcp`. Ducter's own fake server answered 401 with `{"error":"unauthorized"}`,
   whose words matched, so the tests passed.
3. The key field was empty (the screenshot), so nothing could have worked; and even with a
   right key, `/mcp` would not have been the endpoint.
4. The Mac's Accounts tab showed every connection answer in its one toast, styled done (green,
   a check), refusals included.

## 6. Not verified without a real key

- That a console API key is accepted as Bearer at `/v1/mcp` (DOCUMENTED twice by OOMOL; not run).
- The hosted MCP tool list and `get_action_guide`'s shape there.
- `/v1/apps` field values on the hosted service (the shape is DOCUMENTED by oo-cli's schema).
- That `/mcp` answers 404 with a valid key.

One check by the author closes all four: add OOMOL Hosted with a key from
`console.oomol.com/api-key` and see "加上了 OOMOL，现在能看：Gmail、Discord".

## Implications for Ducter

- Use `https://connector.oomol.com/v1/mcp` for OOMOL Hosted, whatever form of the address the
  user types; move connections saved at `/mcp`.
- Send the key as `Authorization: Bearer`; never send an empty one to OOMOL Hosted.
- Classify by the HTTP status in the SDK error's `code` (401/403 refused, 5xx unreachable, other
  4xx not MCP), with the message only as a fallback.
- After the check, ask `GET /v1/apps?status=active` what is connected, leave out `no_auth:` and
  `marketplace:` entries, and say it plainly: the list, or "connected, but nothing connected
  there yet" with a link to `console.oomol.com/app-connections`.
- Link `console.oomol.com/api-key` for the key. OpenConnector's Access page and Create Token
  belong to self-hosted only.

**Summary.** OOMOL Hosted serves MCP at `/v1/mcp` with `Authorization: Bearer <API key>` from
`console.oomol.com/api-key`; its accounts list is `GET /v1/apps`. Ducter used `/mcp` and read
the gateway's plain-text 401 as "not MCP". Fixed in D158; one real-key check by the author
remains.
