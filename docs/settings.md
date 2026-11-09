---
title: Your partner and settings
description: Rename your partner, choose how it talks, when it may come to you, what it remembers, and the app's own settings.
order: 4
---

# Your partner and settings

There are two places to change things. **Partner** is about the one you talk to: its name, how
it talks, when it comes to you and what it remembers. **Settings** is about the app itself. What
your devices can do lives in **Devices**.

## Partner

Open it with **⌘4**, from **View › Partner**, or by clicking your partner's face and name at the
top of the conversation. On a phone, tap your partner at the top of the conversation.

- **Its name.** Click **Rename**, type a new name, and press Return. The new name shows at once
  in every window and on your phone.
- **How it talks.** Choose **Follow me** to have it answer in whatever language you write in.
  Choose **中文** or **English** to have it always answer in that language.
- **When it comes to you.**
  - **Notifications** turns the nudges on this Mac and your connected phones on or off. With
    them off, anything that needs you waits in the conversation and in On hand.
  - **Quiet hours** holds notifications between two times, 23:00 to 08:00 at first. When the
    quiet hours end, you hear about everything that came up during them.
  - **If you don't answer** sets how long a decision waits before your partner goes with its
    suggested default: 10 minutes, 30 minutes, 1 hour or 2 hours. This applies only to things
    that can be undone. Anything that can't be undone always waits for you.
- **What it remembers.** With [Nowledge Mem](https://mem.nowledge.co) connected, your partner
  remembers what you've told it across conversations. **Noted lately** lists what it wrote
  down. **Forget** removes a line: Nowledge Mem forgets it when it can, and otherwise the line
  is only hidden here (the app tells you which). To stop it from recalling or noting anything,
  turn off **Remember things**.
- **Accounts it can read.** Your partner can read your Gmail, calendar, GitHub and other
  accounts through [OpenConnector](https://github.com/oomol-lab/open-connector). Connect the
  accounts there first, make a key for Ducter on OpenConnector's Access page (Create Token), then choose
  **Add one**, pick where your OpenConnector runs, and paste its address and the key.
  - **Hosted by OOMOL** needs no setup with Google, but your mail and sign-ins pass through
    OOMOL's servers.
  - **Self-hosted** keeps them on your own machine. For Gmail and similar accounts, you then
    set up your own app with Google in OpenConnector.
  - If OOMOL's `oo` command line is set up with your own OpenConnector, choose **Use the
    OpenConnector from oo** instead.
  - Your partner reads on its own, and asks you first before anything is sent or changed.
  - What it reads is shown to your AI account to understand it; no one else gets it.
  - **Remove** takes an account away, and the key with it. The key is kept only in
    Ducter's own data folder.
  - This is new and still being tried out. Your partner doesn't yet watch your accounts on
    its own; it looks when you ask.
- **On its own, or asks you first.** This list shows what your partner does without asking
  (changing code in its own copy, reading your projects, browsing in its own browser) and what it
  always asks you about first (anything that reaches other people, anything that can't be taken
  back, signing in, paying). You can't change this list yet.

## Settings

Open it with **⌘,** or **Ducter › Settings…**.

- **Look:** Pebble, the warm paper and clay look. More looks will appear here once they work.
- **Language:** the language of the app's own words. **Follow the system** uses your Mac's
  language. This is separate from how your partner talks.
- **When you close the window:** shows whether Ducter keeps working in the background and
  starts again when you log in. **Stop Ducter** stops everything until you wake it.
- **Updates:** checks for a new version, restarts into one that's ready, or installs it when
  you quit.
- **Data and logs:** opens Ducter's data folder or its log. **Run checks** runs the same
  check-up as the first run, with a plain line for each tool.
- **About:** the version, the docs, the licenses, and **Report a problem…**.
- **Remove Ducter** is the quiet button at the very bottom. It shows exactly what goes and what
  stays before anything is removed. See [Install](install.md).

## The menu bar

- **Ducter:** About, the update line, Settings…, Stop Ducter, Quit.
- **View:** Conversation ⌘1, On hand ⌘2, Devices ⌘3, Partner ⌘4.
- **Help:** Ducter docs, Report a problem….

With the window closed, your partner also sits in the macOS menu bar. Click it to see what needs
you and answer each question with **Go** or **Hold**, or choose **Open Ducter**.

## Devices: AI accounts and connecting a phone

In **Devices**, the AI accounts under this Mac (Claude Code, Codex; pi and DeepSeek Harness when
they're set up) open when you click them.
From there you can install the tool, sign in with its own sign-in in your browser, or sign out.
Ducter never sees your password. To add your phone or another computer, click **Connect a phone
or computer**. The app shows a one-time code for it (see [Your phone](phone.md)).
