# 113 · Positioning: who lands on ducter.ai, what they need to hear, and the tagline

Date: 2026-11-17. For D326. The author: "网站里的内容比如 'Small windows on purpose' 这个用户根本不应该需要知道也不关心 … 'Say it once. Hear back when it's done.' 都不足够表达我们的特点". Then: the home page's main action should be Get started, one guided path, with the AI-agent setup as a first-class way in.

Tags: VERIFIED = read in Ducter's docs, code or the built site; MEASURED = from the rater runs below; INFERRED = judgment. Outside products are described generally; no named comparisons here.

## 1. Who lands, and from where

| Visitor | Arrives from | In 5 seconds they want | In 30 seconds | Before they install |
|---|---|---|---|---|
| Heavy multi-agent developer | GitHub, a forum thread, the README | What is it, and is it real (a product shot, not a slogan) | Does it use my own agents and plans; can I open and steer the work; is it open | Exact commands, what it touches, how it's checked |
| Consumer personal-AI user | A post, a friend | Will it help my life (mail, trips, errands) | Can I reach it where I already chat; will it pester me; is my data safe | Do I need to pay twice; what do I install |
| Fresh user | A link a friend sent, often opened on a phone | What it does, in plain words, with no jargon | Is it for me (not "for developers") | Do I have what it needs (a Mac? a subscription?) |

INFERRED from the three users in AGENTS.md and the rater runs (§4).

## 2. What makes Ducter different (true today)

Compared, in general terms, with what these visitors already use (a chat assistant in an app, a
coding agent in a terminal, a hosted agent workbench):

1. **It does the work, not only the answer.** Jobs run on real AI agents and come back with
   what changed and how it was checked. VERIFIED (`docs/getting-started.md`, the shots).
2. **It asks only when it matters.** One morning note with at most three things; decisions with a
   default; quiet hours; anything that pays, sends or calls waits for Go. VERIFIED (`docs/accounts.md`,
   `docs/privacy-and-safety.md`).
3. **Yours.** It lives on your Mac or server, works through the AI plan you already have, and is
   Apache 2.0. VERIFIED (README, `docs/faq.md`).
4. **One partner everywhere.** The app on Mac, iPhone and iPad, Android, any browser, and iMessage,
   WeChat, Telegram and Slack as more windows on the one conversation. VERIFIED (`docs/chat-apps.md`,
   `docs/imessage.md`).
5. **It remembers you, visibly.** Every remembered line says where it came from and can be fixed
   or forgotten; Nowledge Mem shares it across AI tools. VERIFIED (D321, `docs/settings.md`).

What the visitor does **not** need: small context windows, the facts registry, budgets as tests,
OAR, the eval. Those are how the claims stay true, so they move to the README's "Under the hood",
linked from the footer as "How it's built".

Proof each claim needs on the page: (1) a real screen of a finished job; (2) a real screen of the
morning note and of On hand's two decisions; (3) the agents by name and "no Ducter account"; (4) the
places by name; (5) a real screen of Memory. Trust needs a real screen of Done for you. All six are
real screenshots of the web client against a demo core (§5).

## 3. Candidates and rubric

Ten taglines with subheads, zh and en designed together. Rubric 1–5 each: **says what it is**,
**says why it's different**, **true today**, **warm voice**, **short**, **translates cleanly**.
Author's scores (INFERRED), then the naive raters' "would you try it" sum (§4, 5 raters × 1–5).

| # | en | zh | What | Diff | True | Warm | Short | Tr | Σ rubric | Raters Σ /25 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Take it off your mind. | 交给它，放心。 | 1 | 2 | 5 | 5 | 5 | 4 | 22 | 16 |
| 2 | Say it once. Hear back when it's done. (today's) | 说一次，做完了告诉你。 | 2 | 3 | 5 | 4 | 4 | 4 | 22 | 15 |
| 3 | Less to watch. More done. | 少操心，多办成。 | 2 | 2 | 5 | 4 | 5 | 4 | 22 | 16 |
| 4 | An open-source personal AI that runs on your own computers. (literal) | 跑在你自己电脑上的开源私人 AI。 | 5 | 4 | 5 | 2 | 3 | 5 | 24 | 17 |
| 5 | One partner for your work, your life and all your AIs. | 一个伙伴，管你的工作、生活和所有 AI。 | 4 | 4 | 4 | 3 | 3 | 4 | 22 | 16 |
| 6 | Your own personal AI. It does the work, and asks only when it matters. | 你自己的私人 AI：替你把事办完，只在要紧时找你。 | 5 | 4 | 5 | 4 | 3 | 5 | 26 | **18** |
| 7 | The AI that minds things for you. | 替你操心的 AI。 | 3 | 3 | 5 | 4 | 5 | 4 | 24 | 15 |
| 8 | You get on with your day. It gets things done. | 你过你的日子，事情它来办。 | 2 | 2 | 5 | 5 | 4 | 4 | 22 | 16 |
| 9 | Hand it anything. Hear only what matters. | 什么都能交给它，只听要紧的。 | 3 | 3 | 3 | 4 | 5 | 4 | 22 | 14 |
| 10 | A personal AI that works for you, not the other way round. | 为你干活的 AI，而不是让你围着它转。 | 3 | 3 | 5 | 4 | 3 | 3 | 21 | 17 |

(9 scores 3 on true: "anything" over-promises.)

## 4. Comprehension test (LLM raters as naive visitors)

Method: Haiku as each naive visitor, reading only the candidate file (each version "on its own"),
answering what it does, who it's for, would you try it (1–5), what confuses; then the six hero
pictures. Five raters: a developer from a forum thread (en), a consumer who uses a chat assistant
for life admin (en), a teacher sent the link by a friend, on her phone (en), a non-technical office
worker in Shanghai sent the link on WeChat (zh), an indie developer from GitHub (zh). Limits: one
run each, one fixed order, LLM proxies, not people. MEASURED.

**Try-it scores per candidate** (dev en, consumer en, fresh en, consumer zh, dev zh):
1: 3 4 3 3 3 · 2: 4 3 2 2 4 · 3: 2 4 4 4 2 · 4: 4 3 2 3 5 · 5: 3 3 3 4 3 ·
**6: 3 4 4 3 4** · 7: 2 4 3 4 2 · 8: 3 3 4 4 2 · 9: 3 3 4 2 2 · 10: 4 4 3 3 3.

- **Splits by user.** Developers favour the literal (4) and today's line (2): "states the loop I
  care about"; the consumers and the fresh user mark 2 down ("open source", "server", "AI agents"
  are a wall) and favour 3 ("Less to watch. More done.") and 6.
- **6 is the only one no rater scores below 3.** All five read it the same way: a personal AI
  that does the work and doesn't pester you. Criticism: "a bit generic, slogan-like" (developers):
  the subhead and the picture have to carry the specifics.
- **Recurring warnings:** "watches your inbox" reads as a privacy worry unless trust is stated
  near it (7); naming WeChat in the headline narrows it (5); "anything" sets off alarms (9);
  "partner" alone is vague (1, 8).

**Hero picture** (sum /25): V1 the conversation with a fixed test and Merge into main 16 (devs 5
and 4, consumers 1 and 4: "HawDB", "rebase" are jargon); **V2 the morning note (a domain about to
lapse, a night with nowhere to stay) 21**, top for four of five; V3 the drawn self-playing chat 15;
V4 a lock-screen notification 17; V5 Mac and phone side by side 16; V6 no picture, the mascot 12.

**Two confirmation rounds on the chosen hero** (developer, teacher, Shanghai office worker):
round 1 (subhead "runs on your own Mac or server … Free and open source"): 3, 2, 2. The headline
landed for all three; the subhead's "server", "open source" were a wall, and the office worker's
first question was "can it touch my accounts and money?", which the hero didn't answer. Round 2
(subhead leads with where you talk and "anything that spends your money or reaches other people
waits for your OK"; Mac/server/open source moved to the small print): 3, 2, 3. Remaining: a
caption for the picture ("whose domain? why Tokyo?"), the Mac-only download for a phone visitor,
and what "the AI you already pay for" means. Fixed on the page: the picture's caption, Get started
(which handles phones and "not sure"), and naming the AI plans and keys on the Mac path.

**Get started, one rater run over the page's text** (developer with a Mac and a VPS; marketer with
an M2 and a ChatGPT plan, no terminal; teacher on her phone with an old Windows laptop; Shanghai
office worker with a MacBook and a domestic AI, no paid plan). Path chosen and clarity: server,
yourself, 4/5; this Mac, the download, 4/5; "Not sure" then email the link, 2/5; this Mac, 3/5.
"Let your AI agent do it" trust: 2, 3, 2, 2: trusted by whoever already lives in an agent and
reads the guide, not by the others ("what is Claude Code?"). The office worker stopped at "a
Claude or ChatGPT plan, or an API key". Changes made: on the Mac path the download comes first
("Most people start here") and the agent sentence sits beside it ("Or, if you already use Claude
Code or Codex"); on the server path the agent leads ("The easy way"); the requirement names the
keys Ducter takes (DeepSeek, Kimi, Zhipu GLM, OpenAI, Anthropic, OpenRouter) and says Ducter is
free; the one-liner says it checks the checksum; Windows says plainly there is no app yet.

## 5. Pictures

Real screens of the web client (light and dark, 2× and 3×), headless Chrome against demo cores on
port 7960: `apps/web/demo-site.ts` (new: the morning note with two finds, a coding job done) for
the hero and On hand on a phone; `apps/web/demo.ts` with `DEMO_MEM=ready DEMO_DID=1` for Memory and
Done for you. Still drawn: the Isles (the Devices view's metaphor, interactive; the web client's
Devices sheet is a list and reads poorly as a picture). Owed from the real Mac app: the hero in
the Mac window frame, and Devices.

## Implications for Ducter

- Lead with what it does and how it treats your attention; put "where it runs" and "open source"
  in the small print for the consumer, and in the README for the developer.
- Show, don't claim: every product section carries a real screen.
- The first action is **Get started**, one question (where Ducter lives) and one path; the agent
  sentence sits beside the download, and leads only where it helps (a server).
- The AI-plan requirement is the real gate for the consumer in China; say which keys work, early.

**Summary:** chosen tagline: **"Your own personal AI. It does the work, and asks only when it
matters."** / **「你自己的私人 AI：替你把事办完，只在要紧时找你。」** It is the only candidate every
naive rater could read and would try (18/25; none below 3); the subhead names where you talk and
that money and messages wait for your OK; the hero picture is the real morning note (21/25).
