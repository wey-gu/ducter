---
title: Accounts your partner can read
description: Let your partner read your Gmail, calendar, Slack and other accounts, in one tap if you use oo, and what it does and never does with them.
order: 5
---

# Accounts your partner can read

Your partner can look in your mail, calendar, Slack, GitHub and other accounts when you ask
("最近几天邮件里有没有需要我留意的事？" / "anything in my mail I should know about?"). It reads on
its own. Anything that would send, change or delete something waits for you to say **Go**.

You add accounts on the **Partner** page, under **Accounts it can read**.

## If you use oo: one tap

If OOMOL's `oo` command line is installed on the computer Ducter runs on, and you're signed in
to it, the card shows **Your accounts in oo**: each service you connected in oo (Gmail, Slack
and so on) with its accounts.

1. Check the list. That is everything your partner will be able to read.
2. Tap **Use these accounts**.

That's all. There is no key to make or paste: Ducter asks oo each time, and oo's sign-in stays
in oo. To add another account later, connect it in oo; it shows up here on its own. If you have
two accounts for one service (a work and a personal Gmail), your partner can read both.

If the card says oo isn't signed in, run `oo login` in a terminal, then tap again.

## Without oo: an address and a key

Choose **Add one** (or **Add one with an address and key** under the oo card), then pick where
your accounts are connected:

- **Hosted by OOMOL**: no setup with Google, but your mail and sign-ins pass through OOMOL's
  servers.
- **Self-hosted**: your own [OpenConnector](https://github.com/oomol-lab/open-connector). Your mail
  and sign-ins stay on your own machine; for Gmail and similar accounts you set up your own
  app with Google in OpenConnector.
- **Something else**: any other MCP server.

Paste the address and the key, then **Check and add**. **How to connect**, under the key, lists
the steps for the choice you picked. The key is kept only in Ducter's own data folder.

## What it does with them

- **Reading just happens.** Your partner looks for itself when you ask, and quotes little.
- **Sending, replying, drafting, labelling, archiving, deleting: always your Go.** You see a
  card with what would happen; it waits on **Hold** until you decide. Through oo, anything
  Ducter can't tell is only a read counts as a change and asks you first.
- **Tasks read only what your partner gives them**, and never change anything.
- **Where your mail goes.** Through oo or Hosted by OOMOL, your mail and sign-ins pass through
  OOMOL's servers. What your partner reads is shown to your AI account to understand it; no one
  else gets it.
- **Remove** takes the accounts away from Ducter. Through oo, that doesn't sign you out of oo.

This is new and still being tried out. Your partner doesn't yet watch your accounts on its own;
it looks when you ask.
