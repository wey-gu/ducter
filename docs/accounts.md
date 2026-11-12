---
title: Accounts your partner can read
description: Let your partner read your Gmail, calendar, Slack and other accounts, in one tap if you use oo, and what it does and never does with them.
order: 5
---

# Accounts your partner can read

Your partner can look in your mail, calendar, Slack, GitHub and other accounts when you ask
("最近几天邮件里有没有需要我留意的事？" / "anything in my mail I should know about?"). It reads on
its own. Anything that would send, change or delete something waits for you to say **Go**.

You add accounts in **Settings**, under **Accounts** (**Accounts it can read**), on the Mac or the
phone.

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

Calendars have a page of their own: [Your calendar](calendar.md).

## Without oo: a key

Choose **Add one** (or **Add one with an address and key** under the oo card), then pick where
your accounts are connected:

- **Hosted by OOMOL**: no setup with Google, but your mail and sign-ins pass through OOMOL's
  servers.
- **Self-hosted**: your own [OpenConnector](https://github.com/oomol-lab/open-connector). Your mail
  and sign-ins stay on your own computer or server; for Gmail and similar accounts you set up your own
  app with Google in OpenConnector.
- **Something else**: any other MCP server.

### Hosted by OOMOL

There is no address to type. The card shows three steps:

1. Sign in to OOMOL and connect Gmail, Discord and the rest. **Connect accounts in OOMOL** opens
   [the page for that](https://console.oomol.com/app-connections).
2. Make a new key in the OOMOL console. **Get a key** opens
   [console.oomol.com/api-key](https://console.oomol.com/api-key).
3. Paste the key under **Key**, then **Check and add** (or press Return). **Show** lets you check
   what you pasted; spaces and line breaks that come along with a paste are dropped.

What you might see:

- **Added OOMOL. It can now read Gmail, Discord.** It worked, and that's what your partner can
  read.
- **Connected, but no accounts are connected in OOMOL yet.** The key works, but there's nothing
  in OOMOL to read. Connect your accounts there (the link is right under it); they show up here
  within a few minutes.
- **Paste a key first.** The key field was empty; nothing was sent.
- **That key was refused or has expired.** Make a new one with **Get a key** and paste it again.
- **Can't reach that address.** Check your internet connection and try again in a moment.

### Self-hosted or something else

Paste the address and the key, then **Check and add**. **How to connect**, under the key, lists
the steps for the choice you picked.

The key is kept only in Ducter's own data folder, and is never shown again.

## What it does with them

- **Reading just happens.** Your partner looks for itself when you ask, and quotes little.
- **Sending, replying, drafting, labelling, archiving, deleting: always your Go.** You see a
  card with what would happen; it waits on **Hold** until you decide. Through oo, anything
  Ducter can't tell is only a read counts as a change and asks you first.
- **Tasks read only what your partner gives them**, and never change anything.
- **Where your mail goes.** Through oo or Hosted by OOMOL, your mail and sign-ins pass through
  OOMOL's servers. What your partner reads is shown to your AI account to understand it; no one
  else gets it.
- **Stop using …** at the foot of a card takes the accounts away from Ducter, after you confirm
  it in place. Through oo, that doesn't sign you out of oo. What it noted stays in **What it
  remembers**, where you can forget it.

## The card for each place

Each place your accounts come from (oo, OOMOL, your own OpenConnector, another service) has one
card: its mailbox, its name and one line that says how it is (**Keeping an eye out**, **Paused**,
**Reads only when you ask**, or what went wrong and how to fix it). Under it, a
square for each app it can read. Tap one to see what it reads, what it always asks you first,
when it last looked, and two choices:

- **Watch on its own**: on, Ducter looks at this app by itself (once you said yes, below). For
  Discord and Slack it looks only at @-mentions and direct messages.
- **Don't let Ducter read this one**: nothing reads that account, not even when you ask.

**⋯** beside the line about where your mail passes shows **What it read** today, one line per
look (how many, and what it looked at; never what the mail said).

## When it notices something

If you want, your partner keeps an eye on your accounts and tells you only what matters. When you
add accounts the first time, it asks once whether to look through the last two weeks for anything
that needs you (someone waiting, a bill due, a booking that doesn't add up), and then how you want
to hear about things. Until you answer, it doesn't look by
itself.

The same choice sits above the cards, and under **Notifications**:

- **Only urgent**: only what costs you something if it waits until tomorrow (someone who asked
  you again, or has waited three working days, counts too; so does a promise due today), and,
  10 minutes before a meeting, what you have open with those people.
- **Up to 3 a day** (suggested): one message in the morning, when your quiet hours end, with at
  most three things; anything urgent right away. On a day with nothing worth saying it sends
  nothing and shows nothing: no news is good news.
- **Whenever useful**: everything worth saying, still in the morning message (at most five in one).
- **Only when I ask**: it doesn't look by itself.

If you choose here instead of answering the first question, it still takes one quiet look back
over earlier mail and your calendars, so it knows the bookings and bills already there. It says
nothing about that look.

What it may tell you: two things that don't match (a flight that lands the night before your
hotel starts, or a talk your calendar has on the 18th while the organizer's mail says the 19th), someone waiting on your answer, you waiting on someone, something you promised
for today, a deadline or a payment, a plan that changed, and, 10 minutes before a meeting, what
you have open with those people. Each comes with **How I know** (the mails or events, with
dates) and at most one next step, like **See if it can start earlier**: nothing happens until
you tap it, and even then it only looks things up or drafts; it never sends, pays, books,
deletes or marks anything read. A step you don't take quietly becomes **Passed** after its date.

Under each one, **Useful** or **Don't tell me this kind**. The second becomes a rule in **Your
rules**, where you can remove it. If three morning messages in a row go unread, they stop, and
the next time you write it asks whether to keep them. At night it never wakes you, unless you
said so for a kind ("wake me if a flight changes").

It doesn't tell you how much it read or list what it skipped. Ask "anything else?" and it tells
you what it left out; **What it read** under **⋯** on the card shows each look, and **What it
looked at today** under **Notifications** shows why it stayed quiet (see
[Settings](settings.md)).

It reads headers and the first lines of new mail, and keeps only small facts with dates (a
booking, a renewal, a promise) for 30 days after they stop mattering; never the mail itself.
