# 47. Nowledge Mem inside Ducter's tasks: the plugin, its check, and what it costs

Date: 2026-11-10. For D168 and D169 (`design/memory.md` "Mem and tasks").

Sources:
- the public `nowledge-co/community` repo, cloned fresh (`--depth 1`, read only);
- a read-only `nmem --json plugins inspect` on the author's Mac (nmem 0.10.116);
- Mem's public setup guide (https://mem.nowledge.co/SKILL.md) and home page (https://mem.nowledge.co).

No third-party code was run.

## 1. What the Claude Code plugin does in a session

- **Hooks** (VERIFIED, `nowledge-mem-claude-code-plugin/hooks/hooks.json`):
  - `SessionStart` (startup, resume, clear, fork) injects the Context Bundle, or Working Memory
    as a fallback. On compact it injects the same again.
  - `UserPromptSubmit` adds one line: run one targeted memory or thread search for
    continuation or prior-decision work.
  - `SubagentStart` gives a bounded context snapshot.
  - `PreCompact`, `Stop`, `SubagentStop` and `SessionEnd` save the session as a thread.
  - `Stop` also runs a Bridge mailbox probe.
- **Capture** (VERIFIED, `scripts/nmem-hook-save.py`): `nmem --json t save --from <claude-code|grok>
  --session-id <native session id>`, and `--space` only from an explicit `NMEM_SPACE`.
- **Identity** (DOCUMENTED, plugin README): "For multi-agent orchestrators, set
  `NMEM_AGENT_ID=<agent-slug>` per spawned Claude Code worker … Context Bundle will use the
  stable identity while keeping `source_app=claude-code` for provenance."
- **The environment it reads** (VERIFIED, every `NMEM_*` name in its scripts):
  - `NMEM_AGENT_ID`, `NMEM_HOST_AGENT_ID`, `NMEM_AGENT_CONTEXT`;
  - `NMEM_SPACE`, `NMEM_SPACE_ID`;
  - `NMEM_API_URL`, `NMEM_API_KEY`;
  - `NMEM_APP_DATA`, `NMEM_APP_CONFIG_DIR`, `NMEM_CLI_CONFIG_DIR`, `NMEM_CLI_PATH`, `NMEM_AI_NOW_HOME`;
  - `NMEM_BRIDGE_SESSION_MAILBOX`, `NMEM_NO_MAILBOX_NOTICE`, `NMEM_SUBAGENT_CONTEXT_TYPES`.

  None of them carries an orchestrator's own provenance, such as a task id or a Log pointer.
- **Bridge** (DOCUMENTED, README): `NMEM_NO_MAILBOX_NOTICE=1` disables the mailbox reminders.
  The per-session mailbox is opt-in with `NMEM_BRIDGE_SESSION_MAILBOX=1`.
- **Codex plugin** (DOCUMENTED, its README):
  - a SessionStart hook injects the Context Bundle, with Working Memory as fallback;
  - a Stop hook captures the transcript;
  - a synchronous UserPromptSubmit hook "must be enabled and trusted", so installing the plugin
    alone doesn't prove its hooks run.

## 2. Mem's own check (`nmem --json plugins inspect`)

VERIFIED on the author's Mac. The fixture is `packages/protocol/fixtures/mem-inspect/mac-2026-11-10.json`.

- **Answer shape:** `{schema_version: 1, local_only: true, plugins: [...]}`. Each entry has
  `host`, `installation` (installed | absent | unknown), `enabled`, `installed_version`,
  `runtime` (`not_checked`), `recommended_action` (none | install | review), `installations[]`
  and `warnings[]`.
- **Every entry warns that runtime loading isn't verified.** So "installed" means installed,
  never "working".
- **Codex** showed two registrations (0.1.10 and 0.1.49) and `review`.
- **Not reported:** a newer plugin version.

## 3. The setup guide and its plugin ids

DOCUMENTED, https://mem.nowledge.co/SKILL.md:

- Claude Code: `claude plugin install nowledge-mem@nowledge-community`.
- Codex: `codex plugin add nowledge-mem@nowledge-community`, plus its hooks script.
- pi: `pi install npm:nowledge-mem-pi`.
- Rules the agent must follow:
  - never guess a URL or key;
  - connect links are single use;
  - back up a file before editing it;
  - verify with `nmem doctor` and a context call in a restarted session.

## 4. What Mem costs

DOCUMENTED, mem.nowledge.co, read 2026-11-10:

- "Free to download, local first."
- "Mem runs on your own machine first: everything local, fully offline if you want."
- "Bring your own AI keys, or add Plus: managed AI and a cloud workspace that never sleeps, in
  one subscription."
- Nowledge Cloud is in public beta.

The pricing page could not be read (it renders client side), so no prices or limits are known
here.

## Implications for Ducter

- **A task can simply keep the plugin, as the persona.** `NMEM_AGENT_ID` and `NMEM_SPACE`
  (D141 (3)) are exactly what the plugin documents for orchestrators.
- **Provenance:** its writes carry the persona and the agent's own `source_app`. The task link
  is the native session id, which the Log already keeps.
- **`NMEM_NO_MAILBOX_NOTICE=1`** keeps the persona's Bridge mailbox out of tasks.
- **Ducter's own recall would double the plugin's SessionStart context.** So it only fills in
  where the plugin isn't installed.
- **Browser places stay without it.** The Context Bundle is injected unasked, and a page can
  steer the agent.
- **Copy may say "free to download, runs on your own computer"** and must never imply that
  Mem is required or paid.

Summary: the plugin is built to be run by an orchestrator under a given identity, so Ducter
keeps it on in tasks and fills in only where it is missing.
