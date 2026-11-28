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

Ducter has no reader built in. A reader comes from a **plugin repository** — a git repository
with an `index.json` at its root — and Ducter knows two kinds: the one official repository
(`https://github.com/wey-gu/ducter-plugins`) and the ones you add yourself.

## The official plugins

Open **Settings › 导入 / Import**. Under the installed rows, **可以带进来的 / Available** lists
what the repositories carry: each app's own icon, its name, its version, where it comes from, and
**带进来 / Bring them in**. Apps whose store is on this computer come first and say **这台电脑上有它
/ It's on this computer**.

The official repository carries **Lody** and other readers. Lody's reader runs your own signed-in
`lody` command and goes online through it. The other readers the repository lists say exactly what
they read on their own consent cards; some open a local store read only and never go online. **Bring them in** installs one at the commit and content
hash the repository pins, then shows the consent card below. Nothing is read before you choose
**带进来** on that card.

If you already brought Lody in when Ducter had a built-in Lody reader, nothing moves: the plugin
has the same app name and account, so your imported tasks keep their ids and messages. Bringing
Lody in again adds only conversations and messages that are new.

## A reader someone else wrote

Add their repository in **Settings › 导入 › 插件仓库 › 加一个插件仓库 / Add a plugin repository**, or
from a terminal:

```sh
ducter plugin source add https://github.com/someone/ducter-plugins
ducter plugin source list
```

Their plugins appear under **可以带进来的 / Available**, marked **你加的 / Added by you**. Unless the
official repository lists the same id, version and content hash, they also say **没有人替你检查过 /
Nobody has checked it for you**. The check is about exact bytes, not a promise: the official index
is the only list Ducter treats as reviewed.

You can still install a single reader directly, without a repository:

```sh
ducter plugin add https://github.com/someone/acme-notes-reader
ducter plugin add ~/src/my-reader
```

Ducter installs it at a fixed commit and records a hash of its files; it never runs anything while
installing. `ducter plugin list` shows what is installed, its pin and what it reads;
`ducter plugin update <id>` moves to a newer pin; `ducter plugin remove <id>` removes it and hides
the conversations it brought in.

## Install and consent

One tap on **带进来** installs the plugin, then the same literal card for every source:

- **It will read:** every path the reader declares, one line each; a glob stays literal. It can't
  read anything else, and it can only write in a temporary folder Ducter gives it.
- **Commands it starts.** A reader may declare a command you already have, with its own sentence
  in the card, such as **它会用你电脑上已经登录的 lody 命令读你的对话，会联网。 / It reads your
  conversations with the lody command already signed in on this computer, and goes online.** That
  sentence says it goes online; an offline reader's card adds **它不能上网，也不能改那些文件。 / It
  can't go online or change those files.**
- **If it goes online and nobody checked it**, the card asks for a second, explicit tick:
  **它会联网，没有人替你检查过 / It will go online, and nobody has checked it for you**. Until you
  tick it, **带进来** is not offered.
- **What comes in** shows in Past tasks, read only. Who made it is on the card.
- **It is run in a sandbox, or not at all.** On macOS Ducter uses the system's sandbox; on Linux
  it uses bubblewrap. A declared online command gets outbound network for that run only; every
  other reader gets none. Where neither sandbox can run, the row says **这台电脑不能把它关进沙箱 /
  This computer can't sandbox it** and nothing is run.
- **An update that reads more asks again.** If the newer version declares a path or command you
  haven't seen, the consent card comes back before anything runs.

## When it runs, and if it can't

- **When it is done** one line says what came in and the oldest conversation's day. Pictures and
  attachments are counted, not brought.
- **If it can't read** (its command isn't on this computer, you aren't signed in, a workspace this
  computer isn't allowed to read, or the reader can't run here), the row says which, in plain
  words, and offers **再试一次 / Try again**.
- **Remove this source** hides the conversations it brought in from Past tasks and search. It says
  how many before you choose, and it never deletes them: bringing the app in again brings them
  back. The line saying it was removed sits under the sources, where the source was, not in a
  toast.

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

A plugin folder has a `ducter-plugin.json` at its top:

```json
{
  "format": "ducter-plugin/1",
  "id": "acme-notes",
  "kind": "importer",
  "version": "0.2.0",
  "name": { "en": "Acme Notes", "zh": "Acme 笔记" },
  "app": { "name": "Acme Notes", "icon": "icon.png" },
  "author": { "name": "Your name" },
  "emits": "ducter-import/1",
  "run": ["bun", "main.ts"],
  "reads": ["~/Library/Application Support/AcmeNotes/**/*.sqlite*"],
  "starts": [],
  "uses": [
    {
      "command": "lody",
      "online": true,
      "why": {
        "en": "It reads your conversations with the lody command already signed in on this computer, and goes online.",
        "zh": "它会用你电脑上已经登录的 lody 命令读你的对话，会联网。"
      }
    }
  ],
  "detect": ["~/Library/Application Support/AcmeNotes/store.sqlite"],
  "ducter": "^0.1"
}
```

- **id** is lower-case letters, digits and `-`; **kind** is `importer` (the only kind now);
  **version** is your reader's own version.
- **name** and **app** are what the card says; **author** is who made it, shown on the card.
- **app.icon** is a PNG or SVG inside the plugin, at most 256 KB. Ducter shows it in the shared
  clay tile; without one the app's initial stays.
- **run** is the command, with `bun` meaning Ducter's own Bun (a single-binary Ducter runs your
  script in Bun's mode). No `bun install` runs: ship what your reader needs inside the folder.
- **reads** is every path it opens, literally; `~` is the home folder and a glob is allowed.
  Nothing outside this list is readable.
- **uses** names a command the reader starts. `online: true` is the only way a reader may use the
  network, and only for that run; a use without it gets no network. `why` is the sentence the
  consent card shows, in both languages. `starts` remains for a plain extra program with no
  network; new plugins should use `uses`.
- **detect** is checked by file existence only, so the app can be offered first without reading
  its store.
- **ducter** is the Ducter range it needs, for example `^0.1`. A reader whose range doesn't match
  is listed as needing a newer Ducter and isn't run.

## A plugin repository's index

A repository is any git repository with an `index.json` at its root:

```json
{
  "format": "ducter-plugins/1",
  "plugins": [
    {
      "id": "acme-notes",
      "path": "plugins/acme-notes",
      "version": "0.2.0",
      "commit": "0123456789abcdef",
      "hash": "<sha256>",
      "app": "Acme Notes",
      "icon": "icon.png"
    }
  ]
}
```

- **path** is the plugin folder inside the repository, and **commit** is the commit that contains
  those exact bytes. Ducter checks it out and verifies the hash before installing.
- **hash** is the content hash of the plugin folder: every file's path (relative to the folder,
  `/` separators, sorted) and bytes, each followed by a NUL byte, hashed with SHA-256. The official
  repository's `scripts/index.ts` is the reference implementation; copy it for your own.
- **icon** is the app's icon inside the plugin folder; `app.icon` in the manifest is the fallback.
- Ducter reads the last good official index from its disk cache, so being offline doesn't turn a
  checked version into an unchecked one. A repository you added is read when the pane opens.

The same reader can be run by hand while you write it:
`bun main.ts | ducter import --check`, then `bun main.ts | ducter import -`.
