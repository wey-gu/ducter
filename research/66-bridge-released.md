# 66 · The released Nowledge Bridge (nmem 0.10.118) against Ducter's D205, and Mem on a home that lacks it

> 2026-11-12. Public. Follows `31-bridge-in-ducter.md`, `37-bridge-dogfood.md` and D205. Built from:
> - the author's Mac: the public Nowledge Mem app with `nmem 0.10.118` (the app's bundled CLI), its `--help`
>   tree and JSON answers, read-only except where §3 says otherwise;
> - the `nowledge-mem` Claude Code plugin 0.7.36 (`skills/bridge/SKILL.md`, its `references/native-sessions.md`,
>   `CHANGELOG.md`, and the startup and Stop hook scripts), read only;
> - Mem's public install guide `https://mem.nowledge.co/SKILL.md` and docs page `start-here`; PyPI's
>   `nmem-cli` metadata;
> - hel (the author's server home), read-only over ssh: which `nmem` it has and how it was put there;
> - a scratch Ducter home on the Mac (`DUCTER_DATA_DIR` in the session scratchpad, port 7792) driven through its
>   web client, and a scratch Linux home (Ubuntu 26.04 in a container of its own colima profile) driven over
>   its socket (`scripts/e2e/mem-cli-home.ts`).
>
> Identity references, member ids and keys from the author's account are not reproduced. Raw output is in
> `~/dev/ducter-evidence/bridge/` (outside git). Closed-source concepts only, as AGENTS.md asks.
>
> Tags: **VERIFIED** observed in this session · **DOCUMENTED** stated by Mem (help, skill, guide, docs) ·
> **INFERRED** my reading.

## 1. What the released Bridge offers

| Surface | What it does | Tag |
|---|---|---|
| `nmem bridge connections connect --space-id <id> --agent-id <agent> [--context <name>]` | "Represent an existing role using this login; save a logical Context". `--context` defaults to the role and is "never an identity". | DOCUMENTED |
| `bridge connections list --space-id <id> [--agent-id] [--after-connection-id]`, `revoke <connection id>` | One bounded page in an exact Space; revoke one own connection "without changing the Mem login". | DOCUMENTED |
| `bridge session --host codex\|claude-code --session-id <id> status\|prepare\|send\|inbox\|reply\|recover` | A particular native session's own inbox, distinct from an Agent mailbox. `status` is a read-only diagnostic. | DOCUMENTED, `status` VERIFIED |
| `bridge setup [--enable]`, `contacts [--query] [--all-spaces] [--spaces-cursor]`, `send --to … [--shared-document]`, `inbox`, `open`, `reply`, `outbox`, `inspect`, `resume` | The Agent mailbox path D105–D111 was built for; unchanged in shape, plus all-Spaces discovery and shared documents. `--space <name>` resolves a name once to its exact id. | DOCUMENTED |
| `nmem connect <link>` (`--skip-tools`, `--detect-only`, `--tool`, `--dry-run`) | One command from a one-time connect link to a signed-in CLI; `--skip-tools` saves the sign-in only. | DOCUMENTED, the refusal of a used link VERIFIED |
| `nmem --json status` | `backend: cloud`, `mode: remote`, `cli_version: 0.10.118`; its `update.latest` still says 0.10.117. | VERIFIED |
| The plugin (0.7.35–0.7.36) | At every Claude Code or Codex SessionStart on a Cloud backend it prepares the actual native session automatically (`NMEM_BRIDGE_SESSION_MAILBOX=auto` by default), hands the model a `session_args` vector, and its Stop hook reads the session inbox. Nothing about Ducter's persona. | DOCUMENTED (changelog, scripts) |
| The skill | Two targets (an Agent mailbox, one native session), never substituted for each other; an existing role is reused "through this login" (CLI `connections`, MCP `bridge_connect` / `bridge_connections` / `bridge_disconnect`); a typed "unavailable" or authority refusal means **stop and keep the connection**, never mint keys or try another identity or backend; sending never wakes anyone; check at task boundaries only. | DOCUMENTED |
| Registered setup codes in 0.10.118 | Beyond D205's seven: `authority_denied`, `authority_retired`, `unavailable`, `busy`, `capacity`, `outcome_unknown`, `policy_invalid`, `request_invalid`, `profile_conflict`. | VERIFIED (the CLI's own code list) |
| Discovery (`contacts --query ducter` in Only me) | Answers now (D205's dogfood saw `cloud_agent_im_backend_unavailable` everywhere): one card, agent "Ducter", member still only `Member <id>` (B11 unchanged), plus a ready `send_args_prefix` vector, `match_state`, `has_more`, `outgoing`. | VERIFIED |
| Passive `bridge setup` (no context) | `selection_needed` with 8 candidates, exactly one `kind: "personal"` ("Only me"): D205's place finder holds. With `--space-id <Only me>` it reports `enable_needed` for a **retained pilot identity**, not `ducter` (B12 still true). | VERIFIED |

## 2. What D205 and design/bridge.md assumed, against the release

| Assumption | Release | Tag |
|---|---|---|
| Capability = `--version` ≥ 0.10.118 (or `bridge connections --help`) | Holds: 0.10.118 has `bridge connections`. | VERIFIED |
| The one personal place among passive setup's candidates | Holds, same JSON. | VERIFIED |
| Connect = `connections connect --space-id --agent-id ducter --context ducter`, then passive `--agent-context ducter bridge setup` | Same command and flags. Its success shape is still unseen live (§3). | DOCUMENTED |
| Seven registered refusals, each a plain line | Sixteen codes exist; `unavailable` (503, `outcome_unknown: true`, `retryable: false`) is the one the Cloud answers today. D205 showed Mem's agent-facing detail ("Stop… do not mint another key or try another backend") to the user. | VERIFIED |
| "谁能找到 {name}" (who can reach the partner) is Ducter's own gate | Still Ducter's: Mem has no per-sender reach setting for an Agent mailbox. | DOCUMENTED (no such surface in help) |
| X1/S1: the terminal session finds the persona in `contacts` and `send`s | Discovery returns the persona's card. But the plugin now prepares a **native session** inbox for every session, and the skill keeps the two paths apart; whether a native session's context may `send` to an Agent-mailbox contact, and where a reply to it lands (its native inbox, or its role's Agent mailbox), is not shown. | INFERRED, open |
| Correlated replies: `reply` targets the original's sender | Unchanged for the Agent mailbox; the native path replies through a returned `reply_reference`. | DOCUMENTED |
| Permissions / OK prompts: nothing on Mem's side asks the user | Holds: Mem has no OK prompt; the user's Go stays Ducter's (D105, D164). | DOCUMENTED |
| The live trial's peer: `bridge session … prepare` for a native `claude -p` session | The same command the plugin runs at startup. Today it answers the same 503 (§3). | VERIFIED |

## 3. The live run (2026-11-12, 03:20–03:58 UTC)

1. **Preflight, read-only** (`bun run bridge:live -- --connected`): version ✓, one personal place ✓,
   `connections list` ✗ **`cloud_bridge_setup_unavailable`, HTTP 503**, outcome unknown, not retryable. VERIFIED.
2. **Connect from Settings**, on a scratch Ducter home (its own data folder and port; persona identity `ducter`
   adopted from the existing Mem identity, nothing enrolled): the row showed `ready` with `ducter · Only me · <id>`;
   one tap on Connect ran the one `connections connect`; Mem answered the same 503. The row showed Mem's
   agent-facing text verbatim (fixed by D225). No local context was saved (`agents context show --name ducter`:
   still `selection_required`). VERIFIED.
3. **The peer's native session**: one `bridge session --host claude-code --session-id <fresh id> prepare` (what
   the plugin does at every start): the same 503. VERIFIED.
4. Per the skill ("a typed backend-unavailable result: stop attempts"), nothing else was tried: no `--enable`, no
   other identity, Space or key, no send. A re-check 38 minutes later (`connections list`, read-only) answered the
   same. **S1, S2, S3, X1 and the correlated-reply checks could not run.** Nothing was created in Mem, so there is
   nothing to disconnect or clean up. VERIFIED.

**Reading.** Bridge connections are not open for this Cloud workspace yet, though the CLI is public and discovery
answers. That is Mem's rollout, not Ducter's or the user's setup. INFERRED (the code says "unavailable", not an
authority refusal).

## 4. Mem on a home without it, or with an old one

| Fact | Tag |
|---|---|
| Official route: on a machine with the Mem app, its bundled CLI (the app's Settings › Developer Tools › Install bundled CLI); **anywhere else the PyPI package `nmem-cli`** (`pip install --user`, `pipx install`, `uv`, a COPR or AUR package); refresh from the same source it came from; never hand-edit around an old CLI. | DOCUMENTED (SKILL.md Step 0) |
| `nmem-cli` 0.10.118 is on PyPI (2026-11-12 01:42 UTC) with wheels for manylinux x86_64 and aarch64 and macOS; the wheel carries the Rust binary. | VERIFIED |
| hel: Ubuntu 26.04, x86_64, Python 3.14 marked externally managed (PEP 668), no pipx or uv. It **does have** `nmem 0.10.116`, put in `~/.local` by pip (user site), signed in (`~/.nowledge-mem/config.json` exists), and the Ducter service's PATH includes `~/.local/bin`. So hel needs an **update**, not an install. | VERIFIED (read-only ssh) |
| Updating hel's copy in place needs `--break-system-packages`: pip refuses the user site of a marked python otherwise, and the copy got there past that mark already. | VERIFIED (container, same shape) |
| A fresh Ubuntu server has `python3` but no pip, pipx or uv: no official route runs without one `sudo apt install pipx` first. | VERIFIED (container) |
| An unsigned `nmem status` exits 1 ("Connection refused" to 127.0.0.1:14242). | VERIFIED (container) |

**The container run** (Ubuntu 26.04, the real core from this branch, the row driven over the socket):
- no nmem, no pipx: `install_mem`, `need: pipx`; after `apt install pipx`: `install_mem`, `canRun`;
- tap: `installing` → real `pipx install nmem-cli` → `nmem 0.10.118` in `~/.local/bin` (not on the service's PATH;
  found and added) → `sign_in`;
- a pasted non-link: `signIn: bad`, nothing run; an invalid one-time link: Mem answered "expired or was already
  used" → `signIn: used`;
- hel's shape (0.10.116 by `pip --user --break-system-packages`, no pipx, a fresh start): `update_mem`,
  `canRun` → tap → pip refused, retried past the mark → `nmem 0.10.118` → `sign_in`.

## 5. Signing in a headless home

| Fact | Tag |
|---|---|
| nmem 0.10.118 has no device-code or browser sign-in. A CLI signs in with `nmem connect <link>` (a one-time link: a Cloud workspace link lasts 15 minutes, single use) or `--url` + `--api-key`. | DOCUMENTED (SKILL.md, `connect --help`) |
| A Cloud workspace shows its URL and per-tool setup under **Connectors › AI Tools**; its key is under **Settings › Mem access**. Where exactly a one-time link is offered there is not described. | DOCUMENTED (docs `start-here`); the link's place INFERRED |
| `connect --skip-tools` saves the sign-in only and touches no AI tool's settings. | DOCUMENTED |

So the user's step on a headless home is one paste from the phone: open Mem on the web, copy a connect link, paste
it on the card. A device code would be one tap fewer; it is Mem's to add (B16 below).

## 6. Implications for Ducter

1. **Say Mem's refusals in the user's words, all sixteen.** `unavailable` / `busy` / `capacity`: "Mem can't take
   it right now, nothing wrong on your side"; `outcome_unknown`: "not clear whether it took; Try again finds out".
   Never show Mem's agent-facing detail. (D225)
2. **Put Mem's command line in, or update it, from the same row**, with Mem's official route and the source the
   copy came from; a fresh install never passes the system's mark. Then a paste-a-link sign-in. Then Connect.
   (D225)
3. **Keep Bridge off by default** (D170 (9)): the live run could not pass. Docs keep "coming soon" for the
   conversation with terminal agents, with the requirements stated honestly.
4. **Re-check the X1/S1 send path when Mem opens connections**: a terminal session now has a native session inbox
   by default; the trial must show whether it can send to the persona's Agent mailbox and where the reply lands.
5. **B16 for Mem** (with B11–B15): a device-code sign-in for `nmem connect` on a headless box; a public line on
   when Bridge connections open per workspace; the `update.latest` in `status` lagging the release.

## 7. Addendum 2026-11-13: the live trial against Mem Cloud (feeds D249)

Mem Cloud now accepts the connection: `ducter` connected in Only me (context `ducter`), nmem 0.10.118, haiku on
both sides of `bun run bridge:live -- --connected --real`, the peer a native Claude Code session. Four runs; raw
argv/stdout/stderr per call under `~/dev/ducter-evidence/bridge/raw-2026-11-13T07-{27-26,44-31,51-45,56-28}*`.
Message bodies are the trial's own synthetic text.

| Fact | Tag |
|---|---|
| `--agent-context ducter bridge setup` exits 1 "agent context \"ducter\" was not found", while `inbox`, `contacts`, `open`, `send`, `reply` and `agents context show --name ducter` all work with it. | VERIFIED |
| `agents context show` (local) names the Space `personal-<custodian id>` and the custodian; every card in that Space is "Member <the same id>". A contact's `r1:<uuid>` is the Agent's `identity_birth`. | VERIFIED |
| `bridge inbox --json`: `{messages: [{message}], next, outgoing: [{message, status: delivered\|read, read_recipients, recipients}], status_observed_at_us}`. No sender, no time. | VERIFIED |
| `bridge open --json`: `{message, body, reply_to, outgoing, status_observed_at_us}`. **No sender.** `reply_to` is the message's own id, **also for a message the peer sent with `bridge reply`**: no `in_reply_to`. Human output is the same. (B17) | VERIFIED |
| `bridge send` / `reply` success: `{message, status: "delivered", operation: "bo1:…", outgoing}`. | VERIFIED |
| `reply` from the persona to a message a native session sent reaches that session's logical inbox; the session's `reply` reaches the persona's. | VERIFIED |
| A native session's binding (`bridge session … prepare` → `context: bridge-<…>`) works for the logical `contacts/send/inbox/open/reply`. It reuses one Agent identity across sessions; in `contacts` such Agents show as "Bridge agent" with no description (two cards). | VERIFIED |
| `contacts --query Claude` returned "Claude 收尾协调", an older agent of the author's. `send` to it: stdout JSON, exit ≠ 0, `stage: upstream`, `cloud_agent_original_selection_unavailable`, HTTP 409, `retryable: false`, `outcome_unknown: true`, `original_operation: prepare`, detail "A selected recipient has no current registered mailbox. A previous unknown send remains unresolved; do not replace its identity." It was the context's first send ever, so the second sentence is Mem's wording, not an earlier op of Ducter's (each run uses a fresh Ducter data folder). | VERIFIED |
| `inspect` of that op: `{operation, source: "retained_input", body, contacts, reply_to: null, outgoing}`, no state; `resume`: the same 409; `outbox`: `operations: []`. | VERIFIED |
| The peer's native context keeps its inbox across runs (it saw the previous run's questions). | VERIFIED |

**Diagnosis of the first run (07:27).** S1 and X1: the request was logged *muted* because `open` names no sender,
so it was "another agent", not the user's, and Settings' default reach is "only yours". S2 and S3: haiku picked the
only card matching "Claude" (a stale agent with no mailbox), each send got the 409 and stayed unknown; the
partner then offered "再发一次" and carded a second copy (a replacement, which the skill forbids). X1's answer had
nothing to go back to. No Ducter ledger state crossed runs.

**After D249.** 07:44: 3/4, 2/4, 2/3, 2/3 (haiku made S1 an asker card; asked "which one?" in S2; the driver
checked before slow sends finished). 07:51: 6/6, 4/5, 3/3, 2/3 (the driver's X1 check looked for a field the answer
never carries). 07:56: **S1 6/6, S2 4/5, S3 3/3, X1 3/3.** The one failing check is "the answer came back as a reply
to ours": Mem's `open` doesn't link it (B17).

**B17 for Mem** (draft, not posted): an Agent mailbox's recipient sees neither the sender (member, Agent) nor the
original a reply answers; the send intent has `in_reply_to` (`inspect` shows `prepare.in_reply_to`), the recipient's
`open` drops it. Also: `contacts` lists a card whose Agent has no registered mailbox; the 409's "previous unknown
send" sentence appears on a first send; native-session Agents are all "Bridge agent".

**Implications.** (1) In Only me, an unnamed sender is the user's own; elsewhere, not. (2) An agent that wrote is
reached by `reply` on its message, the only address Ducter has for it. (3) Without linked replies, follow-through
after a send to an unnamed own agent stays quiet once any such agent writes. (4) Bridge stays off by default until
B17 (D170 (9)).

**Summary.** The released nmem 0.10.118 matches D205's commands and JSON, and adds nine more refusal codes and
a native-session inbox the plugin prepares by itself. On the author's Cloud workspace, connections and native
preparation answer 503 `cloud_bridge_setup_unavailable` today, so the live trial stopped at Connect, as the skill
says; nothing was created. Ducter now says that plainly, and on a home without a new enough Mem (hel has 0.10.116
by pip) one tap updates or installs it with Mem's own route, a pasted link signs it in, and the same row goes on
to Connect. Verified in a Linux container for install, update past PEP 668, and the sign-in refusals.
