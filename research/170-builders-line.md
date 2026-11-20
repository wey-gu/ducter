# 170 · Positioning: a personal AI for builders, on your own computers or servers

Date: 2026-11-20. For D414. The author, first: "我觉得我们的官网和 github repo desc 上没有真的抓住我们的精髓。我们的精髓是本地的无比优雅的
Personal agent，支持各种服务器和本地电脑，同时，又是充分解决了注意力问题的 … 最强工作 agent 平台" (a reference product's
name left out, as the author asked). Then, on the first pass's pick (§4): "不够好，personal ai + ai agent
for builders on your own computers or servers 大概核心是这个". §1–4 are the first pass; §5 the second, on
that core; §6 the words chosen.

Tags: VERIFIED = read in Ducter's docs, code or the built site; MEASURED = from the rater runs below;
INFERRED = judgment. No outside product is named here (D414: no reference product's name in public
copy or in git).

## 1. What was wrong with the line we had

D326's line, **Your own personal AI. It does the work, and asks only when it matters.** /
**你自己的私人 AI：替你把事办完，只在要紧时找你。** (research/113), was picked for a consumer reading it
cold. Measured against the two halves (§3), it carries the personal half and the calm, and loses
the other half completely: across four rounds and 72 rater readings, **0–6 %** read it as running
several AI agents at once, and it was rated the most generic line in every round (4.50–4.72 of 5
in English, 3.83–4.17 in Chinese). The developers, the people most likely to arrive from GitHub,
gave it the lowest score of any candidate (2.0–2.5 of 5). MEASURED.

## 2. Method

- **Candidates.** Eight lines per language in round 1, written natively in each (not translated),
  deliberately different: the many/one inversion, a triad, attention first, ownership first, a
  relational line, D326's line as the control, a fully literal line, and an attention-as-asset
  line. Round 2 crossed the best of round 1; rounds 3 and 4 tested the headline with its paragraph,
  as a hero shows them.
- **Raters.** Claude Haiku via `claude -p --model haiku --no-session-persistence --tools ""
  --strict-mcp-config --setting-sources ""`, in a scratch folder (its `~/.claude/projects` folder
  deleted after). 18 personas per language, 6 for each of the three users in AGENTS.md: heavy
  multi-agent developers (tmux full of sessions, overnight runs, a CTO), consumer personal-AI users
  (life admin in a chat assistant, notification-averse, privacy-minded), and fresh users (a
  teacher, a nurse, a retired accountant, a hairdresser…); the Chinese personas are their own
  people (Shenzhen, Hangzhou, a 豆包 user, a café owner sent the link in a group chat). Each saw
  every candidate in a different shuffled order under neutral letters, told each was a different
  product's first screen, and answered per candidate: what they think it is, would they try it
  (1–5), does it sound like every other AI product (1–5), then the one they'd open and why.
- **Coding.** A second Haiku pass coded each "what I think it is", strictly from the words: *own*
  (a personal AI that is theirs, or on their own computers), *many* (runs several AI agents at
  once), *calm* (spares their attention). **Both** = own and many: the two halves read together.
- **Limits.** LLM proxies, not people; one run per persona per round; the scores move about ±0.4
  between rounds for the same line (D326's control: fresh users 3.33 in round 1, 4.00 in round 2).
  Read the gaps larger than that.

## 3. Results

**Round 1, the line alone (n = 18 each).** Try = mean of 5; Generic = mean of 5 (lower is better).

| | Line | Try dev | Try consumer | Try fresh | Generic | Both | Calm |
|---|---|---|---|---|---|---|---|
| E1 | Run all your AI agents at once. Talk to just one. | 3.50 | 3.50 | 2.83 | 3.17 | 0 % | 17 % |
| E2 | One partner. All your AI agents. On your own computers. | 3.83 | 3.17 | 2.50 | 3.11 | 89 % | 0 % |
| E3 | Many AI agents at work. Only what matters reaches you. | 3.83 | 3.17 | 3.00 | 3.44 | 0 % | 100 % |
| E4 | A personal AI that's truly yours, and runs your other AIs for you. | 2.83 | 3.67 | 2.67 | 3.44 | 83 % | 17 % |
| E5 | Your own AI partner. It runs the agents, and comes to you only when it matters. | 3.33 | 3.17 | 3.17 | 4.06 | 6 % | 94 % |
| E6 | D326's line (control) | 2.33 | 3.50 | 3.33 | 4.50 | 6 % | 94 % |
| E7 | An open-source personal AI on your own computers that runs many AI agents at once and asks you only when it matters. | **5.00** | 3.83 | 2.17 | **2.17** | 78 % | 78 % |
| E8 | Hand it all your work. Keep your attention. | 2.67 | 2.83 | 3.17 | 3.44 | 0 % | 67 % |

| | 中文 | Try 开发者 | Try 消费者 | Try 新手 | Generic | Both | Calm |
|---|---|---|---|---|---|---|---|
| Z1 | 一群 AI 替你干活，你只跟一个说话。 | 3.50 | 3.50 | 3.67 | 3.33 | 0 % | 33 % |
| Z2 | 一个伙伴，你所有的 AI，都在你自己的电脑上。 | 3.67 | 3.33 | 3.17 | 2.78 | 50 % | 0 % |
| Z3 | 很多 AI 同时在干活，到你这儿的只有要紧事。 | 3.50 | 3.33 | 3.00 | 3.28 | 0 % | 94 % |
| Z4 | 真正属于你的私人 AI，还替你管着其他所有 AI。 | 3.67 | 4.00 | 3.17 | 2.83 | 56 % | 11 % |
| Z5 | 你自己的 AI 伙伴：它带着一群 AI 干活，只在要紧时找你。 | 3.50 | 3.67 | 3.33 | 3.39 | 17 % | 72 % |
| Z6 | D326 的那句（对照） | 2.50 | 3.83 | 3.83 | 3.83 | 0 % | 83 % |
| Z7 | 跑在你自己电脑上的开源私人 AI，能同时调度很多 AI 智能体，只在要紧时找你。 | **4.67** | 3.50 | 2.50 | **2.17** | 89 % | 61 % |
| Z8 | 事都交出去，心思留给自己。 | 2.00 | 2.50 | 2.50 | 3.94 | 0 % | 72 % |

Read: the literal line is the only one that carries both halves and the calm, and the developers
wanted it most (10 of 18 English raters picked it); the fresh users stumbled on "open-source" and
"agents" ("sounds like something my grandson would have to set up"). Short, clever lines (E1, E8,
Z1, Z8) carry one half at most. "Many" with no "own" reads as "a dashboard for juggling AIs"; "own"
with no "many" reads as "a private assistant". MEASURED.

**Round 2, both halves in plain words (n = 18 each).**

| | Line | Try | Min | Generic | Both | Calm | Picked |
|---|---|---|---|---|---|---|---|
| R1 | Your own personal AI, on your own computers. It runs many AI agents at once, and asks only when it matters. | 2.94 | 2 | 3.50 | 94 % | 89 % | 0 |
| **R2** | **One personal AI on your own computers, with a team of AI agents behind it. You hear only what matters.** | **3.44** | 2 | 3.28 | **94 %** | **100 %** | 3 |
| R3 | A personal AI that lives on your computers and runs a whole team of AIs for you. It speaks up only when it matters. | 3.00 | 2 | 3.56 | 83 % | 94 % | 1 |
| R4 | Many AI agents at work. One partner to talk to. All on your own computers. | 3.06 | 2 | 3.00 | 89 % | 6 % | 0 |
| R5 | Your own AI, at home on your computers. It runs all your other AIs, and asks you only when it matters. | 2.56 | 1 | 3.28 | 94 % | 56 % | 1 |
| R6 | Talk to one. It runs the rest, on your own computers, and asks only when it matters. | 3.67 | 2 | 2.89 | 56 % | 100 % | 3 |
| E7 | the literal line | 3.11 | 1 | 2.94 | 78 % | 78 % | 6 |
| E6 | D326's line | 3.00 | 2 | 4.56 | 0 % | 89 % | 4 |

| | 中文 | Try | Min | Generic | Both | Calm | Picked |
|---|---|---|---|---|---|---|---|
| Q1 | 你自己的私人 AI，跑在你自己的电脑上：一群 AI 同时替你干活，只在要紧时找你。 | 3.22 | 2 | 3.39 | 100 % | 72 % | 0 |
| Q2 | 一群 AI 替你干活，你只跟一个说话。都在你自己的电脑上，只在要紧时找你。 | 3.33 | 2 | 3.28 | 67 % | 83 % | 3 |
| **Q3** | **住在你电脑上的私人 AI，带着一群 AI 替你干活，只在要紧时找你。** | 3.11 | 2 | 3.44 | **100 %** | 78 % | 0 |
| Q4 | 真正属于你的私人 AI：在你自己的电脑上，替你管着所有 AI，只在要紧时开口。 | 3.61 | 2 | 3.22 | 78 % | 83 % | 4 |
| Q5 | 一个伙伴，一群 AI，都在你自己的电脑上。要紧的事才找你。 | 2.83 | 2 | 3.39 | 72 % | 67 % | 0 |
| Q6 | 你只跟一个说话。它在你的电脑上带着一群 AI 干活，要紧时才找你。 | 3.56 | 2 | 3.00 | 50 % | 72 % | 3 |
| Z7 | 直白的那句 | 3.17 | 2 | 2.22 | 61 % | 22 % | 6 |
| Z6 | D326 的那句 | 3.17 | 2 | 3.89 | 0 % | 67 % | 2 |

**Round 3, the headline with the paragraph (§4) under it, as a hero shows them (n = 18 each).**
D326's hero (its line and its lede) is the control.

| | Hero | Try dev | Try consumer | Try fresh | Generic | Both | Picked |
|---|---|---|---|---|---|---|---|
| **U1** | **R2 + the paragraph** | **4.17** | 3.17 | 2.33 | 3.00 | 83 % | **5** |
| U2 | R6 + the paragraph | 3.83 | 3.00 | 2.33 | 3.11 | 56 % | 1 |
| U3 | R1 + the paragraph | 3.83 | 3.00 | 2.33 | 3.50 | 100 % | 2 |
| U5 | "Talk to one AI. It runs the rest…" + the paragraph | 4.00 | 3.33 | 2.50 | 3.22 | 78 % | 3 |
| U4 | D326's hero | 2.00 | 3.17 | **4.00** | 4.61 | 0 % | **7** |

| | Hero | Try 开发者 | Try 消费者 | Try 新手 | Generic | Both | Picked |
|---|---|---|---|---|---|---|---|
| V1 | Q4 + 段落 | 3.50 | 3.00 | 2.83 | 2.94 | 94 % | 2 |
| V2 | Q1 + 段落 | 4.00 | 3.17 | 3.00 | 2.61 | 89 % | 3 |
| V3 | Q6 + 段落 | 4.17 | 3.33 | 3.17 | 2.39 | 56 % | 4 |
| **V5** | **Q3 + 段落** | 4.00 | 3.33 | 3.00 | 2.50 | **100 %** | 2 |
| V4 | D326 的首屏 | 2.33 | 3.33 | **4.00** | 3.83 | 0 % | **7** |

Every fresh rater who picked D326's hero said why in the same words: "it says plainly that it waits
for my OK before it spends my money or contacts people". MEASURED.

**Round 4, three heroes (n = 18 each).** F/G: the chosen headline with a plain lede that carries
the trust sentence and puts the agents' names in small print; U1/V5 from round 3; D326's hero.

| | Hero | Try dev | Try consumer | Try fresh | Try | Generic | Both | Picked |
|---|---|---|---|---|---|---|---|---|
| F | R2 + plain lede + small print | 3.83 | 3.17 | 2.50 | 3.17 | 3.17 | 83 % | 1 |
| **U1** | **R2 + the paragraph** | **4.83** | **4.17** | **3.00** | **4.00** | **2.33** | 83 % | **16** |
| U4 | D326's hero | 2.00 | 2.50 | 3.50 | 2.67 | 4.72 | 0 % | 1 |
| G | Q3 + 平白的导语 + 小字 | 4.00 | 3.50 | 3.00 | 3.50 | 2.33 | 89 % | 4 |
| **V5** | **Q3 + 段落** | **4.67** | **3.83** | **3.33** | **3.94** | **2.11** | 83 % | **13** |
| V4 | D326 的首屏 | 2.17 | 2.67 | 3.00 | 2.61 | 4.17 | 0 % | 1 |

Read: side by side, the paragraph wins for all three users, the fresh ones included; the "small
print" framing read as hedging ("says too much, so I don't know what it does for me"). The trust
sentence still matters to fresh users, so it stays on the hero as the line under the buttons.
MEASURED (rounds 3–4); INFERRED (keeping the trust line).

## 4. The first pass's pick (not taken)

| | English | 中文 |
|---|---|---|
| Line | One personal AI on your own computers, with a team of AI agents behind it. You hear only what matters. | 住在你电脑上的私人 AI，带着一群 AI 替你干活，只在要紧时找你。 |
| Paragraph | Ducter is a personal AI you run yourself, on your Mac, a server you own, and any computer you lend it. You talk to one partner, from your phone, your desk or the chat app you already use. Behind it, as many AI agents as the work needs (Claude Code, Codex, pi and DeepSeek Harness) run at once on the plans you already pay for, and you can open any of them and steer it yourself. Finished work comes back with how it was checked. When nothing needs you, you hear nothing. | Ducter 是你自己部署的私人 AI，住在你的 Mac、你自己的服务器，和你借给它的每一台电脑上。你只跟一个伙伴说话，用手机、在电脑前，或者在你常用的聊天软件里都行。它身后，活要几个 AI 就同时开几个（Claude Code、Codex、pi、DeepSeek Harness），用的是你自己的订阅；哪一件你都能随时打开看、亲手接着做。做完了，结果连同怎么验证的一起交给你；没事的时候，它一声不响。 |

The author found it not good enough: "a team of AI agents behind it" lost the builder edge, and
"your own computers" left out servers. The second pass agrees: builders were the ones least likely
to see that line as theirs (2.1–2.2 of 5, §5), though it was the panel's overall favourite.
MEASURED.

## 5. Second pass: the builder core

Same panels and method, two changes: the raters also answered **builder** ("would someone who
builds software or products, a developer or an indie maker, see at once that this is made for
them", 1–5), and lines are ranked by **weighted try** (developer 0.5, consumer 0.25, fresh 0.25),
since the builder is who this line is for. MEASURED.

**Round 5, the core said plainly (n = 18 each).** WTry = weighted try; Bld = builder, all raters;
Bld dev = the developers' own builder score.

| | Line | Try dev | WTry | Bld | Bld dev | Both | Calm | Picked |
|---|---|---|---|---|---|---|---|---|
| B1 | A personal AI, and AI agents for builders, on your own computers or servers. | 2.50 | 2.33 | 3.78 | 3.33 | 78 % | 0 % | 0 |
| B2 | Your personal AI, with a team of AI agents for what you build. On your own computers or servers. | 3.17 | 2.96 | 3.39 | 3.33 | 89 % | 11 % | 0 |
| B3 | A personal AI for your life. AI agents for what you build. On your own computers or servers. | 1.83 | 2.67 | 2.61 | 2.17 | 61 % | 17 % | 2 |
| B4 | The personal AI for builders: one partner, many AI agents, on your own computers or servers. | 3.67 | 3.29 | 4.44 | 4.50 | 67 % | 28 % | 0 |
| B5 | A personal AI that runs your AI agents for you. Made for builders, on your own computers or servers. | 4.00 | 3.13 | 4.39 | 4.67 | 28 % | 28 % | 0 |
| B6 | Personal AI and AI agents for builders, running on your own computers or servers. | 2.50 | 2.25 | 4.17 | 4.00 | 89 % | 0 % | 0 |
| B7 | One personal AI that runs all your coding agents, on your own computers or servers. | 4.83 | 3.25 | 4.89 | 4.67 | 61 % | 17 % | 3 |
| B8 | the first pass's line (control) | 3.83 | 4.12 | 2.17 | 2.67 | 61 % | 100 % | 13 |

| | 中文 | Try 开发者 | WTry | Bld | Bld dev | Both | Calm | Picked |
|---|---|---|---|---|---|---|---|---|
| C1 | 私人 AI，加上给开发者的 AI agent，跑在你自己的电脑或服务器上。 | 2.83 | 2.67 | 3.72 | 3.83 | 67 % | 0 % | 0 |
| C2 | 给**开发者**的私人 AI：一个伙伴带着一群 AI agent，跑在你自己的电脑或服务器上。 | 3.50 | 2.83 | **4.56** | 4.50 | 78 % | 0 % | 0 |
| C3 | 给**做东西的人**的私人 AI：（其余同 C2） | 3.17 | 2.96 | 3.78 | 4.00 | 67 % | 0 % | 0 |
| C4 | 给**创造者**的私人 AI：（其余同 C2） | 2.50 | 2.54 | 3.11 | 2.67 | 67 % | 0 % | 0 |
| C5 | 生活里是你的私人 AI，做东西时是你的一群 AI agent，都跑在你自己的电脑或服务器上。 | 2.67 | 3.17 | 3.44 | 3.17 | 83 % | 6 % | 0 |
| C6 | 你的私人 AI，替你调度所有编程 AI，跑在你自己的电脑或服务器上。 | 4.50 | 3.38 | 4.39 | 4.50 | 22 % | 11 % | 3 |
| C7 | 私人 AI 和开发者的 AI agent 团队，都在你自己的电脑或服务器上。 | 3.33 | 2.87 | 3.89 | 4.00 | 100 % | 6 % | 1 |
| C8 | 第一轮选的那句（对照） | 4.33 | 4.46 | 2.67 | 3.17 | 89 % | 100 % | 14 |

Read: naming builders works (4.4–4.9 against the control's 2.2–2.7), and **开发者** is the zh word
(on the same sentence: 4.56, 做东西的人 3.78, 创造者 3.11). But every plain core line lost the calm
(0–28 %), and the control, which kept it, was still everyone's pick. The calm had to come back.

**Round 6, the core plus the calm (n = 18 each).**

| | Line | Try dev | WTry | Bld | Bld dev | Generic | Both | Calm | Picked |
|---|---|---|---|---|---|---|---|---|---|
| D1 | The personal AI for builders: one partner, a team of AI agents, on your own computers or servers. You hear only what matters. | 3.83 | 3.50 | 4.33 | 4.33 | 3.06 | 78 % | 83 % | 5 |
| **D2** | **A personal AI for builders. It runs your AI agents on your own computers or servers, and you hear only what matters.** | **4.83** | **3.83** | 4.44 | 4.67 | 2.89 | **89 %** | 83 % | 3 |
| D3 | A personal AI that runs your coding agents on your own computers or servers. You hear only what matters. | 4.83 | 3.25 | **4.78** | 4.67 | 2.56 | 67 % | 50 % | 3 |
| D4 | Personal AI, plus a team of AI agents for builders, on your own computers or servers. You hear only what matters. | 3.50 | 3.04 | 3.83 | 3.83 | 3.33 | 94 % | 61 % | 0 |
| D5 | One personal AI for builders, with a team of AI agents behind it, on your own computers or servers. | 3.17 | 2.83 | 4.39 | 4.17 | 3.22 | 89 % | 6 % | 0 |
| D6 | Your personal AI, and the AI agents you build with, on your own computers or servers. You hear only what matters. | 3.67 | 3.25 | 3.67 | 3.50 | 2.94 | 56 % | 72 % | 2 |
| B4 | round 5's best builder line | 3.00 | 2.71 | 4.22 | 4.00 | 3.33 | 72 % | 11 % | 0 |
| B8 | the first pass's line (control) | 3.17 | 3.33 | 2.11 | 2.17 | 3.50 | 89 % | 83 % | 5 |

| | 中文 | Try 开发者 | WTry | Bld | Bld dev | Generic | Both | Calm | Picked |
|---|---|---|---|---|---|---|---|---|---|
| E1 | 给开发者的私人 AI：一个伙伴带着一群 AI agent，跑在你自己的电脑或服务器上，只在要紧时找你。 | 3.67 | 3.13 | 4.22 | 3.83 | 3.06 | 67 % | 67 % | 2 |
| E2 | 开发者的私人 AI，带着一群 AI agent 替你干活，跑在你自己的电脑或服务器上，只在要紧时找你。 | 3.67 | 3.17 | **4.50** | 4.17 | 3.00 | 72 % | 83 % | 1 |
| E3 | 替你调度所有编程 AI 的私人 AI，跑在你自己的电脑或服务器上，只在要紧时找你。 | **4.67** | 3.33 | 4.39 | **4.67** | 2.11 | 44 % | 50 % | 5 |
| E4 | 你的私人 AI，和你写代码用的一群 AI agent，都在你自己的电脑或服务器上，只在要紧时找你。 | 3.67 | **3.42** | 3.89 | 4.00 | 2.61 | **94 %** | 67 % | 2 |
| E5 | 给开发者的私人 AI，带着一群 AI agent，住在你自己的电脑或服务器上。 | 3.17 | 2.75 | 4.28 | 3.83 | 3.06 | 83 % | 11 % | 0 |
| E6 | 私人 AI，加一群给开发者的 AI agent，跑在你自己的电脑或服务器上，只在要紧时找你。 | 2.83 | 2.71 | 3.56 | 3.50 | 3.22 | 67 % | 39 % | 0 |
| C2 | 第五轮的 C2 | 3.00 | 2.58 | 4.06 | 3.50 | 3.28 | 78 % | 6 % | 0 |
| C8 | 第一轮选的那句（对照） | 2.67 | 3.25 | 2.06 | 2.17 | 3.61 | 67 % | 83 % | 8 |

Read: with the calm back, the builder lines pass the control on weighted try (D2 3.83 vs 3.33),
and the developers move most (4.83 vs 3.17). In Chinese no line led every column: E3 is the
developers' favourite but only 44 % read the personal half; E4 holds both halves best but says
写代码用的 instead of naming who it is for; E2 names 开发者 most clearly.

**Round 7, the hero (line + the new paragraph), n = 18 each.** Control: the first pass's hero.

| | Hero | Try dev | WTry | Bld | Bld dev | Both | Calm | Picked |
|---|---|---|---|---|---|---|---|---|
| H2 | D2 + paragraph | 3.67 | 3.04 | **4.50** | 4.50 | 72 % | 67 % | 0 |
| H1 | D1 + paragraph | 3.83 | 3.25 | 4.33 | 4.17 | 61 % | 67 % | 6 |
| H3 | D3 + paragraph | 4.17 | 3.25 | 4.28 | 4.67 | 72 % | 61 % | 6 |
| H8 | the first pass's hero | 3.50 | 3.25 | 2.94 | 3.33 | 67 % | 94 % | 6 |
| F1 | 给开发者的私人 AI。它在你自己的电脑或服务器上替你跑一群 AI agent，只在要紧时找你。+ 段落 | 4.00 | 3.13 | **4.61** | **4.83** | 78 % | 61 % | 1 |
| **F2** | **开发者的私人 AI：在你自己的电脑或服务器上，带着一群 AI agent 替你干活，只在要紧时找你。+ 段落** | **4.17** | 3.29 | 4.39 | 4.50 | **83 %** | 50 % | 4 |
| F4 | 你的私人 AI，和你写代码用的一群 AI agent，都在你自己的电脑或服务器上，只在要紧时找你。+ 段落 | 3.83 | **3.50** | 3.94 | 4.00 | 78 % | 44 % | 6 |
| F8 | 第一轮的首屏（对照） | 3.33 | 3.33 | 3.11 | 3.00 | 78 % | 83 % | 7 |

Read: with a paragraph under every line, the weighted tries bunch within the noise (3.04–3.50);
the builder score keeps its gap (4.3–4.6 against 2.9–3.1). Several developers called the
paragraph's mail-and-calendar sentence clutter for them; it stays, last, because the personal half
is half of the core.

## 6. The words chosen

| | English | 中文 |
|---|---|---|
| Line | A personal AI for builders. It runs your AI agents on your own computers or servers, and you hear only what matters. | 开发者的私人 AI：在你自己的电脑或服务器上，带着一群 AI agent 替你干活，只在要紧时找你。 |
| Paragraph | in `design/positioning.md` | 见 `design/positioning.md` |

- **EN, D2.** Best weighted try on its own (3.83), the developers' top (4.83, tied with D3),
  builder 4.44–4.67, both halves read by 89 %. Runner-ups: **D1** ("The personal AI for builders:
  one partner, a team of AI agents, on your own computers or servers. You hear only what
  matters.": as clear to builders, developers 3.83) and **D3** ("…runs your coding agents…": the
  highest builder score, but the personal half fell to 67 % and fresh users to 1.2).
- **ZH, F2.** The developers' top among lines that name 开发者 (4.17 with the paragraph), both
  halves 83 %, builder 4.39–4.50. Runner-ups: **F1** (the twin of the English line, the best
  builder score, 4.83 from developers, both halves 78 %) and **F4** (best weighted try and both
  halves, but it never says who it is for).
- Humanizer pass: no "seamless", "empower", "supercharge"; each clause is something a person can
  check in the app.

## Implications for Ducter

- The line names the builder, the personal AI and "your own computers or servers"; the calm ("you
  hear only what matters") had to stay for any of them to win.
- The landing page leads with the builder section (On hand with many tasks); the personal half
  follows as what the same partner does for the rest of the day.
- 开发者 is the zh word for builders; 做东西的人 and 创造者 read vague.
- Fresh users are not who the line is for; the trust line under the buttons keeps them safe.

**Summary:** the first pass's line ("One personal AI on your own computers, with a team of AI
agents behind it…") was liked, but builders didn't see it as theirs (2.1–2.2 of 5). Naming
builders and keeping the calm: **"A personal AI for builders. It runs your AI agents on your own
computers or servers, and you hear only what matters."** (developers 4.83, weighted try 3.83 vs the
control's 3.33, builder 4.44) and **「开发者的私人 AI：在你自己的电脑或服务器上，带着一群 AI agent
替你干活，只在要紧时找你。」** (developers 4.17, builder 4.39, both halves 83 %). 开发者 beat 做东西的人
and 创造者.
