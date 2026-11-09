# 42 · Where a task runs: prior art and what Ducter has today

2026-11-10. For `design/where.md` (draft D157). The question: when a person has more than one
computer (the author: a server home "hel", a MacBook about to become hel's worker, phones as
clients), how should Ducter pick, show and change the machine a task runs on?

Tags: **VERIFIED** (read in this repo's code today, file and line given), **DOCUMENTED** (a
vendor page or a dated public report, linked), **INFERRED** (my reading). No experiments were
run: nothing here needed a model call, and no harness, browser or user config was touched.

## 1. Prior art: how agent products pick an execution environment

| Product | How the place is chosen | Moving | Source |
|---|---|---|---|
| Codex app | A mode per chat: **Local** (on the user's computer), **Worktree** (an isolated git worktree on the same computer), **Cloud** (OpenAI's container, checks the repo out from GitHub). A "connected host" lends files and a shell to chats opened remotely | **Handoff** is defined only between Local and Worktree. Whether a chat can be handed to Cloud is contested in third-party writing; the glossary does not say so | DOCUMENTED [learn.chatgpt.com/docs/glossary](https://learn.chatgpt.com/docs/glossary) (fetched 2026-11-10); [worktrees](https://developers.openai.com/codex/app/worktrees) |
| Claude Code | Terminal = this computer; `claude --remote "task"` or the `&` prefix starts a cloud session with a snapshot of the current context; the desktop app's "Continue in" sends a local session to the web | `--teleport` / `/teleport` pulls a cloud session down (branch + conversation), one way; needs a clean git state and the same account | DOCUMENTED (secondary guides, [sfeir](https://institute.sfeir.com/en/claude-code/claude-code-surfaces-and-environments/web/), [dev.to](https://dev.to/proflead/claude-code-tutorial-syncing-web-sessions-to-local-cli-34e0)); official page [code.claude.com](https://code.claude.com/docs/en/claude-code-on-the-web.md) not opened |
| Cursor 3 | A picker under the prompt (This Computer / Cloud / a remote or self-hosted machine), defaulting to **"Last Used"** | Move to Cloud carries the conversation but **not uncommitted changes**; Move to Local appears only when a local agent for the same repo is open | DOCUMENTED [cursor.com/help/ai-features/cloud-agents](https://cursor.com/help/ai-features/cloud-agents) (fetched); [forum](https://forum.cursor.com/t/can-we-move-from-cloud-agent-to-local/165263) |
| Cursor, a user's complaint (2026-10-07) | One cloud run made later agents start in the cloud ("Last Used"); the agent then could not touch the open folder and the user found out only when it failed: "A Cloud Agent is a remote machine. It cannot read or write the folder on my computer." Asks: label cloud before the first prompt; "Run this on my computer" | The answer: set the default to Local, watch the picker, Move to > Local | DOCUMENTED [forum thread](https://forum.cursor.com/t/desktop-agents-should-work-on-the-open-local-folder-cloud-should-be-a-choice-not-the-surprise/173943) |
| ChatGPT agent | Its own separate browser that does not touch the user's tabs or passwords; sign-ins are stored sessions, listed and clearable in settings | n/a | DOCUMENTED (secondary) [learnprompting](https://newsletter.learnprompting.org/p/chatgpt-can-book-and-browse-while-signed-in-as-you); research/25 |
| ChatGPT Atlas (retired 2026-08) | Agent mode in the user's own browser, with an explicit **logged-in / logged-out** choice; paused on sensitive sites while watched | n/a | DOCUMENTED [help.openai.com 12628199](https://help.openai.com/en/articles/12628199-chatgpt-atlas-agent-mode); research/23 |

**What they share (INFERRED):**
1. The place is a **mode the person picks** before starting (Codex, Cursor), or a **command**
   (Claude Code). None of them works out the machine from what the task needs.
2. **"Last used" as a default surprises** (the Cursor thread): the place changed without the
   person deciding it, and the cost (no access to the folder) showed only at failure.
3. Moving carries the conversation and the **committed** work; uncommitted changes stay
   behind everywhere (Cursor says it outright). Ducter's E3 already says the same.
4. The browser question is framed as **whose sign-ins** (Atlas's logged-in vs logged-out;
   ChatGPT's own browser vs the user's), not as which computer. That is the useful framing for
   Ducter: the person cares whose identity acts, not where the CPU is.
5. Nobody asks "which machine?" when the answer doesn't change anything the person can see.
   Nobody explains, either, why a place was picked.

## 2. What Ducter has today (VERIFIED in code, 2026-11-10)

| Fact | Where |
|---|---|
| A place carries its device: `Place = none{device?} \| repo{device,…} \| folder{device,…} \| browser{device, profile}` | `packages/protocol/src/index.ts:27` |
| The partner picks a device by name only: `task_open` place `device` is "local" by default, "another device only when the user asks for it or the task needs what only it has" | `packages/partner/src/partner.ts:1198` |
| The partner's `[devices]` line names each worker, awake or can't reach, its OS and signed-in agents; no abilities, no sign-ins, no asleep | `partner.ts:2152` `renderDevices` |
| **A browser place on a worker is refused**: "browser places run on this machine only for now" | `packages/runner/src/runner.ts:924` |
| On Devices, a worker's 上网 is `unavailable` / `home_only`; 用电脑 is `later` on every device | `packages/core/src/devices.ts:275,310` |
| Who does it (`fw_candidates`, `chooseBody`) ranks agents **on one device** (the input is that device's harnesses) | `packages/core/src/candidates.ts` |
| The New task card's Where row lists repos and No folder; the device is inferred; there is no device row | `design/new-task.md`, `packages/core/src/newtask.ts` |
| A worker drops → `offline`, after 2 min `blocked` "在等 · <name> 连不上"; a new task for that device fails with "<name> is not connected" (no queueing for a sleeping worker) | `design/system.md` "Placement" |
| The device states the protocol knows: `awake \| asleep \| unreachable` ("asleep" only when the device said it was going to sleep) | `index.ts:760` |
| Browser drivers: on a Mac, native first (Codex Computer Use drives the user's Chrome; Claude Code uses Claude in Chrome when its extension is connected), cua-driver as fallback (D130); on Linux, Ducter's own headless Chrome for Testing with per-persona profile and user-done sign-ins (D151) | `design/decisions.md` D130, D151 |

## 3. What each kind of need asks of a machine (from §2 and research/23, 34, 38, 39)

| Need | A machine qualifies when | Notes |
|---|---|---|
| A repo | it has a checkout, or can clone it with its own git login (asked once per repo, C1) | Moving needs the branch pushed (E3) |
| A folder that isn't git | it is the machine the folder is on | Never moves: the D142 copy is local |
| Browse public pages | any machine with 上网 on (a Mac: native or cua; a server: Ducter's own browser) | — |
| Browse **as the user** (their signed-in sites) | the Mac with the user's Chrome, through a native driver; or Ducter's own browser on a machine where the user already signed in to that site (Signed-in sites, D151) | Sign-ins never copy between machines (research/25) |
| A Mac app (Keynote, Xcode) | a Mac with 用电脑 (computer use) | Today `later` everywhere; Codex Computer Use can drive apps on a Mac (research/38) |
| A specific agent (pin, rule) | that agent installed and signed in there | Claude Code is on the Mac only in the author's setup |
| Long-running, or must keep going when the laptop closes | a machine that doesn't sleep (a server, a plugged-in mini) | A laptop sleeps on lid close on battery (A3) |

## Implications for Ducter

1. **Where is part of who.** The body a task runs in is (computer, agent, model); one ranking
   over pairs replaces "infer the device, then rank agents on it". Principle 14 already lists
   "machine availability" and "environment needs" as filters; the code ranks one device only.
2. **Pick by need, not by name.** The partner should pass what the task needs (a repo, sign-ins
   on a site, a Mac app, long) and let core pick the machine; names stay for "在 hel 上做".
3. **Say it, briefly, always when there's more than one computer.** The Cursor complaint is a
   place chosen silently and found out by failure. A quiet "在 hel 上" on every task removes
   that, at near-zero cost.
4. **Ask only on the axes the person feels**: whose sign-ins act, and when it can start (a
   sleeping machine). Never ask which of two equal machines.
5. **Never widen access silently.** Moving to the user's own Chrome, or to a machine signed in
   as them, is always a choice; moving to a narrower browser is fine when the task doesn't need
   what is lost.
6. **Build gap that matters now:** once the MacBook becomes hel's worker, "your Chrome" is no
   longer reachable for any task (runner.ts:924, `home_only`), so a browsing task that needs
   the user's sign-ins has nowhere to run except hel's own browser. Lifting that refusal is the
   first build step, before any picker.

**Summary.** Codex, Claude Code and Cursor treat the place as a mode or a command the person
picks; none works it out from the task, and Cursor's "last used" default surprised a user who
found out only when the agent couldn't see their folder. Browser agents frame the choice as
whose sign-ins act. Ducter already knows each machine's agents, abilities and wake state; it
should rank (computer × agent) together from the task's needs, show where in one quiet line,
ask only when sign-ins or a sleeping machine change the outcome, and never move a task to more
access without asking. Today a worker can't run browser tasks at all, which blocks "your Chrome
on the Mac" as soon as the Mac becomes hel's worker.
