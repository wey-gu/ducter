---
title: For AI agents
description: Let Claude Code, Codex or another AI agent install Ducter, set up your server and run it for you, with the Ducter skills.
order: 11
---

# For AI agents

You can hand Ducter's setup to the AI agent you already use. Ducter comes with three
[Agent Skills](https://docs.anthropic.com/en/docs/claude-code/skills), short instructions an
agent such as Claude Code or Codex follows:

| Skill | What your agent can do with it |
|---|---|
| **ducter-deploy** | Install Ducter on your Mac or a Linux server, set up your domain with HTTPS, connect your Mac and phone, add a computer that does tasks, update, or start over cleanly |
| **ducter-operate** | Look at your tasks, talk to your partner, start or follow a task, and bring decisions to you |
| **ducter-troubleshoot** | Run the check-up, read the logs and fix what usually goes wrong |

## Give them to your agent

Ask it, in your own words:

> Install the ducter-deploy skill from github.com/wey-gu/ducter/tree/main/skills and deploy
> Ducter on my server.

Or put them where your agent looks for skills, for Claude Code `~/.claude/skills/`:

```sh
git clone --depth 1 https://github.com/wey-gu/ducter /tmp/ducter
cp -R /tmp/ducter/skills/* ~/.claude/skills/
```

Each one is also a single file your agent can read by address:
`https://ducter.ai/skills/ducter-deploy/SKILL.md`, `…/ducter-operate/SKILL.md`,
`…/ducter-troubleshoot/SKILL.md`.

## What runs where

Before it changes anything, the skill has your agent work out which of these you want, and
asks you when it isn't clear:

- **Your Ducter lives on one computer**, your Mac or a server. Your conversation, tasks and
  settings are there. You never have two.
- **Your Mac app, your phone and the `ducter` command** connect to it. On a server they reach it
  at your own domain, over HTTPS.
- **Other computers can do tasks** for it. They keep nothing of their own but the work in
  progress.
- **Claude Code or Codex** has to be installed and signed in on each computer that does the
  work.
- Ducter only listens on the computer it runs on. On a server, [Caddy](https://caddyserver.com)
  answers at your domain and passes requests to it.

| You want | Ducter lives on | Your agent runs |
|---|---|---|
| Just your Mac | your Mac | the one-line install |
| A server that stays on, with your Mac and phone | the server | the install with `--service`, then `ducter domain` |
| A server that also does the tasks | the server | the same; nothing extra |
| Your Mac's repos used by a Ducter on a server | the server | the above, then `ducter worker` on your Mac |

## What it won't do

The skills tell your agent never to answer **Go** for you on anything that can't be undone, never
to pass on your connect codes or sign-in keys, and to ask before it removes anything. Starting
over with `ducter uninstall --all` erases your conversation and tasks, so it shows you the list
first.
