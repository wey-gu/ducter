# 236: Antigravity's terms for a personal sign-in, what Ducter does with agy, and the other agents

Date: 2026-11-26. Asked by the author after a screenshot of Google's summary of the terms for
`agy acp` under `oauth-personal`: thin-client editors (Zed, JetBrains, Android Studio, Xcode)
permitted; outer agent harnesses that modify system instructions, handle tool definitions or
automate interactions not permitted; reading or writing agy's local credentials and polling
quota not permitted. A commenter: "using ACP doesn't make it fine; you must be a thin-client
editor, or you get banned". The author then set the bar (2026-11-26): Ducter's use of agy should
match how a reference GUI client for coding agents runs it; that client's name, repo and commit
are in `private/236-agy-reference.md`.

Tags: VERIFIED (read in the source or the code myself), DOCUMENTED (a vendor page says so),
INFERRED (my reading). Pages read 2026-11-26. No agy was run.

## 1. What Google's pages say

**Antigravity Additional Terms** (https://antigravity.google/terms), DOCUMENTED:
- §6: "Using third party software, tools, or services to access the Service (e.g. using
  OpenClaw with Antigravity OAuth) is a breach of this Agreement." "Such actions may be grounds
  for suspension or termination of your Antigravity and/or Gemini CLI accounts."
- No clause names ACP, editors, system instructions, tools, automation, credentials or quota. No
  "last updated" date on the page.

**Antigravity FAQ** (https://antigravity.google/docs/faq), DOCUMENTED:
- "Why can't I use third-party software (such as Claude Code, OpenClaw, or OpenCode) with my
  Antigravity login?": "Using third-party software, tools, or services to access Antigravity is a
  violation of our [terms]"; "Such actions can result in suspension or termination of your
  account"; "To use a third-party coding agent with Gemini, we recommend using a Gemini
  Enterprise or Google AI Studio API key."
- "Can I use Antigravity CLI headless mode in third-party coding agents or automate account
  switching?": "`agy -p` is intended for direct scripting and CI workflows"; wrapping `agy` in
  third-party tools or automating account rotation "is not supported under consumer plans".

**ACP page** (https://antigravity.google/docs/cli/acp), DOCUMENTED: editors launch `agy acp` as
a subprocess over stdio; "`agy acp` reuses the cached credentials"; "The agent, its tools, your
sign-in, and your settings come from Antigravity CLI". Nothing on permitted clients.

**Install page** (https://antigravity.google/docs/install), DOCUMENTED: the personal sign-in is
"the browser-based OAuth flow using your personal Google Account (Free, Pro, or Ultra plan)"; a
Gemini API key needs `modelProvider: "gemini"` in agy's settings plus `GEMINI_API_KEY` ("Only
setting a `GEMINI_API_KEY` environment variable on its own has no effect"); Vertex and Gemini
Enterprise through a Cloud project.

**Google AI Developers forum** (replies by forum members; none shows a staff badge on the page,
so none is policy), DOCUMENTED as posts, conflicting:
- https://discuss.ai.google.dev/t/policy-question-omp-hosting-unmodified-antigravity-acp-for-one-user/199753
  (2026-11-12): "wrapping `antigravity-acp` as a model provider ... inside a third-party coding
  agent harness" "is not permitted on consumer `oauth-personal` plans"; "Generating wrapper
  scripts around `agy`" "are also non-compliant on consumer sign-in"; "General ACP clients outside
  supported IDEs (JetBrains, Android Studio, Zed, and Xcode) are scoped to Gemini models"; "use a
  Google AI Studio Gemini API key (`gemini-api-key`) instead". This matches the screenshot.
- https://discuss.ai.google.dev/t/tos-clarification-is-openbot-official-antigravity-acp-server-permitted-under-the-antigravity-terms-of-service/197826
  (2026-11-04): "allowed for personal, single-user interactive sessions as long as [the client]
  runs the official, unmodified" server "without intercepting credentials or overriding system
  prompts"; "Consumer plans ... don't allow unattended background runs, task queues, multi-agent";
  "Don't use them for background scraping, polling, autonomous loops".
- discuss.ai.google.dev topic 192027 (2026-10-26; its address is in `private/236-agy-reference.md`): a GUI client running the unmodified ACP agent with native `oauth-personal` is
  "permitted" for "single-user, interactive development"; accounts are suspended that extract or
  proxy OAuth tokens, "wrap `agy -p` inside third-party agent loops", or rotate accounts.
- https://discuss.ai.google.dev/t/is-orchestrating-the-official-antigravity-cli-from-a-local-multi-agent-coding-application-allowed/181088
  (2026-09-07): orchestrating the unmodified CLI from a local multi-agent app, single user,
  "permitted".
- Enforcement is real: many appeal threads quote "This service has been disabled in this account
  for violation of Terms of Service" (403), e.g.
  https://discuss.ai.google.dev/t/appeal-request-antigravity-cli-403-tos-suspension/175585.

The screenshot's three-part wording (thin clients / outer harnesses / credentials and quota) was
not found on a Google page; its source is not located. INFERRED: it summarizes the forum replies
above, the strictest of them.

## 2. What is unclear (INFERRED, each)

- **A brief as the first message, or appended instructions.** The terms say nothing; one forum
  reply says "without ... overriding system prompts" (override, not append). agy itself
  advertises `_meta.antigravity.systemPrompt.append` to clients, and the reference client uses it.
  Unclear; appending is what agy offers, overriding is what the reply rules out.
- **Rounds, Keeps, waits.** The stricter replies rule out "unattended background runs, task
  queues", "autonomous loops". A timer or a check that wakes agy by itself is that. Clear enough
  to avoid.
- **MCP servers passed in.** "handle tool definitions" in the screenshot; the OpenBot reply allows
  client-supplied tools with the user supervising. Unclear; the reference client passes its own.
- **Reading agy's sign-in state.** Running `agy models` is agy's own command. Looking at agy's
  token file (even its presence or mtime) is closer to "reading local credentials". Avoid.
- **The usage meter.** OAR's reader runs `agy -p "/usage"` on Ducter's schedule: that is quota
  polling in the plainest sense. Avoid.

## 3. What Ducter does with agy (VERIFIED in code at 0.1.86) beside the reference client

| | Ducter before D594 | The reference client | D594 |
|---|---|---|---|
| Command | `agy acp --dangerously-skip-permissions --process-per-session [--gemini-dir]` (OAR 0.124 `runtimes/antigravity/session.js:15`) | `agy acp --gemini-dir <its own profile> --app-data-dir antigravity-acp` | unchanged |
| Auth | the person's personal Google sign-in (`agy acp --login`, `core/src/agent-setup.ts:583`) | `oauth-personal` by default; also Gemini API key, Enterprise, Vertex per instance | unchanged |
| Instructions | the brief appended (`_meta.antigravity.systemPrompt.append`, `runner/src/oar.ts:760-762`) | its PR-linking instructions appended the same way, plus a runtime block in the prompt | unchanged (parity) |
| First message | Mem's Context Bundle in front (D417, `runner/src/mem-steps.ts`) | its runtime-info block in front | unchanged (parity) |
| MCP | Ducter's own over the stdio bridge (`runner/src/oar.ts:758`) | its own MCP server | unchanged (parity) |
| Sign-in state | `agy models`, and no answer read through the token file's presence (`core/src/harness-probe.ts:207`); the token file in the 5-second fingerprint (`core/src/agent-path.ts:190`) | an ACP `initialize`/`authenticate` on its own profile; no token file read found | `agy models` only; no token path anywhere |
| Quota | `agy -p "/usage"` through OAR's `accountUsage`, read for cards and limit waits (`runner/src/oar.ts:995`, `core/src/account-usage.ts`) | no `/usage` call to agy found; limits from a hub the person connects | never read |
| Unattended | `wait_for` timers, checks and events wake it; loops; routines and Keeps may name it; a limit wait wakes it at the reset (`core/src/{work,loops,routines,limits}.ts`) | a PR watch wakes the agent every 2 minutes on CI or reviews; scheduled tasks and workflows (Labs; INFERRED that they can name agy, no exclusion found) | none: refused with one line |
| Sign-out | agy's own ACP `logout` | agy's own | unchanged |

So by the author's bar Ducter did more than the reference client on three rows (quota, sign-in
files, unattended wakes); the rest match. The reference client also wakes agents unattended (PR
watch) and runs scheduled work; D594 stays stricter there because the forum's strictest replies
name unattended runs and loops, and an account ban costs more than a lost feature.

## 4. The other agents Ducter drives

- **Claude Code with a Claude subscription.** https://code.claude.com/docs/en/legal-and-compliance
  (DOCUMENTED): OAuth is "designed to support ordinary use of Claude Code and other native
  Anthropic applications"; "Anthropic does not permit third-party developers to offer Claude.ai
  login into their own applications, or to route requests through Free, Pro, Max, or Ultra plan
  credentials on behalf of their users"; "developers may not collect, store, or intermediate
  Claude.ai credentials or session tokens"; but this does not "prevent an end user from signing in
  to the unmodified Claude Code binary with their own Claude subscription, including where a
  platform hosts Claude Code"; "Advertised usage limits ... assume ordinary, individual usage".
  Ducter runs the unmodified `claude` binary signed in with the person's own login (INFERRED: the
  permitted case). Risk, medium: the "Claude Code sign-in token" Ducter keeps in `keys.env` and
  can copy to a worker (`protocol/src/api-keys.ts:68`) is a stored session token; heavy unattended
  rounds stretch "ordinary, individual usage". Not changed here.
- **Codex with a ChatGPT sign-in.** https://learn.chatgpt.com/docs/auth (DOCUMENTED): "API keys
  are still the recommended default for automation"; "Access tokens are intended for trusted
  scripts, schedulers, and private CI runners". https://developers.openai.com/siwc/quickstart:
  "ChatGPT plan usage is available to all open-source partners and selected private clients".
  Ducter runs the person's own `codex` (app-server) with their own sign-in; reads only the account
  id from `auth.json` (`core/src/harness-probe.ts:286`). Risk: low (INFERRED).
- **pi.** pi is a third-party harness. Ducter treats pi as signed in when `~/.pi/agent/auth.json`
  holds a credential (`core/src/harness-probe.ts:291`), and pi's own login can hold a Claude
  subscription or a Google Antigravity/Gemini CLI sign-in. Driving pi on either is the case both
  vendors forbid (Anthropic above; Google §6). Risk: high where the person signed pi in that way,
  none on an API key. Not changed here; recorded in `design/todo.md` with its trigger.

## 5. hel (read only, 2026-11-26)

Five tasks ever ran on Antigravity there, every one ended (failed, dropped or done, parked or
archived); no Keep, routine, rule or setting names it; no wait is armed for any of them. Three
Codex tasks ran `agy` commands themselves on 2026-11-24 while setting up another tool (listing its
MCP entries, an interactive retry). Task ids in the report to the author, not here.

## Implications for Ducter

1. Antigravity runs only when the person asks (D594, `HARNESSES.antigravity.directOnly`): no wait,
   timer, loop, routine, Keep or reset wake; refused with one plain line, never moved elsewhere
   silently.
2. Ducter never reads agy's quota and never looks where agy keeps its sign-in.
3. The brief append, Mem's bundle and Ducter's MCP stay, at parity with the reference client; they
   are the first to go if Google says appended instructions or client tools are out.
4. The compliant way for unattended Gemini work is a Gemini API key, Enterprise or Vertex; Ducter
   can't set agy's `modelProvider` without writing its settings, so that path is a todo.
5. pi on a subscription sign-in is the next risk to close.

**Summary.** Google's terms forbid third-party software accessing Antigravity on a personal
sign-in; the forum's answers conflict, the strictest ruling out outer harnesses, unattended runs,
credential reads and quota polling. Matched against a reference GUI client the author accepts,
Ducter now drops the three things it did beyond it (quota reads, sign-in file checks, unattended
wakes) and keeps the rest. Claude Code and Codex are within their vendors' stated cases; pi on a
subscription sign-in is not.
