# Positioning: what Ducter is, in one line (D408)

The words Ducter uses about itself wherever someone meets it first: the website's hero, the
README's opening, the docs' intro, the GitHub description, the share image. Evidence:
[research/167](../research/167-two-halves.md). The site's page structure is in [site.md](site.md).

## The two halves, held as one

From [motivation.md](../motivation.md), Ducter is two products that are one partner:

1. **A personal AI that is yours.** One partner with a name, in one conversation, on every device
   and in the chat apps you already use. It lives on your own computers: your Mac, a server you
   own, more computers you lend it, an Android phone lent for a while. Its memory is yours too, and
   with Nowledge Mem it is shared with the other AI tools you use. It looks out for you (the
   morning note), runs errands, and never pays, sends or calls without your OK.
2. **The strongest way to run many AI agents at once, with your attention left alone.** Behind
   the partner, as many tasks as the work needs run side by side, each on an AI agent the person
   already pays for (Claude Code, Codex, pi, DeepSeek Harness today). Silence means success; a
   question comes with a default; finished work comes with how it was checked; any task is fully
   open, to watch, steer or hand to another agent.

The hinge between them is **one and many**: you talk to one, a team works behind it. Neither half
is a mode or an upsell; a fresh user meets the first and grows into the second without learning a
word, and a heavy developer starts in the second and finds the first already there.

**Never in public copy:** any reference product's name, or a word that echoes one (the author
ruled out the word for an orchestra's leader); motivation.md is the one place the history is told. Never "orchestrator", "swarm", "subagent", "harness" on a page
a visitor reads; say AI agents, a team, tasks.

## The words

| | English | 中文 |
|---|---|---|
| **Line** | One personal AI on your own computers, with a team of AI agents behind it. You hear only what matters. | 住在你电脑上的私人 AI，带着一群 AI 替你干活，只在要紧时找你。 |
| **Paragraph** | Ducter is a personal AI you run yourself, on your Mac, a server you own, and any computer you lend it. You talk to one partner, from your phone, your desk or the chat app you already use. Behind it, as many AI agents as the work needs (Claude Code, Codex, pi and DeepSeek Harness) run at once on the plans you already pay for, and you can open any of them and steer it yourself. Finished work comes back with how it was checked. When nothing needs you, you hear nothing. | Ducter 是你自己部署的私人 AI，住在你的 Mac、你自己的服务器，和你借给它的每一台电脑上。你只跟一个伙伴说话，用手机、在电脑前，或者在你常用的聊天软件里都行。它身后，活要几个 AI 就同时开几个（Claude Code、Codex、pi、DeepSeek Harness），用的是你自己的订阅；哪一件你都能随时打开看、亲手接着做。做完了，结果连同怎么验证的一起交给你；没事的时候，它一声不响。 |
| **Trust line** (under the hero's buttons) | Free and open source. It lives on your Mac, a server you own and any computer you lend it, and anything that spends your money or reaches other people waits for your OK. | 免费、开源。住在你的 Mac、你自己的服务器和你借给它的电脑上；凡是要花你的钱、或者要发给别人的，都先等你点头。 |

The zh line is written for Chinese readers, not translated: 住在 (lives in) carries "yours, on
your machine" without the word 自部署; 一群 AI is plain where 智能体 is jargon (D88 keeps "AI agent"
on screen, the line names no category at all). The agents' names come from `apps/site/src/lib/
agents.ts`, so a new agent changes the paragraph in one place.

**Who reads it how** (research/167): the developer reads "a team of AI agents … on your own
computers" as the thing they run in tmux today, minus the babysitting; the consumer reads "one
personal AI … you hear only what matters" as an assistant that won't pester them; the fresh user
needs the trust line, which is why it stays in the first screen.

## Where it is used

- **Website hero** (`apps/site/src/pages/index.astro`): the line as the `<h1>` (its second half the
  quiet line), the paragraph without its first clause as the lede, the trust line under the
  buttons. Page title and meta description from the same words. The share image (`og.png`) is
  drawn from the `<h1>`.
- **Landing sections** carry the halves in order: *For your days* (the personal half), *For your
  work* (the many-agents half, with a real screen of On hand holding 18 tasks), then *It only asks
  when it matters*, where it runs, where you reach it, memory, trust, open source.
- **README** opens with the line and the paragraph, then **Why Ducter** in two groups, one per half.
- **Docs index** (`docs/README.md`) states the product in the same words, in user terms.
- **GitHub** (applied by hand after the author approves; nothing in the repo sets it):
  - Description (305 characters): *A personal AI you run on your own computers. You talk to one
    partner; behind it, a team of AI agents (Claude Code, Codex, pi, DeepSeek Harness) works in
    parallel on the plans you already pay for, and every task is open to you. You hear only what
    matters. Open source, on Mac, Linux servers and your phone.*
  - Topics: `personal-ai`, `ai-agents`, `multi-agent`, `self-hosted`, `local-first`,
    `ai-assistant`, `claude-code`, `codex`, `agent-orchestration`, `coding-agents`, `macos`,
    `linux`, `ios`, `android`, `open-source`.
- **Not yet:** a 中文 site (site.md "Owed"); when it comes, its hero uses the zh column above.

## Rules for new copy

- A sentence about what Ducter is names both halves, or says which one it is about.
- "Elegant" is shown, never claimed: no adjective about the product's looks in the copy.
- Only what is built (`design/scenarios.md`); an agent that isn't verified end to end is not
  named (`agents.ts` holds the list).
