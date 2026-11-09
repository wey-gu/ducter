---
name: ducter-operate
description: Work with a running Ducter (the user's self-hosted personal AI) from a terminal or as an agent - see its tasks and decisions, talk to the partner, start or follow a task, answer a decision, merge or undo results, connect a device. Use when the user asks you to check on Ducter, hand it work, follow a task, or act on what it reports.
---

# Operate Ducter

Ducter has one **partner** the user talks to; its work runs as **tasks** on AI agents (Claude
Code, Codex…). **On hand** is every task at a glance; **Needs you** are decisions waiting for the
user. The `ducter` CLI talks to the Ducter running on THIS machine (`127.0.0.1:7777`; add
`--port <n>` if it was started on another port). For a Ducter on a server, run these over SSH on
that server. Prefer `--json`; exit code 0 means it worked.

## Look

```sh
ducter status --json        # On hand: tasks (title, state, place), open decisions with their ids
ducter devices --json       # connected devices and workers ("awake")
ducter tail                 # follow the conversation (Ctrl-C stops); ducter tail <part of a title> follows one task
ducter tail --json          # the same, one JSON event per line
```

`ducter status` exits non-zero with "Ducter isn't running on port 7777" when it's down: see
the ducter-troubleshoot skill.

## Talk and hand off work

```sh
ducter say "What's left on the release?" --json            # waits for the partner's reply (default 300 s; --timeout)
ducter task "Fix the flaky compaction test" --json         # a task with these exact words as its brief, in the repo you're in
ducter task "…" --repo ~/dev/app --agent codex --base main # elsewhere; who does it; what it starts from
ducter open <part of a title>                              # show that task in the Mac app
```

`say` returns `{replies, decisions, settled}`; a decision in `decisions` waits for the user.
`task` returns the new task's card (`taskId`); follow it with `ducter tail <taskId>`.

## Act on results

```sh
ducter answer <decision id or part of its question> go    # go | hold | "your words"
ducter merge <part of a task's title>                     # merge a finished task's branch into its base
ducter undo <part of a task's title>                      # a folder task: put the folder back as it was
```

## Connect a device

`ducter pair --json` → `{code, address, link, command}`: a code for one device, once, for 10
minutes; run it again for each next device (in the Mac app: Devices › Connect a phone or computer
/ 设备 › 连上手机或另一台电脑). The user
opens `link` on a phone or pastes it into the Mac app; another computer runs `command` to do
tasks for this Ducter. `reachable: false` means there's no public address yet: see the
ducter-deploy skill (`ducter domain`).

## Safe defaults

- **Never answer Go for the user** on anything irreversible or outward (merge to main, push,
  send mail, delete, pay, publish). Show the question, its default and what Go does; let the
  user decide. Hold or a reply that asks a question is fine when unsure.
- `merge` and `undo` change the user's repo or folder: run them only when the user asked.
- Don't start tasks the user didn't ask for. Don't paste pair codes, tokens or keys anywhere
  but to the user.
- Words to the partner are the user's voice: say clearly when a message is from you, the agent.
