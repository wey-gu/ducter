# Positioning: what Ducter is, in one line (D414)

The words Ducter uses about itself wherever someone meets it first: the website's hero, the
README's opening, the docs' intro, the GitHub description, the share image. Evidence:
[research/170](../research/170-builders-line.md). The site's page structure is in [site.md](site.md).

## The core

The author (2026-11-20): **personal AI + AI agents for builders, on your own computers or
servers.** Three parts, all explicit in the line:

1. **A personal AI.** One partner with a name, in one conversation, on every device and in the
   chat apps you already use. It looks out for you (the morning note), runs errands, remembers you
   (with Nowledge Mem, across your other AI tools), and never pays, sends or calls without your OK.
2. **AI agents for builders.** For the people who build things (developers, indie makers) and run
   many agents at once: as many tasks as the work needs, side by side, each on an AI agent they
   already pay for (Claude Code, Codex, pi, DeepSeek Harness today). Silence means success; a
   question comes with a default; finished work comes with how it was checked; any task is fully
   open, to watch, steer or hand to another agent.
3. **On your own computers or servers.** Your Mac, a Linux server you own, more computers you lend
   it, an Android phone lent for a while. Open source; nothing to sign up for.

The builder leads: it is who Ducter is sharpest for, and who arrives first (GitHub, forums). The
personal half is what the same partner does for the rest of their day, and what a non-builder
still gets.

**Never in public copy:** any reference product's name, or a word that echoes one (the author
ruled out the word for an orchestra's leader); motivation.md is the one place the history is told.
Never "orchestrator", "swarm", "subagent", "harness" on a page a visitor reads; say AI agents,
tasks.

## The words

| | English | 中文 |
|---|---|---|
| **Line** | A personal AI for builders. It runs your AI agents on your own computers or servers, and you hear only what matters. | 开发者的私人 AI：在你自己的电脑或服务器上，带着一群 AI agent 替你干活，只在要紧时找你。 |
| **Paragraph** | Ducter is a personal AI you run yourself, on your Mac or a server you own, and on any computer you lend it. You talk to one partner, from your phone, your desk or the chat app you already use. When you build, it hands the work to as many AI agents as it needs (Claude Code, Codex, pi and DeepSeek Harness), side by side on the plans you already pay for, and any task is yours to open and steer. Finished work comes back with how it was checked. In between it minds your mail and calendar, runs errands, and stays quiet until something needs you. | Ducter 是你自己部署的私人 AI，跑在你的 Mac 或你自己的服务器上，也能用你借给它的其他电脑。你只跟一个伙伴说话，用手机、在电脑前，或者在常用的聊天软件里都行。写代码、做东西的时候，它把活分给需要的几个 AI agent 同时去做（Claude Code、Codex、pi、DeepSeek Harness），用的是你已有的订阅；每一件你都能随时打开看、亲手接着做。做完了，结果连同怎么验证的一起交给你。平时它帮你盯着邮件和日历、跑跑腿，没事不打扰你。 |
| **Trust line** (under the hero's buttons) | Free and open source. It lives on your Mac or a server you own, and anything that spends your money or reaches other people waits for your OK. | 免费、开源。住在你的 Mac 或你自己的服务器上；凡是要花你的钱、或者要发给别人的，都先等你点头。 |

**Which word for builders.** English: "builders" itself (raters who build saw it as theirs, 4.4–4.7
of 5). Chinese: **开发者**, tested against 做东西的人 and 创造者: a Chinese developer reads 开发者 as
"for me" (4.5) where 做东西的人 reads vague (3.8) and 创造者 reads like a slogan (3.1). The zh
paragraph still says 写代码、做东西 so a maker who doesn't call themselves 开发者 is not left out.
"AI agent" stays in English in the zh line (D88).

**Who reads it how** (research/170): the builder reads "runs your AI agents … you hear only what
matters" as the tmux full of sessions minus the babysitting (try 4.83 of 5); the consumer reads
the paragraph's second half as an assistant for their day; the fresh user is not the one this line
is for, and the trust line under the buttons is what they need.

## Where it is used

- **Website hero** (`apps/site/src/pages/index.astro`): "A personal AI for builders." as the
  `<h1>`, the rest of the line as its quiet second line, the paragraph without its first sentence
  as the lede, the trust line under the buttons. Page title, meta description and the share image
  (`og.png`, drawn from the `<h1>`) follow.
- **Landing sections**, builder first: *For what you build: a whole team of AI agents* (a real
  screen of On hand holding 18 tasks), *For the rest of your day: a partner that looks out for
  you*, *It only asks when it matters*, where it runs, where you reach it, memory, trust, open source.
- **README** opens with the line and the paragraph, then **Why Ducter** in two groups, builder first.
- **Docs index** (`docs/README.md`) states the product in the same words, in user terms.
- **GitHub** (applied by hand after the author approves; nothing in the repo sets it):
  - Description (334 characters): *A personal AI for builders, on your own computers or servers.
    Talk to one partner from your phone, desk or chat app; it runs your AI agents (Claude Code,
    Codex, pi, DeepSeek Harness) side by side on the plans you already pay for, every task open to
    you, and you hear only what matters. It minds your day too. Open source, self-hosted.*
  - Topics: `personal-ai`, `ai-agents`, `coding-agents`, `multi-agent`, `self-hosted`,
    `local-first`, `developer-tools`, `claude-code`, `codex`, `agent-orchestration`,
    `ai-assistant`, `macos`, `linux`, `ios`, `android`.
- **Not yet:** a 中文 site (site.md "Owed"); when it comes, its hero uses the zh column above.

## Rules for new copy

- A sentence about what Ducter is names the builder and the personal half, or says which one it
  is about; "your own computers or servers" is said, not implied.
- "Elegant" is shown, never claimed: no adjective about the product's looks in the copy.
- Only what is built (`design/scenarios.md`); an agent that isn't verified end to end is not
  named (`apps/site/src/lib/agents.ts` holds the list).
