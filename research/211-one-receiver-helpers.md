# 211 · One receiver, and helpers on Bridge (2026-11-23)

For D494. The author asked the partner on hel for "a Codex loop agent named like Nowledge Mem PR
babysitter, in Nowledge Bridge", that his own agents hand PRs to and that fixes CI and review comments
until the PR can merge, then replies over Bridge; if Bridge can't wake it, it should wake itself to
read its mailbox. Separately, Settings › Agent 通信 showed 「Ducter 也在另一台电脑上收 … [只留这台]」, and
he asked why Bridge can't receive on every computer. Everything here was read only: hel's Log through a
read-only SQLite connection (`?mode=ro`, a temporary script removed after), `nmem --help` and one
read-only `bridge connections list` on the author's Mac (nmem 0.10.122). Nothing was enabled, sent,
acknowledged or revoked. Tags: VERIFIED (seen today), DOCUMENTED (Mem's help or Ducter's own notes),
INFERRED (follows, not tested).

## 1. What happened on hel

| Fact | Tag |
|---|---|
| 10:34:01 UTC the person's message; 10:34:33 the partner opened task `daj4u2vt` "Nowledge Mem PR Babysitter" on hel with Codex, its brief the person's words verbatim. The task's title was the partner's own (26 characters), not the paragraph. | VERIFIED (Log) |
| The task read the Mem plugin's `bridge` skill and ran `bridge session --host codex … prepare` twice: "uses existing ducter/default automatic binding … prepared but `delivery_ready: false`, `receiving_capability: null` and display label `codex / b60c213e79bb`" (its checkpoint). | VERIFIED (Log) |
| It armed a Ducter timer as a wake test (fired at 10:36:41, the same Codex thread resumed), then reported blocked: a session label it can't rename, no receiving, only a timer wake. | VERIFIED (Log) |
| The partner told the person 「…你可以先到「设置 → 与其他 AI 对话」里为 Codex 启用信箱。」 No pane has that name; the line the partner read named the pane in English only ("Settings › Talk with your other agents"). | VERIFIED (Log, code) |
| A task runs with `NMEM_AGENT_ID` = the partner's own Mem identity (`runner.ts`, D312: its memory writes are the partner's). | VERIFIED (code) |

## 2. Why the pane said "also receiving on another computer"

| Fact | Tag |
|---|---|
| `bridge connections list --space-id <Only me> --agent-id ducter --include-activity`: three connections for `ducter`: hel's own (`client_label: "ducter"`, created 2026-11-13, active), an old revoked one, and one with `client_label: "codex"`, **created 2026-11-23 10:34:44.9 UTC, active**: 4 s after the task's session started. `home_id` and `device_label` are null on all. | VERIFIED |
| Ducter's D324 read every active connection of the identity that isn't the home's own as another home answering the mailbox, so the Codex session's connection showed as 「也在另一台电脑上收」 with 只留这台 (which would have revoked the task's connection). | VERIFIED (code) |
| Whether a native-session connection also reads the identity's inbox (and so could take the partner's mail) is not said by the help. The plugin README (research/161) says native session mail "remains separate from the identity inbox". | DOCUMENTED / open |
| The author's homes: hel (`ducter.service`, the person's own home, connected since 2026-11-13). No second Ducter home holds a connection for `ducter` today. | VERIFIED |

So nothing was "receiving on another computer". A task, running as the partner, set up a Bridge session
of its own.

## 3. What Mem can and can't do here (nmem 0.10.122 help)

| Fact | Tag |
|---|---|
| `bridge session … prepare` has no name or label option; the session's contact label is derived from host and id. | VERIFIED |
| `agents enroll <ID> --name <DISPLAY_NAME> --source-app --description` makes a named identity; `bridge connections connect --space-id --agent-id --context [--device-label]` lets this login represent it; `bridge inbox` lists an identity's mail across every authorized Space. So a named address that Ducter's home holds is within today's CLI. | VERIFIED (help) |
| `bridge inbox --wait` holds 1 to 5 s; `--watch` streams changes as JSON lines; nothing in Mem starts or wakes an agent (`notices`: "never starts an agent"). | VERIFIED (help) |
| `connections list` reports `home_id` and `device_label` fields (null today); no field says whether a connection is a home's or a session's. | VERIFIED |

## 4. Who and how it should feel

- **The heavy developer (the author).** Before: asked for a babysitter, got a task that tried to become a
  mailbox, failed, and a pointer to a pane that doesn't exist; a scary card about another computer.
  After: one line, the helper is made under the name he chose, his agents hand it PRs in Nowledge Mem,
  each PR is watched and woken by Ducter until it can merge, and the answer goes back from that name.
- **The consumer user.** Never needs to know a mailbox exists; "a helper my agents can give work to"
  is one sentence. **The fresh user.** Sees nothing until they ask.

## Implications for Ducter

1. The home is the one receiver. A task must never set up a mailbox or session of its own: it runs as
   the partner and would split its mail. Ducter carries every task's messages (all agents, not only
   those without a Bridge plugin) and wakes the task with the answer.
2. Only a home's own connection is another receiver; a session's connection is not shown as "another
   computer" and never offered for revoking.
3. A long-lived "loop agent" is not a harness session. It is a helper: a named Mem identity whose one
   connection the home holds, whose mail the partner's loop reads, each piece of work a task woken by
   D483's waits, answered from the helper's address when done.
4. Point to Settings panes only by their real names, from one table, in the person's language.

## Summary

The "other computer" was a Codex task's Bridge session made as the partner's identity, 4 s after it
started (VERIFIED). Mem can't name a session but can name an identity, and the home can hold that
identity's connection (help, VERIFIED). D494 makes the home the one receiver, carries every task's
messages, and adds helpers; what still needs Mem is a field telling a session's connection from a
home's, and whether a session connection can take identity mail (asked in a private draft).
