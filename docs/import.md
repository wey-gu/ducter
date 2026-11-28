---
title: Bring past conversations in
description: Copy the conversations you had in another app into Past tasks, read only, with one small format any reader can print. Check it first, then find them by words, day and project.
order: 2.7
---

# Bring past conversations in

If you have months of conversations in another AI app you are leaving, Ducter can keep them as
**做过的事 / Past tasks**: read only, with their own day and project, found by the same words and
time words as everything else. The other app isn't changed, and Ducter never pushes anything at
you about them.

There are two sides: a **reader** that knows how to get the conversations out of the other app,
and `ducter import`, which checks what the reader prints and keeps it. Ducter has a reader for
**Lody** built in: Settings › **Import** runs your own signed-in `lody` command, so nothing needs
installing and nothing is read until you say yes. A reader for any other app is any program that
prints the format below; you (or anyone) can write one in an afternoon.

## Lody, in Settings

Open **Settings › Import**. Lody's row says how many conversations it can see. Choose **Bring them
in**; the consent card says, in plain words, what will be read (your Lody conversations, through
the `lody` command already signed in on this computer), that the command is used, that what comes
in shows in **Past tasks** read only, and who made the reader. Nothing is read before you choose
**Bring them in** there.

- **Read only.** Nothing in Lody changes, and Ducter never sends, answers or continues a Lody
  conversation.
- **The offer.** The first time a Lody conversation could come in, **Past tasks** shows one quiet
  line under **Also on this computer**, once. It fades if you leave it; **Not now** keeps it away
  until you mention Lody again.
- **When it is done** one line says what came in and the oldest conversation's day. Pictures and
  attachments are counted, not brought.
- **If it can't read**: no `lody` on this computer, not signed in, or an encrypted workspace this
  computer isn't authorized for. The row says which, in plain words, and nothing else is tried.
- **Remove this source** hides the conversations it brought in from Past tasks and search. It says
  how many before you choose, and it never deletes them: bringing Lody in again brings them back.
- Running **Bring in again** adds only conversations and messages that are new. A message edited
  in Lody isn't updated, because Ducter only has a copy.

## A reader someone else wrote

A reader doesn't have to ship with Ducter. If someone wrote one for an app you use, add it from
its git repository or from a folder on this computer:

```sh
ducter plugin add https://github.com/someone/acme-notes-reader
ducter plugin add ~/src/my-reader
```

Ducter installs it at a fixed commit and records a hash of its files; it never runs anything
while installing. `ducter plugin list` shows what is installed, its pin and what it reads;
`ducter plugin update <id>` moves to a newer pin; `ducter plugin remove <id>` removes it and hides
the conversations it brought in.

Its row appears in **Settings › Import**, marked **你加的 / Added by you** with its repository.
Ducter's own curated list (`plugins.json`) says which version Ducter has checked; a reader that
isn't on it says **没有人替你检查过 / Nobody has checked it for you** instead.

- **You say what it may read.** The consent card names every path the reader declares, one line
  each. It can't go online or change those files; it writes only in a temporary folder Ducter
  gives it and prints the conversations to Ducter. Nothing runs before you choose **Bring them
  in**.
- **It is run in a sandbox, or not at all.** On macOS Ducter uses the system's sandbox; on Linux
  it uses bubblewrap. Where neither can run, the row says **这台电脑不能把它关进沙箱 / This computer
  can't sandbox it** and nothing is run.
- **An update that reads more asks again.** If the newer version declares a path you haven't
  seen, the consent card comes back before anything runs.
- **Read only.** What it brings in is the same read-only past task as Lody's. It never gets a
  window, a network connection, a credential or the Log; it only prints the format below.

A reader that needs a vendor's command with a network connection (as Lody's does) stays a
built-in reader: an added reader is local and offline.

## Run it

```sh
my-reader | ducter import -
```

Or from a file:

```sh
ducter import threads.jsonl
```

For a reader of your own (not Lody), check first, writing nothing:

```sh
my-reader | ducter import --check
```

`--check` prints how many conversations and messages the stream holds, and why it stopped if it
did. Run it until it is clean, then import.

## The format

One JSON object per line. Nothing else is read.

```jsonl
{"t":"source","format":"ducter-import/1","app":"Lody","account":"workspace:my-team","reader":"lody-cli","readerVersion":"1"}
{"t":"thread","id":"S-8f2a","title":"Fix the flaky WAL test","folder":"/Users/me/src/hawdb","repo":"github.com/acme/hawdb","branch":"fix-wal","agent":"codex","model":"gpt-5.5","createdAt":"2026-10-02T03:11:00Z","updatedAt":"2026-10-02T05:40:12Z","archived":false}
{"t":"msg","thread":"S-8f2a","id":"m1","role":"user","text":"The WAL test fails one run in five…","at":"2026-10-02T03:11:00Z"}
{"t":"msg","thread":"S-8f2a","id":"m2","role":"assistant","text":"It races the checkpoint…","at":"2026-10-02T03:14:31Z"}
{"t":"skipped","thread":"S-8f2a","what":"attachment","n":2}
{"t":"end","threads":1,"messages":2}
```

- **source**, once, first: the format, the app's name (the card says **从 {app} 带进来的 / From
  {app}**), an account or workspace when the app has one, and the reader's own name and version.
- **thread**, one per conversation: its id, a title, and when it began and was last worked on.
  `folder` is where it worked, and `repo` (owner/name or a Git address) when the app knew it.
  `agent` and `model` are the app's own words. `archived: true` is fine.
- **msg**, one per visible message: the thread's id, the message's id, `user` or `assistant`, the
  text, and when it was said. Messages may come in any order; Ducter sorts them by time.
- **skipped**, optional: what was not brought, and how many. Attachments are the usual one.
- **end**, once, last: the counts the reader says it printed. Ducter checks them.

The reader may print nothing else: system prompts, tool calls, their output and thinking aren't
part of the format. Unknown fields are dropped rather than stored. A line whose `t` Ducter doesn't
know stops the stream.

**Limits.** One message's text is at most 256 KB. A title is at most 200 characters. One thread
has at most 20,000 messages in one run. Every time is a valid ISO time and not in the future.

**Stopping early** is safe. If a record is bad or the stream ends without **end**, everything
before it that was whole is kept and the last, possibly cut-off conversation is left out. The
import says where it stopped. The next run picks up from what is there.

**Keys are hidden.** Every title, message and field passes through the same secret detector
Ducter uses everywhere, before anything is stored. A pasted API key, a password in a URL or a card
number in a message is shown as dots.

## What is brought in

Each thread becomes one past task:

- its title, its own **day** (the source's times, not the day you ran the import) and its
  **project**: the repository when the reader knows it, else the folder's origin, else the
  folder's name, marked **文件夹不在了 / Folder gone** if that folder isn't on this computer.
- the person's messages become its **steps**; the agent's last words show as **最后说的 / Last
  words**.
- it sits under the **带进来的 / Brought in** end filter. Its card says **从 {app} 带进来的 / From
  {app}** once; **Brought in** is on the card only when the app isn't known.

A card offers **打开 / Open** and **带着它开新任务 / New task from this**. It never offers
**接着做 / Continue**: the conversation lives in the other app and Ducter only has a copy. Import
the same reader again and nothing is duplicated; a conversation that grew brings only its new
messages. A message edited in the other app isn't updated.

These tasks are not on **任务 / Tasks** and never need you: no card, no count, and the partner
isn't woken by them. The partner can still find one when you ask about it, and says which app it
came from.

## Writing a reader

A reader can be any language and any length; it only has to read the other app's store without
changing it, and print these lines to standard output.

1. Print **source** once.
2. For each conversation, print **thread**, then its visible messages, then **skipped** if some
   things couldn't be brought.
3. Print **end** with the counts.

Use the other app's own ids for threads and messages: Ducter uses them to recognise a conversation
it already has. Leave out tool calls, thinking, system prompts and unfinished (streaming) messages.
Count their attachments as **skipped** rather than dropping them silently.

A first run on a copy of a small store is the fastest way to see the card. If the format changes
later, Ducter keeps accepting this one: a new version is added, never swapped in.

## The manifest

A folder a person can add with `ducter plugin add` has a `ducter-plugin.json` at its top:

```json
{
  "format": "ducter-plugin/1",
  "id": "acme-notes",
  "kind": "importer",
  "version": "0.2.0",
  "name": { "en": "Acme Notes", "zh": "Acme 笔记" },
  "app": { "name": "Acme Notes" },
  "author": { "name": "Your name" },
  "emits": "ducter-import/1",
  "run": ["bun", "main.ts"],
  "reads": ["~/Library/Application Support/AcmeNotes/**/*.sqlite*"],
  "starts": [],
  "network": false,
  "detect": ["~/Library/Application Support/AcmeNotes/store.sqlite"],
  "ducter": "^0.1"
}
```

- **id** is lower-case letters, digits and `-`; **kind** is `importer` (the only kind now);
  **version** is your reader's own version.
- **name** and **app** are what the card says; **author** is who made it, shown on the card.
- **run** is the command, with `bun` meaning Ducter's own Bun (a single-binary Ducter runs your
  script in Bun's mode). No `bun install` runs: ship what your reader needs inside the folder.
- **reads** is every path it opens, literally; `~` is the home folder and a glob is allowed.
  Nothing outside this list is readable.
- **starts** names extra programs it may start; **network** must be `false`.
- **ducter** is the Ducter range it needs, for example `^0.1`. A reader whose range doesn't match
  is listed as needing a newer Ducter and isn't run.

The same reader can be run by hand while you write it:
`bun main.ts | ducter import --check`, then `bun main.ts | ducter import -`.
