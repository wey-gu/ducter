# 120 · Naming the page where the person's own agents reach the partner

> 2026-11-17. Public. Evidence for D332: the Settings page once called 连上的 AI agent / Connected AI agents
> (Nowledge Bridge underneath). The author on 0.0.67: someone who doesn't know Nowledge Mem or Bridge can't
> tell what the page is for, and "连上的 AI agent" means nothing to them.
>
> Tags: **VERIFIED** run by me this session · **INFERRED** my reading. LLM proxies only, no humans: the
> numbers say how a careful naive reader parses a label, not how people feel.

## 1. Method (VERIFIED)

- **Raters:** `claude -p --model haiku` with no tools and no session kept (no `~/.claude/projects` folder was
  created; checked before and after), from a scratch folder, 8 at a time. Scratch scripts only.
- **Three personas** (AGENTS.md): a developer who runs several coding agents in terminals every day; a consumer
  who uses AI bots on the phone and has never opened a terminal; a fresh user who has never heard of an agent.
- **The stimulus:** Ducter's real Settings list in the rater's language (zh or en) with its real lines (伙伴 "名字、
  想事情和做事的 AI agent、怎么说话", 记忆, 通知, 账号, 聊天软件, 自动填充), the candidate in the third row. Two
  conditions: the name alone, and the name with one shared list line ("你自己在终端里用的 Claude Code、Codex，能把
  事交给小鸭，小鸭也能去问它们").
- **Asked:** what the row is for (one sentence); which of five meanings (shuffled per run: the right one; the AI
  that Duckie itself thinks and works with; mail and calendar accounts; other people's assistants that message
  me; buying more AI); clarity 1–5; would you open it, given who you are; one thing the name might make you
  believe that may be false.
- **Runs:** 8 candidates × 2 languages × 3 personas × 2 conditions × 2 runs = **192**.

## 2. Results (VERIFIED)

| Candidate | Read right, name alone | Read right, with the line | Read as the partner's own AI | Clarity alone / with line | Developer opens | Consumer or fresh user opens |
|---|---|---|---|---|---|---|
| A 连上的 AI agent / Connected AI agents (today) | 75% | 92% | 4% | 2.50 / 2.83 | 100% | 13% |
| B 你的其他 AI / Your other AIs | 83% | 100% | 0% | 2.33 / 3.00 | 100% | 25% |
| **C 终端里的 AI / AI in your terminal** | **100%** | **100%** | 0% | 2.42 / 2.83 | 100% | **0%** |
| D 和别的 AI 互相找 / Your AIs and Ducter, both ways | 92% | 92% | 0% | 2.25 / 2.33 | 100% | 6% |
| E 你自己用的 AI / The AI you use yourself | 42% | 100% | 25% | 2.42 / 2.67 | 100% | 25% |
| F Claude Code 和 Codex / Claude Code and Codex | 92% | 100% | 4% | 2.75 / 2.75 | 100% | 0% |
| G 别的 AI 找它帮忙 / When your other AIs need it | 83% | 100% | 0% | 2.25 / 2.67 | 100% | 13% |
| H Nowledge Bridge (the mechanism) | 67% | 100% | 0% | 1.92 / 2.58 | 100% | 0% |

Each row is 24 runs (12 per condition). The multiple choice was easy (the right option names a terminal), so the
false readings and the "would you open it" answer say more than the accuracy.

**False readings, in the raters' words (a sample):**

| Candidate | What the name made them believe |
|---|---|
| A | "it is where you pick the model or agent Duckie itself thinks with" (dev, consumer, zh and en); "other people's AI assistants can message me"; "once connected, all my AI tools see my mail and calendar" |
| B | "where I buy or subscribe to more AI"; "other people's assistants"; "every AI tool I run is connected automatically" |
| C | dev: "Duckie itself runs in my terminal"; consumer and fresh: "I need a terminal or to code to use this" |
| D | "strangers' AI assistants can find me"; "it picks the models Duckie thinks with" |
| E | "it changes the AI in my own chat apps"; "Duckie reads my ChatGPT chats" |
| F | "Duckie runs on Claude Code or Codex" (true of its tasks, so the row collides with Partner); "sign up for these here" |
| G | "other people's or strangers' AIs can reach me and read my memory without asking" |

## 3. Reading (INFERRED)

- Today's name collides with the Partner row right above it, whose line says "the AI agents it thinks and works
  with": "connected AI agents" reads as the partner's own brains. F (the tools' names) collides the same way,
  because Ducter's tasks do run on Claude Code and Codex.
- Every "other / 别的" name (B, D, G) invites "other people's" or "strangers'" AIs, the creepy reading.
- **C is the only name read right by every rater in both conditions, and the only one that sorts people by
  itself:** no consumer or fresh rater wanted to open it, every developer did. Its consumer-side "false" reading
  ("you need a terminal for this") is true; its developer-side one ("Duckie runs in my terminal") is mild and the
  lede answers it. The terminal is where these agents live today (Claude Code, Codex, pi); an IDE agent is a stretch
  the name doesn't cover (a watch item, not a blocker).
- Clarity scores sit at 2–3 for every name: haiku raters are conservative about a row they can't open. They rank
  the names; they don't measure delight.
- With the page shown only to people Ducter sees running agents of their own (D332 (2)), the name's job is to be
  unmistakable to them and self-excluding for everyone else; C does both.

## 4. The author's verdict (2026-11-17, after the shots)

The rater winner, 终端里的 AI / AI in your terminal, was rejected: "still odd, and wrong". Claude Code and Codex are
not only terminal tools: both have desktop apps and editor extensions, so a name about the terminal tells a
person who uses the Codex app that the page isn't for them, the opposite of what the page is for. The haiku
personas were described as terminal users, so the test could not catch it (a limit of the stimulus, INFERRED).
**Decided: 和你的其他 agent 通信 / Talk with your other agents.** It keeps what the data showed: **你的 / your**
removes the main misreading of every "other AI" name (other people's or strangers' AI, rows B, D, G), and the
list line under it (kept) names Claude Code and Codex. "agent" is lowercase, the glossary's word. This name was
not rated; a human test is in `todo.md`.

## Implications for Ducter

1. Name the page **和你的其他 agent 通信 / Talk with your other agents**, its list line **Claude Code、Codex 能把事交给它，
   它也能去问它们 / Claude Code and Codex can hand it work, and it can ask them**; the lede says both ways.
2. Never "other / 别的" without **你的 / your**: alone it reads as other people's.
3. No "terminal" framing for these agents: they live in apps and editors too.
4. Show it by who (records or Mem's plugin), and give everyone else one quiet line on the Partner page.
5. A human test of the name and the Partner line stays in `todo.md`.

## Summary

Eight names, 192 haiku runs as three users. "连上的 AI agent" read as the partner's own AI next to the Partner
row; every "other AI" name read as other people's. The raters' winner, 终端里的 AI, was rejected by the author as
wrong (the agents are apps and editor extensions too). Chosen for D332: 和你的其他 agent 通信 / Talk with your other
agents, with "你的" against the other-people misreading.
