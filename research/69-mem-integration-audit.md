# 69. Ducter's Nowledge Mem integration against Mem's own spec (2026-11-12)

Question (the author): is Ducter's Nowledge Mem integration done exactly the way Mem intends? Every call
Ducter makes to Mem, compared with the authoritative sources. Read-only throughout: no memory was added,
edited or deleted, no config changed, no connect or Bridge write ran. Counts and shapes only; no memory
content and no key appears here.

## 1. Sources

- **The CLI on the author's Mac**: `nmem 0.10.118`, the Nowledge Mem app's bundled copy
  (`/usr/local/bin/nmem` → the app's `nmem-wrapper`), signed in to a Nowledge Cloud team workspace.
  Each subcommand's `--help`; `--json` shapes of `status`, `agents list/show`, `spaces list`,
  `context --no-ensure --no-working-memory`, `m search` (VERIFIED).
- **The Claude Code plugin** `nowledge-mem@nowledge-community` 0.7.36 (`~/.claude/plugins/cache/…`): skills
  `search-memory`, `read-working-memory`, `distill-memory`, `save-thread`, `bridge`; commands; `hooks.json`;
  the hook scripts (`nmem-hook-context.py` ROUTING_GUIDANCE, `nmem_startup.py` `memory_scope`,
  `nmem-hook-save.py`) (VERIFIED by reading).
- **Mem's public docs** (reachable): `mem.nowledge.co/SKILL.md`, `/docs/cli.md`, `/docs/server-deployment.md`,
  `/docs/concepts/ai-identities.md`, `/docs/spaces.md` (DOCUMENTED).
- **hel** (the author's Linux server), over ssh, read-only: `nmem --version`, `--json status`, file layout
  (VERIFIED).

## 2. What Mem says (the spec)

1. **Identity.** An AI Identity is "who is working"; it carries "a default space for memory reads and writes".
   Orchestrators set `NMEM_AGENT_ID=<slug>` per worker; `NMEM_SPACE` "only when that run should override the
   AI Identity's default space"; `source_app` is provenance, never identity (ai-identities.md, plugin README,
   SKILL.md) (DOCUMENTED).
2. **Reading the identity's lane.** The plugin, given `NMEM_AGENT_ID` and no `NMEM_SPACE`, reads
   `agents show <id>` → `defaultSpaceId` and reads Working Memory and the Context Bundle with
   `--space-id <that id>` (`nmem_startup.py memory_scope`). Its search guidance: "If an AI Identity resolved
   another lane and no session override is set, pass that existing lane with --space. Never infer a Space
   from cwd, git, or a project name" (VERIFIED, plugin 0.7.36).
3. **Where a save lands in a team workspace.** "A save that does not name a Space goes to *Only me*"; a save
   that asks for the pre-team `default` Space also goes to Only me (spaces.md) (DOCUMENTED).
4. **Search.** `nmem --json m search "<q>" -n 5`; threads `nmem --json t search "<q>" --limit 5`; distinguish
   no matches from a failure (VERIFIED, skill).
5. **Saving.** `nmem m add "<content>" -t "<title>" -i <0..1>` with optional `--unit-type`, `--space` only
   when the user named it; `--agent-id` "falls back to `NMEM_AGENT_ID`"; `--source-app` "runtime provenance"
   (help) (VERIFIED).
6. **Executable.** "If NMEM_CLI_PATH is set, use its quoted value as the executable instead of bare nmem"
   (skill, hooks) (VERIFIED).
7. **Install / update.** Standalone CLI: "`python3 -m pip install --user nmem-cli` or `pipx install
   nmem-cli`" (SKILL.md); "`pip install nmem-cli` … or `uv pip install`" (cli.md, server-deployment.md);
   plugin README "`pip install nmem-cli  # or: pipx install nmem-cli`"; on a desktop machine prefer the app's
   bundled CLI and don't install PyPI's over it; "Refresh the CLI from the same source it was installed from"
   (SKILL.md) (DOCUMENTED). `nmem --json status`'s `update.command` is **"pipx upgrade nmem-cli" on both the
   Mac (the app's copy) and hel (a pip copy)**, so it is a fixed hint, not channel-aware (VERIFIED).
8. **Remote sign-in.** `nmem connect "<link>"` (one-time link) or `nmem config client set url/api-key`;
   credentials in `~/.nowledge-mem/config.json` ("the single credential home"); `NMEM_API_URL` /
   `NMEM_API_KEY` override per process (SKILL.md) (DOCUMENTED).

## 3. Shapes seen (nmem 0.10.118, VERIFIED)

- `--json status`: `status`, `cli_version`, `api_url`, `mode` (`remote`), `backend` (`cloud`),
  `update {current, latest, update_available, command}`, `attention {…}`.
- `--json agents list`: `{agentProfiles: [...]}` (13 on the Mac). `--json agents show <id>`: a **top-level**
  object, **camelCase**: `id, displayName, role, description, instructions, defaultSpaceId, sourceApp,
  hostAgentId, tags, origin, custodianMemberId, ownerMemberId, identityReference, canEdit`. Unknown id:
  `{"error":"not_found","id":…}`, exit 1.
- `--json spaces list`: `{spaces[{space_id, name, kind: commons|team|default, …}], members, grants,
  personal_zones}` (12 spaces).
- `--json context --no-ensure --no-working-memory --agent-id ducter`: `agent_profile.default_space_id`,
  `active_space {primary_space_id, read_scope: "space", write_target {space_id, reason: "personal_zone"}}`.
  For the author's `ducter` identity: its lane is the workspace's pre-team `default` Space (6 readers);
  `primary_space_id` = that lane; `write_target` = the personal zone (a different id).
- `--json m search`: `{query, total, search_mode, memories[{id, title, content, score, importance, source,
  space_id, unit_type, labels, label_ids, created_at}]}`. **Measured:** the same query without a Space
  returned 30/30 hits from the personal zone; with `--space-id <ducter's lane>` 30/30 from the lane, no
  overlap. So an unscoped search reads only *Only me*, and a lane search reads only the lane.
- hel: `/root/.local/bin/nmem` is the wheel's ELF binary, `nmem_cli-0.10.116.dist-info/INSTALLER` = `pip`, under
  `/usr/lib/python3.14` with `EXTERNALLY-MANAGED`; no pipx, no uv; Ducter runs as root; `apt-get` present;
  `status`: remote, cloud, healthy, `update_available: true`, command "pipx upgrade nmem-cli".

## 4. Divergences, call by call (ranked by impact)

| # | Where in Ducter (main @ 8f7b0788) | Mem's spec | Impact | Now |
|---|---|---|---|---|
| M1 | `partner/src/memory.ts` search: `m search -n N [--space <user's>]`; no lane | §2.2: read the identity's lane when no session override | **High.** The partner's recall never reads the identity's own lane; in the author's team workspace that is the whole pre-team Space (measured on one query: none of the lane's 30 hits were among recall's 30) | Fixed (D229) |
| M2 | `core/src/mem-identity.ts showAgent` reads only `display_name`/`source_app` (+ camelCase fallbacks) and never `defaultSpaceId` | §3 camelCase profile; §2.2 | Medium: the lane was invisible to Ducter | Fixed: lane bound and refreshed each start |
| M3 | `core/src/mem-cli.ts` fresh install: uv → pipx → pip --user | §2.7: pipx/pip named; uv only as `uv pip`/`uvx`; `status` says pipx | Medium: the first route Mem names comes second | Fixed: pipx → uv → pipx from the system → pip |
| M4 | hel's pip copy past PEP 668, updated in place with `--break-system-packages` | §2.7 "same source", but every Mem surface names pipx; the system Python forbids pip there | Medium: each update bypasses the OS mark; no route out | Fixed: one-tap move to pipx, sign-in kept, old copy put back on failure |
| M5 | No pipx/uv and pip refused: a dead end asking the user to `sudo apt install pipx` | — (Ducter's own) | Medium for a fresh server; hel runs as root | Fixed: apt/dnf as root or with `sudo -n`, Homebrew on a Mac; the line stays only when none works |
| M6 | `runner.ts` gives a task `NMEM_AGENT_ID` (and `NMEM_SPACE`) only; `NMEM_CLI_PATH` dropped | §2.6 | Low-medium: a home whose `nmem` Ducter put off PATH (NMEM_CLI_PATH) runs the plugin with no `nmem` | Fixed |
| M7 | `persona.ts loadPersona`, `mem-identity.ts nmemRunner`, `bridge-link.ts nmemCall` spawn nmem with Ducter's whole environment | D102 (Ducter's own: nmem gets basics + `NMEM_*` only) | Low (Ducter's rule, not Mem's): harness keys reached nmem | Fixed |
| M8 | `persona.ts` `context` without `--source-app` | §2.1 (`--source-app` is the calling app's provenance; the plugin passes `claude-code`) | Low | Fixed: `--source-app ducter` |
| M9 | Mem says a newer nmem is out (`status.update`) and Ducter offered nothing | §2.7 | Low | Fixed: a quiet 更新 from the copy's own source |
| K1 | Tasks' brief: "never save memories yourself"; the plugin's SessionStart/compaction text says "save durable decisions autonomously" | §2.5 | By design (D168 (5)): the partner owns durable writes. The two instructions still meet in a task's context; the brief wins by its own rule | Kept; noted |
| K2 | Writes name `--agent-id` and never `--space` unless the user chose one | §2.3, §2.5 | Matches Mem: the save lands where Mem says (Only me in a team workspace) | Kept |
| K3 | Ducter enrolls its own `ducter` identity when `NMEM_AGENT_ID` is unset; adopts the user's otherwise | §2.1 "one identity only for a real recurring role" | Matches: the persona is a durable role; one per persona | Kept |
| K4 | `nmem connect --skip-tools <link>` for sign-in; link never kept | §2.8 | Matches | Kept |
| K5 | Bridge (`bridge connections …`, `--agent-context`) | research/66 already checked 0.10.118 | Matches | Kept |
| K6 | Threads: Ducter never runs `t search`; the plugin captures task threads itself (`t save --from <host> --session-id`) | §2.4 | Partner recall reads memories only; its own conversation is the Log (D123). A thread search for "what did I discuss in another tool" is not offered | Open (todo) |

## 5. Install route: what is correct

Mem's own documents are not one voice (pip, pipx, `uv pip`), but they agree on two things: refresh from the
source the copy came from, and pipx is the one isolated route every surface names (`SKILL.md`, the plugin
skills, README, and `status`'s hint on every machine). On a Debian/Ubuntu Python marked externally managed
(hel), `pip install --user` works only past the mark; pipx is the OS-sanctioned route there (the Python
packaging guidance PEP 668 points to). So: fresh installs go pipx first; a pip copy in the user's site under a
marked Python is moved once to pipx (old copy out, `pipx install --force nmem-cli` in, the old one back on
failure), after which "the same source" is pipx. The sign-in lives in `~/.nowledge-mem/config.json`, which
neither pip nor pipx touches (INFERRED from both tools' scope and Mem's "single credential home"; the fake
asserts no step names it). A copy under an unmarked Python (a Mac's python.org build) stays where it is.

Not run on hel: this audit was read-only. The move's argv was checked against the fake only.

## Implications for Ducter

- Recall reads where saves land and the identity's lane, merged by id and Mem's score (D229). One more
  parallel CLI call per recall when the identity has a lane.
- Install pipx-first; offer the move for a copy past the system's mark; get pipx from the system when that
  needs no password.
- Keep the plugin as the persona in tasks; it reads the lane itself; give it `NMEM_CLI_PATH`.
- Open: thread search in partner recall (K6), and the K1 double instruction, both for a later change.

**Summary.** Ducter calls Mem the documented way almost everywhere (identity, provenance, sign-in, Bridge).
Two real gaps: the partner's recall ignored the identity's own lane (in the author's team workspace that
hides an entire Space from recall), and the install/update route put uv ahead of pipx and kept updating hel
past PEP 668. Both are fixed in D229, with fakes in nmem 0.10.118's real shapes.
