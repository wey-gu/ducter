# @ and / in the composers (D534)

The author: 「我们 main ai 和 task 的聊天界面应该能允许 @ 提及其他 task，/ 调出来各种 skill 吧？在 task
里应该还支持 harness 原生的 command 才对？」 This note says what @ and / do in the one composer (D519),
in the partner's conversation and in an opened task, what rides with the words, and which of an
agent's own commands reach it. Evidence per agent is in `research/224-native-commands-through-oar.md`.
Words are the glossary's (`product-model.md`).

## Who, what they feel, how it starts

- **The heavy developer** has six tasks on hand and twenty finished this week. Before: to point the
  partner at one task he retyped its title and hoped the partner picked the right one ("the login
  one" landed on the bench task the conversation was just on); in a task he could type `/compact`
  only if he remembered which agent took it; his own skills were invisible. After: `@lo`, Enter,
  and the words say *that* task; the partner carries it on. `/` in a task lists exactly what its
  agent runs, with its own descriptions, and nothing that would silently do nothing. Feel: 顺滑
  (one key), 放心 (the chip names the real thing; nothing fake is offered).
- **The consumer** types `@` because every messaging app taught them to: the tasks on hand come up,
  pick one, ask about it. `/` shows Ducter's own verbs in plain words (新任务, 照看, 提醒我).
- **The fresh user** meets none of it until they type @ or /. The list says what it finds while it
  waits ("打几个字，找任务、文件、伙伴或 PR") and closes with Esc. No setup, no concept.

## @: refer to something

Typing `@` (at the start, after a space, or straight after CJK text; never inside an address)
opens the list above the caret. Sections, each with its drawn glyph:

| Section | What | Where from |
|---|---|---|
| 任务 / Tasks | on hand first (newest first), then earlier ones once words are typed | the cards; the Past index (⌘K's) |
| 文件 / Files | files in the task's place, by name then path (inside a task only) | the workbench's `find`: `git ls-files` (tracked and untracked, never ignored), else a bounded walk |
| 在照看的 / Looking after | Keeps on or paused | the Keeps |
| 伙伴 / Partners | the person's other partners | partners |
| PR 和 issue / PRs and issues | PRs the tasks own, issues they were started from | the cards' `prs` and `source` |

Picking writes `@name ` into the words (the name one line, at most 36 characters, cut at a word
end) and keeps the object beside them. The name is marked in the words on the chip's tint (web: a
backdrop behind the textarea; Mac: the text's own ranges), so the textarea keeps its caret, IME
and undo. Deleting the name drops the reference: only references whose `@name` is still in the
words go (`liveRefs`).

**On send** the words go as typed with `refs: [{kind, id, label}]`. The home resolves each id
(`core/src/mentions.ts`): a task's title, state, latest report, branch and PR; a Keep's line; a
PR's state and the task on it; a gone one is said gone. Code only resolves; the model judges.

- **In the partner's conversation** the message's `refs` are rendered into the partner's turn
  with what each is. A task they @ is what the words are about: carry it on, ask about it,
  compare it, start from it, never a new task for the same work.
- **In a task** the task reads its references after the person's words, fenced as data
  (`<ducter-refs>`), with an @'d task's report, its branch and working copy, and the files it
  changed, so it can read the full diff itself. The opened task shows only the words and chips.

A sent message draws each reference as the chip: its glyph and name inline in the bubble, in the
bubble's own ink on a 13% tint; a task opens, a PR or issue opens its page.

## /: do something

`/` opens the other list. In the partner's composer it may follow a space; in a task only at the
very start of the words (an agent reads a command there).

**The partner's composer**

| Section | Entries | Picking |
|---|---|---|
| Ducter 能做的 / Ducter can | 新任务 / New task, 照看 / Look after, 提醒我 / Remind me, 交给 Ducter / Hand over, 找 / Find | New task, Hand over and Find open their sheets at once; Look after and Remind me become a chip (`/照看`) the partner reads as the ask |
| 你的技能 / Your skills | the person's skills as their tasks see them (Claude Code's on the home, else Codex's), their own first, each with its description | a chip (`/kill-ai-slop`); the partner starts a task whose brief uses it by name |

**A task's composer**

| Section | Entries | Picking |
|---|---|---|
| 这个任务 / This task | 暂停 / Pause (while it works), 换谁来做 / Switch who does it, 从这一步开新任务 / New task from this step | runs at once with its sheet |
| {agent} 的命令 / {agent}'s commands | Ducter's `/model` and `/effort` (D282), `/compact` where it reaches the agent, then the agent's own catalog read in the task's folder | writes `/name ` into the words; sent untouched |
| {agent} 的技能 / {agent}'s skills | an agent whose skills are typed in a form of their own (Codex `$name`, pi `/skill:name`) | writes that form |

Which agent offers what is the registry's `nativeCommands` (harness-facts.ts), read at runtime
through OAR's inventories and cached five minutes per task:

| Agent | Offered | Not offered, and why |
|---|---|---|
| Claude Code | everything its catalog lists, with descriptions | pickers and screens of its terminal (`/config`, `/color`, `/agents`, `/mcp`…) |
| Codex | `/compact` (OAR's), `/model`, `/effort`, its skills as `$name` | its TUI commands (`/review`, `/diff`, `/init`…): the app-server takes none |
| pi | its prompt templates, `/skill:name`, `/compact` | — |
| DeepSeek Harness | `/compact`, `/model`, `/effort` | its skills: no verified way to run one by name |
| Antigravity | `/model`, `/effort` | `/compact`: OAR says it is unverified |

## The popover: one shared control

`MentionPop` (web `composer.tsx`) and `mentionPop` (Mac `mentions.go`), with the reference chip
(`RefChip` / `refChip`), are in the D161 table. Keys: ↑↓ (⌃N ⌃P) walk, Enter or Tab picks, Esc
closes and stays closed until the trigger changes, typing filters; the mouse hovers and clicks
without taking the focus from the words. It stands above the caret on the clay menu's card
(`--floating`, a hairline), at most 340 high and never past the window (it goes below where there
is no room above). On a phone or under 560 wide it is a sheet docked over the composer with a grab
line, its name and 收起 / Close, rows 48 tall. While the home answers it breathes and says so
(在找… / 在读 Claude Code 的命令…); nothing found says the words typed.

## What it is not

- Not a rich-text editor: the words stay plain text; the chip is drawn in sent messages only.
- Not a second way to run things: Ducter's actions open the same sheets their buttons open.
- No command is offered that would reach the agent as plain words when the person meant a command.
